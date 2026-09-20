/**
 * Serialize a Roam page/block into roam-json-v1 for the publish API.
 * See docs/api-contract.md (Project store).
 */

import { pullEntity } from "./roam.js";

const TREE_PULL =
  "[:block/uid :node/title :block/string :block/order {:block/children ...}]";
const SELF_PULL = "[:block/uid :node/title :block/string :block/order]";

/**
 * @param {string} uid
 * @param {{ scope?: "self" | "tree", kind?: "page" | "block" }} [opts]
 * @returns {{ format: "roam-json-v1", string?: string, title?: string, uid?: string, children?: object[] } | null}
 */
export function serializeForPublish(uid, { scope = "self", kind } = {}) {
  if (!uid) return null;
  const wantTree = kind === "page" || scope === "tree";
  let pull = null;
  try {
    pull = window.roamAlphaAPI.pull(wantTree ? TREE_PULL : SELF_PULL, [
      ":block/uid",
      uid,
    ]);
  } catch (err) {
    console.warn("Roam Publish: tree pull failed, falling back", uid, err);
    pull = pullEntity(uid);
  }
  if (!pull) return null;

  const root = normalizeChild(pull, wantTree);
  /** @type {{ format: "roam-json-v1", string?: string, title?: string, uid?: string, children?: object[] }} */
  const payload = {
    format: "roam-json-v1",
    uid: root.uid,
  };
  if (root.title != null) payload.title = root.title;
  if (root.string != null) payload.string = root.string;
  if (wantTree && Array.isArray(root.children)) {
    payload.children = root.children;
  } else if (kind === "page") {
    payload.children = root.children || [];
  }
  return payload;
}

/**
 * @param {object} pull
 * @param {boolean} includeChildren
 */
function normalizeChild(pull, includeChildren) {
  /** @type {{ uid?: string, title?: string, string?: string, children?: object[] }} */
  const node = {};
  if (pull[":block/uid"] != null) node.uid = String(pull[":block/uid"]);
  if (pull[":node/title"] != null) node.title = String(pull[":node/title"]);
  if (pull[":block/string"] != null) node.string = String(pull[":block/string"]);

  if (includeChildren) {
    const kids = Array.isArray(pull[":block/children"])
      ? pull[":block/children"]
      : [];
    const sorted = [...kids].sort(
      (a, b) => (a?.[":block/order"] ?? 0) - (b?.[":block/order"] ?? 0),
    );
    node.children = sorted.map((child) => normalizeChild(child, true));
  }
  return node;
}

/**
 * @param {string} uid
 * @param {{ scope?: "self" | "tree", kind?: "page" | "block" }} [opts]
 */
export function contentFingerprintForPublish(uid, opts = {}) {
  const tree = serializeForPublish(uid, opts);
  if (!tree) return "";
  try {
    return JSON.stringify(tree);
  } catch (_) {
    return tree.title || tree.string || uid;
  }
}
