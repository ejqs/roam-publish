import { stableStringify } from "./stable-stringify";

export type Node = {
  uid: string;
  string: string;
  heading?: 1 | 2 | 3;
  viewType?: "numbered" | "document";
  align?: "center" | "right" | "justify";
  embed?: Node;
  children: Node[];
};
export type Payload = { rootUid: string; kind: "page" | "block"; title: string; tree: Node };

const PATTERN =
  "[:block/uid :block/string :block/heading :block/text-align :children/view-type :node/title :block/order {:block/children ...}]";
const REF = /\(\(([\w-]{9,})\)\)/g;
// Spans whose block refs stay as written: code, embeds, and block-ref aliases `[label](((uid)))`.
const KEEP = /```[\s\S]*?```|`[^`\n]+`|\{\{(?:\[\[)?embed(?:-path|-children)?(?:\]\])?:[^}]*\}\}|\]\(\(\([\w-]{9,}\)\)\)/g;
const EMBED =
  /\{\{(?:\[\[)?(embed(?:-path|-children)?)(?:\]\])?:\s*(?:\(\(([\w-]{9,})\)\)|\[\[(.+?)\]\])\s*\}\}/;
const MAX_REF_DEPTH = 3;
const MAX_EMBED_DEPTH = 2;

/** Embeds currently being serialized, to stop at cycles and limit depth. */
type EmbedChain = string[];

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

async function embedOf(text: string, chain: EmbedChain): Promise<Node | undefined> {
  const m = EMBED.exec(text);
  if (!m || chain.length > MAX_EMBED_DEPTH) return;
  const [, kind, uid, title] = m;
  const eid = uid ? `[:block/uid "${uid}"]` : `[:node/title "${title.replace(/["\\]/g, "\\$&")}"]`;
  const b = await window.roamAlphaAPI.data.async.pull(PATTERN, eid);
  const embedUid = b?.[":block/uid"];
  if (!b || !embedUid || chain.includes(embedUid)) return;
  const isPage = typeof b[":node/title"] === "string";
  const node = await toNode(b, isPage, [...chain, embedUid]);
  if (kind === "embed-children") node.string = "";
  else if (isPage) node.string = `[[${b[":node/title"]}]]`;
  return node;
}

async function toNode(b: PullBlock, isPageRoot: boolean, chain: EmbedChain): Promise<Node> {
  const children = [...(b[":block/children"] ?? [])].sort(
    (a, c) => (a[":block/order"] ?? 0) - (c[":block/order"] ?? 0),
  );
  const node: Node = {
    uid: b[":block/uid"]!,
    string: isPageRoot ? "" : await resolveRefs(b[":block/string"] ?? ""),
    children: await Promise.all(children.map((c) => toNode(c, false, chain))),
  };
  const h = b[":block/heading"];
  if (!isPageRoot && (h === 1 || h === 2 || h === 3)) node.heading = h;
  // Pull returns keywords as strings, with or without the leading colon.
  const view = String(b[":children/view-type"] ?? "").replace(/^:/, "");
  if (view === "numbered" || view === "document") node.viewType = view;
  const align = b[":block/text-align"];
  if (!isPageRoot && (align === "center" || align === "right" || align === "justify")) node.align = align;
  if (!isPageRoot) {
    const embed = await embedOf(node.string, chain);
    if (embed) node.embed = embed;
  }
  return node;
}

export async function serialize(uid: string): Promise<Payload | null> {
  const b = await window.roamAlphaAPI.data.async.pull(PATTERN, `[:block/uid "${uid}"]`);
  if (!b || !b[":block/uid"]) return null;
  const isPage = typeof b[":node/title"] === "string";
  const tree = await toNode(b, isPage, [uid]);
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
