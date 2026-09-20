import { listPublishEntries, onCacheChange } from "./cache.js";
import { openUidInMainWindow } from "./roam.js";
import { openSharePopover } from "./share-popover.js";
import {
  formatPublishedAt,
  scopeLabel,
  statusLabel,
  statusTagClass,
  visibilityLabel,
} from "./theme.js";

const PORTAL_ID = "rp-published-portal";

/** @type {(() => void) | null} */
let dialogUnsub = null;
/** @type {((e: KeyboardEvent) => void) | null} */
let keyHandler = null;

/**
 * Discourse Graph / Workbench pattern: command-palette → Blueprint Dialog
 * overlay (vanilla DOM stand-in for roamjs-components renderOverlay + Dialog).
 */
export function closePublishedItemsDialog() {
  document.getElementById(PORTAL_ID)?.remove();
  dialogUnsub?.();
  dialogUnsub = null;
  if (keyHandler) {
    document.removeEventListener("keydown", keyHandler, true);
    keyHandler = null;
  }
}

export function openPublishedItemsDialog() {
  closePublishedItemsDialog();

  const portal = document.createElement("div");
  portal.id = PORTAL_ID;
  portal.className = "bp3-portal rp-published-portal";
  portal.innerHTML = `
    <div class="bp3-overlay bp3-overlay-open bp3-overlay-scroll-container rp-published-overlay">
      <div class="bp3-overlay-backdrop rp-published-backdrop" data-rp-published-close></div>
      <div class="bp3-dialog-container rp-published-dialog-container">
        <div class="bp3-dialog rp-published-dialog" role="dialog" aria-modal="true"
          aria-labelledby="rp-published-title">
          <div class="bp3-dialog-header">
            <span class="bp3-icon bp3-icon-share bp3-icon-large" aria-hidden="true"></span>
            <h4 class="bp3-heading" id="rp-published-title">Published items</h4>
            <button type="button" class="bp3-dialog-close-button bp3-button bp3-minimal bp3-icon-cross"
              data-rp-published-close aria-label="Close"></button>
          </div>
          <div class="bp3-dialog-body" data-rp-published-body></div>
          <div class="bp3-dialog-footer">
            <div class="bp3-dialog-footer-actions">
              <span class="bp3-text-muted rp-published-count" data-rp-published-count></span>
              <button type="button" class="bp3-button" data-rp-published-close>Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(portal);

  const fill = () => {
    const items = listPublishEntries();
    const body = portal.querySelector("[data-rp-published-body]");
    const count = portal.querySelector("[data-rp-published-count]");
    if (body) body.innerHTML = renderItemsHtml(items);
    if (count) {
      count.textContent = items.length
        ? `${items.length} item${items.length === 1 ? "" : "s"}`
        : "";
    }
    bindItemActions(portal);
  };
  fill();
  dialogUnsub = onCacheChange(fill);

  portal.querySelectorAll("[data-rp-published-close]").forEach((el) => {
    el.addEventListener("click", () => closePublishedItemsDialog());
  });

  keyHandler = (e) => {
    if (e.key === "Escape") closePublishedItemsDialog();
  };
  document.addEventListener("keydown", keyHandler, true);
}

/**
 * @param {Array<object>} items
 */
export function renderItemsHtml(items) {
  if (!items.length) {
    return `<p class="bp3-text-muted rp-published-empty">No published items yet. Connect in Settings, publish a page or block, then reopen.</p>`;
  }
  return `
    <div class="rp-published-list" role="list">
      ${items.map((item) => renderItemRow(item)).join("")}
    </div>
  `;
}

/** @param {object} item */
function renderItemRow(item) {
  const title = escapeHtml(item.title || item.uid);
  const scope =
    item.kind === "block" ? escapeHtml(scopeLabel(item.scope)) : "—";
  const url = item.url
    ? `<a class="rp-published-item-link" href="${escapeAttr(
        item.url,
      )}" target="_blank" rel="noopener noreferrer" data-rp-stop>${escapeHtml(
        item.url,
      )}</a>`
    : `<span class="bp3-text-muted">No live URL</span>`;

  return `
    <div class="rp-published-item bp3-card bp3-interactive bp3-elevation-0"
      role="listitem" tabindex="0"
      data-rp-published-uid="${escapeAttr(item.uid)}"
      data-rp-published-kind="${escapeAttr(item.kind)}">
      <div class="rp-published-item-top">
        <span class="bp3-tag bp3-minimal bp3-small">${escapeHtml(item.kind)}</span>
        <span class="${statusTagClass(item.status)} bp3-small">${escapeHtml(
          statusLabel(item.status),
        )}</span>
        <span class="bp3-tag bp3-minimal bp3-small">${escapeHtml(
          visibilityLabel(item.visibility),
        )}</span>
        <span class="rp-published-item-actions">
          <button type="button" class="bp3-button bp3-minimal bp3-small bp3-icon-document-open"
            data-rp-open-uid="${escapeAttr(item.uid)}" title="Open in Roam">Open</button>
          <button type="button" class="bp3-button bp3-minimal bp3-small bp3-intent-primary"
            data-rp-open-share-item="${escapeAttr(item.uid)}">Share</button>
        </span>
      </div>
      <div class="rp-published-item-title">${title}</div>
      <div class="rp-published-item-meta bp3-text-muted">
        <span>Scope: ${scope}</span>
        <span>Published: ${escapeHtml(formatPublishedAt(item.publishedAt))}</span>
      </div>
      <div class="rp-published-item-url">${url}</div>
    </div>
  `;
}

/** @param {ParentNode} root */
function bindItemActions(root) {
  root.querySelectorAll("[data-rp-open-share-item]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const uid = /** @type {Element} */ (ev.currentTarget).getAttribute(
        "data-rp-open-share-item",
      );
      if (!uid) return;
      closePublishedItemsDialog();
      openSharePopover(uid);
    });
  });

  root.querySelectorAll("[data-rp-open-uid]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const uid = /** @type {Element} */ (ev.currentTarget).getAttribute(
        "data-rp-open-uid",
      );
      if (!uid) return;
      closePublishedItemsDialog();
      void openUidInMainWindow(uid);
    });
  });

  root.querySelectorAll("[data-rp-published-uid]").forEach((row) => {
    const openShare = () => {
      const uid = row.getAttribute("data-rp-published-uid");
      if (!uid) return;
      closePublishedItemsDialog();
      openSharePopover(uid);
    };
    row.addEventListener("click", (ev) => {
      const t = /** @type {Element} */ (ev.target);
      if (t.closest?.("[data-rp-stop], a, button")) return;
      openShare();
    });
    row.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        openShare();
      }
    });
  });
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
