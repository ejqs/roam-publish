import { notify } from "./notify.js";
import {
  republish,
  setSharePopoverDismiss,
  unpublishUid,
  updateShareSettings,
} from "./publish.js";
import { checkPublishState } from "./cache.js";
import { maybeMarkOutdated } from "./outdated.js";
import {
  formatPublishedAt,
  normalizeScope,
  normalizeVisibility,
  scopeLabel,
  statusLabel,
  statusTagClass,
  visibilityLabel,
} from "./theme.js";

const POPOVER_ID = "rp-share-popover";

/** @type {string | null} */
let openUid = null;
/** @type {((e: MouseEvent) => void) | null} */
let outsideHandler = null;
/** @type {((e: KeyboardEvent) => void) | null} */
let keyHandler = null;

export function isSharePopoverOpen() {
  return Boolean(document.getElementById(POPOVER_ID));
}

export function closeSharePopover() {
  document.getElementById(POPOVER_ID)?.remove();
  if (outsideHandler) {
    document.removeEventListener("mousedown", outsideHandler, true);
    outsideHandler = null;
  }
  if (keyHandler) {
    document.removeEventListener("keydown", keyHandler, true);
    keyHandler = null;
  }
  openUid = null;
}

setSharePopoverDismiss(() => closeSharePopover());

/**
 * @param {string} uid
 * @param {{ anchorRect?: DOMRect | null, clientX?: number, clientY?: number }} [opts]
 */
export function openSharePopover(uid, opts = {}) {
  maybeMarkOutdated(uid);
  const entry = checkPublishState(uid);
  if (!entry) {
    notify("Nothing published for that uid. Publish first, then open share settings.");
    return;
  }

  closeSharePopover();
  openUid = uid;

  const pop = document.createElement("div");
  pop.id = POPOVER_ID;
  pop.className = "bp3-card bp3-elevation-3 rp-share-popover";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "Share settings");
  pop.innerHTML = renderPopoverHtml(uid, entry);
  document.body.appendChild(pop);
  positionPopover(pop, opts);
  bindPopover(pop, uid);

  outsideHandler = (e) => {
    if (!(e.target instanceof Node)) return;
    if (pop.contains(e.target)) return;
    if (e.target instanceof Element && e.target.closest("[data-rp-open-share]")) {
      return;
    }
    closeSharePopover();
  };
  keyHandler = (e) => {
    if (e.key === "Escape") closeSharePopover();
  };
  window.setTimeout(() => {
    document.addEventListener("mousedown", outsideHandler, true);
    document.addEventListener("keydown", keyHandler, true);
  }, 0);
}

/**
 * Re-render if the open popover's entry changed in cache.
 */
export function refreshSharePopoverIfOpen() {
  if (!openUid) return;
  const pop = document.getElementById(POPOVER_ID);
  if (!pop) return;
  const entry = checkPublishState(openUid);
  if (!entry) {
    closeSharePopover();
    return;
  }
  const rect = pop.getBoundingClientRect();
  pop.innerHTML = renderPopoverHtml(openUid, entry);
  bindPopover(pop, openUid);
  positionPopover(pop, {
    clientX: rect.left,
    clientY: rect.top,
  });
}

/**
 * @param {string} uid
 * @param {import("./theme.js").PublishEntry} entry
 */
function renderPopoverHtml(uid, entry) {
  const visibilityOptions = ["private", "unlisted", "public"]
    .map(
      (v) =>
        `<label class="bp3-control bp3-radio rp-share-radio">
          <input type="radio" name="rp-visibility" value="${v}" ${
            normalizeVisibility(entry.visibility) === v ? "checked" : ""
          } />
          <span class="bp3-control-indicator"></span>
          ${visibilityLabel(v)}
        </label>`,
    )
    .join("");

  const scopeSection =
    entry.kind === "block"
      ? `<section class="rp-share-section">
          <h4 class="bp3-heading rp-share-heading">Include</h4>
          <div class="rp-share-radios">
            <label class="bp3-control bp3-radio rp-share-radio">
              <input type="radio" name="rp-scope" value="self" ${
                normalizeScope(entry.scope) === "self" ? "checked" : ""
              } />
              <span class="bp3-control-indicator"></span>
              ${scopeLabel("self")}
            </label>
            <label class="bp3-control bp3-radio rp-share-radio">
              <input type="radio" name="rp-scope" value="tree" ${
                normalizeScope(entry.scope) === "tree" ? "checked" : ""
              } />
              <span class="bp3-control-indicator"></span>
              ${scopeLabel("tree")}
            </label>
          </div>
        </section>`
      : "";

  const needsUpdate =
    entry.status === "outdated" || entry.status === "draft";
  const updateHint = needsUpdate
    ? `<div class="bp3-callout bp3-intent-warning bp3-icon-warning-sign rp-share-callout">
         Local content changed since last publish. Click <strong>Update</strong> to republish.
       </div>`
    : `<p class="bp3-text-muted rp-share-hint">Up to date with the last publish.</p>`;

  return `
    <div class="rp-share-header">
      <div>
        <div class="bp3-text-muted rp-share-kicker">${escapeHtml(entry.kind)}</div>
        <div class="bp3-heading rp-share-title">${escapeHtml(entry.title || uid)}</div>
      </div>
      <button type="button" class="bp3-button bp3-minimal bp3-small bp3-icon-cross"
        data-rp-share-close aria-label="Close"></button>
    </div>

    <section class="rp-share-section">
      <h4 class="bp3-heading rp-share-heading">Update state</h4>
      <div class="rp-share-row">
        <span class="${statusTagClass(entry.status)}">${escapeHtml(
          statusLabel(entry.status),
        )}</span>
        <span class="bp3-text-muted">Published ${escapeHtml(
          formatPublishedAt(entry.publishedAt),
        )}</span>
      </div>
      ${updateHint}
      <div class="rp-share-actions">
        <button type="button" class="bp3-button bp3-intent-primary bp3-small"
          data-rp-share-update ${needsUpdate ? "" : "disabled"}>Update</button>
        ${
          entry.url
            ? `<a class="bp3-button bp3-minimal bp3-small" href="${escapeAttr(
                entry.url,
              )}" target="_blank" rel="noopener noreferrer">Open published</a>`
            : `<span class="bp3-text-muted">No live URL yet</span>`
        }
      </div>
    </section>

    <section class="rp-share-section">
      <h4 class="bp3-heading rp-share-heading">Visibility</h4>
      <div class="rp-share-radios" data-rp-share-visibility>
        ${visibilityOptions}
      </div>
    </section>

    ${scopeSection}

    <div class="rp-share-footer">
      <button type="button" class="bp3-button bp3-intent-danger bp3-minimal bp3-small"
        data-rp-share-unpublish>Unpublish</button>
      <button type="button" class="bp3-button bp3-small" data-rp-share-save>Save settings</button>
    </div>
  `;
}

/**
 * @param {HTMLElement} pop
 * @param {string} uid
 */
function bindPopover(pop, uid) {
  pop.querySelector("[data-rp-share-close]")?.addEventListener("click", () => {
    closeSharePopover();
  });

  pop.querySelector("[data-rp-share-update]")?.addEventListener("click", () => {
    void republish(uid).then(() => {
      refreshSharePopoverIfOpen();
    });
  });

  pop.querySelector("[data-rp-share-unpublish]")?.addEventListener("click", () => {
    void unpublishUid(uid);
  });

  pop.querySelector("[data-rp-share-save]")?.addEventListener("click", () => {
    const visibility =
      /** @type {HTMLInputElement | null} */ (
        pop.querySelector('input[name="rp-visibility"]:checked')
      )?.value;
    const scope =
      /** @type {HTMLInputElement | null} */ (
        pop.querySelector('input[name="rp-scope"]:checked')
      )?.value;

    void updateShareSettings(uid, {
      visibility,
      scope,
    }).then((result) => {
      if (!result) return;
      refreshSharePopoverIfOpen();
      notify("Share settings saved.");
    });
  });
}

/**
 * @param {HTMLElement} pop
 * @param {{ anchorRect?: DOMRect | null, clientX?: number, clientY?: number }} opts
 */
function positionPopover(pop, opts) {
  const pad = 12;
  const width = Math.min(360, window.innerWidth - pad * 2);
  pop.style.width = `${width}px`;

  let left = opts.clientX ?? opts.anchorRect?.left ?? window.innerWidth - width - 24;
  let top = opts.clientY ?? (opts.anchorRect ? opts.anchorRect.bottom + 8 : 80);

  const rect = pop.getBoundingClientRect();
  if (left + rect.width > window.innerWidth - pad) {
    left = window.innerWidth - rect.width - pad;
  }
  if (left < pad) left = pad;
  if (top + rect.height > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - rect.height - pad);
  }
  if (top < pad) top = pad;

  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
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
