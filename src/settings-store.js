/**
 * Thin seam over extensionAPI.settings — safe when API is missing (tests / early load).
 */

import { DEFAULT_API_BASE } from "./constants.js";

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

export function getRoamToken() {
  const v = getSetting("roam-token");
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

/** Base URL for roam-publish-web (no trailing slash). */
export function getApiBase() {
  const v = getSetting("api-base");
  const raw =
    typeof v === "string" && v.trim() ? v.trim() : DEFAULT_API_BASE;
  return raw.replace(/\/+$/, "");
}

export function isDebugHudEnabled() {
  try {
    if (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("rpDebug") === "1"
    ) {
      return true;
    }
  } catch (_) {}
  return getSetting("debug-hud") === true;
}

export function hasApiKey() {
  return Boolean(getApiKey());
}
