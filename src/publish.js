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
import { getApiKey } from "./settings-store.js";
import { publishCache, setCachedOpenUid } from "./state.js";
import { resolvePublishTarget } from "./target.js";
import { normalizeScope, normalizeVisibility } from "./theme.js";

/** Set by share-popover onload to avoid import cycles. */
let dismissSharePopover = () => {};

/** @param {() => void} fn */
export function setSharePopoverDismiss(fn) {
  dismissSharePopover = fn || (() => {});
}

function requireApiKey() {
  if (getApiKey()) return true;
  notify(
    "Not connected. Settings → paste Roam temporary token → Connect, then try again.",
  );
  return false;
}

/**
 * @param {{
 *   uid?: string,
 *   kind?: "page" | "block",
 *   scope?: "self" | "tree",
 *   visibility?: string,
 * }} [opts]
 */
export async function publish({ uid, kind, scope, visibility } = {}) {
  if (!requireApiKey()) return null;

  const target = await resolvePublishTarget({ uid, kind });
  if (!target) return null;

  try {
    const record = await postPublish({
      uid: target.uid,
      kind: target.kind,
      title: target.title,
      scope: target.kind === "block" ? normalizeScope(scope) : undefined,
      visibility: normalizeVisibility(visibility),
    });

    upsertCacheEntry(record);
    if (record.kind === "page") setCachedOpenUid(record.uid);

    console.log("Roam Publish: published", record);
    notify(
      record.url
        ? `Published ${record.kind}: ${record.url}`
        : `Published ${record.kind}.`,
    );
    schedulePaint();
    return publishCache.get(record.uid);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("Roam Publish: publish failed", err);
    notify(`Publish failed: ${msg}`);
    return null;
  }
}

/**
 * @param {{ uid?: string, kind?: "page" | "block" }} [opts]
 */
export async function unpublish({ uid, kind } = {}) {
  if (!requireApiKey()) return;

  const target = await resolvePublishTarget({ uid, kind });
  if (!target) return;

  if (!publishCache.has(target.uid)) {
    notify("Nothing published for that uid.");
    return;
  }

  try {
    await postUnpublish(target.uid);
    deleteCacheEntry(target.uid);
    clearBadge(target.uid);
    dismissSharePopover();
    console.log("Roam Publish: unpublished", target.uid);
    notify(`Unpublished ${target.kind}.`);
    schedulePaint();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    notify(`Unpublish failed: ${msg}`);
  }
}

/**
 * Unpublish a known cache uid without re-resolving focus.
 * @param {string} uid
 */
export async function unpublishUid(uid) {
  if (!requireApiKey()) return;
  if (!uid || !publishCache.has(uid)) {
    notify("Nothing published for that uid.");
    return;
  }
  try {
    await postUnpublish(uid);
    deleteCacheEntry(uid);
    clearBadge(uid);
    dismissSharePopover();
    console.log("Roam Publish: unpublished", uid);
    notify("Unpublished.");
    schedulePaint();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    notify(`Unpublish failed: ${msg}`);
  }
}

/**
 * @param {string} uid
 * @param {{ visibility?: string, scope?: string }} patch
 */
export async function updateShareSettings(uid, patch) {
  if (!requireApiKey()) return null;
  const current = checkPublishState(uid);
  if (!current) {
    notify("Nothing published for that uid.");
    return null;
  }
  try {
    const next = await postShareSettings(uid, patch, current);
    upsertCacheEntry(next);
    schedulePaint();
    return publishCache.get(uid);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    notify(`Save failed: ${msg}`);
    return null;
  }
}

/** @param {string} uid */
export async function republish(uid) {
  if (!requireApiKey()) return null;
  const current = checkPublishState(uid);
  if (!current) {
    notify("Nothing published for that uid.");
    return null;
  }
  try {
    const next = await postRepublish(uid, current);
    upsertCacheEntry(next);
    schedulePaint();
    notify("Updated published copy.");
    return publishCache.get(uid);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    notify(`Update failed: ${msg}`);
    return null;
  }
}

export async function refreshPublishCache() {
  try {
    console.log("Roam Publish: fetching publish index…");
    const payload = await fetchPublishedIndex();
    applyPublishIndex(payload);
    console.log(
      "Roam Publish: cache ready",
      payload.fetchedAt,
      Object.fromEntries(publishCache),
    );
    schedulePaint();
    return publishCache;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("Roam Publish: refresh failed", err);
    notify(`Refresh failed: ${msg}`);
    return publishCache;
  }
}
