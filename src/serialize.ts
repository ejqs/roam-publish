import { stableStringify } from "./stable-stringify";

export type Node = {
  uid: string;
  string: string;
  heading?: 1 | 2 | 3;
  viewType?: "numbered" | "document";
  align?: "center" | "right" | "justify";
  /** Set when the block is collapsed in Roam and has children; the website starts it folded. */
  collapsed?: true;
  embed?: Node;
  /** Further embeds in the same block, in order; omitted when it has at most one. */
  moreEmbeds?: Node[];
  title?: string;
  children: Node[];
};
export type Payload = { rootUid: string; kind: "page" | "block"; title: string; tree: Node };

const PATTERN =
  "[:block/uid :block/string :block/heading :block/text-align :block/open :children/view-type :node/title :block/order {:block/children ...}]";
const REF = /\(\(([\w-]{9,})\)\)/g;
// Spans whose block refs stay as written: code, embeds, and block-ref aliases `[label](((uid)))`.
const KEEP = /```[\s\S]*?```|`[^`\n]+`|\{\{(?:\[\[)?embed(?:-path|-children)?(?:\]\])?:[^}]*\}\}|\]\(\(\([\w-]{9,}\)\)\)/g;
const EMBED =
  /\{\{(?:\[\[)?(embed(?:-path|-children)?)(?:\]\])?:\s*(?:\(\(([\w-]{9,})\)\)|\[\[(.+?)\]\])\s*\}\}/g;
/** More than anyone puts in one block; keeps a pathological block from pulling half the graph. */
const MAX_EMBEDS_PER_BLOCK = 20;
const MAX_REF_DEPTH = 3;
const MAX_EMBED_DEPTH = 2;

/** Embeds currently being serialized, to stop at cycles and limit depth. */
type EmbedChain = string[];
/** Shortlink blocks to leave out of the tree, with everything under them. */
type Skip = (b: PullBlock) => boolean;
/** This graph's shortlink ids, and the uids of the Changelog blocks they nest under in Roam. */
export type Shortlinks = { ids: Set<string>; anchors: Set<string> };

async function resolveRefs(text: string, depth = 0, seen = new Set<string>()): Promise<string> {
  if (depth >= MAX_REF_DEPTH || !text.includes("((")) return text;
  const parts: { text: string; keep: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(KEEP)) {
    parts.push({ text: text.slice(last, m.index), keep: false }, { text: m[0], keep: true });
    last = m.index! + m[0].length;
  }
  parts.push({ text: text.slice(last), keep: false });

  const uids = [...new Set(parts.flatMap((p) => (p.keep ? [] : [...p.text.matchAll(REF)].map((m) => m[1]))))];
  const resolved = new Map<string, string>();
  for (const uid of uids) {
    if (seen.has(uid)) continue;
    const b = await window.roamAlphaAPI.data.async.pull("[:block/string :node/title]", `[:block/uid "${uid}"]`);
    const s = b?.[":block/string"] ?? b?.[":node/title"];
    if (s != null) resolved.set(uid, await resolveRefs(s, depth + 1, new Set([...seen, uid])));
  }
  return parts.map((p) => (p.keep ? p.text : p.text.replace(REF, (m, uid) => resolved.get(uid) ?? m))).join("");
}

/** Every `{{embed: …}}` in a block, in order; ones that can't be read or would loop are skipped. */
async function embedsOf(text: string, chain: EmbedChain, skip: Skip): Promise<Node[]> {
  if (chain.length > MAX_EMBED_DEPTH) return [];
  const nodes: Node[] = [];
  for (const m of [...text.matchAll(EMBED)].slice(0, MAX_EMBEDS_PER_BLOCK)) {
    const node = await embedOf(m, chain, skip);
    if (node) nodes.push(node);
  }
  return nodes;
}

async function embedOf(m: RegExpMatchArray, chain: EmbedChain, skip: Skip): Promise<Node | undefined> {
  const [, kind, uid, title] = m;
  const eid = uid ? `[:block/uid "${uid}"]` : `[:node/title "${title.replace(/["\\]/g, "\\$&")}"]`;
  const b = await window.roamAlphaAPI.data.async.pull(PATTERN, eid);
  const embedUid = b?.[":block/uid"];
  if (!b || !embedUid || chain.includes(embedUid)) return;
  const isPage = typeof b[":node/title"] === "string";
  const node = await toNode(b, isPage, [...chain, embedUid], skip);
  if (kind === "embed-children") node.string = "";
  else if (isPage) node.title = b[":node/title"];
  return node;
}

async function toNode(b: PullBlock, isPageRoot: boolean, chain: EmbedChain, skip: Skip): Promise<Node> {
  const children = (b[":block/children"] ?? []).filter((c) => !skip(c)).sort(
    (a, c) => (a[":block/order"] ?? 0) - (c[":block/order"] ?? 0),
  );
  const node: Node = {
    uid: b[":block/uid"]!,
    string: isPageRoot ? "" : await resolveRefs(b[":block/string"] ?? ""),
    children: await Promise.all(children.map((c) => toNode(c, false, chain, skip))),
  };
  const h = b[":block/heading"];
  if (!isPageRoot && (h === 1 || h === 2 || h === 3)) node.heading = h;
  // Pull returns keywords as strings, with or without the leading colon.
  const view = String(b[":children/view-type"] ?? "").replace(/^:/, "");
  if (view === "numbered" || view === "document") node.viewType = view;
  const align = b[":block/text-align"];
  if (!isPageRoot && (align === "center" || align === "right" || align === "justify")) node.align = align;
  if (!isPageRoot && b[":block/open"] === false && node.children.length) node.collapsed = true;
  if (!isPageRoot) {
    const [embed, ...more] = await embedsOf(node.string, chain, skip);
    if (embed) node.embed = embed;
    if (more.length) node.moreEmbeds = more;
  }
  return node;
}

/** The uids of collapsed blocks, embeds included, in order. */
export function foldedUids(n: Node): string[] {
  const embeds = [n.embed, ...(n.moreEmbeds ?? [])].filter((e): e is Node => !!e);
  return [...(n.collapsed ? [n.uid] : []), ...[...n.children, ...embeds].flatMap(foldedUids)];
}

/**
 * The tree with exactly these blocks collapsed (those that still have children). With none, every
 * block is open, which hashes the same as trees published before collapsed blocks were sent.
 */
export function refold(n: Node, folded: ReadonlySet<string>): Node {
  const { collapsed: _, embed, moreEmbeds, children, ...rest } = n;
  return {
    ...rest,
    ...(folded.has(n.uid) && children.length > 0 && { collapsed: true as const }),
    ...(embed && { embed: refold(embed, folded) }),
    ...(moreEmbeds && { moreEmbeds: moreEmbeds.map((e) => refold(e, folded)) }),
    children: children.map((c) => refold(c, folded)),
  };
}

/** "{server}/p/{id}" at the start of a block, bare or as `[text]({server}/p/{id})`. */
export const isShortlinkText = (s: string | undefined, shortIds: Set<string>) => {
  const m = s && /^(?:\[[^\]\n]*\]\()?https?:\/\/[^\s)]+?\/p\/([2-9A-HJ-NP-Za-km-z]{8})(?=[\s)]|$)/.exec(s);
  return !!m && shortIds.has(m[1]);
};

/**
 * A shortlink block: "{tag}" with the "[text]({server}/p/{id})" block and the change log under it (or, from
 * earlier builds, the link block itself). The tag block is recognised by a recorded Changelog block among
 * its children (the link block, or an earlier build's separate "Changelog" block next to it), so a status
 * link pasted under an ordinary block leaves out only the link. The same rule as the server's
 * `withoutShortlinks`.
 */
export const isShortlinkBlock = (b: PullBlock, { ids, anchors }: Shortlinks) => {
  if (isShortlinkText(b[":block/string"], ids)) return true;
  const kids = b[":block/children"] ?? [];
  return kids.some((c) => isShortlinkText(c[":block/string"], ids)) && kids.some((c) => anchors.has(c[":block/uid"] ?? ""));
};

/**
 * The publishable tree. Shortlink blocks of the given ids, and the change log under them, are left
 * out at any depth, so they're never published or hashed.
 */
export async function serialize(
  uid: string,
  shortlinks: Shortlinks = { ids: new Set(), anchors: new Set() },
): Promise<Payload | null> {
  const b = await window.roamAlphaAPI.data.async.pull(PATTERN, `[:block/uid "${uid}"]`);
  if (!b || !b[":block/uid"]) return null;
  const skip: Skip = (c) => isShortlinkBlock(c, shortlinks);
  const isPage = typeof b[":node/title"] === "string";
  const tree = await toNode(b, isPage, [uid], skip);
  return {
    rootUid: uid,
    kind: isPage ? "page" : "block",
    title: isPage ? b[":node/title"]! : tree.string.slice(0, 200),
    tree,
  };
}

export async function hashPayload(p: Payload) {
  const data = new TextEncoder().encode(stableStringify({ kind: p.kind, title: p.title, tree: p.tree }));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
