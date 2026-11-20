import { openPanel } from "./panel";
import { uidFromBlockId } from "./marks";
import { getCache } from "./state";
import { isDark } from "./ui";

/**
 * Hold Cmd (Ctrl elsewhere) and a share icon shows beside Roam's comment "+" on the block under the pointer, the
 * way Roam shows that button on a held Cmd. Clicking it opens the block's Roam Publish pop-up. Pressing
 * another key with it (a shortcut) or leaving the window hides it.
 *
 * The icon is one fixed element on document.body, placed over the block: nothing is added to Roam's
 * own elements, and `stopShare` removes it with its listeners.
 */

const BUTTON_ID = "roam-publish-share";
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const holdKey = () => (isMac() ? "Meta" : "Control");

let held = false;
let pointed: Element | null = null;
let button: HTMLElement | null = null;
let shownUid: string | null = null;

/** The uid of the block in a Roam .rm-block-main, from its text element's id. */
function blockUidOf(main: Element | null): string | null {
  const el = main?.querySelector(".roam-block[id], .rm-block__input[id]");
  return el ? uidFromBlockId(el.id) : null;
}

function hide() {
  button?.remove();
  button = null;
  shownUid = null;
}

function show() {
  if (!held) return hide();
  // Over the icon itself: keep it where it is.
  if (button && pointed && button.contains(pointed)) return;
  const main = pointed?.closest(".rm-block-main") ?? null;
  const uid = blockUidOf(main);
  if (!main || !uid) return hide();
  if (uid === shownUid && button) return place(main);
  hide();
  shownUid = uid;
  const published = getCache()[uid];
  const label = published ? "Roam Publish: this block's status" : "Publish this block…";
  const b = document.createElement("span");
  b.id = BUTTON_ID;
  b.setAttribute("role", "button");
  b.title = label;
  b.setAttribute("aria-label", label);
  b.className = isDark(main) ? "rp-dark" : "";
  b.append(Object.assign(document.createElement("span"), { className: "bp3-icon bp3-icon-standard bp3-icon-share" }));
  // Roam would start editing the block under it on mousedown.
  b.addEventListener("mousedown", (e) => (e.preventDefault(), e.stopPropagation()));
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    held = false;
    hide();
    openPanel(uid);
  });
  document.body.appendChild(b);
  button = b;
  place(main);
  // Roam draws its "+" on the same key press, maybe after us: line up with it once it's there.
  requestAnimationFrame(() => button === b && place(main));
}

/**
 * Roam's own comment "+" for this block, when it's showing. Roam draws it to the right of the block while Cmd is
 * held; any element in the block's row whose class names a comment, or Blueprint's plus icon, counts. Only the
 * block's own row: a child block's "+" sits lower down.
 */
export function commentButtonOf(main: Element): Element | null {
  const row = main.getBoundingClientRect();
  const scope = main.closest(".roam-block-container") ?? main;
  const found = scope.querySelectorAll(
    '[class*="comment" i]:is(button, [role="button"], .bp3-button), button:has(.bp3-icon-plus), .bp3-icon-plus',
  );
  for (const el of Array.from(found)) {
    if (el.closest(`#${BUTTON_ID}`)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    // In the row, not in a child block's.
    if (r.top + r.height / 2 < row.top || r.top + r.height / 2 > row.bottom) continue;
    return el;
  }
  return null;
}

/** Beside Roam's comment "+", to its left, centred on it. Without one, where Roam puts it: the row's right end. */
function place(main: Element) {
  if (!button) return;
  const plus = commentButtonOf(main);
  if (plus) {
    const r = plus.getBoundingClientRect();
    button.style.top = `${r.top + r.height / 2 - 10}px`;
    button.style.left = `${r.left - 22}px`;
    return;
  }
  const r = main.getBoundingClientRect();
  const text = main.querySelector(".rm-block__input, .roam-block") ?? main;
  const t = text.getBoundingClientRect();
  button.style.top = `${t.top + Math.min(t.height, 26) / 2 - 10}px`;
  button.style.left = `${r.right - 48}px`;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === holdKey() && !e.shiftKey && !e.altKey && !(isMac() ? e.ctrlKey : e.metaKey)) {
    if (!held) {
      held = true;
      show();
    }
    return;
  }
  // Another key with it is a shortcut, not a hold.
  if (held) {
    held = false;
    hide();
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.key !== holdKey()) return;
  held = false;
  // A moment to reach the icon if the key comes up as the click lands.
  setTimeout(() => !held && !button?.matches(":hover") && hide(), 150);
}

function onMove(e: MouseEvent) {
  pointed = e.target instanceof Element ? e.target : null;
  if (held) show();
  // Let go of the key while on the icon: it stays until the pointer leaves.
  else if (button && !button.contains(pointed)) hide();
}

function onBlur() {
  held = false;
  hide();
}

export function startShare() {
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("mousemove", onMove, { passive: true });
  window.addEventListener("blur", onBlur);
  window.addEventListener("scroll", onBlur, true);
}

export function stopShare() {
  document.removeEventListener("keydown", onKeyDown, true);
  document.removeEventListener("keyup", onKeyUp, true);
  document.removeEventListener("mousemove", onMove);
  window.removeEventListener("blur", onBlur);
  window.removeEventListener("scroll", onBlur, true);
  held = false;
  pointed = null;
  hide();
}
