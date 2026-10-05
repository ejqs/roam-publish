import { api, ApiError } from "./api";
import { hashPayload, isShortlinkText, serialize, type Shortlinks } from "./serialize";
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
  type Listing,
  listingOf,
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
  places?: number;
  contentHash: string;
  visibility: Visibility;
  listing?: Listing;
  discoverBlocked?: string | null;
  updatedAt: string;
  /** Taken down by a moderator (from servers that say). */
  removed?: boolean;
  /** Whether this key may change it: the owner's, or published by this member (from servers that say). */
  mine?: boolean;
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
  // A slow run (many pages, slow server) mustn't overlap the next one.
  if (confirming) return;
  confirming = true;
  try {
    await confirmOnce();
  } finally {
    confirming = false;
  }
}

let confirming = false;
const CONFIRM_BATCH = 2000;
/** Roam uids; anchor uids come from the server, so anything else is never put into a query. */
const UID = /^[\w-]{1,64}$/;

async function confirmOnce() {
  if (confirmUnsupported || !getApiKey() || (!getShortlinkEnabled() && !getShortlinkOnBlocks())) return;
  // Nothing is written without a token or while it's off, so there's nothing to confirm; just keep
  // the settings switch in step with changes made on the website.
  if (changeLogStatus === "none" || changeLogStatus === "paused") return refreshChangeLog();
  const cache = await ensureCache();
  const anchors = Object.entries(cache)
    .filter(([, c]) => c.anchorUid && UID.test(c.anchorUid) && (c.kind === "block" ? getShortlinkOnBlocks() : getShortlinkEnabled()))
    .map(([rootUid, c]) => ({ rootUid, anchorUid: c.anchorUid! }));
  if (anchors.length === 0) return;
  const exists = new Map<string, boolean>();
  for (const a of anchors) {
    const b = await window.roamAlphaAPI.data.async.pull("[:block/uid]", `[:block/uid "${a.anchorUid}"]`);
    exists.set(a.rootUid, !!b?.[":block/uid"]);
  }
  const missing = anchors.filter((a) => !exists.get(a.rootUid));
  let res!: { changeLog: ChangeLog };
  try {
    // The server takes so many per request; a graph with more is confirmed in batches.
    for (let i = 0; i < anchors.length; i += CONFIRM_BATCH) {
      const batch = anchors.slice(i, i + CONFIRM_BATCH);
      res = await api<{ changeLog: ChangeLog }>("/api/ext/changelog/confirm", {
        method: "POST",
        body: JSON.stringify({
          present: batch.filter((a) => exists.get(a.rootUid)),
          missing: batch.filter((a) => !exists.get(a.rootUid)),
        }),
      });
    }
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
      listing: p.listing, discoverBlocked: p.discoverBlocked,
      shortUrl: p.shortUrl, anchorUid: p.anchorUid, places: p.places, removed: p.removed, mine: p.mine,
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

/** What Open goes to: the status link when it's published in more than one place, so all of them show. */
const openLink = (c: CachedPublication) => ((c.places ?? 1) > 1 && c.shortUrl) || c.url;

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
 * link block from then on, and the old block keeps what's already in it. The existing block is the
 * one holding the recorded Changelog block, or failing that one whose text is the tag: a status link
 * pasted under an ordinary block is never mistaken for it (and its text never replaced). `created`
 * is the new block's uid when this wrote one. Null when it's turned off or the server has no
 * shortlinks.
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
    const withLink = (root?.[":block/children"] ?? []).filter((c) =>
      c[":block/children"]?.some((k) => isShortlinkText(k[":block/string"], ids)),
    );
    const anchor = cached?.anchorUid;
    const parent =
      withLink.find((c) => !!anchor && c[":block/children"]!.some((k) => k[":block/uid"] === anchor)) ??
      withLink.find((c) => (c[":block/string"] ?? "") === tag);
    const linkBlock = parent?.[":block/children"]?.find((k) => isShortlinkText(k[":block/string"], ids));
    if (parent?.[":block/uid"] && linkBlock?.[":block/uid"]) {
      if ((parent[":block/string"] ?? "") !== tag) await block.update({ block: { uid: parent[":block/uid"], string: tag } });
      if (linkBlock[":block/string"] !== link) await block.update({ block: { uid: linkBlock[":block/uid"], string: link } });
      return { shortUrl, anchorUid: linkBlock[":block/uid"], created: undefined };
    }
    const parentUid = window.roamAlphaAPI.util.generateUID();
    const anchorUid = window.roamAlphaAPI.util.generateUID();
    await block.create({
      location: { "parent-uid": rootUid, order: getShortlinkPosition() === "top" ? 0 : "last" },
      block: { uid: parentUid, string: tag },
    });
    await block.create({ location: { "parent-uid": parentUid, order: 0 }, block: { uid: anchorUid, string: link } });
    return { shortUrl, anchorUid, created: parentUid };
  } catch {
    toast("Couldn't add the Roam Publish block. Publishing anyway.", { intent: "none" });
    return { shortUrl, anchorUid: undefined, created: undefined };
  }
}

/**
 * The shortlink blocks to leave out of a page: this graph's shortlink ids, and the Changelog blocks
 * they nest under, including the one just found or written for this publish.
 */
function shortlinksOf(cache: PublicationCache, link?: { shortUrl: string; anchorUid?: string } | null): Shortlinks {
  const items = [...Object.values(cache), ...(link ? [link] : [])];
  return {
    ids: new Set(items.map((c) => shortIdOf(c.shortUrl)).filter((id): id is string => !!id)),
    anchors: new Set(items.map((c) => c.anchorUid).filter((u): u is string => !!u)),
  };
}

/** Takes back a Roam Publish block written for a publish that didn't happen; best effort. */
async function removeBlock(uid: string | undefined) {
  if (uid) await window.roamAlphaAPI.data.block.delete({ block: { uid } }).catch(() => {});
}

/** Pages and blocks being published right now: a second click would add a second Roam Publish block. */
const publishing = new Set<string>();

export async function publish(uid: string) {
  if (publishing.has(uid)) return toast("Already publishing that. One moment…");
  publishing.add(uid);
  let link: Awaited<ReturnType<typeof ensureShortlinkBlock>> = null;
  try {
    const cache = await ensureCache();
    link = await ensureShortlinkBlock(uid, cache[uid]);
    // Shortlink blocks (this page's, and those of blocks published from inside it) and their change
    // logs are never published or hashed.
    const payload = await serialize(uid, shortlinksOf(cache, link));
    if (!payload) {
      await removeBlock(link?.created);
      return toast("Couldn't read that page or block.", { intent: "danger" });
    }
    const hash = await hashPayload(payload);
    const label = payload.kind === "page" ? "Page" : "Block";
    // Not part of the hash: changing only the author name still republishes.
    const author = getAuthor();

    // Always asked, even when the cache has this hash: the cache can be stale (unpublished or
    // removed on the website), and the server answers "unchanged" itself.
    const res = await api<{
      status: "created" | "updated" | "unchanged";
      url: string;
      shortUrl?: string;
      contentHash: string;
      visibility: Visibility;
      listing?: Listing;
      discoverBlocked?: string | null;
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
        visibility: res.visibility, listing: res.listing, discoverBlocked: res.discoverBlocked,
        updatedAt: new Date().toISOString(), author,
        shortUrl: res.shortUrl ?? link?.shortUrl ?? null, anchorUid: link?.anchorUid ?? cache[uid]?.anchorUid ?? null,
        places: cache[uid]?.places,
      },
    });
    const copied = await navigator.clipboard?.writeText(res.url).then(() => true, () => false);
    const copiedNote = copied ? " Link copied." : "";

    const unlisted = listingOf(res) === "unlisted";
    const msg =
      res.status === "unchanged"
        ? `${label} is already published with no changes.`
        : res.status === "updated"
          ? `${label} republished with your changes.${copiedNote}`
          : unlisted
            ? `${label} published as unlisted: only people with the link can see it.${copiedNote}`
            : `${label} published!${copiedNote}`;
    toast(msg, {
      intent: res.status === "unchanged" ? "none" : "success",
      link: res.url,
      // New items start unlisted; offer the one-click upgrades right where they'll see it.
      actions: res.status === "created" && unlisted ? listingActions(uid, res) : undefined,
    });
    warnIfBroken(res.changeLog);
  } catch (e) {
    // The server refused it (too large, removed, another member's…): nothing was published, so the
    // block written for it goes too. Kept when the server couldn't be reached, as it may have
    // published; the next publish reuses it.
    if (e instanceof ApiError && e.status >= 400) await removeBlock(link?.created);
    report(e);
  } finally {
    publishing.delete(uid);
  }
}

/** The website's words for where a page is listed. */
const LISTING_LABEL: Record<Listing, string> = { unlisted: "unlisted", listed: "listed", discover: "discoverable" };

const NOW: Record<Listing, string> = {
  unlisted: "Now unlisted: only people with the link can see it.",
  listed: "Now listed on your graph's front page.",
  discover: "Now discoverable: listed on your graph's front page and on Discover.",
};

/**
 * "Make …" buttons for every listing but the current one. Make discoverable only shows when the
 * server says it can be (older servers don't say, so it never shows there). Taking a page off
 * Discover asks first, as the website does.
 */
function listingActions(uid: string, c: { visibility: Visibility; listing?: Listing; discoverBlocked?: string | null }) {
  const current = listingOf(c);
  const discoverOk = c.listing !== undefined && !c.discoverBlocked;
  return (["listed", "discover", "unlisted"] as const)
    .filter((l) => l !== current && (l !== "discover" || discoverOk))
    .map((l) => ({
      label: `Make ${LISTING_LABEL[l]}`,
      onClick: () => (current === "discover" && l !== "discover" ? confirmLeaveDiscover(uid, l) : void setListing(uid, l)),
    }));
}

const OFF_DISCOVER: Record<Exclude<Listing, "discover">, string> = {
  listed: "It stays on your graph's front page.",
  unlisted: "It also comes off your graph's front page: only people with the link can see it.",
};

/** Closes a confirm toast without doing anything (any button closes it). */
const CANCEL = { label: "Cancel", onClick: () => {} };

/** Asks before taking a Discoverable page off Discover, as the website does. */
export function confirmLeaveDiscover(uid: string, listing: Exclude<Listing, "discover">) {
  const title = getCache()[uid]?.title;
  toast(
    `Take ${title ? `“${title}”` : "this"} off roam.pub/discover? ${OFF_DISCOVER[listing]}`,
    {
      intent: "danger",
      actions: [{ label: `Make ${LISTING_LABEL[listing]}`, onClick: () => void setListing(uid, listing) }, CANCEL],
      durationMs: 15000,
    },
  );
}

export async function setListing(uid: string, listing: Listing) {
  try {
    const res = await api<{ visibility: Visibility; listing?: Listing; discoverBlocked?: string | null; url: string }>(
      `/api/ext/publications/${encodeURIComponent(uid)}`,
      { method: "PATCH", body: JSON.stringify({ listing }) },
    );
    const cache = getCache();
    const next = cache[uid] && { ...cache[uid], visibility: res.visibility, listing: res.listing, discoverBlocked: res.discoverBlocked, url: res.url };
    if (next) await setCache({ ...cache, [uid]: next });
    toast(NOW[listingOf(res)], { intent: "success", link: next ? openLink(next) : res.url });
  } catch (e) {
    report(e);
  }
}

/**
 * Asks before unpublishing: roam.pub deletes the page with everything attached to it there, and
 * publishing again starts from scratch.
 */
export function confirmUnpublish(uid: string) {
  const title = getCache()[uid]?.title;
  toast(
    `Unpublish ${title ? `“${title}”` : "this"}? Its link stops working, and its access settings, passwords, views, upvotes and places in collections on roam.pub are deleted. Publishing it again starts over.`,
    { intent: "danger", actions: [{ label: "Unpublish", onClick: () => void unpublish(uid) }, CANCEL], durationMs: 15000 },
  );
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
 * listed, discoverable or unlisted, and unpublish. Writes nothing to the graph by itself.
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
    const payload = await serialize(uid, shortlinksOf(cache));
    if (!payload) return toast("Couldn't read that page or block.", { intent: "danger" });
    const label = payload.kind === "page" ? "Page" : "Block";
    if (!c)
      return toast(`${label} isn't published.${offline}`, {
        action: { label: `Publish ${payload.kind}`, onClick: () => void publish(uid) },
      });
    if (c.removed) return toast(`${label} was removed by a moderator.${offline}`, { intent: "danger", link: openLink(c) });
    const where = LISTING_LABEL[listingOf(c)];
    if (c.mine === false)
      return toast(
        `${label} is published (${where}) by another member of this graph. Only they or the graph's owner can change it.${offline}`,
        { link: openLink(c) },
      );
    const since = new Date(c.updatedAt).toLocaleString();
    const changed = (await hashPayload(payload)) !== c.hash;
    // Only known for items published from this graph's extension settings.
    const bylineChanged = c.author !== undefined && c.author !== getAuthor();
    const upToDate = !changed && !bylineChanged;
    const actions = [
      ...(upToDate ? [] : [{ label: "Republish", onClick: () => void publish(uid) }]),
      ...listingActions(uid, c),
      { label: "Unpublish", onClick: () => confirmUnpublish(uid) },
    ];
    // Roam's toasts can't grey a button out, so say why Make discoverable isn't there.
    const blocked = c.discoverBlocked && listingOf(c) !== "discover" ? ` ${c.discoverBlocked}` : "";
    toast(
      upToDate
        ? `${label} is published (${where}) and up to date. Last published ${since}.${offline}${blocked}`
        : `${label} is published (${where}) but ${changed ? "has changed" : "has a new author name"} since it was last published on ${since}.${offline}${blocked}`,
      { intent: upToDate ? "success" : "none", link: openLink(c), actions, durationMs: 15000 },
    );
  } catch (e) {
    report(e);
  }
}
