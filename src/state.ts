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
  updatedAt: string;
  /** Author name sent with the last publish; republishing with a new one updates the byline. */
  author?: string;
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
  if (api.settings.get("shortlink-tag") === undefined)
    void api.settings.set("shortlink-tag", existing ? "#published" : DEFAULT_SHORTLINK_TAG);
  if (api.settings.get("shortlink-text") === undefined) void api.settings.set("shortlink-text", DEFAULT_SHORTLINK_TEXT);
  // Store defaults so the settings panel's switch and select show them.
  if (api.settings.get("shortlink-enabled") === undefined) void api.settings.set("shortlink-enabled", true);
  if (api.settings.get("shortlink-position") === undefined) void api.settings.set("shortlink-position", "top");
  if (api.settings.get("shortlink-blocks") === undefined) void api.settings.set("shortlink-blocks", false);
}

/**
 * Roam keeps an extension's settings in the graph after it's uninstalled, so reinstalling brings
 * back the old values rather than the defaults. This puts the Roam Publish block settings back.
 */
export async function resetShortlinkSettings() {
  await Promise.all([
    api.settings.set("shortlink-enabled", true),
    api.settings.set("shortlink-blocks", false),
    api.settings.set("shortlink-tag", DEFAULT_SHORTLINK_TAG),
    api.settings.set("shortlink-text", DEFAULT_SHORTLINK_TEXT),
    api.settings.set("shortlink-position", "top"),
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
  // Roam refuses to save settings holding undefined (a byline never sent, a field an older server
  // leaves out), so those fields are left out rather than stored.
  await api.settings.set("publications", withoutUndefined(cache));
}

const withoutUndefined = (cache: PublicationCache): PublicationCache =>
  Object.fromEntries(
    Object.entries(cache).map(([uid, c]) => [
      uid,
      Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) as CachedPublication,
    ]),
  );
