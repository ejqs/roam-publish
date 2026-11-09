import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cssString, editedSince, iconFor, linkStyles, uidFromBlockId, uidInId } from "../src/marks";

describe("status marks", () => {
  test("blocks edited after the last publish, never the root", () => {
    const at = "2026-10-20T09:14:00Z";
    const t = Date.parse(at);
    const edited = editedSince([["page1", t + 5], ["a", t - 1], ["b", t + 1000], ["c", t]], at, "page1");
    assert.deepEqual([...edited], ["b"]);
    assert.equal(editedSince([["b", 1]], "", "page1").size, 0);
  });

  test("the title icon: a lock when encrypted, its tone by state", () => {
    assert.deepEqual(iconFor("changed", false), { icon: "globe", tone: "changed" });
    assert.deepEqual(iconFor("current", true), { icon: "lock", tone: "current" });
    assert.deepEqual(iconFor("current", false, true), { icon: "eye-off", tone: "current" });
    assert.equal(iconFor("current", true, true).icon, "lock");
    assert.equal(iconFor("unknown", false).tone, "muted");
    assert.equal(iconFor("removed", false).tone, "danger");
  });

  test("finds a block's uid in Roam's element id, including longer uids and windows with dashes", () => {
    const uids = new Set(["abcDEF123", "imported-uid-long"]);
    assert.equal(uidInId("block-input-main-window-abcDEF123", uids), "abcDEF123");
    assert.equal(uidInId("block-input-sidebar-1-imported-uid-long", uids), "imported-uid-long");
    assert.equal(uidInId("block-input-main-xbcDEF123", uids), null);
    assert.equal(uidInId("block-input-main-windowabcDEF123", uids), null);
  });
});

test("the block uid comes from the end of a Roam block element's id", () => {
  assert.equal(uidFromBlockId("block-input-uuid1a2b3c4d-5e6f-body-outline-abc123XYZ"), "abc123XYZ");
  assert.equal(uidFromBlockId("block-input-x-a_b-c1234"), "a_b-c1234");
  assert.equal(uidFromBlockId("block-input-short"), null);
});

describe("link marks", () => {
  test("titles are quoted safely for attribute selectors", () => {
    assert.equal(cssString('Say "hi"'), '"Say \\"hi\\""');
    assert.equal(cssString("a\\b"), '"a\\\\b"');
    assert.equal(cssString("line\nbreak"), '"line\\a break"');
  });

  test("one rule per icon, links and tags both, and published links lose the underline", () => {
    const css = linkStyles(
      [
        { title: "Deep Work", icon: "globe" },
        { title: "Diary", icon: "lock" },
        { title: "Draft", icon: "eye-off" },
      ],
      "data-roam-publish",
    );
    assert.match(css, /\[data-link-title="Deep Work"\] > \.rm-page-ref::after,\n\.rm-page-ref--tag\[data-tag="Deep Work"\]::after \{ content: "\\e666"; \}/);
    assert.match(css, /\[data-link-title="Diary"\] > \.rm-page-ref::after,\n\.rm-page-ref--tag\[data-tag="Diary"\]::after \{ content: "\\e625"; \}/);
    assert.match(css, /data-tag="Draft"\]::after \{ content: "\\e6cc"; \}/);
    assert.match(css, /\[data-roam-publish~="page"\] \[data-link-title\] > \.rm-page-ref \{ text-decoration: underline dotted/);
    assert.match(css, /\[data-link-title="Draft"\] > \.rm-page-ref \{ text-decoration: none !important; \}/);
    // Pseudo-elements never go inside :is(), which would drop the whole rule.
    assert.doesNotMatch(css, /:is\([^)]*::after/);
  });

  test("with nothing published, only the underline rules", () => {
    const css = linkStyles([], "data-roam-publish");
    assert.doesNotMatch(css, /::after/);
    assert.match(css, /underline dotted/);
  });
});
