import { notify } from "./notify.js";
import {
  entityKindFromPull,
  entityTitleFromPull,
  isPageEntity,
  pullEntity,
  refreshCachedOpenUid,
} from "./roam.js";

/**
 * Resolve which page/block the user means to publish or unpublish.
 * @param {{ uid?: string, kind?: "page" | "block" }} opts
 * @returns {Promise<null | { uid: string, kind: "page" | "block", title: string, pull: object }>}
 */
export async function resolvePublishTarget({ uid, kind } = {}) {
  let targetUid = uid;
  let targetKind = kind;

  if (!targetUid) {
    if (targetKind === "block") {
      targetUid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
    } else {
      targetUid = await refreshCachedOpenUid();
    }
  }

  if (!targetUid) {
    notify(
      targetKind === "block"
        ? "Focus a block first, then publish it."
        : "Open a page first, then publish it.",
    );
    return null;
  }

  let pull = pullEntity(targetUid);
  if (!pull) {
    notify(`Could not load uid ${targetUid}`);
    return null;
  }

  if (targetKind === "block" && isPageEntity(pull)) {
    const focused = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
    if (focused && focused !== targetUid) {
      targetUid = focused;
      pull = pullEntity(targetUid);
      if (!pull) {
        notify("Focus a block first, then publish it.");
        return null;
      }
    }
  }

  const finalKind =
    targetKind === "page" || isPageEntity(pull) ? "page" : "block";
  if (targetKind === "block" && finalKind === "page") {
    notify("Focus a block first, then publish it.");
    return null;
  }

  return {
    uid: targetUid,
    kind: finalKind,
    title: entityTitleFromPull(pull, targetUid),
    pull,
  };
}

export { entityKindFromPull, entityTitleFromPull, isPageEntity, pullEntity };
