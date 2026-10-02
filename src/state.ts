export type CachedPublication = {
  hash: string;
  url: string;
  title: string;
  kind: "page" | "block";
  visibility: Visibility;
  updatedAt: string;
  /** Author name sent with the last publish; republishing with a new one updates the byline. */
  author?: string;
};
export type Visibility = "public" | "unlisted";
export type PublicationCache = Record<string, CachedPublication>;

let api: ExtensionAPI;

export function initState(extensionAPI: ExtensionAPI) {
  api = extensionAPI;
}

export const getServer = () =>
  ((api.settings.get("server-url") as string) || __DEFAULT_SERVER__).replace(/\/+$/, "");
export const getApiKey = () => ((api.settings.get("api-key") as string) || "").trim();
export const getAuthor = () => ((api.settings.get("author-name") as string) || "").trim();

export const getCache = (): PublicationCache =>
  (api.settings.get("publications") as PublicationCache) ?? {};

export async function setCache(cache: PublicationCache) {
  await api.settings.set("publications", cache);
}
