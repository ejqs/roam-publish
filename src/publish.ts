import { api, ApiError } from "./api";
import { foldedUids, hashPayload, isShortlinkText, type Payload, refold, serialize, type Shortlinks } from "./serialize";
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
  listedNote?: string | null;
  /** False when it's only in collections (from servers that say). */
  inGraph?: boolean;
  /** Sealed with a password (from servers that say). */
  encrypted?: boolean;
  updatedAt: string;
  /** Taken down by a moderator (from servers that say). */
  removed?: boolean;
  /** Whether this key may change it: the owner's, or published by this member (from servers that say). */
  mine?: boolean;
  /** Uids of the blocks collapsed on the website (from servers that say). */
  folded?: string[];
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
  const { publications, changeLog, collections } = await api<{
    publications: Remote[];
    changeLog?: ChangeLog;
    collections?: number;
  }>("/api/ext/publications");
  warnIfBroken(changeLog);
  collectionCount = collections;
  const previous = getCache();
  const cache: PublicationCache = {};
  for (const p of publications) {
    cache[p.rootUid] = {
      hash: p.contentHash, url: p.url, title: p.title, kind: p.kind, visibility: p.visibility, updatedAt: p.updatedAt,
      listing: p.listing, discoverBlocked: p.discoverBlocked, listedNote: p.listedNote,
      inGraph: p.inGraph, encrypted: p.encrypted,
      shortUrl: p.shortUrl, anchorUid: p.anchorUid, places: p.places, removed: p.removed, mine: p.mine,
      // The server doesn't send bylines; keep the one sent with the last publish from here.
      author: previous[p.rootUid]?.author,
      // Older servers don't say which blocks are collapsed; then it's what was last published from here.
      folded: p.folded ?? previous[p.rootUid]?.folded,
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

/**
 * Which blocks the published page has collapsed:
 * - "asIs": the ones collapsed in Roam right now, exactly as you see it;
 * - "keep": the ones collapsed on the published page now (as last published from here);
 * - "expanded": none.
 */
export type Folds = "asIs" | "keep" | "expanded";

/** The payload as sent, with its blocks collapsed the chosen way. */
function folded(p: Payload, folds: Folds, published?: string[]): Payload {
  if (folds === "asIs") return p;
  return { ...p, tree: refold(p.tree, new Set(folds === "keep" ? published : [])) };
}

const blocksWord = (n: number) => (n === 1 ? "1 block" : `${n} blocks`);
const sameFolds = (a: string[], b: string[]) => a.length === b.length && a.every((u, i) => u === b[i]);

/** The first publish of something with collapsed blocks: should they start collapsed on the website? */
function askFirstFolds(uid: string, count: number, kind: "page" | "block", republish: boolean) {
  const verb = republish ? "Republish" : "Publish";
  toast(
    `${blocksWord(count)} on this ${kind} ${count === 1 ? "is" : "are"} collapsed in Roam. Should ${count === 1 ? "it" : "they"} start collapsed on the published ${kind} too? Readers can open and close blocks either way.`,
    {
      actions: [
        { label: `${verb} as is (Collapsed)`, onClick: () => void publish(uid, { folds: "asIs" }) },
        { label: `${verb} expanded`, onClick: () => void publish(uid, { folds: "expanded" }) },
      ],
      durationMs: 20000,
    },
  );
}

/** Republishing when the blocks collapsed in Roam aren't the ones collapsed on the published page. */
function askRepublishFolds(uid: string, kind: "page" | "block") {
  toast(
    `The blocks collapsed in Roam aren't the ones collapsed on the published ${kind}. Republish it exactly as you see it in Roam, or keep the published ${kind}'s open and collapsed blocks?`,
    { actions: republishActions(uid), durationMs: 20000 },
  );
}

/** For when only which blocks are collapsed changed: makes the website's match Roam's. */
const syncFoldsAction = (uid: string) => ({ label: "Sync open/collapsed blocks", onClick: () => void publish(uid, { folds: "asIs" }) });

const republishActions = (uid: string) => [
  { label: "Republish as is", onClick: () => void publish(uid, { folds: "asIs" }) },
  { label: "Republish, keep open/collapsed", onClick: () => void publish(uid, { folds: "keep" }) },
];

/**
 * Publishes or republishes. `folds` says which blocks start collapsed on the website (see Folds).
 * Without it, the user is asked when it matters: the first time something with collapsed blocks is
 * published, and when the blocks collapsed in Roam differ from the published page's.
 */
export async function publish(uid: string, opts: { folds?: Folds } = {}) {
  if (publishing.has(uid)) return toast("Already publishing that. One moment…");
  publishing.add(uid);
  let link: Awaited<ReturnType<typeof ensureShortlinkBlock>> = null;
  try {
    const cache = await ensureCache();
    const published = cache[uid]?.folded;
    let folds = opts.folds;
    if (!folds) {
      // Asked before writing anything to the graph.
      const first = await serialize(uid, shortlinksOf(cache));
      const inRoam = first ? foldedUids(first.tree) : [];
      const kept = first && published ? foldedUids(refold(first.tree, new Set(published))) : [];
      if (first && inRoam.length && !published) return askFirstFolds(uid, inRoam.length, first.kind, !!cache[uid]);
      if (first && published && !sameFolds(inRoam, kept)) {
        // Nothing but collapsed blocks changed: there's only one thing to do.
        if ((await hashPayload(folded(first, "keep", published))) === cache[uid]?.hash)
          return toast(
            `Only which blocks are collapsed changed since this ${first.kind} was published. Sync them to the website?`,
            { actions: [syncFoldsAction(uid), CANCEL], durationMs: 15000 },
          );
        return askRepublishFolds(uid, first.kind);
      }
      folds = "asIs";
    }
    link = await ensureShortlinkBlock(uid, cache[uid]);
    // Shortlink blocks (this page's, and those of blocks published from inside it) and their change
    // logs are never published or hashed.
    const read = await serialize(uid, shortlinksOf(cache, link));
    if (!read) {
      await removeBlock(link?.created);
      return toast("Couldn't read that page or block.", { intent: "danger" });
    }
    const payload = folded(read, folds, published);
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
      inGraph?: boolean;
      encrypted?: boolean;
      changeLog?: ChangeLog;
      collections?: number;
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
        inGraph: res.inGraph, encrypted: res.encrypted ?? cache[uid]?.encrypted,
        updatedAt: new Date().toISOString(), author,
        // Which blocks are collapsed on the website now, for "keep" and for telling when Roam differs.
        folded: foldedUids(payload.tree),
        shortUrl: res.shortUrl ?? link?.shortUrl ?? null, anchorUid: link?.anchorUid ?? cache[uid]?.anchorUid ?? null,
        places: cache[uid]?.places,
      },
    });
    collectionCount = res.collections;
    const copied = await navigator.clipboard?.writeText(res.url).then(() => true, () => false);
    const copiedNote = copied ? " Link copied." : "";

    const unlisted = listingOf(res) === "unlisted";
    const msg =
      res.status === "unchanged"
        ? `${label} is already published with no changes.`
        : res.status === "updated"
          ? `${label} republished with your changes.${copiedNote}`
          : res.inGraph === false
            ? `${label} published to your graph's collections only, as its settings say.${copiedNote}`
            : unlisted
              ? `${label} published as unlisted: only people with the link can see it.${copiedNote}`
              : `${label} published!${copiedNote}`;
    toast(msg, {
      intent: res.status === "unchanged" ? "none" : "success",
      link: res.url,
      // New items start unlisted; offer the one-click upgrades, and collections, right where they'll see it.
      actions:
        res.status === "created"
          ? [...(unlisted ? listingActions(uid, res) : []), ...collectionAction(uid, res)]
          : undefined,
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
 * Discover asks first, as the website does. None for a page only in collections: it has no graph
 * place to list, and each collection lists it its own way.
 */
function listingActions(
  uid: string,
  c: { visibility: Visibility; listing?: Listing; discoverBlocked?: string | null; inGraph?: boolean },
) {
  if (c.inGraph === false) return [];
  const current = listingOf(c);
  const discoverOk = c.listing !== undefined && !c.discoverBlocked;
  return (["listed", "discover", "unlisted"] as const)
    .filter((l) => l !== current && (l !== "discover" || discoverOk))
    .map((l) => ({
      label: `Make ${LISTING_LABEL[l]}`,
      onClick: () => (current === "discover" && l !== "discover" ? confirmLeaveDiscover(uid, l) : void setListing(uid, l)),
    }));
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

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
    const res = await api<{
      visibility: Visibility;
      listing?: Listing;
      discoverBlocked?: string | null;
      listedNote?: string | null;
      url: string;
    }>(`/api/ext/publications/${encodeURIComponent(uid)}`, { method: "PATCH", body: JSON.stringify({ listing }) });
    const cache = getCache();
    const next = cache[uid] && {
      ...cache[uid], visibility: res.visibility, listing: res.listing, discoverBlocked: res.discoverBlocked,
      listedNote: res.listedNote, url: res.url,
    };
    if (next) await setCache({ ...cache, [uid]: next });
    // Listed with the graph's front page off: nothing lists it, so don't say the front page does.
    const now = listingOf(res);
    const note = now !== "unlisted" && res.listedNote;
    toast(note ? `Now listed, but ${lowerFirst(note)}` : NOW[now], {
      intent: note ? "none" : "success",
      link: next ? openLink(next) : res.url,
      durationMs: note ? 15000 : undefined,
    });
  } catch (e) {
    report(e);
  }
}

/** Collections the key's holder can add pages to, as the server last said; undefined on servers that don't. */
let collectionCount: number | undefined;

/**
 * "Add to collection…", when there's a collection to add to. Not for encrypted pages: they're added
 * on roam.pub, which can ask for their password.
 */
const collectionAction = (uid: string, c: { encrypted?: boolean }) =>
  collectionCount && !c.encrypted ? [{ label: "Add to collection…", onClick: () => void chooseCollection(uid) }] : [];

/** Why the status toast has no "Add to collection…" for an encrypted page. */
const ENCRYPTED_COLLECTIONS = " It's encrypted, so add it to collections on roam.pub, where you can enter its password.";

type CollectionChoice = {
  id: string;
  name: string;
  listing: Exclude<Listing, "unlisted">;
  access: "open" | "password" | "members";
  entryUrl: string | null;
  movesOutOfGraph: boolean;
};

/** How a page starts out in a collection, as the dropdown says it. */
function startsAs(c: Pick<CollectionChoice, "listing" | "access">) {
  return c.access === "password"
    ? "password-protected"
    : c.access === "members"
      ? "members only"
      : c.listing === "discover"
        ? "listed and on Discover"
        : "listed";
}

/**
 * Asks which collection to add a published page to. Each one says how the page will start out
 * there, from the collection's own defaults, and whether it leaves the graph.
 */
export async function chooseCollection(uid: string) {
  try {
    const { collections } = await api<{ collections: CollectionChoice[] }>(
      `/api/ext/publications/${encodeURIComponent(uid)}/collections`,
    );
    if (collections.length === 0)
      return toast("You're not in any collections yet. Create or join one on roam.pub.", {
        link: `${getServer()}/dashboard/collections`,
      });
    const title = getCache()[uid]?.title;
    toast(`Add ${title ? `“${title}”` : "this"} to a collection. It starts out the way the collection says.`, {
      select: {
        placeholder: "Choose a collection…",
        options: collections.map((c) => ({
          value: c.id,
          label: c.entryUrl
            ? `${c.name} (already there)`
            : `${c.name}: ${startsAs(c)}${c.movesOutOfGraph ? ", leaves your graph" : ""}`,
          disabled: !!c.entryUrl,
        })),
        onChoose: (id) => void addToCollection(uid, id),
      },
      durationMs: 20000,
    });
  } catch (e) {
    report(e);
  }
}

export async function addToCollection(uid: string, collectionId: string) {
  try {
    const res = await api<{
      name: string;
      entryUrl: string;
      listing: Listing;
      access: CollectionChoice["access"];
      movedOutOfGraph: boolean;
      encrypted?: boolean;
      url: string;
    }>(`/api/ext/publications/${encodeURIComponent(uid)}/collections`, {
      method: "POST",
      body: JSON.stringify({ collectionId }),
    });
    const cache = getCache();
    if (cache[uid])
      await setCache({
        ...cache,
        [uid]: {
          ...cache[uid],
          url: res.url,
          places: (cache[uid].places ?? 1) + (res.movedOutOfGraph ? 0 : 1),
          inGraph: res.movedOutOfGraph ? false : cache[uid].inGraph,
          // The collection may have encrypted it.
          encrypted: res.encrypted || cache[uid].encrypted,
        },
      });
    const how = res.listing === "unlisted" ? "unlisted" : startsAs({ listing: res.listing, access: res.access });
    toast(
      `Added to ${res.name}, ${how} there.${
        res.movedOutOfGraph
          ? ` It left your graph, so its graph link can't get around ${res.access === "password" ? "the password" : "members-only access"}.`
          : ""
      }`,
      { intent: "success", link: res.entryUrl, durationMs: res.movedOutOfGraph ? 15000 : undefined },
    );
  } catch (e) {
    report(e);
  }
}

/**
 * Asks before unpublishing: roam.pub deletes the page with everything attached to it there, and
 * publishing again starts from scratch. From the command palette (`checked` false), it first checks
 * the page is published and this key may unpublish it, so it never asks about something it can't do.
 */
export async function confirmUnpublish(uid: string, { checked = false } = {}) {
  if (!checked) {
    let cache: PublicationCache;
    try {
      cache = await syncPublications({ quiet: true });
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 0) return report(e);
      cache = getCache();
    }
    const c = cache[uid];
    if (!c) return toast("That isn't published, so there's nothing to unpublish.");
    if (c.mine === false)
      return toast("Another member of this graph published that. Only they or the graph's owner can unpublish it.", {
        link: openLink(c),
      });
  }
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
    // A page only in collections has no listing of its own: each collection lists it.
    const onlyInCollections = c.inGraph === false;
    const where = onlyInCollections ? "only in collections" : `(${LISTING_LABEL[listingOf(c)]})`;
    if (c.mine === false)
      return toast(
        `${label} is published ${where} by another member of this graph. Only they or the graph's owner can change it.${offline}`,
        { link: openLink(c) },
      );
    const since = new Date(c.updatedAt).toLocaleString();
    // Only which blocks are collapsed changing isn't a change to the content; it's said separately.
    const published = c.folded;
    const inRoam = foldedUids(payload.tree);
    const keptPayload = folded(payload, published ? "keep" : "expanded", published);
    const asIsHash = await hashPayload(payload);
    const keptHash = await hashPayload(keptPayload);
    // From an older server that doesn't say, published elsewhere, the collapsed blocks aren't known: either way matches.
    const changed = c.hash !== keptHash && c.hash !== asIsHash;
    const foldsDiffer = published ? !sameFolds(inRoam, foldedUids(keptPayload.tree)) : inRoam.length > 0 && c.hash !== asIsHash;
    // Only known for items published from this graph's extension settings.
    const bylineChanged = c.author !== undefined && c.author !== getAuthor();
    const upToDate = !changed && !bylineChanged;
    const republish = !foldsDiffer
      ? upToDate
        ? []
        : [{ label: "Republish", onClick: () => void publish(uid, { folds: "asIs" }) }]
      : published
        ? upToDate
          ? [syncFoldsAction(uid)]
          : republishActions(uid)
        : [
            { label: "Republish as is (Collapsed)", onClick: () => void publish(uid, { folds: "asIs" }) },
            ...(upToDate ? [] : [{ label: "Republish expanded", onClick: () => void publish(uid, { folds: "expanded" }) }]),
          ];
    const actions = [
      ...republish,
      ...listingActions(uid, c),
      ...collectionAction(uid, c),
      { label: "Unpublish", onClick: () => void confirmUnpublish(uid, { checked: true }) },
    ];
    const foldsNote = foldsDiffer ? ` The blocks collapsed in Roam aren't the ones collapsed on the published ${payload.kind}.` : "";
    // Roam's toasts can't grey a button out, so say why Make … or Add to collection… isn't there.
    const blocked =
      (onlyInCollections
        ? " Where it's listed is set in each of its collections on roam.pub."
        : (listingOf(c) !== "unlisted" && c.listedNote ? ` ${c.listedNote}` : "") ||
          (c.discoverBlocked && listingOf(c) !== "discover" ? ` ${c.discoverBlocked}` : "")) +
      (c.encrypted && collectionCount ? ENCRYPTED_COLLECTIONS : "");
    toast(
      upToDate
        ? `${label} is published ${where} and up to date. Last published ${since}.${foldsNote}${offline}${blocked}`
        : `${label} is published ${where} but ${changed ? "has changed" : "has a new author name"} since it was last published on ${since}.${foldsNote}${offline}${blocked}`,
      { intent: upToDate ? "success" : "none", link: openLink(c), actions, durationMs: 15000 },
    );
  } catch (e) {
    report(e);
  }
}
