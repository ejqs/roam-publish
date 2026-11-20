import assert from "node:assert/strict";
import { test } from "node:test";
import { searchPublications } from "../src/search";
import type { CachedPublication, PublicationCache } from "../src/state";

const pub = (title: string, updatedAt: string, more: Partial<CachedPublication> = {}): CachedPublication => ({
  hash: "h", url: "https://roam.pub/x", title, kind: "page", visibility: "public", updatedAt, ...more,
});

const cache: PublicationCache = {
  a: pub("Revit Walls", "2026-10-09T00:00:00Z"),
  b: pub("Revit API/Wall References for Dimensions", "2026-10-05T00:00:00Z"),
  c: pub("Roam Publish Roadmap", "2026-10-20T00:00:00Z"),
  d: pub("Café notes", "2026-10-01T00:00:00Z", { kind: "block" }),
  e: pub("Taken down", "2026-10-01T00:00:00Z", { removed: true }),
  f: pub("My walls", "2026-11-01T00:00:00Z"),
};

test("finds titles with every word, in any order, ignoring case", () => {
  assert.deepEqual(searchPublications(cache, "wall REVIT").map((f) => f.uid), ["a", "b"]);
  assert.deepEqual(searchPublications(cache, "roadmap").map((f) => f.uid), ["c"]);
});

test("titles starting with the query first, then a word that does, newest first in each", () => {
  assert.deepEqual(searchPublications(cache, "wall").map((f) => f.uid), ["f", "a", "b"]);
  assert.deepEqual(searchPublications(cache, "my wall").map((f) => f.uid), ["f"]);
  // Titles that start with the query lead, even when older.
  assert.deepEqual(searchPublications({ ...cache, g: pub("Calls with Revit", "2026-12-01T00:00:00Z") }, "revit").map((f) => f.uid), ["a", "b", "g"]);
  assert.deepEqual(searchPublications(cache, "alls").map((f) => f.uid), ["f", "a"]);
});

test("ignores accents, blanks and pages taken down", () => {
  assert.deepEqual(searchPublications(cache, "cafe").map((f) => f.uid), ["d"]);
  assert.deepEqual(searchPublications(cache, "  "), []);
  assert.deepEqual(searchPublications(cache, "taken"), []);
});
