/**
 * Prototype outdated detection: compare local :edit/time (or content fingerprint)
 * to publishedAt. Never call from paint/scroll — only from user actions / watches.
 */

import { upsertCacheEntry, checkPublishState } from "./cache.js";
import { pullEntityEditMeta } from "./roam.js";
import { schedulePaint } from "./overlays.js";
import { publishCache } from "./state.js";

/**
 * @param {string} uid
 * @returns {boolean} whether status changed to outdated
 */
export function maybeMarkOutdated(uid) {
  const entry = checkPublishState(uid);
  if (!entry || entry.status === "outdated" || entry.status === "draft") {
    return false;
  }
  if (!entry.publishedAt) return false;

  const meta = pullEntityEditMeta(uid);
  if (!meta) return false;

  const publishedMs = Date.parse(entry.publishedAt);
  if (Number.isNaN(publishedMs)) return false;

  let localMs = 0;
  if (typeof meta.editTime === "number" && meta.editTime > 0) {
    // Roam :edit/time is usually ms; tolerate seconds.
    localMs = meta.editTime < 1e12 ? meta.editTime * 1000 : meta.editTime;
  }

  const fingerprintDrift =
    Boolean(entry.contentFingerprint) &&
    Boolean(meta.fingerprint) &&
    entry.contentFingerprint !== meta.fingerprint;

  const timeDrift = localMs > publishedMs + 500;

  if (!fingerprintDrift && !timeDrift) return false;

  upsertCacheEntry({
    ...entry,
    uid,
    status: "outdated",
  });
  schedulePaint();
  return true;
}

/** Scan all published cache entries (user-triggered / slow tick). */
export function scanAllForOutdated() {
  let changed = false;
  for (const uid of publishCache.keys()) {
    if (maybeMarkOutdated(uid)) changed = true;
  }
  return changed;
}
