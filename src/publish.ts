import { api, ApiError } from "./api";
import { hashPayload, isShortlinkText, serialize } from "./serialize";
import {
  getApiKey,
  getAuthor,
  getServer,
  getCache,
  getShortlinkEnabled,
  getShortlinkOnBlocks,
  getShortlinkPosition,
  getShortlinkTag,
  setCache,
  type CachedPublication,
  type PublicationCache,
  type Visibility,
} from "./state";
import { toast } from "./toast";

type Remote = {
  rootUid: string;
  kind: "page" | "block";
  title: string;
  url: string;
  shortUrl?: string | null;
  anchorUid?: string | null;
  contentHash: string;
  visibility: Visibility;
  updatedAt: string;
};

let syncedThisSession = false;

/** Whether roam.pub can write this graph's change log (from servers that have one). */
type ChangeLog = { status: "ok" | "invalid" | "none"; lastOkAt: string | null };
let warnedThisSession = false;

const changeLogSettings = (graphName = window.roamAlphaAPI.graph.name) =>
  `${getServer()}/dashboard/${encodeURIComponent(graphName)}/settings#change-log`;

const BROKEN =
  "Roam rejected the append-only token roam.pub stores for this graph, so the change log under your shortlink blocks stopped. The graph's owner can add a new token in its settings on roam.pub.";

/** The graph's change log status as last reported this session; undefined until the server says. */
let changeLogStatus: ChangeLog["status"] | undefined;

/**
 * Whether new shortlink blocks get a Changelog block. Not when the graph has no change log (no
 * token stored), so opted-out graphs don't collect empty ones; one is added on the next publish
 * once a token is. Servers without a change log keep the previous behavior.
 */
async function changeLogWanted() {
  if (changeLogStatus === undefined) {
    try {
      noteChangeLog((await api<{ changeLog: ChangeLog }>("/api/ext/changelog")).changeLog);
    } catch {
      return true;
    }
  }
  return changeLogStatus !== "none";
}

/** Remembers the change log status, and tells the user, once per session, that it stopped working. */
function warnIfBroken(changeLog: ChangeLog | undefined) {
  noteChangeLog(changeLog);
  if (changeLog?.status !== "invalid" || warnedThisSession) return;
  warnedThisSession = true;
  toast(BROKEN, { intent: "danger", link: changeLogSettings(), durationMs: 15000 });
}

function noteChangeLog(changeLog: ChangeLog | undefined) {
  if (changeLog) changeLogStatus = changeLog.status;
}

let missingWarned = false;
let changeLogOff = false;

/**
 * Tells roam.pub which of this graph's Changelog blocks still exist. Roam's Append API writes to the
 * daily note when its target is gone, so roam.pub only writes to blocks confirmed in the last few
 * minutes; this runs every few minutes while Roam is open. Sends only page and block uids.
 */
export async function confirmChangeLogBlocks() {
  if (changeLogOff || !getApiKey() || !getShortlinkEnabled()) return;
  const cache = await ensureCache();
  const anchors = Object.entries(cache)
    .filter(([, c]) => c.anchorUid)
    .map(([rootUid, c]) => ({ rootUid, anchorUid: c.anchorUid! }));
  if (anchors.length === 0) return;
  const present: typeof anchors = [];
  const missing: typeof anchors = [];
  for (const a of anchors) {
    const b = await window.roamAlphaAPI.data.async.pull("[:block/uid]", `[:block/uid "${a.anchorUid}"]`);
    (b?.[":block/uid"] ? present : missing).push(a);
  }
  let res: { changeLog: ChangeLog };
  try {
    res = await api<{ changeLog: ChangeLog }>("/api/ext/changelog/confirm", {
      method: "POST",
      body: JSON.stringify({ present, missing }),
    });
  } catch (e) {
    // Servers without confirmations: nothing to do this session. Anything else: try again next time.
    if (e instanceof ApiError && e.status === 404) changeLogOff = true;
    return;
  }
  // No stored token: nothing is written, so there's nothing to confirm this session.
  noteChangeLog(res.changeLog);
  if (res.changeLog.status === "none") changeLogOff = true;
  if (missing.length) {
    const next = { ...getCache() };
    for (const m of missing) if (next[m.rootUid]) next[m.rootUid] = { ...next[m.rootUid], anchorUid: null };
    await setCache(next);
    if (!missingWarned) {
      missingWarned = true;
      toast(
        `${missing.length === 1 ? "A published page's" : `${missing.length} published pages'`} Changelog block was deleted, so roam.pub stopped logging changes there. Publish the page again to add it back, or ignore it on your dashboard.`,
        { intent: "danger", link: `${getServer()}/dashboard#change-log-issues`, durationMs: 15000 },
      );
    }
  }
  warnIfBroken(res.changeLog);
}

/** Asks the server whether the change log works. Writes nothing to the graph. */
export async function checkChangeLog() {
  try {
    const { changeLog, graphName } = await api<{ changeLog: ChangeLog; graphName: string }>("/api/ext/changelog");
    noteChangeLog(changeLog);
    const link = changeLogSettings(graphName);
    if (changeLog.status === "ok")
      return toast(
        changeLog.lastOkAt
          ? `Change log is working. Roam last accepted an entry on ${new Date(changeLog.lastOkAt).toLocaleString()}.`
          : "Change log is on. Roam hasn't been sent an entry yet.",
        { intent: "success" },
      );
    if (changeLog.status === "invalid") return toast(BROKEN, { intent: "danger", link });
    toast("No append-only token is stored for this graph, so there's no change log. Add one in the graph's settings on roam.pub.", { link });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404)
      return toast("This Roam Publish server doesn't have a change log yet.", { intent: "danger" });
    report(e);
  }
}

/** Re-download the list of published items from the server into the cache. */
export async function syncPublications(opts: { quiet?: boolean } = {}) {
  const { publications, changeLog } = await api<{ publications: Remote[]; changeLog?: ChangeLog }>(
    "/api/ext/publications",
  );
  warnIfBroken(changeLog);
  const cache: PublicationCache = {};
  for (const p of publications) {
    cache[p.rootUid] = {
      hash: p.contentHash, url: p.url, title: p.title, kind: p.kind, visibility: p.visibility, updatedAt: p.updatedAt,
      shortUrl: p.shortUrl, anchorUid: p.anchorUid,
    };
  }
  await setCache(cache);
  syncedThisSession = true;
  if (!opts.quiet) toast(`Synced ${publications.length} published item(s).`);
  return cache;
}

/** Cache, refilled from the server when it's empty. */
async function ensureCache() {
  const cache = getCache();
  if (Object.keys(cache).length === 0 && !syncedThisSession) return syncPublications({ quiet: true });
  return cache;
}

function report(e: unknown) {
  toast(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong", { intent: "danger" });
}

const shortIdOf = (shortUrl: string | null | undefined) => shortUrl?.split("/p/")[1];

const CHANGELOG = "Changelog";

/**
 * The page's permanent link, written in Roam first or last under the root as
 *
 *   {tag}
 *     {shortUrl}
 *     Changelog        ← the server appends its change log entries here
 *
 * Written before publishing so the server learns the Changelog block's uid with the publish. Null
 * when it's turned off or the server has no shortlinks. Changelog is left out while the graph has
 * no change log.
 */
async function ensureShortlinkBlock(rootUid: string, cached: CachedPublication | undefined) {
  if (!getShortlinkEnabled()) return null;
  if (!getShortlinkOnBlocks()) {
    // Pages only, unless turned on for blocks too.
    const root = await window.roamAlphaAPI.data.async.pull("[:node/title]", `[:block/uid "${rootUid}"]`);
    if (typeof root?.[":node/title"] !== "string") return null;
  }
  let shortUrl = cached?.shortUrl;
  if (!shortUrl) {
    try {
      shortUrl = (await api<{ shortUrl: string }>("/api/ext/shortlinks", {
        method: "POST",
        body: JSON.stringify({ rootUid }),
      })).shortUrl;
    } catch (e) {
      // Servers from before shortlinks: publish as before.
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }
  const ids = new Set([shortIdOf(shortUrl)!]);
  const tag = getShortlinkTag();
  const { block } = window.roamAlphaAPI.data;
  try {
    const root = await window.roamAlphaAPI.data.async.pull(
      "[{:block/children [:block/uid :block/string {:block/children [:block/uid :block/string]}]}]",
      `[:block/uid "${rootUid}"]`,
    );
    const parent = root?.[":block/children"]?.find((c) =>
      c[":block/children"]?.some((k) => isShortlinkText(k[":block/string"], ids)),
    );
    if (parent?.[":block/uid"]) {
      const parentUid = parent[":block/uid"];
      // A changed tag is applied in place, so the change log under it stays where it is.
      if ((parent[":block/string"] ?? "") !== tag) await block.update({ block: { uid: parentUid, string: tag } });
      const log = parent[":block/children"]?.find((k) => k[":block/string"] === CHANGELOG)?.[":block/uid"];
      if (log) return { shortUrl, anchorUid: log };
      if (!(await changeLogWanted())) return { shortUrl, anchorUid: undefined };
      const anchorUid = window.roamAlphaAPI.util.generateUID();
      await block.create({ location: { "parent-uid": parentUid, order: "last" }, block: { uid: anchorUid, string: CHANGELOG } });
      return { shortUrl, anchorUid };
    }
    const wanted = await changeLogWanted();
    const parentUid = window.roamAlphaAPI.util.generateUID();
    await block.create({
      location: { "parent-uid": rootUid, order: getShortlinkPosition() === "top" ? 0 : "last" },
      block: { uid: parentUid, string: tag },
    });
    await block.create({ location: { "parent-uid": parentUid, order: 0 }, block: { string: shortUrl } });
    if (!wanted) return { shortUrl, anchorUid: undefined };
    const anchorUid = window.roamAlphaAPI.util.generateUID();
    await block.create({ location: { "parent-uid": parentUid, order: 1 }, block: { uid: anchorUid, string: CHANGELOG } });
    return { shortUrl, anchorUid };
  } catch {
    toast("Couldn't add the shortlink block. Publishing anyway.", { intent: "none" });
    return { shortUrl, anchorUid: undefined };
  }
}

export async function publish(uid: string) {
  try {
    const cache = await ensureCache();
    const link = await ensureShortlinkBlock(uid, cache[uid]);
    // Shortlink blocks (this page's, and those of blocks published from inside it) and their change
    // logs are never published or hashed.
    const ids = new Set(
      [link?.shortUrl, ...Object.values(cache).map((c) => c.shortUrl)].map(shortIdOf).filter((id): id is string => !!id),
    );
    const payload = await serialize(uid, ids);
    if (!payload) return toast("Couldn't read that page or block.", { intent: "danger" });
    const hash = await hashPayload(payload);
    const label = payload.kind === "page" ? "Page" : "Block";
    // Not part of the hash: changing only the author name still republishes.
    const author = getAuthor();
    // A new or replaced shortlink block still has to reach the server.
    const anchorKnown = !link?.anchorUid || link.anchorUid === cache[uid]?.anchorUid;

    if (cache[uid]?.hash === hash && (cache[uid].author ?? "") === author && anchorKnown) {
      return toast(`${label} is already published with no changes.`, { link: cache[uid].url });
    }

    const res = await api<{
      status: "created" | "updated" | "unchanged";
      url: string;
      shortUrl?: string;
      contentHash: string;
      visibility: Visibility;
      changeLog?: ChangeLog;
    }>(
      "/api/ext/publications",
      {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          contentHash: hash,
          author,
          anchorUid: link?.anchorUid,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      },
    );
    await setCache({
      ...getCache(),
      [uid]: {
        hash: res.contentHash, url: res.url, title: payload.title, kind: payload.kind,
        visibility: res.visibility, updatedAt: new Date().toISOString(), author,
        shortUrl: res.shortUrl ?? link?.shortUrl ?? null, anchorUid: link?.anchorUid ?? cache[uid]?.anchorUid ?? null,
      },
    });
    await navigator.clipboard?.writeText(res.url).catch(() => {});

    const unlisted = res.visibility === "unlisted";
    const msg =
      res.status === "unchanged"
        ? `${label} is already published with no changes.`
        : res.status === "updated"
          ? `${label} republished with your changes. Link copied.`
          : unlisted
            ? `${label} published as unlisted: only people with the link can see it. Link copied.`
            : `${label} published! Link copied.`;
    toast(msg, {
      intent: res.status === "unchanged" ? "none" : "success",
      link: res.url,
      // New items start unlisted; offer the one-click upgrade right where they'll see it.
      action: res.status === "created" && unlisted
        ? { label: "Make public", onClick: () => void setVisibility(uid, "public") }
        : undefined,
    });
    warnIfBroken(res.changeLog);
  } catch (e) {
    report(e);
  }
}

export async function setVisibility(uid: string, visibility: Visibility) {
  try {
    const res = await api<{ visibility: Visibility; url: string }>(
      `/api/ext/publications/${encodeURIComponent(uid)}`,
      { method: "PATCH", body: JSON.stringify({ visibility }) },
    );
    const cache = getCache();
    if (cache[uid]) await setCache({ ...cache, [uid]: { ...cache[uid], visibility: res.visibility, url: res.url } });
    toast(
      res.visibility === "public"
        ? "Now public: listed on your graph's front page."
        : "Now unlisted: only people with the link can see it.",
      { intent: "success", link: res.url },
    );
  } catch (e) {
    report(e);
  }
}

export async function unpublish(uid: string) {
  try {
    await api(`/api/ext/publications/${encodeURIComponent(uid)}`, { method: "DELETE" });
    const cache = { ...getCache() };
    delete cache[uid];
    await setCache(cache);
    toast("Unpublished.", { intent: "success" });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      const cache = { ...getCache() };
      delete cache[uid];
      await setCache(cache);
      return toast("That wasn't published.");
    }
    report(e);
  }
}

export const isPublished = (uid: string) => !!getCache()[uid];
export const visibilityOf = (uid: string) => getCache()[uid]?.visibility;
