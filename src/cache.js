import {
  formatTeamsDestinations,
  formatTeamsLabel,
  normalizeGroupIds,
  teamDestinationFor,
  teamDestinationsFor,
  teamNameFor,
  teamNamesFor,
} from "./groups.js";
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
 * Resolve team ids from a raw entry (supports legacy single groupId).
 * @param {object} entry
 */
function groupIdsFromRaw(entry) {
  if (entry.groupIds != null || entry.teamIds != null) {
    return normalizeGroupIds(entry.groupIds ?? entry.teamIds);
  }
  return normalizeGroupIds(entry.groupId || entry.teamId || null);
}

/**
 * Normalize a raw API/cache item into a PublishEntry.
 * @param {object} entry
 * @returns {import("./theme.js").PublishEntry | null}
 */
export function normalizeEntry(entry) {
  if (!entry?.uid) return null;
  const kind = entry.kind === "block" ? "block" : "page";
  const groupIds = groupIdsFromRaw(entry);
  const groupNames = teamNamesFor(groupIds);
  const teamDestinations = teamDestinationsFor(groupIds);
  const groupId = groupIds[0] || null;
  return {
    status: normalizeStatus(entry.status),
    kind,
    scope: kind === "block" ? normalizeScope(entry.scope) : undefined,
    visibility: normalizeVisibility(entry.visibility),
    groupIds,
    groupNames,
    teamDestinations,
    // Legacy single-value mirrors (first selected team).
    groupId,
    groupName: groupNames[0] || teamNameFor(groupId),
    teamDestination: teamDestinations[0] || teamDestinationFor(groupId),
    title: entry.title,
    url: entry.url,
    publishedAt: entry.publishedAt,
    contentFingerprint: entry.contentFingerprint,
  };
}

/** Display helper used by lists / alerts. */
export function teamsLabelForEntry(entry) {
  if (!entry) return null;
  return (
    formatTeamsLabel(entry.groupIds) ||
    entry.groupName ||
    null
  );
}

/** Display helper for destinations. */
export function teamsDestLabelForEntry(entry) {
  if (!entry) return null;
  return (
    formatTeamsDestinations(entry.groupIds) ||
    (entry.groupName && entry.teamDestination
      ? `${entry.groupName} → ${entry.teamDestination}`
      : entry.teamDestination) ||
    null
  );
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
