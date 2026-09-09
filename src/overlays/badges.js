import { BADGE_ATTR } from "../constants.js";
import {
  blockMainLayout,
  findBulletEl,
  isRectVisible,
  titleLayout,
} from "../dom/finders.js";
import {
  entryTitleAttr,
  normalizeStatus,
  scopeShort,
  statusBadgeClass,
  statusLabel,
  STATUS_THEME,
  visibilityLabel,
} from "../theme.js";

/**
 * Page share indicator — Discourse Graph–style: Blueprint minimal control
 * placed *under* the title (never over `.rm-title-display` text).
 * Click opens share settings popover.
 */
export function placeOverlayBadge(layer, uid, entry, layout) {
  const rect = layout?.rect;
  if (!rect || !isRectVisible(rect)) return;

  let badge = layer.querySelector(
    `[${BADGE_ATTR}="${CSS.escape(uid)}"][data-rp-kind="page"]`,
  );
  if (!badge) {
    badge = document.createElement("button");
    badge.type = "button";
    badge.setAttribute(BADGE_ATTR, uid);
    badge.setAttribute("data-rp-kind", "page");
    badge.setAttribute("data-rp-open-share", uid);
    layer.appendChild(badge);
  }
  badge.className = `${statusBadgeClass(entry.status)} bp3-interactive`;
  badge.innerHTML = `<span class="bp3-icon bp3-icon-share" aria-hidden="true"></span><span class="rp-publish-badge-label">${escapeHtml(
    statusLabel(entry.status),
  )} · ${escapeHtml(visibilityLabel(entry.visibility))}</span>`;
  badge.title = `${entryTitleAttr(entry)} — click for share settings`;
  // Never rely on debug HUD — keep the under-title control visibly painted.
  badge.style.display = "inline-flex";
  badge.style.visibility = "visible";
  badge.style.opacity = "1";
  badge.style.pointerEvents = "auto";

  const gap = 6;
  const badgeH = 24;
  const belowTop = rect.bottom + gap;
  const roomBelow = belowTop + badgeH < window.innerHeight - 8;
  const narrow = window.innerWidth < 720 || (layout?.narrow ?? false);

  if (narrow || roomBelow) {
    // Under title — preferred (never covers title text).
    badge.style.top = `${Math.round(belowTop)}px`;
    badge.style.left = `${Math.round(Math.max(8, rect.left))}px`;
    badge.style.transform = "none";
    badge.style.maxWidth = `${Math.max(
      140,
      Math.min(rect.width, window.innerWidth - rect.left - 16),
    )}px`;
  } else {
    // Wide viewport with no room below: clamp to the right of the title row.
    const left = Math.min(rect.right + 8, window.innerWidth - 180);
    badge.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
    badge.style.left = `${Math.round(Math.max(rect.left, left))}px`;
    badge.style.transform = "translateY(-50%)";
    badge.style.maxWidth = "180px";
  }
}

/**
 * Block share chip — Workbench decorated-blocks style: trailing control on the
 * right of `.rm-block-main`, never over block text. Stylesheet rings/tints
 * (Better Bullets / Color Highlighter pattern) carry self vs tree scope.
 * @returns {boolean} whether placed
 */
export function placeBlockShareChip(layer, uid, entry) {
  const layout = blockMainLayout(uid);
  const rect = layout?.rect;
  if (!rect || !isRectVisible(rect)) return false;

  let chip = layer.querySelector(
    `[${BADGE_ATTR}="${CSS.escape(uid)}"][data-rp-kind="block-chip"]`,
  );
  if (!chip) {
    chip = document.createElement("button");
    chip.type = "button";
    chip.setAttribute(BADGE_ATTR, uid);
    chip.setAttribute("data-rp-kind", "block-chip");
    chip.setAttribute("data-rp-open-share", uid);
    layer.appendChild(chip);
  }

  const theme = STATUS_THEME[normalizeStatus(entry.status)];
  chip.className = [
    "rp-block-share-chip",
    "bp3-tag",
    "bp3-minimal",
    "bp3-small",
    "bp3-interactive",
    theme.tagIntent,
  ]
    .filter(Boolean)
    .join(" ");
  chip.textContent = scopeShort(entry.scope);
  chip.title = `${entryTitleAttr(entry)} — click for share settings`;
  chip.style.display = "inline-flex";
  chip.style.visibility = "visible";
  chip.style.opacity = "0.92";
  chip.style.pointerEvents = "auto";

  // Trailing: right edge of the block row, vertically centered on the bullet line.
  const bullet = findBulletEl(uid);
  const bulletRect = bullet?.getBoundingClientRect();
  const midY = bulletRect
    ? bulletRect.top + bulletRect.height / 2
    : rect.top + Math.min(14, rect.height / 2);

  const chipW = 44;
  const left = Math.min(rect.right - 4, window.innerWidth - 8);
  // Keep chip inside the block row; if row is too narrow, tuck to viewport right.
  chip.style.top = `${Math.round(midY)}px`;
  chip.style.left = `${Math.round(left)}px`;
  chip.style.transform = "translate(-100%, -50%)";
  chip.style.maxWidth = `${chipW + 8}px`;

  // If the block row is extremely narrow, fall back to far-right margin.
  if (rect.width < 80) {
    chip.style.left = `${Math.round(window.innerWidth - 8)}px`;
  }

  return true;
}

export function clearBadge(uid) {
  const layer = document.getElementById("rp-publish-layer");
  if (!layer) return;
  layer
    .querySelectorAll(`[${BADGE_ATTR}="${CSS.escape(uid)}"]`)
    .forEach((el) => el.remove());
}

/** HUD helper — format block scope for display. */
export function formatBlockHudLine(entry) {
  if (!entry) return null;
  return `${statusLabel(entry.status)} · ${scopeShort(entry.scope)} · ${visibilityLabel(
    entry.visibility,
  )}`;
}

/** Re-export for paint convenience. */
export { titleLayout };

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
