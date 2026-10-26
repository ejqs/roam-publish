import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { editedSince, iconFor, uidInId } from "../src/marks";

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
