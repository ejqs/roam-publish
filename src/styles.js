import { STYLE_ID } from "./constants.js";
import { publishCache } from "./state.js";
import { normalizeScope, normalizeStatus, STATUS_THEME } from "./theme.js";

/**
 * Style published blocks via a stylesheet + :has() — does not mutate Roam's
 * React tree.
 *
 * Scope (mirrors Color Highlighter / roam CSS “self vs children” patterns):
 * - self: ring the bullet + tint only the parent row (`> .rm-block-main`)
 * - tree: same ring + soft border/tint around the whole container (incl. kids)
 */
export function syncPublishStylesheet() {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  const rules = [];
  for (const [uid, entry] of publishCache) {
    if (entry.kind !== "block") continue;
    const safe = CSS.escape(uid);
    const theme = STATUS_THEME[normalizeStatus(entry.status)];
    const scope = normalizeScope(entry.scope);
    const container = blockContainerSelector(safe);

    rules.push(`
${container} .rm-bullet,
${container} .rm-bullet__inner,
${container} .controls > .rm-bullet {
  border-radius: 50% !important;
  box-sizing: content-box !important;
  box-shadow: 0 0 0 2px ${theme.ring} !important;
}`);

    if (scope === "tree") {
      rules.push(`
${container} {
  outline: 1.5px solid ${theme.treeBorder};
  outline-offset: 2px;
  border-radius: 6px;
  background: ${theme.tint};
}
${container} > .rm-block-main {
  border-radius: 4px 4px 0 0;
}`);
    } else {
      rules.push(`
${container} > .rm-block-main {
  background: ${theme.tint};
  border-radius: 4px;
}`);
    }
  }
  style.textContent = rules.join("\n");
}

/** @param {string} safeUid already CSS.escape'd */
function blockContainerSelector(safeUid) {
  return [
    `[data-uid="${safeUid}"]`,
    `.rm-block:has([id="block-input-${safeUid}"])`,
    `.roam-block-container:has([id="block-input-${safeUid}"])`,
  ].join(",\n");
}

export function clearPublishStylesheet() {
  document.getElementById(STYLE_ID)?.remove();
}
