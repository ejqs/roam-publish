import type { CachedPublication, PublicationCache } from "./state";

/** Lower case, without accents, so "cafe" finds "Café". */
export const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

export type Found = { uid: string; c: CachedPublication };

/**
 * Published pages and blocks whose titles have every word of `query`, in any order. Titles that start
 * with the query come first, then titles with a word that does, then the rest; each group newest first.
 * Pages taken down by a moderator are left out.
 */
export function searchPublications(cache: PublicationCache, query: string): Found[] {
  const q = fold(query.trim());
  const words = q.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const rank = (title: string) => (title.startsWith(q) ? 0 : words.some((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(w)}`, "u").test(title)) ? 1 : 2);
  return Object.entries(cache)
    .filter(([, c]) => !c.removed)
    .map(([uid, c]) => ({ uid, c, title: fold(c.title || "") }))
    .filter((f) => words.every((w) => f.title.includes(w)))
    .sort((a, b) => rank(a.title) - rank(b.title) || b.c.updatedAt.localeCompare(a.c.updatedAt))
    .map(({ uid, c }) => ({ uid, c }));
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
