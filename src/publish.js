import {
  applyPublishIndex,
  deleteCacheEntry,
  upsertCacheEntry,
  checkPublishState,
} from "./cache.js";
import {
  fetchPublishedIndex,
  postPublish,
  postRepublish,
  postShareSettings,
  postUnpublish,
} from "./api.js";
import { notify } from "./notify.js";
import { clearBadge, schedulePaint } from "./overlays.js";
import { publishCache, setCachedOpenUid } from "./state.js";
import { resolvePublishTarget } from "./target.js";
import { normalizeScope, normalizeVisibility } from "./theme.js";
import { normalizeGroupIds } from "./groups.js";

/** Set by share-popover onload to avoid import cycles. */
let dismissSharePopover = () => {};

/** @param {() => void} fn */
export function setSharePopoverDismiss(fn) {
  dismissSharePopover = fn || (() => {});
}

/**
 * @param {{
 *   uid?: string,
 *   kind?: "page" | "block",
 *   scope?: "self" | "tree",
 *   visibility?: string,
 *   groupIds?: string[],
 *   groupId?: string | null,
 * }} [opts]
 */
export async function publish({
  uid,
  kind,
  scope,
  visibility,
  groupIds,
  groupId,
} = {}) {
  const target = await resolvePublishTarget({ uid, kind });
  if (!target) return null;

  const record = await postPublish({
    uid: target.uid,
    kind: target.kind,
    title: target.title,
    scope: target.kind === "block" ? normalizeScope(scope) : undefined,
    visibility: normalizeVisibility(visibility),
    groupIds: normalizeGroupIds(groupIds ?? groupId ?? null),
  });

  upsertCacheEntry(record);

  if (record.kind === "page") setCachedOpenUid(record.uid);

  console.log("Roam Publish: published (dummy)", record);
  schedulePaint();
  return publishCache.get(record.uid);
}

/**
 * @param {{ uid?: string, kind?: "page" | "block" }} [opts]
 */
export async function unpublish({ uid, kind } = {}) {
  const target = await resolvePublishTarget({ uid, kind });
  if (!target) return;

  if (!publishCache.has(target.uid)) {
    notify("Nothing published for that uid.");
    return;
  }

  await postUnpublish(target.uid);
  deleteCacheEntry(target.uid);
  clearBadge(target.uid);
  dismissSharePopover();
  console.log("Roam Publish: unpublished (dummy)", target.uid);
  notify(`Unpublished ${target.kind} (dummy).`);
  schedulePaint();
}

/**
 * Unpublish a known cache uid (e.g. from share popover) without re-resolving focus.
 * @param {string} uid
 */
export async function unpublishUid(uid) {
  if (!uid || !publishCache.has(uid)) {
    notify("Nothing published for that uid.");
    return;
  }
  await postUnpublish(uid);
  deleteCacheEntry(uid);
  clearBadge(uid);
  dismissSharePopover();
  console.log("Roam Publish: unpublished (dummy)", uid);
  notify("Unpublished (dummy).");
  schedulePaint();
}

/**
 * @param {string} uid
 * @param {{ visibility?: string, groupIds?: string[], groupId?: string | null, scope?: string }} patch
 */
export async function updateShareSettings(uid, patch) {
  const current = checkPublishState(uid);
  if (!current) {
    notify("Nothing published for that uid.");
    return null;
  }
  const next = await postShareSettings(uid, patch, current);
  upsertCacheEntry(next);
  schedulePaint();
  return publishCache.get(uid);
}

/** @param {string} uid */
export async function republish(uid) {
  const current = checkPublishState(uid);
  if (!current) {
    notify("Nothing published for that uid.");
    return null;
  }
  const next = await postRepublish(uid, current);
  upsertCacheEntry(next);
  schedulePaint();
  notify("Updated published copy (dummy).");
  return publishCache.get(uid);
}

export async function refreshPublishCache() {
  console.log("Roam Publish: fetching publish index (dummy)…");
  const payload = await fetchPublishedIndex();
  applyPublishIndex(payload);
  console.log(
    "Roam Publish: cache ready",
    payload.fetchedAt,
    Object.fromEntries(publishCache),
  );
  schedulePaint();
  return publishCache;
}
