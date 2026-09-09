/**
 * Thin seam over extensionAPI.settings — safe when API is missing (tests / early load).
 */

/** @type {any} */
let extensionAPI = null;

/** @param {any} api */
export function setExtensionAPI(api) {
  extensionAPI = api;
}

export function getExtensionAPI() {
  return extensionAPI;
}

/** @param {string} key */
export function getSetting(key) {
  try {
    return extensionAPI?.settings?.get?.(key) ?? null;
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export async function setSetting(key, value) {
  try {
    await extensionAPI?.settings?.set?.(key, value);
  } catch (err) {
    console.warn("Roam Publish: settings.set failed", key, err);
  }
}

export function getApiKey() {
  const v = getSetting("api-key");
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

export function isDebugHudEnabled() {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("rpDebug") === "1") {
      return true;
    }
  } catch (_) {}
  return getSetting("debug-hud") === true;
}
