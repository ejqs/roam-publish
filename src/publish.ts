import { api, ApiError } from "./api";
import { foldedUids, hashPayload, isShortlinkText, type Node, type Payload, refold, serialize, type Shortlinks } from "./serialize";
import {
  getApiKey,
  getAskWhere,
  getAuthor,
  getServer,
  getCache,
  getFirstFolds,
  getShortlinkEnabled,
  getShortlinkOnBlocks,
  getShortlinkPosition,
  getShortlinkTag,
  setCache,
  SHORTLINK_TEXT,
  type CachedPublication,
  type Listing,
  listingOf,
  type PublicationCache,
  type Visibility,
} from "./state";
import { toast } from "./toast";
import { canSeal, hashLike, keyedHash, type SealPlan, sealTree } from "./seal";

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
      hash: p.contentHash, url: p.url, kind: p.kind,
      // An encrypted page's title is encrypted on roam.pub, which only says "Encrypted page": keep the one
      // last published from here.
      title: (p.encrypted && previous[p.rootUid]?.title) || p.title, visibility: p.visibility, updatedAt: p.updatedAt,
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

/** The link block's text. Blocks written by earlier versions with other text are rewritten to it on the next publish. */
const linkText = (shortUrl: string) => `[${SHORTLINK_TEXT}](${shortUrl})`;

/**
 * The page's status link, written in Roam first or last under the root as
 *
 *   {tag}                          ← Block tag setting, [[Roam Publish]] by default
 *     [Roam Publish Status]({shortUrl})
 *       [[October 2nd, 2026]] …    ← the server appends change log entries here
 *
 * Written before publishing so the server learns the link block's uid with the publish. A tag changed
 * in settings, or link text an earlier version wrote, is replaced in place on the next publish, so the
 * entries stay put. Pages from earlier builds have a separate "Changelog" block under the tag; new entries go under the
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

const sameFolds = (a: string[], b: string[]) => a.length === b.length && a.every((u, i) => u === b[i]);

/** For when only which blocks are collapsed changed: makes the website's match Roam's. */
const syncFoldsAction = (uid: string) => ({ label: "Sync open/collapsed blocks", onClick: () => void publish(uid, { folds: "asIs" }) });

/**
 * Republish, keeping the published page's open and collapsed blocks when they're known (Sync open/collapsed
 * blocks changes those); otherwise as the Collapsed blocks setting says.
 */
const republishAction = (uid: string, published: string[] | undefined) => ({
  label: "Republish",
  onClick: () => void publish(uid, { folds: published ? "keep" : getFirstFolds() }),
});

type PublishResponse = {
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
};

/**
 * The page and its title encrypted for roam.pub, when it's a Password page there (it says, for a new
 * page, whether it will be), with its keyed hash. Null to send it as before: not encrypted, or a
 * roam.pub from before encryption in Roam. "roamCantEncrypt" when it's a Password page but this Roam
 * has no X25519 (older desktop apps): it's sent as before, roam.pub encrypts it on arrival, and the
 * toast says so. `encrypt`: Publish with encryption, refused (nothing sent) when roam.pub says it can't be.
 */
async function sealFor(uid: string, payload: Payload, encrypt: boolean, to?: string[]) {
  let plan: SealPlan;
  const query = new URLSearchParams([...(encrypt ? [["encrypt", "1"]] : []), ...(to ?? []).map((t) => ["to", t])]).toString();
  try {
    plan = await api<SealPlan>(`/api/ext/publications/${encodeURIComponent(uid)}/seal${query ? `?${query}` : ""}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && !encrypt) return null;
    if (e instanceof ApiError && e.status === 404) throw new ApiError(400, CANT_ENCRYPT_YET);
    throw e;
  }
  if (encrypt && !("encryptBlocked" in plan)) throw new ApiError(400, CANT_ENCRYPT_YET);
  if (encrypt && plan.encryptBlocked) throw new ApiError(400, plan.encryptBlocked);
  if (!plan.encrypt) return null;
  if (!(await canSeal())) return "roamCantEncrypt" as const;
  return {
    sealed: await sealTree(plan, payload.tree, payload.title),
    contentHash: (await keyedHash(await hashPayload(payload), { create: true }))!,
  };
}

/** roam.pub doesn't have Publish with encryption yet. */
const CANT_ENCRYPT_YET = "roam.pub can't publish with encryption yet. Nothing was published; try again later.";

/** Said after publishing a Password page that roam.pub had to encrypt, because this Roam can't. */
const encryptedByRoamPub = (unchanged: boolean) =>
  ` ${unchanged ? "This Roam can't encrypt pages itself, so its text and title reached roam.pub to check that." : "roam.pub encrypted it, since this Roam can't encrypt pages itself, so its text and title reached roam.pub this time."} To encrypt in Roam, update Roam's desktop app or publish from roamresearch.com in a browser.`;

type PublishOpts = {
  folds?: Folds;
  addedTo?: { name: string; entryUrl: string };
  encrypt?: boolean;
  /** Where a new page goes: "graph" and collection ids, as picked in "Publish where?". */
  to?: string[];
  /** Publish where roam.pub's New pages go to says, without asking (it was asked, or there's nothing to pick). */
  noAsk?: boolean;
};

/**
 * Publishes or republishes. `folds` says which blocks start collapsed on the website (see Folds).
 * Without it, a first publish (or one whose published collapsed blocks aren't known) follows the
 * Collapsed blocks setting, and a republish keeps the published page's open and collapsed blocks; when
 * only those differ from Roam's, it offers to sync them instead. `encrypt`: Publish
 * with encryption, for something not published yet: it goes to the graph as a Password page, encrypted.
 * Something new is first asked where it goes (askWhere), unless that's switched off in settings.
 */
export async function publish(uid: string, opts: PublishOpts = {}): Promise<void> {
  if (publishing.has(uid)) return toast("Already publishing that. One moment…");
  publishing.add(uid);
  let link: Awaited<ReturnType<typeof ensureShortlinkBlock>> = null;
  try {
    const cache = await ensureCache();
    // Publish with encryption is for something new: roam.pub ignores it on a republish.
    const already = opts.encrypt && cache[uid];
    if (already)
      return toast(
        already.encrypted
          ? `This ${already.kind} is already published, encrypted.`
          : `This ${already.kind} is already published, so this doesn't change it. To encrypt it, give it a password on roam.pub.`,
        { link: openLink(already) },
      );
    if (!cache[uid] && !opts.encrypt && !opts.to && !opts.noAsk && getAskWhere()) {
      // Asked before anything else, and before writing anything to the graph.
      publishing.delete(uid);
      return await askWhere(uid, opts);
    }
    const published = cache[uid]?.folded;
    let folds = opts.folds;
    if (!folds && !published) folds = getFirstFolds();
    if (!folds) {
      // Checked before writing anything to the graph.
      const first = await serialize(uid, shortlinksOf(cache));
      const inRoam = first ? foldedUids(first.tree) : [];
      const kept = first ? foldedUids(refold(first.tree, new Set(published))) : [];
      folds = "asIs";
      if (first && !sameFolds(inRoam, kept)) {
        // Nothing but collapsed blocks changed: republishing them kept would change nothing.
        if ((await hashLike(cache[uid]?.hash, folded(first, "keep", published))) === cache[uid]?.hash)
          return toast(
            `Only which blocks are collapsed changed since this ${first.kind} was published. Sync them to the website?`,
            { actions: [syncFoldsAction(uid), CANCEL], durationMs: 15000 },
          );
        folds = "keep";
      }
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
    let roamCantEncrypt = false;
    const send = async (retry = true): Promise<PublishResponse> => {
      // Password pages are encrypted here, title included, so roam.pub only gets the cipher (see seal.ts).
      const seal = await sealFor(uid, payload, !!opts.encrypt, opts.to);
      const sealed = seal === "roamCantEncrypt" ? null : seal;
      roamCantEncrypt = seal === "roamCantEncrypt";
      const body = sealed
        ? { rootUid: payload.rootUid, kind: payload.kind, folded: foldedUids(payload.tree), ...sealed }
        : { ...payload, contentHash: hash };
      try {
        return await api<PublishResponse>("/api/ext/publications", {
          method: "POST",
          body: JSON.stringify({
            ...body,
            author,
            anchorUid: link?.anchorUid,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            ...(opts.encrypt && { encrypt: true }),
            ...(opts.to && { to: opts.to }),
          }),
        });
      } catch (e) {
        // Where it's shown, or a password, changed while it was being encrypted: encrypt it again.
        if (sealed && retry && e instanceof ApiError && e.status === 409) return send(false);
        throw e;
      }
    };
    const res = await send();
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
    const msg = opts.addedTo
      ? `Added to ${opts.addedTo.name} and republished, so it opens there with ${opts.addedTo.name}'s password.`
      : res.status === "unchanged"
        ? `${label} is already published with no changes.`
        : res.status === "updated"
          ? `${label} republished with your changes.${copiedNote}`
          : opts.encrypt && res.encrypted
            ? `${label} published with encryption: it opens with your graph password.${copiedNote}`
          : res.inGraph === false
            ? `${label} published to collections only.${copiedNote}`
            : unlisted
              ? `${label} published as unlisted: only people with the link can see it.${copiedNote}`
              : `${label} published!${copiedNote}`;
    toast(roamCantEncrypt ? msg + encryptedByRoamPub(res.status === "unchanged") : msg, {
      intent: res.status === "unchanged" && !opts.addedTo ? "none" : "success",
      link: opts.addedTo?.entryUrl ?? res.url,
      durationMs: roamCantEncrypt ? 20000 : undefined,
      // New items start unlisted; offer the one-click upgrades, and collections, right where they'll see it.
      actions:
        res.status === "created"
          ? [...(unlisted ? listingActions(uid, res) : []), ...collectionAction(uid)]
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

/** The website's words for a page's visibility: the buttons, and what the status calls a page or block. */
const MAKE: Record<Listing, string> = { unlisted: "Make unlisted", listed: "Make public", discover: "Put on Discover" };
const statusLabel = (listing: Listing, kind: "page" | "block") =>
  listing === "discover" ? `${kind} on Discover` : `${listing === "listed" ? "public" : "unlisted"} ${kind}`;

type Places = {
  /** `encryptBlocked`: why it can't be published with encryption, or null when it can (from servers that say). */
  graph: { name: string; access: Access; encrypted: boolean; encryptBlocked?: string | null };
  collections: { id: string; name: string; access: Access; listing: Exclude<Listing, "unlisted">; encrypted: boolean }[];
  /** Where roam.pub's New pages go to puts a new page: "graph" and collection ids. */
  newPagesGoTo: string[];
};
type Access = "open" | "password" | "members";

/** How a new page starts out in a place, as the dropdown says it. */
const ACCESS_WORDS: Record<Access, string> = { open: "Open", password: "Password", members: "Members only" };
const startsWords = (p: { access: Access; encrypted: boolean }) => ACCESS_WORDS[p.access] + (p.encrypted ? ", encrypted" : "");

/** "Where New pages go to" as the dropdown says it, when that's more than one place. */
const NEW_PAGES = "new-pages";
/** Publish with encryption, as one of the choices. */
const ENCRYPTED = "graph-encrypted";

/**
 * "Publish where?": asks whether something new goes to the graph or one of the publisher's
 * collections, starting on where roam.pub's New pages go to says, so Publish is still one click.
 * A collection is the only place it goes; Add to collection… after publishing adds more. Not asked
 * when there's no collection to pick, nor by a roam.pub that can't publish to one directly.
 */
async function askWhere(uid: string, opts: PublishOpts): Promise<void> {
  let places: Places;
  try {
    places = await api<Places>("/api/ext/places");
  } catch (e) {
    // A roam.pub from before "Publish where?": publish as before.
    if (e instanceof ApiError && e.status === 404) return publish(uid, { ...opts, noAsk: true });
    return report(e);
  }
  // Not offered when new pages there are encrypted anyway.
  const offerEncrypted = places.graph.encryptBlocked !== undefined && !places.graph.encrypted;
  if (places.collections.length === 0 && !(offerEncrypted && !places.graph.encryptBlocked))
    return publish(uid, { ...opts, noAsk: true });
  const names = new Map([["graph", places.graph.name], ...places.collections.map((c) => [c.id, c.name] as [string, string])]);
  const goTo = places.newPagesGoTo.filter((t) => names.has(t));
  const several = goTo.length > 1;
  const options = [
    ...(several
      ? [{ value: NEW_PAGES, label: `New pages setting: ${goTo.map((t) => names.get(t)).join(" + ")}` }]
      : []),
    { value: "graph", label: `Graph: ${places.graph.name} (${startsWords(places.graph)})` },
    ...(offerEncrypted
      ? [{
          value: ENCRYPTED,
          label: `Graph: ${places.graph.name} (Password, encrypted)${places.graph.encryptBlocked ? ", needs a graph password that can encrypt" : ""}`,
          disabled: !!places.graph.encryptBlocked,
        }]
      : []),
    ...places.collections.map((c) => ({ value: c.id, label: `Collection: ${c.name} (${startsWords(c)})` })),
  ];
  const root = await window.roamAlphaAPI.data.async.pull("[:node/title]", `[:block/uid "${uid}"]`);
  const title = root?.[":node/title"];
  const kind = typeof title === "string" ? "page" : "block";
  toast(`Publish ${title ? `“${title}”` : `this ${kind}`} to:`, {
    select: { placeholder: "Publish to…", options, value: several ? NEW_PAGES : (goTo[0] ?? "graph") },
    actions: [
      {
        label: "Publish",
        onClick: (picked) =>
          void publish(
            uid,
            picked === ENCRYPTED
              ? { ...opts, noAsk: true, encrypt: true }
              : { ...opts, noAsk: true, to: picked === NEW_PAGES ? goTo : [picked] },
          ),
      },
    ],
    durationMs: 20000,
  });
}

const NOW: Record<Listing, string> = {
  unlisted: "Now unlisted: only people with the link can see it.",
  listed: "Now public: on your graph's front page.",
  discover: "Now on Discover and your graph's front page.",
};

/**
 * Buttons for every visibility but the current one. Put on Discover only shows when the
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
      label: MAKE[l],
      onClick: () => (current === "discover" && l !== "discover" ? confirmLeaveDiscover(uid, l) : void setListing(uid, l)),
    }));
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const OFF_DISCOVER: Record<Exclude<Listing, "discover">, string> = {
  listed: "It stays on your graph's front page.",
  unlisted: "It also comes off your graph's front page: only people with the link can see it.",
};

/** Closes a confirm toast without doing anything (any button closes it). */
const CANCEL = { label: "Cancel", onClick: () => {} };

/** Asks before taking a page off Discover, as the website does. */
export function confirmLeaveDiscover(uid: string, listing: Exclude<Listing, "discover">) {
  const title = getCache()[uid]?.title;
  toast(
    `Take ${title ? `“${title}”` : "this"} off roam.pub/discover? ${OFF_DISCOVER[listing]}`,
    {
      intent: "danger",
      actions: [{ label: MAKE[listing], onClick: () => void setListing(uid, listing) }, CANCEL],
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
    // Public with the graph's front page off: nothing lists it, so don't say the front page does.
    const now = listingOf(res);
    const note = now !== "unlisted" && res.listedNote;
    toast(note ? `Now public, but ${lowerFirst(note)}` : NOW[now], {
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
 * "Add to collection…", when there's a collection to add to.
 */
const collectionAction = (uid: string) =>
  collectionCount ? [{ label: "Add to collection…", onClick: () => void chooseCollection(uid) }] : [];

type CollectionChoice = {
  id: string;
  name: string;
  listing: Exclude<Listing, "unlisted">;
  access: "open" | "password" | "members";
  entryUrl: string | null;
  movesOutOfGraph: boolean;
  /** Why it can't be added there (an encrypted page in a collection without a usable password), from servers that say. */
  blocked?: string | null;
};

/** How a page starts out in a collection, as the dropdown says it. */
function startsAs(c: Pick<CollectionChoice, "listing" | "access">) {
  return c.access === "password"
    ? "password-protected"
    : c.access === "members"
      ? "members only"
      : c.listing === "discover"
        ? "public and on Discover"
        : "public";
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
            : c.blocked
              ? `${c.name} (needs a password that can encrypt)`
              : `${c.name}: ${startsAs(c)}${c.movesOutOfGraph ? ", leaves your graph" : ""}`,
          disabled: !!c.entryUrl || !!c.blocked,
        })),
        onChoose: (id) => void addToCollection(uid, id),
      },
      durationMs: 20000,
    });
  } catch (e) {
    report(e);
  }
}

/** Whether the page in Roam differs from what's published, apart from which blocks are collapsed. */
async function changedInRoam(uid: string) {
  const cache = getCache();
  const c = cache[uid];
  const payload = c && (await serialize(uid, shortlinksOf(cache)));
  if (!c || !payload) return false;
  return c.hash !== (await hashLike(c.hash, folded(payload, "keep", c.folded))) && c.hash !== (await hashLike(c.hash, payload));
}

/**
 * Adds a published page to a collection. An encrypted page is added waiting for a republish (only
 * its passwords open it, and a new collection's can't without one), so it's republished right
 * after: that locks it for every place's password, the new collection's included. When the page
 * changed in Roam since it was published, that republish would publish the changes too, so it asks
 * first (`confirmed`).
 */
export async function addToCollection(uid: string, collectionId: string, { confirmed = false } = {}) {
  try {
    if (getCache()[uid]?.encrypted && !confirmed && (await changedInRoam(uid)))
      return toast(
        "This page is encrypted, so adding it republishes it, and it changed in Roam since it was last published. Add it and publish your changes?",
        {
          actions: [
            { label: "Add and republish", onClick: () => void addToCollection(uid, collectionId, { confirmed: true }) },
            CANCEL,
          ],
          durationMs: 20000,
        },
      );
    const res = await api<{
      name: string;
      entryUrl: string;
      listing: Listing;
      access: CollectionChoice["access"];
      movedOutOfGraph: boolean;
      encrypted?: boolean;
      /** Encrypted: it opens there once republished (from servers that add encrypted pages). */
      needsRepublish?: boolean;
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
    if (res.needsRepublish)
      return publish(uid, {
        // Without the published page's collapsed blocks (older servers), as in Roam.
        folds: getCache()[uid]?.folded ? "keep" : "asIs",
        addedTo: { name: res.name, entryUrl: res.entryUrl },
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

/** What the status toast and the title icon's pop-up say about a page or block. */
export type StatusState = "unpublished" | "current" | "changed" | "unknown" | "removed" | "other";
export type StatusView = {
  state: StatusState;
  kind: "page" | "block";
  message: string;
  intent: "success" | "danger" | "none";
  link?: string;
  actions: { label: string; onClick: () => void }[];
  durationMs?: number;
  /** The cached publication, when it's published. */
  c?: CachedPublication;
  /** Uids of the blocks it publishes (the Roam Publish block left out), for marking edited ones. */
  uids?: string[];
};

/**
 * Whether a page or block is published, and if so whether it changed in Roam since, hashing the
 * content the way publishing does, and the actions its state calls for: publish, or the one thing to
 * do (republish, or sync open/collapsed blocks), add to collection and unpublish. With `sync`, the
 * published list is refreshed from the server first (falling back to the cache offline); without,
 * only the cache is read, so it costs no request. Null when the page or block can't be read.
 */
export async function statusView(uid: string, { sync }: { sync: boolean }): Promise<StatusView | null> {
  let cache: PublicationCache;
  let offline = "";
  if (sync) {
    try {
      cache = await syncPublications({ quiet: true });
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 0) throw e;
      cache = getCache();
      offline = " (couldn't reach the server; this is from the last sync)";
    }
  } else cache = getCache();
  const c = cache[uid];
  const payload = await serialize(uid, shortlinksOf(cache));
  if (!payload) return null;
  const { kind } = payload;
  const label = kind === "page" ? "Page" : "Block";
  if (!c)
    return {
      state: "unpublished", kind, intent: "none", message: `${label} isn't published.${offline}`,
      actions: [
        { label: `Publish ${kind}`, onClick: () => void publish(uid) },
        // Otherwise Publish asks, with encryption as one of the choices.
        ...(getAskWhere() ? [] : [{ label: "Publish with encryption", onClick: () => void publish(uid, { encrypt: true }) }]),
      ],
    };
  const uids = treeUids(payload.tree);
  if (c.removed)
    return { state: "removed", kind, c, uids, intent: "danger", message: `${label} was removed by a moderator.${offline}`, link: openLink(c), actions: [] };
  // A page only in collections has no listing of its own: each collection lists it.
  const onlyInCollections = c.inGraph === false;
  // "Unlisted page", "Encrypted public block", "Page on Discover", "Page in collections only".
  const listed = onlyInCollections ? `${kind} in collections only` : statusLabel(listingOf(c), kind);
  const what = upperFirst(c.encrypted ? `encrypted ${listed}` : listed);
  if (c.mine === false)
    return {
      state: "other", kind, c, uids, intent: "none", link: openLink(c), actions: [],
      message: `${what}, published by another member of this graph. Only they or the graph's owner can change it.${offline}`,
    };
  const since = new Date(c.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  // Only which blocks are collapsed changing isn't a change to the content; it's said separately.
  const published = c.folded;
  const inRoam = foldedUids(payload.tree);
  const keptPayload = folded(payload, published ? "keep" : "expanded", published);
  const asIsHash = await hashLike(c.hash, payload);
  const keptHash = await hashLike(c.hash, keptPayload);
  // Encrypted in Roam elsewhere, and the graph's key for telling hasn't reached this Roam's settings.
  if (asIsHash === null || keptHash === null)
    return {
      state: "unknown", kind, c, uids, intent: "none", link: openLink(c), durationMs: 15000,
      message: `${what}, last published ${since}. Can't tell here whether it changed. Republish to be sure.${offline}`,
      actions: [
        { label: "Republish", onClick: () => void publish(uid, { folds: "asIs" }) },
        ...collectionAction(uid),
        { label: "Unpublish", onClick: () => void confirmUnpublish(uid, { checked: true }) },
      ],
    };
  // From an older server that doesn't say, published elsewhere, the collapsed blocks aren't known: either way matches.
  const changed = c.hash !== keptHash && c.hash !== asIsHash;
  const foldsDiffer = published ? !sameFolds(inRoam, foldedUids(keptPayload.tree)) : inRoam.length > 0 && c.hash !== asIsHash;
  // Only known for items published from this graph's extension settings.
  const bylineChanged = c.author !== undefined && c.author !== getAuthor();
  const upToDate = !changed && !bylineChanged;
  // The one thing to do, if any: Republish (keeping the published open/collapsed blocks), or, when only
  // those differ, sync them. Visibility is changed on the status page the link opens.
  const next = !upToDate ? [republishAction(uid, published)] : foldsDiffer ? [syncFoldsAction(uid)] : [];
  const foldsNote = !foldsDiffer
    ? ""
    : upToDate || !published
      ? ` Collapsed blocks differ from the published ${kind}.`
      : ` Collapsed blocks differ from the published ${kind}; Republish keeps the published ones.`;
  // Public, but nothing lists it (its graph's front page is off).
  const listedNote = !onlyInCollections && listingOf(c) !== "unlisted" && c.listedNote ? ` ${c.listedNote}` : "";
  return {
    state: upToDate ? "current" : "changed", kind, c, uids, link: openLink(c), durationMs: 15000,
    intent: upToDate ? "success" : "none",
    message: upToDate
      ? `${what}, up to date. Last published ${since}.${foldsNote}${offline}${listedNote}`
      : `${what}, ${changed ? "changed" : "new author name"} since last published ${since}.${foldsNote}${offline}${listedNote}`,
    actions: [
      ...next,
      ...collectionAction(uid),
      { label: "Unpublish", onClick: () => void confirmUnpublish(uid, { checked: true }) },
    ],
  };
}

const treeUids = (n: Node): string[] => [n.uid, ...n.children.flatMap(treeUids)];

/**
 * The status as a toast, from the page and block menus and the command palette. Syncs first. Writes
 * nothing to the graph by itself.
 */
export async function publishStatus(uid: string) {
  try {
    const view = await statusView(uid, { sync: true });
    if (!view) return toast("Couldn't read that page or block.", { intent: "danger" });
    const { message, intent, link, actions, durationMs } = view;
    toast(message, { intent, link, actions, durationMs });
  } catch (e) {
    report(e);
  }
}
