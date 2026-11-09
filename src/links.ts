import { iconFor, linkStyles } from "./marks";
import { getCache, getStatusMarks, listingOf, lockedOf } from "./state";

/**
 * Marks on links: a small icon after [[links]] and #tags to published pages, and on a published page a
 * dotted underline on links to pages that aren't. One generated stylesheet (marks.ts `linkStyles`), so
 * nothing watches or changes the links themselves; it's rebuilt when the published list changes or
 * edits pause (a page may have been renamed). Only with Status in Roam set to Titles and blocks.
 */

const STYLE_ID = "roam-publish-links";
let last = "";
let pending: Promise<void> | null = null;
let again = false;

/** Rebuilds the stylesheet; asked again while it's at it, it builds once more after. */
export function refreshLinks(pageAttr: string): Promise<void> {
  if (pending) {
    again = true;
    return pending;
  }
  pending = draw(pageAttr)
    .catch((e) => console.warn("[roam-publish] couldn't mark links", e))
    .finally(() => {
      pending = null;
      if (again) {
        again = false;
        void refreshLinks(pageAttr);
      }
    });
  return pending;
}

async function draw(pageAttr: string) {
  if (getStatusMarks() !== "Titles and blocks") return removeLinks();
  const cache = getCache();
  const pages = Object.entries(cache).filter(([, c]) => c.kind === "page" && !c.removed);
  // Titles as Roam has them now: an encrypted page's cached title can be old, and pages get renamed.
  const titles: [string, string][] = pages.length
    ? await window.roamAlphaAPI.data.async.q(
        "[:find ?u ?t :in $ [?u ...] :where [?p :block/uid ?u] [?p :node/title ?t]]",
        pages.map(([u]) => u),
      )
    : [];
  const byUid = new Map(titles);
  const css = linkStyles(
    pages.flatMap(([uid, c]) => {
      const title = byUid.get(uid);
      if (!title) return [];
      const { icon } = iconFor("current", lockedOf(c), c.inGraph !== false && listingOf(c) === "unlisted");
      return [{ title, icon }];
    }),
    pageAttr,
  );
  if (css === last && document.getElementById(STYLE_ID)) return;
  last = css;
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
}

export function removeLinks() {
  document.getElementById(STYLE_ID)?.remove();
  last = "";
}
