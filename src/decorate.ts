import { editedSince, iconFor, uidInId } from "./marks";
import { statusView, syncPublications, type StatusView } from "./publish";
import { openDashboard, renderPageSettings, renderPageStats } from "./panels";
import { getApiKey, getCache, getStatusMarks, getTopBar, listingOf, onCacheChange } from "./state";
import { button as bpButton, closeDialogs, h, isDark } from "./ui";

/**
 * Status marks in Roam: three icons after the title of a published page (status, stats, settings), a ring on the bullet of a block
 * published on its own, and a bar beside blocks edited since their page was last published.
 *
 * Nothing is written to the graph. Marks are an attribute and CSS on Roam's own elements, plus one
 * small element per title, all removed by `stopMarks`. One observer watches Roam's app for new pages
 * and blocks; it never acts on the mutations themselves, only schedules one pass per animation frame,
 * and status is re-checked from the cached published list (no request) once edits pause.
 *
 * The observer's shape (one observer on Roam's app, skipping Roam's own chrome, guarded against its
 * own changes) follows Reference Count (https://github.com/fbgallet/roam-extension-ref-count, MIT
 * License, Copyright (c) 2023 Fabrice Gallet); no code is copied from it.
 */

const STYLE_ID = "roam-publish-marks";
const ATTR = "data-roam-publish";
const GROUP_CLASS = "roam-publish-title-icons";
const ICON_CLASS = "roam-publish-title-icon";
const POPOVER_ID = "roam-publish-popover";
export const TOPBAR_CLASS = "roam-publish-topbar";
/** Status is re-checked this long after Roam stops changing. */
const RECHECK_MS = 2000;
/** The published list is refreshed from roam.pub at most this often, when Roam is focused. */
const SYNC_EVERY_MS = 10 * 60_000;
/** Pages with more edited blocks than this mark none; the icon still says it changed. */
const MAX_MARKED = 500;

const STYLES = `
.${GROUP_CLASS} { display: inline-flex; align-items: center; gap: 2px; margin-left: 8px; vertical-align: middle; }
h1.rm-title-display:has(textarea, input) .${GROUP_CLASS} { display: none; }
.${ICON_CLASS} { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px;
  vertical-align: middle; border-radius: 3px; cursor: pointer; position: relative; user-select: none; }
.${ICON_CLASS}:hover { background: rgba(138, 155, 168, 0.2); }
.${ICON_CLASS} .bp3-icon { display: block; width: 16px; height: 16px; }
.${ICON_CLASS} .bp3-icon::before { display: block; font-size: 16px; line-height: 16px; font-weight: 400; }
.${ICON_CLASS}:focus:not(:focus-visible) { outline: none; }
.${ICON_CLASS}[data-tone="current"] { color: #0f9960; }
.${ICON_CLASS}[data-tone="changed"] { color: #d9822b; }
.${ICON_CLASS}[data-tone="changed"]::after { content: ""; position: absolute; right: 3px; top: 3px; width: 6px; height: 6px;
  border-radius: 50%; background: #d9822b; }
.${ICON_CLASS}[data-tone="danger"] { color: #db3737; }
.${ICON_CLASS}[data-tone="muted"], .${ICON_CLASS}[data-part="stats"], .${ICON_CLASS}[data-part="settings"] { color: #8a9ba8; }
.${ICON_CLASS}[aria-expanded="true"] { background: rgba(138, 155, 168, 0.2); }
.rm-block-main[${ATTR}~="edited"] { position: relative; }
.rm-block-main[${ATTR}~="edited"]::before { content: ""; position: absolute; left: -10px; top: 5px; bottom: 5px; width: 3px;
  border-radius: 2px; background: #d9822b; }
.rm-block-main[${ATTR}~="published"] .rm-bullet__inner { box-shadow: 0 0 0 3px rgba(15, 153, 96, 0.35); background-color: #0f9960; }
.rm-block-main[${ATTR}~="published-changed"] .rm-bullet__inner { box-shadow: 0 0 0 3px rgba(217, 130, 43, 0.35); background-color: #d9822b; }
#${POPOVER_ID} { position: fixed; z-index: 30; width: 420px; max-width: calc(100vw - 24px); box-sizing: border-box; padding: 12px 14px;
  border-radius: 4px; font-size: 14px; line-height: 1.45; background: #fff; color: #182026;
  box-shadow: 0 0 0 1px rgba(16, 22, 26, 0.1), 0 2px 4px rgba(16, 22, 26, 0.2), 0 8px 24px rgba(16, 22, 26, 0.2); }
#${POPOVER_ID}.rp-dark { background: #30404d; color: #f5f8fa; }
#${POPOVER_ID} { max-height: calc(100vh - 120px); overflow-y: auto; }
#${POPOVER_ID} .rp-tabs { display: flex; gap: 16px; margin: -12px -14px 12px; padding: 0 14px; border-bottom: 1px solid rgba(138, 155, 168, 0.3); }
#${POPOVER_ID} .rp-tab { padding: 8px 0 6px; border: 0; border-bottom: 2px solid transparent; background: none; color: inherit; font: inherit; cursor: pointer; }
#${POPOVER_ID} .rp-tab[aria-selected="true"] { color: #106ba3; border-bottom-color: #106ba3; }
#${POPOVER_ID}.rp-dark .rp-tab[aria-selected="true"] { color: #48aff0; border-bottom-color: #48aff0; }
#${POPOVER_ID} .rp-pop-foot { display: flex; justify-content: flex-end; margin: 12px -14px -12px; padding: 8px 14px; border-top: 1px solid rgba(138, 155, 168, 0.3); }
.rp-form-row { display: grid; grid-template-columns: 96px 1fr; gap: 10px; align-items: start; margin: 8px 0; }
.rp-form-label { font-weight: 600; font-size: 13px; padding-top: 4px; }
.rp-form-field { min-width: 0; }
.rp-form-field > .rp-list-row { padding: 2px 0; }
.rp-link { cursor: pointer; }
.rp-links { display: flex; flex-wrap: wrap; gap: 16px; }
.rp-inline { display: flex; gap: 6px; align-items: center; margin-top: 4px; }
.rp-inline > .bp3-html-select { flex: 1; min-width: 0; }
.rp-row-end { justify-content: flex-end; }
.rp-tiles.rp-tiles-3 { grid-template-columns: repeat(3, 1fr); margin-top: 10px; }
.rp-tile-small { padding: 8px 10px; }
.rp-tile-small .rp-tile-value { font-size: 18px; }
.rp-tile-small .rp-tile-label { text-transform: none; letter-spacing: 0; font-size: 12px; }
.rp-gain { color: #0f9960; opacity: 1; }
.rp-dark .rp-gain { color: #3dcc91; }
.rp-spacer { flex: 1; }
.rp-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.rp-muted { opacity: 0.7; }
.rp-note { display: block; font-size: 12px; opacity: 0.75; margin: 2px 0 6px; }
.rp-field { display: block; margin: 6px 0; }
.rp-field-label { display: block; font-size: 12px; margin-bottom: 2px; opacity: 0.8; }
.rp-switch { margin: 8px 0 !important; }
.rp-switch .rp-note { margin-top: 2px; }
.rp-section-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin: 12px 0 2px;
  padding-top: 8px; border-top: 1px solid rgba(138, 155, 168, 0.3); }
.rp-tab-body > .rp-section-head:first-child, .bp3-dialog-body > .rp-section-head:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
.roam-publish-dialog textarea { font-family: inherit; }
.rp-callout { margin: 8px 0; font-size: 13px; }
.roam-publish-portal .bp3-overlay { z-index: 40; }
.roam-publish-dialog { width: 460px; max-width: calc(100vw - 32px); }
.roam-publish-dialog.rp-wide { width: 760px; }
.roam-publish-dialog .bp3-dialog-body { max-height: calc(100vh - 220px); overflow-y: auto; }
.rp-periods { margin-bottom: 12px; }
.rp-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.rp-tile { padding: 10px 12px; border-radius: 3px; background: rgba(138, 155, 168, 0.12); }
.rp-tile-value { font-size: 22px; font-weight: 600; line-height: 1.2; }
.rp-tile-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.8; }
.rp-heading { margin: 18px 0 6px !important; }
.rp-chart { display: flex; align-items: flex-end; gap: 2px; height: 96px; padding: 4px 0; border-bottom: 1px solid rgba(138, 155, 168, 0.4); }
.rp-bar { flex: 1; min-width: 2px; border-radius: 2px 2px 0 0; background: #2b95d6; }
.rp-list-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
.rp-list-row > :first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp-foot { margin-top: 16px; }
.${TOPBAR_CLASS} { margin: 0 2px; }
`;

type Checked = { view: StatusView | null; edited: Set<string> };

let running = false;
let observer: MutationObserver | null = null;
let frame = 0;
let recheck: ReturnType<typeof setTimeout> | undefined;
let unlisten: (() => void) | null = null;
let lastSync = 0;
/** Status per page or block uid, as last checked. */
const checked = new Map<string, Checked>();
const checking = new Set<string>();
/** Page uid per title, so titles aren't looked up on every pass. */
const titleUids = new Map<string, string | null>();

/** The styles for the marks, the pop-up and the dialogs; added on load, whatever Status in Roam says. */
export function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

export function removeStyles() {
  closeDialogs();
  document.getElementById(STYLE_ID)?.remove();
}

let topbarObserver: MutationObserver | null = null;

/** The dashboard's button in Roam's top bar, put back if Roam redraws the bar without it. */
export function startTopbar(on = getTopBar()) {
  if (topbarObserver || !on) return;
  const mount = () => {
    const bar = document.querySelector(".rm-topbar");
    if (!bar || bar.querySelector(`.${TOPBAR_CLASS}`)) return;
    const b = h(
      "span",
      { class: `bp3-button bp3-minimal bp3-small bp3-icon-globe-network ${TOPBAR_CLASS}`, role: "button", tabindex: 0, title: "Roam Publish dashboard", "aria-label": "Roam Publish dashboard" },
    );
    b.addEventListener("click", openDashboard);
    b.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openDashboard()));
    bar.append(b);
  };
  mount();
  topbarObserver = new MutationObserver(mount);
  topbarObserver.observe(document.querySelector(".rm-topbar")?.parentElement ?? document.body, { childList: true });
  const bar = document.querySelector(".rm-topbar");
  if (bar) topbarObserver.observe(bar, { childList: true });
}

export function stopTopbar() {
  topbarObserver?.disconnect();
  topbarObserver = null;
  document.querySelectorAll(`.${TOPBAR_CLASS}`).forEach((e) => e.remove());
}

export function startMarks() {
  if (running || getStatusMarks() === "Off") return;
  running = true;
  observer = new MutationObserver(onMutations);
  observer.observe(document.querySelector(".roam-app") ?? document.body, { childList: true, subtree: true });
  unlisten = onCacheChange(() => recheckSoon(0));
  window.addEventListener("focus", syncIfStale);
  syncIfStale();
  schedule();
}

export function stopMarks() {
  if (!running) return;
  running = false;
  observer?.disconnect();
  observer = null;
  cancelAnimationFrame(frame);
  clearTimeout(recheck);
  unlisten?.();
  unlisten = null;
  window.removeEventListener("focus", syncIfStale);
  closePopover();
  document.querySelectorAll(`.${GROUP_CLASS}`).forEach((e) => e.remove());
  document.querySelectorAll(`[${ATTR}]`).forEach((e) => e.removeAttribute(ATTR));
  checked.clear();
  titleUids.clear();
}

/** The Status in Roam setting changed. */
export function restartMarks() {
  stopMarks();
  startMarks();
}

/** Keeps the published list fresh on a computer that hasn't published this session; never with no key. */
function syncIfStale() {
  if (!running || !getApiKey() || Date.now() - lastSync < SYNC_EVERY_MS) return;
  lastSync = Date.now();
  void syncPublications({ quiet: true }).catch(() => {});
}

const ours = (n: Node) => n instanceof Element && (n.classList.contains(GROUP_CLASS) || n.classList.contains(ICON_CLASS) || n.id === POPOVER_ID);
/** Parts of Roam whose changes never change a page: the top bar, the left sidebar, menus. */
const OUTSIDE_PAGES = ".rm-topbar, .roam-sidebar-container, .bp3-portal";

function onMutations(ms: MutationRecord[]) {
  // Our own icons coming and going need no pass, nor does Roam's chrome.
  const relevant = ms.filter(
    (m) =>
      !(m.target instanceof Element && m.target.closest(OUTSIDE_PAGES)) &&
      ![...m.addedNodes, ...m.removedNodes].every(ours),
  );
  if (!relevant.length) return;
  schedule();
  recheckSoon(RECHECK_MS);
}

function schedule() {
  if (frame || !running) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    void apply();
  });
}

/** Forgets the checked status of every page and block on screen, and checks again after `ms`. */
function recheckSoon(ms: number) {
  clearTimeout(recheck);
  recheck = setTimeout(() => {
    checked.clear();
    schedule();
  }, ms);
}

const editingTitle = (h: Element) => !!h.querySelector("textarea, input");

/** The page title in a Roam title heading, without our icons. */
function titleText(h: Element) {
  const node = [...h.childNodes].find((n) => n.nodeName === "#text" || (n.nodeName === "SPAN" && !ours(n)));
  return node?.textContent?.trim() ?? "";
}

async function pageUid(title: string) {
  if (!titleUids.has(title))
    titleUids.set(
      title,
      await window.roamAlphaAPI.data.async.q("[:find ?u . :in $ ?t :where [?p :node/title ?t] [?p :block/uid ?u]]", title),
    );
  return titleUids.get(title) ?? null;
}

/** Checks a page or block once until the next recheck; the pass after it draws the result. */
function check(uid: string) {
  if (checked.has(uid) || checking.has(uid)) return checked.get(uid);
  checking.add(uid);
  void (async () => {
    let result: Checked = { view: null, edited: new Set() };
    try {
      const view = await statusView(uid, { sync: false });
      result = { view, edited: new Set() };
      if (view?.state === "changed" && view.c && view.uids && getStatusMarks() === "Titles and blocks") {
        const times: [string, number][] = await window.roamAlphaAPI.data.async.q(
          "[:find ?u ?t :in $ [?u ...] :where [?b :block/uid ?u] [?b :edit/time ?t]]",
          view.uids,
        );
        const edited = editedSince(times, view.c.updatedAt, uid);
        if (edited.size <= MAX_MARKED) result.edited = edited;
      }
    } catch (e) {
      console.warn("[roam-publish] couldn't check status", uid, e);
    } finally {
      checking.delete(uid);
      checked.set(uid, result);
      schedule();
    }
  })();
  return undefined;
}

/** One pass: icons on published titles, marks on published and edited blocks. Only draws what's checked. */
async function apply() {
  if (!running) return;
  const cache = getCache();
  const marks = new Map<Element, Set<string>>();
  const mark = (el: Element | null, m: string) => {
    if (!el) return;
    if (!marks.has(el)) marks.set(el, new Set());
    marks.get(el)!.add(m);
  };
  const edited = new Set<string>();

  for (const h of document.querySelectorAll("h1.rm-title-display")) {
    const icon = h.querySelector(`.${GROUP_CLASS}`) as HTMLElement | null;
    // While the title is being edited, Roam puts a text box in the heading: leave the (hidden) icons
    // alone until it's done, so they neither jump above the title nor flicker with each keystroke.
    if (editingTitle(h)) continue;
    const uid = await pageUid(titleText(h));
    const c = uid ? cache[uid] : undefined;
    const state = c && uid ? check(uid) : undefined;
    if (!uid || !c || !state?.view) {
      if (!c) icon?.remove();
      continue;
    }
    drawIcons(h, icon, uid, state.view);
    state.edited.forEach((u) => edited.add(u));
  }

  if (getStatusMarks() === "Titles and blocks") {
    const blocks = Object.entries(cache).filter(([, c]) => c.kind === "block").map(([u]) => u);
    for (const uid of blocks) {
      const els = document.querySelectorAll(`.roam-block[id$="-${CSS.escape(uid)}"]`);
      if (!els.length) continue;
      const state = check(uid);
      if (!state?.view) continue;
      state.edited.forEach((u) => edited.add(u));
      const m = state.view.state === "changed" ? "published-changed" : "published";
      els.forEach((el) => mark(el.closest(".rm-block-main"), m));
    }
    if (edited.size)
      for (const el of document.querySelectorAll(".roam-block[id], .rm-block__input[id]")) {
        if (uidInId(el.id, edited)) mark(el.closest(".rm-block-main"), "edited");
      }
  }

  for (const [el, set] of marks) {
    const value = [...set].sort().join(" ");
    if (el.getAttribute(ATTR) !== value) el.setAttribute(ATTR, value);
  }
  for (const el of document.querySelectorAll(`[${ATTR}]`)) if (!marks.has(el)) el.removeAttribute(ATTR);
}

type Tab = "page" | "settings";

/** Stats and settings only for pages this key may change: published, not removed, not another member's. */
const yours = (view: StatusView) => view.state !== "unpublished" && view.state !== "removed" && view.state !== "other";

function iconButton(uid: string, part: string, tab: Tab, label: string) {
  const el = document.createElement("span");
  el.className = ICON_CLASS;
  el.dataset.part = part;
  el.contentEditable = "false";
  el.setAttribute("role", "button");
  el.setAttribute("aria-haspopup", "dialog");
  el.tabIndex = 0;
  el.title = label;
  el.setAttribute("aria-label", label);
  // A click on the title starts editing it in Roam; the icons' clicks stay with the icons.
  for (const type of ["mousedown", "mouseup", "click"]) el.addEventListener(type, (e) => e.stopPropagation());
  el.addEventListener("click", () => void openPopover(el, uid, tab));
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      void openPopover(el, uid, tab);
    }
  });
  el.appendChild(document.createElement("span"));
  return el;
}

/** The title's icons: status always, then stats and settings where they apply. */
function drawIcons(h: Element, existing: HTMLElement | null, uid: string, view: StatusView) {
  const c = view.c;
  const { icon, tone } = iconFor(view.state, c?.encrypted, !!c && c.inGraph !== false && listingOf(c) === "unlisted");
  const parts = yours(view) ? "status stats settings" : "status";
  let group = existing;
  if (!group || group.dataset.parts !== parts) {
    group?.remove();
    group = document.createElement("span");
    group.className = GROUP_CLASS;
    group.contentEditable = "false";
    group.dataset.parts = parts;
    group.append(iconButton(uid, "status", "page", ""));
    if (parts !== "status")
      group.append(iconButton(uid, "stats", "page", "Roam Publish: views and upvotes"), iconButton(uid, "settings", "settings", "Roam Publish: page settings"));
    group.querySelector('[data-part="stats"] > span')?.setAttribute("class", "bp3-icon bp3-icon-standard bp3-icon-timeline-bar-chart");
    group.querySelector('[data-part="settings"] > span')?.setAttribute("class", "bp3-icon bp3-icon-standard bp3-icon-cog");
    h.appendChild(group);
  } else if (group !== h.lastChild) {
    // Roam redrew the title before the icons (after an edit): put them back after it.
    h.appendChild(group);
  }
  const el = group.firstElementChild as HTMLElement;
  const glyph = `bp3-icon bp3-icon-standard bp3-icon-${icon}`;
  if (el.firstElementChild!.className !== glyph) el.firstElementChild!.className = glyph;
  if (el.dataset.tone !== tone) el.dataset.tone = tone;
  if (el.title !== view.message) {
    el.title = view.message;
    el.setAttribute("aria-label", `Roam Publish: ${view.message}`);
  }
}

let closeListeners: (() => void) | null = null;

function closePopover() {
  closeListeners?.();
  closeListeners = null;
  document.querySelectorAll(`.${ICON_CLASS}[aria-expanded]`).forEach((e) => e.removeAttribute("aria-expanded"));
  document.getElementById(POPOVER_ID)?.remove();
}

/**
 * The pop-up under the title icons, about this page only: "This page" (status, stats and actions)
 * and "Settings". Synced with roam.pub first, as the menus are.
 */
async function openPopover(anchor: HTMLElement, uid: string, tab: Tab) {
  const open = document.getElementById(POPOVER_ID);
  if (open?.dataset.uid === uid && open.dataset.anchor === anchor.dataset.part) return closePopover();
  closePopover();
  const pop = document.createElement("div");
  pop.id = POPOVER_ID;
  pop.dataset.uid = uid;
  pop.dataset.anchor = anchor.dataset.part;
  pop.setAttribute("role", "dialog");
  pop.className = isDark(anchor) ? "rp-dark bp3-dark" : "";
  pop.textContent = "Checking…";
  anchor.setAttribute("aria-expanded", "true");
  const place = () => {
    const r = anchor.getBoundingClientRect();
    pop.style.top = `${r.bottom + 8}px`;
    pop.style.left = `${Math.max(12, Math.min(r.left - 12, window.innerWidth - pop.offsetWidth - 12))}px`;
  };
  document.body.appendChild(pop);
  place();
  // A dialog opened from the pop-up (a collection's settings) sits over it: its clicks and Escape are its own.
  const inDialog = () => !!document.querySelector(".roam-publish-portal");
  const onDown = (e: MouseEvent) =>
    !inDialog() && !pop.contains(e.target as Node) && !anchor.contains(e.target as Node) && closePopover();
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && !inDialog() && closePopover();
  document.addEventListener("mousedown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", place);
  closeListeners = () => {
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", place);
  };

  let view: StatusView | null = null;
  try {
    view = await statusView(uid, { sync: true });
  } catch (e) {
    pop.textContent = e instanceof Error ? e.message : "Couldn't check the status.";
  }
  if (!pop.isConnected || !view) return;
  const v = view;
  const body = h("div", { class: "rp-tab-body" });
  const tabs: [Tab, string, () => void][] = [["page", "This page", () => drawPage(body, uid, v, place)]];
  if (yours(v)) tabs.push(["settings", "Settings", () => void renderPageSettings(body, uid, () => recheckSoon(0)).then(place)]);
  const bar = h("div", { class: "rp-tabs", role: "tablist" });
  const select = (t: Tab) => {
    const i = Math.max(0, tabs.findIndex(([k]) => k === t));
    bar.querySelectorAll("[role=tab]").forEach((b, j) => b.setAttribute("aria-selected", String(i === j)));
    tabs[i][2]();
    place();
  };
  for (const [k, label] of tabs) bar.append(h("button", { type: "button", class: "rp-tab", role: "tab", onclick: () => select(k) }, label));
  pop.replaceChildren(bar, body);
  select(tab);
  // What the pop-up found is the freshest status: draw it.
  checked.set(uid, { view, edited: checked.get(uid)?.edited ?? new Set() });
  schedule();
}

/** "This page": the status, the page's stats, its actions and the way to the dashboard. */
function drawPage(root: HTMLElement, uid: string, view: StatusView, place: () => void) {
  const stats = h("div", {});
  const { message, actions } = drawStatus(view);
  // Stats sit between the status and its actions.
  root.replaceChildren(
    message,
    stats,
    actions,
    h(
      "div",
      { class: "rp-pop-foot" },
      h("a", { class: "rp-link", href: "#", onclick: (e: Event) => (e.preventDefault(), closePopover(), openDashboard()) }, "Open dashboard"),
    ),
  );
  if (yours(view)) void renderPageStats(stats, uid).then(place);
}

/** The status, as the status toast says it, with its actions. */
function drawStatus(view: StatusView) {
  const row = h("div", { class: "rp-row" });
  const button = (label: string, onClick: () => void, primary: boolean) =>
    row.append(
      bpButton(
        label,
        () => {
          closePopover();
          onClick();
        },
        label === "Unpublish" ? { minimal: true, intent: "danger" } : { intent: primary ? "primary" : undefined },
      ),
    );
  const last = view.actions.filter((a) => a.label === "Unpublish");
  view.actions
    .filter((a) => !last.includes(a))
    .forEach((a, i) => button(a.label, a.onClick, i === 0 && /^(Republish|Publish|Sync)/.test(a.label)));
  // Links come from the server's responses; only ever open web pages from them.
  const link = view.link;
  if (link && /^https?:\/\//i.test(link)) button("Open ↗", () => void window.open(link, "_blank", "noopener"), false);
  last.forEach((a) => button(a.label, a.onClick, false));
  return { message: h("div", {}, view.message), actions: row.childElementCount ? row : "" };
}
