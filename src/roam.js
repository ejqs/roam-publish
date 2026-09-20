/**
 * Minimal Roam Alpha helpers for user actions (not scroll/paint).
 */

export function isPageEntity(pull) {
  return Boolean(pull && pull[":node/title"] != null);
}

export function entityTitleFromPull(pull, uid) {
  return pull?.[":node/title"] || pull?.[":block/string"] || uid;
}

export function pullEntity(uid) {
  if (!uid) return null;
  try {
    return window.roamAlphaAPI.pull(
      "[:block/uid :node/title :block/string]",
      [":block/uid", uid],
    );
  } catch (err) {
    console.warn("Roam Publish: pull failed", uid, err);
    return null;
  }
}

export function contentFingerprintFor(uid) {
  const pull = pullEntity(uid);
  if (!pull) return "";
  return String(pull[":node/title"] ?? pull[":block/string"] ?? "");
}

export async function getOpenUid() {
  try {
    return await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid();
  } catch (err) {
    console.warn("Roam Publish: open uid failed", err);
    return null;
  }
}
