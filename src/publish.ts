import { api, ApiError } from "./api";
import { hashPayload, isShortlinkBlock, serialize } from "./serialize";
import {
  getAuthor,
  getCache,
  getShortlinkEnabled,
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

/** Re-download the list of published items from the server into the cache. */
export async function syncPublications(opts: { quiet?: boolean } = {}) {
  const { publications } = await api<{ publications: Remote[] }>("/api/ext/publications");
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

/**
 * The page's permanent link, and the shortlink block in Roam that the server's change log nests
 * under: "{shortUrl} {tag}", first or last under the root. Written before publishing so the server
 * learns its uid with the publish. Null when it's turned off or the server has no shortlinks.
 */
async function ensureShortlinkBlock(rootUid: string, cached: CachedPublication | undefined) {
  if (!getShortlinkEnabled()) return null;
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
  const text = `${shortUrl} ${getShortlinkTag()}`.trim();
  try {
    const root = await window.roamAlphaAPI.data.async.pull(
      "[{:block/children [:block/uid :block/string]}]",
      `[:block/uid "${rootUid}"]`,
    );
    const existing = root?.[":block/children"]?.find((c) => isShortlinkBlock(c[":block/string"], ids));
    if (existing?.[":block/uid"]) {
      // A changed tag is applied in place, so the change log under it stays where it is.
      if (existing[":block/string"] !== text)
        await window.roamAlphaAPI.data.block.update({ block: { uid: existing[":block/uid"], string: text } });
      return { shortUrl, anchorUid: existing[":block/uid"] };
    }
    const anchorUid = window.roamAlphaAPI.util.generateUID();
    await window.roamAlphaAPI.data.block.create({
      location: { "parent-uid": rootUid, order: getShortlinkPosition() === "top" ? 0 : "last" },
      block: { uid: anchorUid, string: text },
    });
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
