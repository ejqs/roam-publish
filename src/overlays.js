/** Public overlay façade — re-exports for watcher / publish / lifecycle. */

export { clearBadge } from "./overlays/badges.js";
export {
  ensureOverlayRoots,
  destroyOverlayRoots,
  updateHud,
  setOpenShareHandler,
} from "./overlays/hud.js";
export {
  scrubLegacyInTreeBadges,
  schedulePaint,
  paintOverlays,
  removeAllBadges,
  isRoamOverlayOpen,
} from "./overlays/paint.js";
