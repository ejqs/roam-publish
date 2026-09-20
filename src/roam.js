/**
 * Roam Alpha API helpers.
 * Prefer these for one-off user actions — never from the paint/scroll loop.
 */

import {
  cachedOpenUid,
  openUidInFlight,
  setCachedOpenUid,
  setOpenUidInFlight,
} from "./state.js";

export function isPageEntity(pull) {
  return Boolean(pull && pull[":node/title"] != null);
}

export function entityKindFromPull(pull) {
  return isPageEntity(pull) ? "page" : "block";
}

export function entityTitleFromPull(pull, uid) {
  return pull?.[":node/title"] || pull?.[":block/string"] || uid;
}

/** Sync pull — prefer for one-off user actions (not loops). */
export function pullEntity(uid) {
  if (!uid) return null;
  try {
    return window.roamAlphaAPI.pull(
      "[:block/uid :node/title :block/string :edit/time {:block/page [:block/uid :node/title]}]",
      [":block/uid", uid],
    );
  } catch (err) {
    console.warn("Roam Publish: pull failed", uid, err);
    return null;
  }
}

/**
 * Edit metadata for outdated checks — not for paint/scroll.
 * @param {string} uid
 * @returns {{ editTime: number | null, fingerprint: string } | null}
 */
export function pullEntityEditMeta(uid) {
  const pull = pullEntity(uid);
  if (!pull) return null;
  const title = pull[":node/title"];
  const str = pull[":block/string"];
  const fingerprint = String(title ?? str ?? "");
  const editTime =
    typeof pull[":edit/time"] === "number" ? pull[":edit/time"] : null;
  return { editTime, fingerprint };
}

/** Snapshot content fingerprint at publish time. */
export function contentFingerprintFor(uid) {
  return pullEntityEditMeta(uid)?.fingerprint ?? "";
}

export async function refreshCachedOpenUid() {
  if (openUidInFlight) return cachedOpenUid;
  setOpenUidInFlight(true);
  try {
    setCachedOpenUid(
      await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid(),
    );
  } catch (err) {
    console.warn("Roam Publish: open uid refresh failed", err);
  } finally {
    setOpenUidInFlight(false);
  }
  return cachedOpenUid;
}

/**
 * Navigate main window to a page or block uid (user action — not paint path).
 * openBlock accepts page uids too (opens the page).
 * @param {string} uid
 */
export async function openUidInMainWindow(uid) {
  if (!uid) return;
  try {
    await window.roamAlphaAPI.ui.mainWindow.openBlock({ block: { uid } });
  } catch (err) {
    console.warn("Roam Publish: openBlock failed", uid, err);
  }
}
