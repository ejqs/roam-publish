/**
 * Resolve the open Roam graph name from the app URL.
 * Shape: #/app/<graph-name>/...
 */

export function getGraphName() {
  try {
    const hash = String(window.location?.hash || "");
    const m = hash.match(/#\/app\/([^/?#]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
  } catch (_) {}

  try {
    const path = String(window.location?.pathname || "");
    const m = path.match(/\/app\/([^/?#]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
  } catch (_) {}

  return "";
}
