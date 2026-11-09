import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { borrowedWords, inText, offerable } from "../src/linked";

describe("linked content", () => {
  test("finds page embeds, block embeds and references, but not references inside code or embeds", () => {
    const r = inText([
      "{{[[embed]]: [[Seed catalog]]}}",
      "{{embed: ((abcdefghi))}} and ((refuid123))",
      "`((codeuid12))` [alias](((aliasuid1)))",
    ]);
    assert.deepEqual(r.pageEmbeds, ["Seed catalog"]);
    assert.deepEqual(r.blockEmbeds, ["abcdefghi"]);
    assert.deepEqual(r.refs, ["refuid123"]);
  });

  test("says what's copied in, or nothing", () => {
    assert.equal(borrowedWords(["Seed catalog"], 2), "1 embed (Seed catalog) and 2 block references");
    assert.equal(borrowedWords([], 1), "1 block reference");
    assert.equal(borrowedWords(["A", "A", "B"], 0), "3 embeds (A, B)");
    assert.equal(borrowedWords([], 0), null);
  });

  test("daily notes and Roam's own pages aren't offered", () => {
    assert.equal(offerable({ uid: "11-09-2026", title: "November 9th, 2026" }), false);
    assert.equal(offerable({ uid: "abcdefghi", title: "TODO" }), false);
    assert.equal(offerable({ uid: "abcdefghi", title: "roam/templates" }), false);
    assert.equal(offerable({ uid: "abcdefghi", title: "Deep Work" }), true);
  });
});
