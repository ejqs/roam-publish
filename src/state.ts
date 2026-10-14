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
/** The status link's text, as [Roam Publish Status](link). */
export const SHORTLINK_TEXT = "Roam Publish Status";

/** Where the Roam Publish block is added, as the settings panel's select shows it. */
export const BLOCK_CHOICES = ["Pages", "Pages and blocks", "Blocks only", "Off"] as const;
type BlockChoice = (typeof BLOCK_CHOICES)[number];
const BLOCK_SETTING = "shortlink-add";

/** The Collapsed blocks setting's choices, as the settings panel shows and stores them. */
export const COLLAPSED_AS_IN_ROAM = "As in Roam";
export const COLLAPSED_EXPANDED = "Expanded";

export function initState(extensionAPI: ExtensionAPI) {
  api = extensionAPI;
  // Graphs set up before these defaults keep the labels their blocks already have.
  const existing = !!api.settings.get("api-key") || Object.keys(getCache()).length > 0;
  if (api.settings.get("shortlink-tag") == null)
    void save("shortlink-tag", existing ? "#published" : DEFAULT_SHORTLINK_TAG);
  // Saved so the settings panel's selects show them. Both carry over what versions before 0.2.0 saved.
  if (api.settings.get(BLOCK_SETTING) == null) void save(BLOCK_SETTING, legacyBlockChoice());
  const position = api.settings.get("shortlink-position");
  if (position !== "First" && position !== "Last") void save("shortlink-position", position === "bottom" ? "Last" : "First");
  if (api.settings.get("collapsed-blocks") == null) void save("collapsed-blocks", COLLAPSED_AS_IN_ROAM);
  if (api.settings.get("ask-where") == null) void save("ask-where", true);
}

/** What the two switches before the select said: pages on unless switched off, blocks off unless on. */
function legacyBlockChoice(): BlockChoice {
  const pages = api.settings.get("shortlink-enabled") !== false;
  const blocks = api.settings.get("shortlink-blocks") === true;
  return pages ? (blocks ? "Pages and blocks" : "Pages") : blocks ? "Blocks only" : "Off";
}

function blockChoice(): BlockChoice {
  const saved = api.settings.get(BLOCK_SETTING);
  return BLOCK_CHOICES.includes(saved as BlockChoice) ? (saved as BlockChoice) : legacyBlockChoice();
}

/** Keeps the old switches in step with the select, for a device still on an earlier version. */
export function saveLegacyBlockSwitches(choice: string) {
  return Promise.all([
    save("shortlink-enabled", choice === "Pages" || choice === "Pages and blocks"),
    save("shortlink-blocks", choice === "Pages and blocks" || choice === "Blocks only"),
  ]);
}

/** Set when the extension is built (ROAM_PUBLISH_SERVER); roam.pub by default. */
export const getServer = () => __DEFAULT_SERVER__.replace(/\/+$/, "");
export const getApiKey = () => ((api.settings.get("api-key") as string) || "").trim();
export const getAuthor = () => ((api.settings.get("author-name") as string) || "").trim();
/** Published pages get a Roam Publish block. */
export const getShortlinkEnabled = () => blockChoice() === "Pages" || blockChoice() === "Pages and blocks";
/** Published blocks get a Roam Publish block. */
export const getShortlinkOnBlocks = () => blockChoice() === "Pages and blocks" || blockChoice() === "Blocks only";
/** The Roam Publish block's text; blank for none. */
/** Whether Publish asks where a new page goes; on unless switched off. */
export const getAskWhere = () => api.settings.get("ask-where") !== false;
export const getShortlinkTag = () => ((api.settings.get("shortlink-tag") as string) ?? DEFAULT_SHORTLINK_TAG).trim();
/** How collapsed blocks start on a first publish: as in Roam unless set to Expanded. */
export const getFirstFolds = () => (api.settings.get("collapsed-blocks") === COLLAPSED_EXPANDED ? "expanded" : "asIs");
/** First or last under the page or block; "bottom" is how earlier versions saved Last. */
export const getShortlinkPosition = () => {
  const saved = api.settings.get("shortlink-position");
  return saved === "Last" || saved === "bottom" ? "bottom" : "top";
};

export const getCache = (): PublicationCache =>
  (api.settings.get("publications") as PublicationCache) ?? {};

export async function setCache(cache: PublicationCache) {
  await save("publications", cache);
}

/** The key for encrypted pages' content hashes (seal.ts `keyedHash`), when this graph has one. */
export function savedHashKey() {
  const saved = api.settings.get("hash-key");
  return typeof saved === "string" && /^[\w-]{43}$/.test(saved) ? saved : null;
}

let makingHashKey: Promise<string> | null = null;
/**
 * The hash key, made the first time a page is encrypted. Kept in the graph's extension settings, so
 * every device publishing this graph shares it. Made once even when two pages are published at once.
 */
export async function getHashKey() {
  const saved = savedHashKey();
  if (saved) return saved;
  makingHashKey ??= (async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await save("hash-key", key);
    return key;
  })().finally(() => (makingHashKey = null));
  return makingHashKey;
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
