import { isDebugHudEnabled } from "../settings-store.js";
import { cachedOpenUid, publishCache } from "../state.js";
import { statusLabel, visibilityLabel } from "../theme.js";
import { formatBlockHudLine } from "./badges.js";

let layerDelegated = false;
let hudDelegated = false;

/** @type {((uid: string, ev: MouseEvent) => void) | null} */
let openShareHandler = null;

export function setOpenShareHandler(handler) {
  openShareHandler = handler;
}

/**
 * Always ensure the share overlay layer. Debug HUD is optional and separate —
 * `isDebugHudEnabled()` must never gate `#rp-publish-layer` or badges/chips.
 */
export function ensureOverlayRoots() {
  let layer = document.getElementById("rp-publish-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "rp-publish-layer";
    document.body.appendChild(layer);
  }
  // Layer is the share affordance surface — always present (debug only gates HUD).
  layer.style.display = "";
  if (!layerDelegated) {
    layer.addEventListener("click", (ev) => {
      const btn =
        ev.target instanceof Element
          ? ev.target.closest("[data-rp-open-share]")
          : null;
      if (!btn) return;
      const uid = btn.getAttribute("data-rp-open-share");
      if (!uid || !openShareHandler) return;
      ev.preventDefault();
      ev.stopPropagation();
      openShareHandler(uid, /** @type {MouseEvent} */ (ev));
    });
    layerDelegated = true;
  }

  let hud = document.getElementById("rp-publish-hud");
  const debug = isDebugHudEnabled();
  if (debug) {
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "rp-publish-hud";
      hud.className = "bp3-card bp3-elevation-2";
      document.body.appendChild(hud);
    }
    hud.style.display = "";
    if (!hudDelegated) {
      hud.addEventListener("click", (ev) => {
        const btn =
          ev.target instanceof Element
            ? ev.target.closest("[data-rp-open-share]")
            : null;
        if (!btn) return;
        const uid = btn.getAttribute("data-rp-open-share");
        if (!uid || !openShareHandler) return;
        ev.preventDefault();
        ev.stopPropagation();
        openShareHandler(uid, /** @type {MouseEvent} */ (ev));
      });
      hudDelegated = true;
    }
  } else if (hud) {
    hud.style.display = "none";
    hud.innerHTML = "";
  }

  return { layer, hud: debug ? hud : null };
}

export function destroyOverlayRoots() {
  document.getElementById("rp-publish-layer")?.remove();
  document.getElementById("rp-publish-hud")?.remove();
  layerDelegated = false;
  hudDelegated = false;
}

export function updateHud(hud) {
  if (!hud || !isDebugHudEnabled()) {
    const existing = document.getElementById("rp-publish-hud");
    if (existing) {
      existing.style.display = "none";
      existing.innerHTML = "";
    }
    return;
  }

  // Sync only — no getOpenPageOrBlockUid (rate-limited).
  const focusedUid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
  const openUid = cachedOpenUid;
  const open = openUid ? publishCache.get(openUid) : null;
  const focused =
    focusedUid && focusedUid !== openUid
      ? publishCache.get(focusedUid)
      : null;

  const lines = [
    `<div class="rp-hud-title"><span class="bp3-tag bp3-intent-primary bp3-minimal bp3-small">Debug</span> Roam Publish</div>`,
  ];

  if (open && openUid) {
    lines.push(
      `<button type="button" class="rp-hud-row rp-hud-action" data-rp-open-share="${escapeAttr(
        openUid,
      )}">Page: ${escapeHtml(statusLabel(open.status))} · ${escapeHtml(
        visibilityLabel(open.visibility),
      )}</button>`,
    );
  } else {
    lines.push(
      `<div class="rp-hud-row rp-hud-muted">Page: not published</div>`,
    );
  }

  if (focusedUid) {
    const blockLine = formatBlockHudLine(focused);
    if (blockLine && focused) {
      lines.push(
        `<button type="button" class="rp-hud-row rp-hud-action" data-rp-open-share="${escapeAttr(
          focusedUid,
        )}">Block: ${escapeHtml(blockLine)}</button>`,
      );
    } else {
      lines.push(
        `<div class="rp-hud-row rp-hud-muted">Block: not published</div>`,
      );
    }
  } else {
    lines.push(
      `<div class="rp-hud-row rp-hud-muted">Block: (none focused)</div>`,
    );
  }

  lines.push(
    `<div class="rp-hud-row rp-hud-muted">Cache: ${publishCache.size} item(s)</div>`,
  );
  hud.style.display = "";
  hud.innerHTML = lines.join("");
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {string} s */
function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
