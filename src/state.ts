export type CachedPublication = {
  hash: string;
  url: string;
  title: string;
  kind: "page" | "block";
  visibility: Visibility;
  /** Unlisted, Listed or Discoverable, as the website says (from servers that say). */
  listing?: Listing;
  /** Why it can't be made Discoverable, in words; null when it can (from servers that say). */
  discoverBlocked?: string | null;
  /** Why it's listed but nothing shows it (its graph's front page is off), in words (from servers that say). */
  listedNote?: string | null;
  /** False when it's only in collections, so it has no listing of its own (from servers that say). */
  inGraph?: boolean;
  /** Sealed with a password, so collections are added on roam.pub (from servers that say). */
  encrypted?: boolean;
  updatedAt: string;
  /** Author name sent with the last publish; republishing with a new one updates the byline. */
  author?: string;
  /** Uids of the blocks collapsed on the published page, as the server last said (or as last published from here). */
  folded?: string[];
  /** Permanent {server}/p/{id} link, from servers that have shortlinks. */
  shortUrl?: string | null;
  /** How many places (its graph, collections) it's published in, as of the last sync (from servers that say). */
  places?: number;
  /** The shortlink block in Roam the server's change log nests under. */
  anchorUid?: string | null;
  /** Taken down by a moderator, as of the last sync. */
  removed?: boolean;
  /** False when another member of a shared graph published it, so this key can't change it. */
  mine?: boolean;
};
export type Visibility = "public" | "unlisted";
export type Listing = "unlisted" | "listed" | "discover";

/** Where it's listed; older servers only say public or unlisted. */
export const listingOf = (c: { visibility: Visibility; listing?: Listing }): Listing =>
  c.listing ?? (c.visibility === "public" ? "listed" : "unlisted");
export type PublicationCache = Record<string, CachedPublication>;

let api: ExtensionAPI;

export const DEFAULT_SHORTLINK_TAG = "[[Roam Publish]]";
export const DEFAULT_SHORTLINK_TEXT = "Roam Publish Status";

export function initState(extensionAPI: ExtensionAPI) {
  api = extensionAPI;
  // Graphs set up before these defaults keep the labels their blocks already have.
  const existing = !!api.settings.get("api-key") || Object.keys(getCache()).length > 0;
  if (api.settings.get("shortlink-tag") == null)
    void save("shortlink-tag", existing ? "#published" : DEFAULT_SHORTLINK_TAG);
  if (api.settings.get("shortlink-text") == null) void save("shortlink-text", DEFAULT_SHORTLINK_TEXT);
  // Store defaults so the settings panel's switch and select show them.
  if (api.settings.get("shortlink-enabled") == null) void save("shortlink-enabled", true);
  if (api.settings.get("shortlink-position") == null) void save("shortlink-position", "top");
  if (api.settings.get("shortlink-blocks") == null) void save("shortlink-blocks", false);
}

/**
 * Roam keeps an extension's settings in the graph after it's uninstalled, so reinstalling brings
 * back the old values rather than the defaults. This puts the Roam Publish block settings back.
 */
export async function resetShortlinkSettings() {
  await Promise.all([
    save("shortlink-enabled", true),
    save("shortlink-blocks", false),
    save("shortlink-tag", DEFAULT_SHORTLINK_TAG),
    save("shortlink-text", DEFAULT_SHORTLINK_TEXT),
    save("shortlink-position", "top"),
  ]);
}

export const getServer = () =>
  ((api.settings.get("server-url") as string)?.trim() || __DEFAULT_SERVER__).replace(/\/+$/, "");
export const getApiKey = () => ((api.settings.get("api-key") as string) || "").trim();
export const getAuthor = () => ((api.settings.get("author-name") as string) || "").trim();
/** On unless switched off. */
export const getShortlinkEnabled = () => api.settings.get("shortlink-enabled") !== false;
/** The shortlink block's text; blank for none. */
export const getShortlinkTag = () => ((api.settings.get("shortlink-tag") as string) ?? DEFAULT_SHORTLINK_TAG).trim();
/** Shown for the link, as [text](link); blank for the bare link. */
export const getShortlinkText = () => ((api.settings.get("shortlink-text") as string) ?? DEFAULT_SHORTLINK_TEXT).trim();
/** Published blocks get a shortlink block only when this is on; pages always do. */
export const getShortlinkOnBlocks = () => api.settings.get("shortlink-blocks") === true;
export const getShortlinkPosition = () => (api.settings.get("shortlink-position") === "bottom" ? "bottom" : "top");

export const getCache = (): PublicationCache =>
  (api.settings.get("publications") as PublicationCache) ?? {};

export async function setCache(cache: PublicationCache) {
  await save("publications", cache);
}

/**
 * The key for encrypted pages' content hashes (seal.ts `keyedHash`), made the first time it's needed.
 * Kept in the graph's extension settings, so every device publishing this graph shares it.
 */
export async function getHashKey() {
  const saved = api.settings.get("hash-key");
  if (typeof saved === "string" && /^[\w-]{43}$/.test(saved)) return saved;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await save("hash-key", key);
  return key;
}

/**
 * Every setting is written through here. Roam refuses to save a value holding undefined anywhere
 * (a byline never sent, a field an older server leaves out, a count a new page doesn't have yet),
 * so undefined fields and array entries are left out rather than stored.
 */
function save(key: string, value: unknown) {
  return api.settings.set(key, withoutUndefined(value));
}

export function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.filter((v) => v !== undefined).map(withoutUndefined) as T;
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, withoutUndefined(v)]),
  ) as T;
}
