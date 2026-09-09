import { UID_ATTR } from "../constants.js";

export function findBlockEl(uid) {
  return (
    document.getElementById(`block-input-${uid}`) ||
    document.querySelector(`[${UID_ATTR}="${CSS.escape(uid)}"]`) ||
    document.querySelector(`[id="block-input-${CSS.escape(uid)}"]`) ||
    document.querySelector(`.roam-block[id="${CSS.escape(uid)}"]`) ||
    document.querySelector(`[id$="${CSS.escape(uid)}"]`) ||
    null
  );
}

export function titleRect() {
  return titleLayout()?.rect || null;
}

/**
 * Title geometry + narrow-viewport hint for non-overlapping badge placement.
 * @returns {{ rect: DOMRect, narrow: boolean, el: Element } | null}
 */
export function titleLayout() {
  const title =
    document.querySelector(".rm-title-display") ||
    document.querySelector(".rm-page__title");
  if (!title) return null;
  const rect = title.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const article =
    title.closest(".roam-article") ||
    title.closest(".rm-article-wrapper") ||
    title.parentElement;
  const articleW = article?.getBoundingClientRect()?.width || window.innerWidth;
  const narrow = window.innerWidth < 720 || articleW < 520 || rect.width > articleW * 0.72;
  return { rect, narrow, el: title };
}

/**
 * Layout for a block's main row — used for trailing share chips
 * (Workbench decorated-blocks style: right of `.rm-block-main`).
 * @returns {{ rect: DOMRect, el: Element } | null}
 */
export function blockMainLayout(uid) {
  const blockEl = findBlockEl(uid);
  if (!blockEl) return null;
  const main =
    blockEl.closest(".rm-block-main") ||
    blockEl.closest(".roam-block-container") ||
    blockEl.closest(".rm-block") ||
    blockEl;
  const rect = main.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return { rect, el: main };
}

/** Best-effort find of the visible bullet/dot for a block uid. */
export function findBulletEl(uid) {
  const blockEl = findBlockEl(uid);
  if (!blockEl) return null;

  const main =
    blockEl.closest(".rm-block-main") ||
    blockEl.closest(".roam-block-container") ||
    blockEl.closest(".rm-block") ||
    blockEl.parentElement;
  if (!main) return null;

  const candidates = [
    ".rm-bullet__inner",
    ".simple-bullet-inner",
    ".rm-bullet .rm-bullet__inner",
    ".rm-bullet",
    ".roam-bullet-closed",
    ".simple-bullet-outer",
    ".controls .bp3-popover-target",
    ".controls .rm-bullet",
    ".block-expand",
  ];
  for (const sel of candidates) {
    const hit = main.querySelector(sel);
    if (hit) {
      const r = hit.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return hit;
    }
  }

  const controls = main.querySelector(".controls");
  if (controls) {
    const r = controls.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return controls;
  }
  return null;
}

export function approxBulletRect(uid) {
  const blockEl = findBlockEl(uid);
  if (!blockEl) return null;
  const main =
    blockEl.closest(".rm-block-main") ||
    blockEl.closest(".rm-block") ||
    blockEl;
  const mr = main.getBoundingClientRect();
  if (!mr.width || !mr.height) return null;
  const size = 8;
  const left = mr.left + 6;
  const top = mr.top + Math.min(10, mr.height / 2 - size / 2);
  return {
    left,
    top,
    width: size,
    height: size,
    right: left + size,
    bottom: top + size,
  };
}

/** @param {DOMRect | { top: number, bottom: number, left: number, right: number, width: number, height: number } | null} rect */
export function isRectVisible(rect) {
  if (!rect || rect.width === 0 || rect.height === 0) return false;
  return !(
    rect.bottom < 0 ||
    rect.top > window.innerHeight ||
    rect.right < 0 ||
    rect.left > window.innerWidth
  );
}
