import { api, ApiError } from "./api";
import { hashPayload, isShortlinkText, serialize } from "./serialize";
import {
  getApiKey,
  getAuthor,
  getShortlinkText,
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
  /** Taken down by a moderator (from servers that say). */
  removed?: boolean;
};

let syncedThisSession = false;

/** Whether roam.pub can write this graph's change log (from servers that have one). */
type ChangeLog = { status: "ok" | "invalid" | "paused" | "none"; lastOkAt: string | null };
let warnedThisSession = false;

const changeLogSettings = (graphName = window.roamAlphaAPI.graph.name) =>
  `${getServer()}/dashboard/${encodeURIComponent(graphName)}/settings#change-log`;

const BROKEN =
  "Roam rejected the append-only token roam.pub stores for this graph, so the change log under your Roam Publish Status links stopped. The graph's owner can add a new token in its settings on roam.pub.";

/** The graph's change log status as last reported this session; undefined until the server says. */
let changeLogStatus: ChangeLog["status"] | undefined;

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

/** Reads the change log's status from the server, quietly, while it's off: it may be turned on on the website. */
export async function refreshChangeLog() {
  if (!getApiKey()) return;
  try {
    noteChangeLog((await api<{ changeLog: ChangeLog }>("/api/ext/changelog")).changeLog);
  } catch {
    // Old server, bad key or offline: keep the last known status.
  }
}

let missingWarned = false;
/** The server has no confirmations: nothing to confirm this session. */
let confirmUnsupported = false;

/**
 * Tells roam.pub which of the blocks its change log goes under (status links) still exist. Roam's Append API writes to the
 * daily note when its target is gone, so roam.pub only writes to blocks confirmed in the last few
 * minutes; this runs every few minutes while Roam is open. Sends only page and block uids.
 */
export async function confirmChangeLogBlocks() {
  if (confirmUnsupported || !getApiKey() || (!getShortlinkEnabled() && !getShortlinkOnBlocks())) return;
  // Nothing is written without a token or while it's off, so there's nothing to confirm; just keep
  // the settings switch in step with changes made on the website.
  if (changeLogStatus === "none" || changeLogStatus === "paused") return refreshChangeLog();
  const cache = await ensureCache();
  const anchors = Object.entries(cache)
    .filter(([, c]) => c.anchorUid && (c.kind === "block" ? getShortlinkOnBlocks() : getShortlinkEnabled()))
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
    if (e instanceof ApiError && e.status === 404) confirmUnsupported = true;
    return;
  }
  noteChangeLog(res.changeLog);
  if (missing.length) {
    const next = { ...getCache() };
    for (const m of missing) if (next[m.rootUid]) next[m.rootUid] = { ...next[m.rootUid], anchorUid: null };
    await setCache(next);
    if (!missingWarned) {
      missingWarned = true;
      toast(
        `${missing.length === 1 ? "A published page's" : `${missing.length} published pages'`} Roam Publish Status link was deleted, so roam.pub stopped logging changes there. Publish the page again to add it back, or ignore it on your dashboard.`,
        { intent: "danger", link: `${getServer()}/dashboard#change-log-issues`, durationMs: 15000 },
      );
    }
  }
  warnIfBroken(res.changeLog);
}

/** Opens the graph's change log settings on the website, where its owner can check and change it. */
export function openChangeLogSettings() {
  window.open(changeLogSettings(), "_blank", "noopener");
}

/** Re-download the list of published items from the server into the cache. */
export async function syncPublications(opts: { quiet?: boolean } = {}) {
  const { publications, changeLog } = await api<{ publications: Remote[]; changeLog?: ChangeLog }>(
    "/api/ext/publications",
  );
  warnIfBroken(changeLog);
  const previous = getCache();
  const cache: PublicationCache = {};
  for (const p of publications) {
    cache[p.rootUid] = {
      hash: p.contentHash, url: p.url, title: p.title, kind: p.kind, visibility: p.visibility, updatedAt: p.updatedAt,
      shortUrl: p.shortUrl, anchorUid: p.anchorUid, removed: p.removed,
      // The server doesn't send bylines; keep the one sent with the last publish from here.
      author: previous[p.rootUid]?.author,
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

/** The link block's text: `[{text}]({shortUrl})`, or the bare link when the text setting is blank. */
const linkText = (shortUrl: string) => {
  const text = getShortlinkText();
  return text ? `[${text.replace(/[[\]]/g, "")}](${shortUrl})` : shortUrl;
};

/**
 * The page's status link, written in Roam first or last under the root as
 *
 *   {tag}                          ← Shortlink tag setting, [[Roam Publish]] by default
 *     [{text}]({shortUrl})         ← Shortlink text setting, "Roam Publish Status" by default
 *       [[October 2nd, 2026]] …    ← the server appends change log entries here
 *
 * Written before publishing so the server learns the link block's uid with the publish. A tag or
 * text changed in settings is applied in place on the next publish, so the entries stay put. Pages
 * from earlier builds have a separate "Changelog" block under the tag; new entries go under the
 * link block from then on, and the old block keeps what's already in it. Null when it's turned
 * off or the server has no shortlinks.
 */
async function ensureShortlinkBlock(rootUid: string, cached: CachedPublication | undefined) {
  // Pages and blocks each have their own setting.
  const root = await window.roamAlphaAPI.data.async.pull("[:node/title]", `[:block/uid "${rootUid}"]`);
  const isPage = typeof root?.[":node/title"] === "string";
  if (!(isPage ? getShortlinkEnabled() : getShortlinkOnBlocks())) return null;
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
  const link = linkText(shortUrl);
  const { block } = window.roamAlphaAPI.data;
  try {
    const root = await window.roamAlphaAPI.data.async.pull(
      "[{:block/children [:block/uid :block/string {:block/children [:block/uid :block/string]}]}]",
      `[:block/uid "${rootUid}"]`,
    );
    const parent = root?.[":block/children"]?.find((c) =>
      c[":block/children"]?.some((k) => isShortlinkText(k[":block/string"], ids)),
    );
    const linkBlock = parent?.[":block/children"]?.find((k) => isShortlinkText(k[":block/string"], ids));
    if (parent?.[":block/uid"] && linkBlock?.[":block/uid"]) {
      if ((parent[":block/string"] ?? "") !== tag) await block.update({ block: { uid: parent[":block/uid"], string: tag } });
      if (linkBlock[":block/string"] !== link) await block.update({ block: { uid: linkBlock[":block/uid"], string: link } });
      return { shortUrl, anchorUid: linkBlock[":block/uid"] };
    }
    const parentUid = window.roamAlphaAPI.util.generateUID();
    const anchorUid = window.roamAlphaAPI.util.generateUID();
    await block.create({
      location: { "parent-uid": rootUid, order: getShortlinkPosition() === "top" ? 0 : "last" },
      block: { uid: parentUid, string: tag },
    });
    await block.create({ location: { "parent-uid": parentUid, order: 0 }, block: { uid: anchorUid, string: link } });
    return { shortUrl, anchorUid };
  } catch {
    toast("Couldn't add the Roam Publish block. Publishing anyway.", { intent: "none" });
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

/**
 * Whether a page or block is published, and if so whether it changed in Roam since: refreshes the
 * published list from the server first (falling back to the cache offline), then hashes the
 * content the way publishing does. Offers what can be done next: publish, or republish, make
 * public or unlisted, and unpublish. Writes nothing to the graph by itself.
 */
export async function publishStatus(uid: string) {
  try {
    let cache: PublicationCache;
    let offline = "";
    try {
      cache = await syncPublications({ quiet: true });
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 0) throw e;
      cache = getCache();
      offline = " (couldn't reach the server; this is from the last sync)";
    }
    const c = cache[uid];
    const ids = new Set(Object.values(cache).map((x) => shortIdOf(x.shortUrl)).filter((id): id is string => !!id));
    const payload = await serialize(uid, ids);
    if (!payload) return toast("Couldn't read that page or block.", { intent: "danger" });
    const label = payload.kind === "page" ? "Page" : "Block";
    if (!c)
      return toast(`${label} isn't published.${offline}`, {
        action: { label: `Publish ${payload.kind}`, onClick: () => void publish(uid) },
      });
    if (c.removed) return toast(`${label} was removed by a moderator.${offline}`, { intent: "danger", link: c.url });
    const since = new Date(c.updatedAt).toLocaleString();
    const where = c.visibility === "public" ? "public" : "unlisted";
    const changed = (await hashPayload(payload)) !== c.hash;
    // Only known for items published from this graph's extension settings.
    const bylineChanged = c.author !== undefined && c.author !== getAuthor();
    const upToDate = !changed && !bylineChanged;
    const flip: Visibility = c.visibility === "public" ? "unlisted" : "public";
    const actions = [
      ...(upToDate ? [] : [{ label: "Republish", onClick: () => void publish(uid) }]),
      { label: `Make ${flip}`, onClick: () => void setVisibility(uid, flip) },
      { label: "Unpublish", onClick: () => void unpublish(uid) },
    ];
    toast(
      upToDate
        ? `${label} is published (${where}) and up to date. Last published ${since}.${offline}`
        : `${label} is published (${where}) but ${changed ? "has changed" : "has a new author name"} since it was last published on ${since}.${offline}`,
      { intent: upToDate ? "success" : "none", link: c.url, actions, durationMs: 15000 },
    );
  } catch (e) {
    report(e);
  }
}
