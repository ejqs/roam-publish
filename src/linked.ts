import { EMBED, KEEP, REF } from "./serialize";
import { getCache } from "./state";

/**
 * What a page or block about to be published draws on beyond itself, for its Publish pop-up: the
 * pages it links to that aren't published (offered to publish with it), and the embeds and block
 * references whose text is copied in from other pages.
 */

export type Linked = {
  /** Pages it links to that aren't published, in the order they first appear. */
  pages: { uid: string; title: string }[];
  /** Embeds from other pages, by the title of the page each comes from. */
  embeds: string[];
  /** Block references to blocks on other pages. */
  refs: number;
};

type Pulled = { ":block/uid"?: string; ":block/string"?: string; ":block/children"?: Pulled[] };

/** Embedded page titles, embedded block uids and referenced block uids in some block text. */
export function inText(strings: string[]) {
  const pageEmbeds: string[] = [];
  const blockEmbeds: string[] = [];
  const refs: string[] = [];
  for (const s of strings) {
    for (const m of s.matchAll(EMBED)) m[2] ? blockEmbeds.push(m[2]) : m[3] && pageEmbeds.push(m[3]);
    // References outside code, embeds and aliases, as the serializer resolves them.
    const outside = s.replace(KEEP, " ");
    for (const m of outside.matchAll(REF)) refs.push(m[1]);
  }
  return { pageEmbeds, blockEmbeds, refs };
}

/** Pages not worth offering: daily notes and Roam's own markers. */
const DAILY = /^\d{2}-\d{2}-\d{4}$/;
const BUILT_IN = new Set(["TODO", "DONE", "embed", "embed-path", "embed-children", "query", "table", "kanban", "mentions", "slider", "word-count", "pdf", "video", "youtube", "iframe", "roam/js", "roam/css", "Roam Publish"]);
export const offerable = (p: { uid: string; title: string }) => !DAILY.test(p.uid) && !BUILT_IN.has(p.title) && !p.title.startsWith("roam/");

export async function linkedContent(uid: string): Promise<Linked> {
  const q = window.roamAlphaAPI.data.async.q;
  const root = (await window.roamAlphaAPI.data.async.pull("[:block/uid :block/string {:block/children ...}]", `[:block/uid "${uid}"]`)) as Pulled | null;
  if (!root) return { pages: [], embeds: [], refs: 0 };
  const blocks: Pulled[] = [];
  const walk = (b: Pulled) => (blocks.push(b), (b[":block/children"] ?? []).forEach(walk));
  walk(root);
  const uids = blocks.map((b) => b[":block/uid"]!).filter(Boolean);
  // The page it's on: itself for a page.
  const home: string = (await q("[:find ?pu . :in $ ?u :where [?b :block/uid ?u] [?b :block/page ?p] [?p :block/uid ?pu]]", uid)) ?? uid;

  const cache = getCache();
  const linked: [string, string][] = await q(
    "[:find ?pu ?t :in $ [?u ...] :where [?b :block/uid ?u] [?b :block/refs ?p] [?p :node/title ?t] [?p :block/uid ?pu]]",
    uids,
  );
  // In the order they appear in the text, so the list reads like the page.
  const text = blocks.map((b) => b[":block/string"] ?? "").join("\n");
  const at = (t: string) => {
    const i = text.indexOf(`[[${t}]]`);
    return i < 0 ? text.indexOf(`#${t}`) >>> 0 : i;
  };
  const { pageEmbeds, blockEmbeds, refs } = inText(blocks.map((b) => b[":block/string"] ?? ""));
  // A page that's only embedded is copied in already, so it isn't offered.
  const embeddedOnly = (t: string) => {
    const embedded = pageEmbeds.filter((e) => e === t).length;
    // Each page embed writes [[t]] once; any more is a link of its own.
    return embedded > 0 && text.split(`[[${t}]]`).length - 1 <= embedded && !text.includes(`#${t}`);
  };
  const pages = linked
    .map(([u, t]) => ({ uid: u, title: t }))
    .filter((p) => p.uid !== home && p.uid !== uid && !cache[p.uid] && offerable(p) && !embeddedOnly(p.title))
    .sort((a, b) => at(a.title) - at(b.title));

  const pagesOf: [string, string, string][] = [...blockEmbeds, ...refs].length
    ? await q(
        "[:find ?u ?pu ?t :in $ [?u ...] :where [?b :block/uid ?u] [?b :block/page ?p] [?p :block/uid ?pu] [?p :node/title ?t]]",
        [...new Set([...blockEmbeds, ...refs])],
      )
    : [];
  const pageOf = new Map(pagesOf.map(([u, pu, t]) => [u, { uid: pu, title: t }]));
  const homeTitle = (await q("[:find ?t . :in $ ?u :where [?p :block/uid ?u] [?p :node/title ?t]]", home)) as string | null;
  const embeds = [
    ...pageEmbeds.filter((t) => t !== homeTitle),
    ...blockEmbeds.map((u) => pageOf.get(u)).filter((p) => p && p.uid !== home).map((p) => p!.title),
  ];
  const otherRefs = refs.filter((u) => {
    const p = pageOf.get(u);
    return p && p.uid !== home;
  }).length;
  return { pages, embeds, refs: otherRefs };
}

/** "1 embed (Seed catalog) and 2 block references", or null when there are none. */
export function borrowedWords(embeds: string[], refs: number) {
  const names = [...new Set(embeds)];
  const parts = [
    ...(embeds.length ? [`${embeds.length} ${embeds.length === 1 ? "embed" : "embeds"} (${names.slice(0, 3).join(", ")}${names.length > 3 ? ", …" : ""})`] : []),
    ...(refs ? [`${refs} block ${refs === 1 ? "reference" : "references"}`] : []),
  ];
  return parts.length ? parts.join(" and ") : null;
}
