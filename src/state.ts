export type CachedPublication = {
  hash: string;
  url: string;
  title: string;
  kind: "page" | "block";
  updatedAt: string;
};
export type PublicationCache = Record<string, CachedPublication>;

let api: ExtensionAPI;
const listeners = new Set<() => void>();

export function initState(extensionAPI: ExtensionAPI) {
  api = extensionAPI;
}

export const getServer = () =>
  ((api.settings.get("server-url") as string) || __DEFAULT_SERVER__).replace(/\/+$/, "");
export const getApiKey = () => ((api.settings.get("api-key") as string) || "").trim();
export const setApiKey = (key: string) => api.settings.set("api-key", key);

export const getCache = (): PublicationCache =>
  (api.settings.get("publications") as PublicationCache) ?? {};

export async function setCache(cache: PublicationCache) {
  await api.settings.set("publications", cache);
  listeners.forEach((l) => l());
}

export function onCacheChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
