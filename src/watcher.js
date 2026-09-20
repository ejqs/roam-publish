import {
  ensureOverlayRoots,
  schedulePaint,
  scrubLegacyInTreeBadges,
} from "./overlays.js";
import { scanAllForOutdated } from "./outdated.js";
import { refreshCachedOpenUid } from "./roam.js";
import { setViewportWatcher, viewportWatcher } from "./state.js";

let mutationPaintTimer = null;
let outdatedScanTimer = null;

function isOurOverlayNode(node) {
  if (!node) return false;
  const el =
    node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!(el instanceof Element)) return false;
  return Boolean(
    el.id === "rp-publish-layer" ||
      el.id === "rp-publish-hud" ||
      el.id === "rp-share-popover" ||
      el.id === "rp-published-portal" ||
      el.closest(
        "#rp-publish-layer, #rp-publish-hud, #rp-share-popover, #rp-published-portal, .rp-published-backdrop",
      ),
  );
}

function schedulePaintFromMutation() {
  if (mutationPaintTimer) return;
  mutationPaintTimer = window.setTimeout(() => {
    mutationPaintTimer = null;
    schedulePaint();
  }, 400);
}

function scheduleOutdatedScan() {
  if (outdatedScanTimer) return;
  // Debounced; never on paint hot path — pulls edit metadata.
  outdatedScanTimer = window.setTimeout(() => {
    outdatedScanTimer = null;
    try {
      scanAllForOutdated();
    } catch (err) {
      console.warn("Roam Publish: outdated scan failed", err);
    }
  }, 1200);
}

export function startViewportWatcher() {
  stopViewportWatcher();
  scrubLegacyInTreeBadges();
  ensureOverlayRoots();

  const onScrollOrResize = () => schedulePaint();
  window.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize);

  // Find-or-create focus must hide badges immediately (mutation debounce is too slow).
  const onFindOrCreateFocus = (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (
      t.id === "find-or-create-input" ||
      t.closest(".rm-find-or-create-wrapper")
    ) {
      schedulePaint();
    }
  };
  document.addEventListener("focusin", onFindOrCreateFocus);
  document.addEventListener("focusout", onFindOrCreateFocus);

  const mutation = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (isOurOverlayNode(m.target)) continue;
      const touched = [...m.addedNodes, ...m.removedNodes];
      if (touched.length && touched.every((n) => isOurOverlayNode(n))) {
        continue;
      }
      // Overlay open/close: paint now so badges don't sit on top of search.
      const overlayish = touched.some((n) => {
        if (!(n instanceof Element)) return false;
        return Boolean(
          n.matches?.(
            ".bp3-overlay, .bp3-popover, .bp3-transition-container, .rm-menu-item, .rm-omnibar, .rm-command-palette",
          ) ||
            n.querySelector?.(
              ".bp3-overlay, .bp3-popover, .rm-menu-item, .rm-omnibar, .rm-command-palette",
            ),
        );
      });
      if (overlayish) schedulePaint();
      else schedulePaintFromMutation();
      // Content edits often mutate text nodes / block inputs — scan outdated slowly.
      if (
        m.type === "characterData" ||
        (m.target instanceof Element &&
          (m.target.closest?.(".rm-block__input") ||
            m.target.closest?.(".rm-title-display") ||
            m.target.classList?.contains("rm-block__input")))
      ) {
        scheduleOutdatedScan();
      }
      break;
    }
  });

  const root =
    document.querySelector(".roam-app") ||
    document.querySelector(".roam-body") ||
    document.body;
  // childList + characterData for edit detection; not attributes (flood risk).
  mutation.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  void refreshCachedOpenUid().then(() => schedulePaint());
  const openUidTick = window.setInterval(() => {
    void refreshCachedOpenUid().then(() => schedulePaint());
  }, 5000);

  const outdatedTick = window.setInterval(() => {
    try {
      scanAllForOutdated();
    } catch (_) {}
  }, 15000);

  setViewportWatcher({
    disconnect() {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("focusin", onFindOrCreateFocus);
      document.removeEventListener("focusout", onFindOrCreateFocus);
      mutation.disconnect();
      window.clearInterval(openUidTick);
      window.clearInterval(outdatedTick);
      if (mutationPaintTimer) {
        window.clearTimeout(mutationPaintTimer);
        mutationPaintTimer = null;
      }
      if (outdatedScanTimer) {
        window.clearTimeout(outdatedScanTimer);
        outdatedScanTimer = null;
      }
    },
  });

  schedulePaint();
}

export function stopViewportWatcher() {
  viewportWatcher?.disconnect();
  setViewportWatcher(null);
}
