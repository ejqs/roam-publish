// Prototype: dummy GET → cache → overlays (pages/chips) + stylesheet (blocks)
// Hot path (scroll/paint) must NOT call rate-limited roamAlphaAPI methods.

import { onCacheChange } from "./cache.js";
import { buildSettings, registerCommands, teardownCommands } from "./commands.js";
import { removeAllBadges, schedulePaint, setOpenShareHandler } from "./overlays.js";
import { refreshPublishCache } from "./publish.js";
import {
  closePublishedItemsDialog,
} from "./published-list.js";
import {
  closeSharePopover,
  openSharePopover,
  refreshSharePopoverIfOpen,
} from "./share-popover.js";
import { setExtensionAPI } from "./settings-store.js";
import { clearPublishCache } from "./state.js";
import { syncPublishStylesheet } from "./styles.js";
import { startViewportWatcher, stopViewportWatcher } from "./watcher.js";

let unsubscribeCache = null;

function teardown() {
  stopViewportWatcher();
  teardownCommands();
  unsubscribeCache?.();
  unsubscribeCache = null;
  closeSharePopover();
  closePublishedItemsDialog();
  removeAllBadges();
  clearPublishCache();
  setExtensionAPI(null);
}

export default {
  onload: ({ extensionAPI, extension }) => {
    console.log("loading version", extension.version);

    setExtensionAPI(extensionAPI);
    buildSettings(extensionAPI, extension);
    registerCommands(extensionAPI, extension);

    setOpenShareHandler((uid, ev) => {
      const anchor =
        ev.target instanceof Element
          ? ev.target.closest("[data-rp-open-share]")
          : null;
      openSharePopover(uid, {
        clientX: ev.clientX,
        clientY: ev.clientY,
        anchorRect: anchor?.getBoundingClientRect() ?? null,
      });
    });

    unsubscribeCache = onCacheChange(() => {
      syncPublishStylesheet();
      schedulePaint();
      refreshSharePopoverIfOpen();
    });

    startViewportWatcher();
    void refreshPublishCache();

    return teardown;
  },
  onunload: teardown,
};
