/**
 * @typedef {import("./theme.js").PublishEntry} PublishEntry
 */

/** @type {Map<string, PublishEntry>} */
export let publishCache = new Map();

/** Open-page uid, refreshed slowly — never from the paint loop. */
export let cachedOpenUid = null;

export let openUidInFlight = false;

/** @type {{ disconnect: () => void } | null} */
export let viewportWatcher = null;

export function setPublishCache(next) {
  publishCache = next;
}

export function clearPublishCache() {
  publishCache = new Map();
}

export function setCachedOpenUid(uid) {
  cachedOpenUid = uid;
}

export function setOpenUidInFlight(value) {
  openUidInFlight = value;
}

export function setViewportWatcher(watcher) {
  viewportWatcher = watcher;
}
