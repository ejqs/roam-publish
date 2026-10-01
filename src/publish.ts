import { api, ApiError } from "./api";
import { hashPayload, serialize } from "./serialize";
import { getCache, setCache, type PublicationCache, type Visibility } from "./state";
import { toast } from "./toast";

type Remote = {
  rootUid: string;
  kind: "page" | "block";
  title: string;
  url: string;
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

export async function publish(uid: string) {
  try {
    const payload = await serialize(uid);
    if (!payload) return toast("Couldn't read that page or block.", { intent: "danger" });
    const hash = await hashPayload(payload);
    const cache = await ensureCache();
    const label = payload.kind === "page" ? "Page" : "Block";

    if (cache[uid]?.hash === hash) {
      return toast(`${label} is already published with no changes.`, { link: cache[uid].url });
    }

    const res = await api<{
      status: "created" | "updated" | "unchanged";
      url: string;
      contentHash: string;
      visibility: Visibility;
    }>(
      "/api/ext/publications",
      { method: "POST", body: JSON.stringify({ ...payload, contentHash: hash }) },
    );
    await setCache({
      ...getCache(),
      [uid]: {
        hash: res.contentHash, url: res.url, title: payload.title, kind: payload.kind,
        visibility: res.visibility, updatedAt: new Date().toISOString(),
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
