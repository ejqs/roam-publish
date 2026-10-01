import { stableStringify } from "./stable-stringify";

export type Node = { uid: string; string: string; heading?: 1 | 2 | 3; children: Node[] };
export type Payload = { rootUid: string; kind: "page" | "block"; title: string; tree: Node };

const PATTERN = "[:block/uid :block/string :block/heading :node/title :block/order {:block/children ...}]";
const REF = /\(\(([\w-]{9,})\)\)/g;
const MAX_REF_DEPTH = 3;

async function resolveRefs(text: string, depth = 0, seen = new Set<string>()): Promise<string> {
  if (depth >= MAX_REF_DEPTH || !text.includes("((")) return text;
  const uids = [...new Set([...text.matchAll(REF)].map((m) => m[1]))];
  const resolved = new Map<string, string>();
  for (const uid of uids) {
    if (seen.has(uid)) continue;
    const b = await window.roamAlphaAPI.data.async.pull("[:block/string :node/title]", `[:block/uid "${uid}"]`);
    const s = b?.[":block/string"] ?? b?.[":node/title"];
    if (s != null) resolved.set(uid, await resolveRefs(s, depth + 1, new Set([...seen, uid])));
  }
  return text.replace(REF, (m, uid) => resolved.get(uid) ?? m);
}

async function toNode(b: PullBlock, isPageRoot = false): Promise<Node> {
  const children = [...(b[":block/children"] ?? [])].sort(
    (a, c) => (a[":block/order"] ?? 0) - (c[":block/order"] ?? 0),
  );
  const node: Node = {
    uid: b[":block/uid"]!,
    string: isPageRoot ? "" : await resolveRefs(b[":block/string"] ?? ""),
    children: await Promise.all(children.map((c) => toNode(c))),
  };
  const h = b[":block/heading"];
  if (!isPageRoot && (h === 1 || h === 2 || h === 3)) node.heading = h;
  return node;
}

export async function serialize(uid: string): Promise<Payload | null> {
  const b = await window.roamAlphaAPI.data.async.pull(PATTERN, `[:block/uid "${uid}"]`);
  if (!b || !b[":block/uid"]) return null;
  const isPage = typeof b[":node/title"] === "string";
  const tree = await toNode(b, isPage);
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
