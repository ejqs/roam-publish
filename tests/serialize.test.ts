import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { hashPayload, isShortlinkText, serialize } from "../src/serialize";
import { fakeRoam } from "./fake-roam";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/content-hash.json", import.meta.url), "utf8"));

describe("hash parity with the server", () => {
  // Copied verbatim from roam-publish-web/tests/fixtures/content-hash.json; change both or neither.
  for (const f of fixtures)
    test(f.name, async () => {
      assert.equal(await hashPayload({ rootUid: f.tree.uid, kind: f.kind, title: f.title, tree: f.tree }), f.hash);
    });
});

describe("serialize", () => {
  test("children in :block/order; defaults omitted; page root has empty string", async () => {
    fakeRoam([
      {
        uid: "page1",
        title: "My Page",
        children: [
          { uid: "b2", string: "second", order: 1, heading: 1, align: "left" },
          { uid: "b1", string: "first", order: 0, align: "center", view: ":numbered" },
        ],
      },
    ]);
    const p = await serialize("page1");
    assert.deepEqual(p, {
      rootUid: "page1",
      kind: "page",
      title: "My Page",
      tree: {
        uid: "page1",
        string: "",
        children: [
          { uid: "b1", string: "first", align: "center", viewType: "numbered", children: [] },
          { uid: "b2", string: "second", heading: 1, children: [] },
        ],
      },
    });
  });

  test("block refs are inlined up to 3 deep; refs in code and aliases stay", async () => {
    fakeRoam([
      {
        uid: "page1",
        title: "P",
        children: [{ uid: "b1", string: "see ((refaaaaa1)) and `((refaaaaa1))` and [x](((refaaaaa1)))" }],
      },
      { uid: "other", title: "Other", children: [
        { uid: "refaaaaa1", string: "one ((refaaaaa2))" },
        { uid: "refaaaaa2", string: "two ((refaaaaa3))" },
        { uid: "refaaaaa3", string: "three ((refaaaaa4))" },
        { uid: "refaaaaa4", string: "four" },
      ] },
    ]);
    const p = await serialize("page1");
    assert.equal(
      p!.tree.children[0].string,
      "see one two three ((refaaaaa4)) and `((refaaaaa1))` and [x](((refaaaaa1)))",
    );
  });

  test("a ref cycle stops instead of looping", async () => {
    fakeRoam([
      { uid: "page1", title: "P", children: [{ uid: "cycleaaa1", string: "a ((cycleaaa2))" }, { uid: "cycleaaa2", string: "b ((cycleaaa1))" }] },
    ]);
    const p = await serialize("page1");
    assert.match(p!.tree.children[0].string, /^a b /);
  });

  test("embeds attach the embedded tree; page embeds carry the title; cycles are skipped", async () => {
    fakeRoam([
      { uid: "page1", title: "P", children: [
        { uid: "b1", string: "{{embed: [[Other]]}}" },
        { uid: "b2", string: "{{[[embed]]: ((page1kid1))}}" },
      ] },
      { uid: "other", title: "Other", children: [{ uid: "o1", string: "{{embed: [[P]]}}" }] },
    ]);
    const p = await serialize("page1");
    const embed = p!.tree.children[0].embed!;
    assert.equal(embed.title, "Other");
    assert.equal(embed.children[0].string, "{{embed: [[P]]}}");
    assert.equal(embed.children[0].embed, undefined, "embedding the page being published is a cycle");
  });

  test("shortlink blocks and what's under them are left out", async () => {
    fakeRoam([
      { uid: "page1", title: "P", children: [
        { uid: "tag", string: "[[Roam Publish]]", children: [
          { uid: "link", string: "[Roam Publish Status](https://roam.pub/p/abcd2345)", children: [{ uid: "log", string: "entry" }] },
        ] },
        { uid: "b1", string: "content" },
      ] },
    ]);
    const p = await serialize("page1", new Set(["abcd2345"]));
    assert.deepEqual(p!.tree.children.map((c) => c.uid), ["b1"]);
  });

  test("isShortlinkText only matches this graph's ids, at the start", () => {
    const ids = new Set(["abcd2345"]);
    assert.equal(isShortlinkText("https://roam.pub/p/abcd2345", ids), true);
    assert.equal(isShortlinkText("[text](https://roam.pub/p/abcd2345)", ids), true);
    assert.equal(isShortlinkText("see https://roam.pub/p/abcd2345", ids), false);
    assert.equal(isShortlinkText("https://roam.pub/p/zzzz2345", ids), false);
  });

  test("a block's title is its first 200 characters", async () => {
    fakeRoam([{ uid: "page1", title: "P", children: [{ uid: "b1", string: "x".repeat(300) }] }]);
    const p = await serialize("b1");
    assert.equal(p!.kind, "block");
    assert.equal(p!.title.length, 200);
  });
});
