import type { StatusState } from "./publish";

/** Blocks edited after `publishedAt`, from [uid, :edit/time] pairs; the root itself is left out. */
export function editedSince(times: [string, number][], publishedAt: string, rootUid: string): Set<string> {
  const at = Date.parse(publishedAt);
  if (Number.isNaN(at)) return new Set();
  return new Set(times.filter(([uid, t]) => uid !== rootUid && typeof t === "number" && t > at).map(([uid]) => uid));
}

/** How the title icon looks for a status: its Blueprint icon and tone. */
export function iconFor(state: StatusState, encrypted: boolean | undefined, unlisted = false) {
  // As roam.pub marks them: a lock when encrypted, a crossed-out eye when unlisted, a globe otherwise.
  const icon = encrypted ? "lock" : unlisted ? "eye-off" : "globe";
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
