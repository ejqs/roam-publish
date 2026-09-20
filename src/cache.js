import { publishCache, setPublishCache } from "./state.js";
import {
  normalizeScope,
  normalizeStatus,
  normalizeVisibility,
} from "./theme.js";

/** @type {Set<() => void>} */
const listeners = new Set();

/** Subscribe to cache mutations (styles, paint, popover). Returns unsubscribe. */
export function onCacheChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitCacheChange() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.warn("Roam Publish: cache listener failed", err);
    }
  }
}

export function checkPublishState(uid) {
  return publishCache.get(uid) || null;
}

/** Snapshot of all cache entries for the published-items dialog. */
export function listPublishEntries() {
  return [...publishCache.entries()]
    .map(([uid, entry]) => ({ uid, ...entry }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "page" ? -1 : 1;
      return String(a.title || a.uid).localeCompare(String(b.title || b.uid));
    });
}

/**
 * Normalize a raw API/cache item into a PublishEntry.
 * @param {object} entry
 * @returns {import("./theme.js").PublishEntry | null}
 */
export function normalizeEntry(entry) {
  if (!entry?.uid) return null;
  const kind = entry.kind === "block" ? "block" : "page";
  return {
    status: normalizeStatus(entry.status),
    kind,
    scope: kind === "block" ? normalizeScope(entry.scope) : undefined,
    visibility: normalizeVisibility(entry.visibility),
    title: entry.title,
    url: entry.url,
    publishedAt: entry.publishedAt,
    contentFingerprint: entry.contentFingerprint,
    graphName: entry.graphName,
  };
}

/**
 * @param {object} entry raw item including uid
 */
export function upsertCacheEntry(entry) {
  if (!entry?.uid) return;
  const normalized = normalizeEntry(entry);
  if (!normalized) return;
  publishCache.set(entry.uid, normalized);
  emitCacheChange();
}

export function deleteCacheEntry(uid) {
  publishCache.delete(uid);
  emitCacheChange();
}

export function applyPublishIndex(payload) {
  const next = new Map();
  for (const item of payload.items || []) {
    const normalized = normalizeEntry(item);
    if (!normalized || !item?.uid) continue;
    next.set(item.uid, normalized);
  }
  setPublishCache(next);
  emitCacheChange();
  return publishCache;
}
