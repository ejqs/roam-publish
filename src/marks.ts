import type { StatusState } from "./publish";

/** Blocks edited after `publishedAt`, from [uid, :edit/time] pairs; the root itself is left out. */
export function editedSince(times: [string, number][], publishedAt: string, rootUid: string): Set<string> {
  const at = Date.parse(publishedAt);
  if (Number.isNaN(at)) return new Set();
  return new Set(times.filter(([uid, t]) => uid !== rootUid && typeof t === "number" && t > at).map(([uid]) => uid));
}

/** How the title icon looks for a status: its Blueprint icon and tone. */
export function iconFor(state: StatusState, locked: boolean | undefined, unlisted = false) {
  // A lock behind a password (encrypted or not) or members only, a link when unlisted (only people with the
  // link), a globe otherwise. Nothing at all when it isn't published, so no icon can be read as "not published".
  const icon = locked ? "lock" : unlisted ? "link" : "globe";
  const tone =
    state === "current" ? "current" : state === "changed" ? "changed" : state === "removed" ? "danger" : "muted";
  return { icon, tone } as const;
}

/**
 * Adapted from `getUidsFromId` in roamjs-components (https://github.com/RoamJS/roamjs-components,
 * MIT License, Copyright (c) 2021 David Vargas), which reads the last 9 characters of the id.
 *
 * The block uid in a Roam block element's id ("block-input-{window}-{uid}"), when it's one of `uids`.
 * Uids are usually 9 characters; longer ones (from imports) are matched by suffix.
 */
export function uidInId(id: string, uids: ReadonlySet<string>): string | null {
  const short = id.slice(-9);
  if (uids.has(short) && id.charAt(id.length - 10) === "-") return short;
  for (const uid of uids) if (uid.length !== 9 && id.endsWith(`-${uid}`)) return uid;
  return null;
}

/** The uid at the end of a Roam block element's id ("block-input-{window}-{uid}"); uids are 9 characters. */
export function uidFromBlockId(id: string): string | null {
  const m = /-([\w-]{9})$/.exec(id);
  return m ? m[1] : null;
}

/** Blueprint's Icons16 glyphs, as Roam's Blueprint stylesheet draws them. */
const GLYPH: Record<"globe" | "link" | "lock", string> = { globe: "e666", link: "e62d", lock: "e625" };

/** A page title as a quoted CSS string, for an attribute selector. */
export const cssString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ")}"`;

/**
 * Adapted from the generated tag stylesheets of Tag Painter (https://github.com/8bitgentleman/roam-depot-tag-painter,
 * MIT License, Copyright (c) 2022 Matt Vogel) and Magic Tags (https://github.com/rcvd/magic-tags, MIT License,
 * Copyright (c) 2022 Alexander Rink), which draw a Blueprint Icons16 glyph on `span.rm-page-ref--tag[data-tag=…]`.
 *
 * The stylesheet for links to published pages: a small gray icon after each [[link]] and #tag to one
 * (a lock behind a password, a link when unlisted, a globe otherwise), grouped by icon so it's
 * one rule each. `pageAttr` marks a published page's container: there, links to pages not published
 * get a dotted underline, cleared for the published ones and in its linked references.
 */
export function linkStyles(pages: { title: string; icon: keyof typeof GLYPH }[], pageAttr: string) {
  const link = (t: string) => `[data-link-title=${cssString(t)}] > .rm-page-ref`;
  const tag = (t: string) => `.rm-page-ref--tag[data-tag=${cssString(t)}]`;
  const out = [
    `[${pageAttr}~="page"] [data-link-title] > .rm-page-ref { text-decoration: underline dotted rgba(138, 155, 168, 0.8); text-underline-offset: 3px; }`,
  ];
  if (pages.length)
    out.push(
      `${pages.map((p) => link(p.title)).join(",\n")} { text-decoration: none !important; }`,
      // Pseudo-elements can't go in :is(), so each selector is listed.
      `${pages.flatMap((p) => [link(p.title), tag(p.title)]).map((s) => `${s}::after`).join(",\n")} {
  font-family: "Icons16", "blueprint-icons-16"; font-size: 11px; line-height: 1; font-weight: 400; font-style: normal;
  display: inline-block; margin-left: 3px; vertical-align: 1px; color: #8a9ba8; text-decoration: none; }`,
    );
  for (const icon of Object.keys(GLYPH) as (keyof typeof GLYPH)[]) {
    const titles = pages.filter((p) => p.icon === icon).map((p) => p.title);
    if (titles.length)
      out.push(`${titles.flatMap((t) => [link(t), tag(t)]).map((s) => `${s}::after`).join(",\n")} { content: "\\${GLYPH[icon]}"; }`);
  }
  out.push(`[${pageAttr}~="page"] :is(.rm-reference-main, .rm-mentions) [data-link-title] > .rm-page-ref { text-decoration: none !important; }`);
  return out.join("\n");
}
