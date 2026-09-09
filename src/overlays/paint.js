import { BADGE_ATTR } from "../constants.js";
import { titleLayout } from "../dom/finders.js";
import { clearPublishStylesheet } from "../styles.js";
import { cachedOpenUid, publishCache } from "../state.js";
import { placeBlockShareChip, placeOverlayBadge } from "./badges.js";
import { destroyOverlayRoots, ensureOverlayRoots, updateHud } from "./hud.js";

let paintScheduled = false;
let paintDirty = false;

/**
 * True only for command palette / find-or-create / typeahead / real modal dialogs.
 * Must NOT treat Blueprint popovers, menus, toasts, or tooltips as blockers —
 * those used to wipe page badges + block chips while the debug HUD kept
 * updating, so publish state looked "debug-only".
 * Exception: topbar find-or-create *is* a Blueprint popover, but it covers the
 * title area where page badges sit — yield while it is open/focused.
 */
export function isRoamOverlayOpen() {
  if (
    document.querySelector(".rm-typeahead-autocomplete") ||
    document.querySelector(".rm-typeahead") ||
    document.querySelector(".rm-command-palette") ||
    document.querySelector(".rm-omnibar") ||
    document.querySelector("[class*='rm-command-palette']") ||
    // Topbar Find or Create (search results dropdown).
    document.activeElement?.id === "find-or-create-input" ||
    document.querySelector(".rm-find-or-create-wrapper .bp3-overlay-open") ||
    document.querySelector(".rm-find-or-create-wrapper .bp3-popover")
  ) {
    return true;
  }

  // Our published-items dialog (Discourse Graph–style portal).
  if (document.getElementById("rp-published-portal")) return true;

  // Modal Blueprint dialogs/drawers only — ignore popovers/toasts/tooltips.
  for (const el of document.querySelectorAll(".bp3-overlay-open")) {
    if (!(el instanceof Element)) continue;
    if (el.closest("#rp-share-popover")) continue;
    if (
      el.closest(
        ".bp3-popover, .bp3-toast-container, .bp3-toaster, .bp3-tooltip",
      )
    ) {
      continue;
    }
    if (el.querySelector(".bp3-popover, .bp3-toast, .bp3-tooltip")) continue;
    if (
      el.classList.contains("bp3-overlay-scroll-container") ||
      el.querySelector(".bp3-dialog, .bp3-drawer")
    ) {
      return true;
    }
  }
  return false;
}

export function scrubLegacyInTreeBadges() {
  document
    .querySelectorAll(
      `.rm-block-main > [${BADGE_ATTR}], .rm-title-display > [${BADGE_ATTR}], .rm-block__input > [${BADGE_ATTR}], .rm-page__title > [${BADGE_ATTR}]`,
    )
    .forEach((el) => el.remove());
}

export function schedulePaint() {
  paintDirty = true;
  if (paintScheduled) return;
  paintScheduled = true;
  const run = () => {
    paintDirty = false;
    paintOverlays();
    if (paintDirty) requestAnimationFrame(run);
    else paintScheduled = false;
  };
  requestAnimationFrame(run);
}

/** DOM-only. Must not call rate-limited roamAlphaAPI methods. */
export function paintOverlays() {
  scrubLegacyInTreeBadges();
  // Layer + badges/chips always; HUD root is created only when debug is on.
  const { layer, hud } = ensureOverlayRoots();

  if (isRoamOverlayOpen()) {
    // Yield while palette / modal is open (not debug-gated).
    layer.querySelectorAll(`[${BADGE_ATTR}]`).forEach((el) => el.remove());
    layer.style.visibility = "hidden";
    updateHud(hud);
    return;
  }
  layer.style.visibility = "";
  layer.style.display = "";
  layer.style.opacity = "";

  const seen = new Set();
  for (const [uid, entry] of publishCache) {
    if (entry.kind === "page") {
      // Always paint page badge for the open published page (debug-independent).
      if (uid !== cachedOpenUid) continue;
      const layout = titleLayout();
      if (!layout?.rect) continue;
      placeOverlayBadge(layer, uid, entry, layout);
      seen.add(uid);
      continue;
    }

    // Block chips — also debug-independent.
    if (placeBlockShareChip(layer, uid, entry)) {
      seen.add(uid);
    }
  }

  layer.querySelectorAll(`[${BADGE_ATTR}]`).forEach((el) => {
    const uid = el.getAttribute(BADGE_ATTR);
    if (!uid || !seen.has(uid)) el.remove();
  });

  updateHud(hud);
}

export function removeAllBadges() {
  scrubLegacyInTreeBadges();
  destroyOverlayRoots();
  clearPublishStylesheet();
}
