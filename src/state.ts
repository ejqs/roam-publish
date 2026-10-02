export type CachedPublication = {
  hash: string;
  url: string;
  title: string;
  kind: "page" | "block";
  visibility: Visibility;
  updatedAt: string;
  /** Author name sent with the last publish; republishing with a new one updates the byline. */
  author?: string;
  /** Permanent {server}/p/{id} link, from servers that have shortlinks. */
  shortUrl?: string | null;
  /** The shortlink block in Roam the server's change log nests under. */
  anchorUid?: string | null;
};
export type Visibility = "public" | "unlisted";
export type PublicationCache = Record<string, CachedPublication>;

let api: ExtensionAPI;

export function initState(extensionAPI: ExtensionAPI) {
  api = extensionAPI;
  // Store defaults so the settings panel's switch and select show them.
  if (api.settings.get("shortlink-enabled") === undefined) void api.settings.set("shortlink-enabled", true);
  if (api.settings.get("shortlink-position") === undefined) void api.settings.set("shortlink-position", "top");
  if (api.settings.get("shortlink-blocks") === undefined) void api.settings.set("shortlink-blocks", false);
}

export const getServer = () =>
  ((api.settings.get("server-url") as string) || __DEFAULT_SERVER__).replace(/\/+$/, "");
export const getApiKey = () => ((api.settings.get("api-key") as string) || "").trim();
export const getAuthor = () => ((api.settings.get("author-name") as string) || "").trim();
/** On unless switched off. */
export const getShortlinkEnabled = () => api.settings.get("shortlink-enabled") !== false;
export const getShortlinkTag = () => ((api.settings.get("shortlink-tag") as string) ?? "#published").trim();
/** Published blocks get a shortlink block only when this is on; pages always do. */
export const getShortlinkOnBlocks = () => api.settings.get("shortlink-blocks") === true;
export const getShortlinkPosition = () => (api.settings.get("shortlink-position") === "bottom" ? "bottom" : "top");

export const getCache = (): PublicationCache =>
  (api.settings.get("publications") as PublicationCache) ?? {};

export async function setCache(cache: PublicationCache) {
  await api.settings.set("publications", cache);
}
