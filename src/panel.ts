import { choiceInGraph, choiceOpts, publish, publishChoices, statusView, type StatusView } from "./publish";
import { openDashboard, renderPageSettings, renderPageStats } from "./panels";
import { openSetup } from "./setup";
import { getApiKey, type Listing } from "./state";
import { toast } from "./toast";
import { button, callout, dialog, h, segmented, selectField } from "./ui";

/**
 * The Roam Publish pop-up for one page or block: "This page" (its status, stats and actions, or the
 * Publish form when it isn't published) and "Settings". The title icons show it under the title; the
 * page and block menus and the command palette show it as a dialog. Everything about one page or
 * block happens here, so toasts only report results.
 */

export type Tab = "page" | "settings";

/** Stats and settings only for pages this key may change: published, not removed, not another member's. */
export const yours = (view: StatusView) => view.state !== "unpublished" && view.state !== "removed" && view.state !== "other";

type Frame = {
  /** Called after the content changes size, so an anchored pop-up can stay in view. */
  relayout: () => void;
  /** Closes the pop-up or dialog. */
  close: () => void;
  /** Whether it's still showing. */
  isOpen: () => boolean;
  /** Something about the page changed (settings saved, a collection added): redraw its marks. */
  onChange: () => void;
};

/**
 * Fills `root` with the pop-up's tabs for `uid`, synced with roam.pub first, as the menus are.
 * Resolves to the status it found, or null when the page or block couldn't be read.
 */
export async function renderPanel(root: HTMLElement, uid: string, tab: Tab, frame: Frame): Promise<StatusView | null> {
  root.replaceChildren(h("div", { class: "rp-muted" }, "Checking…"));
  let view: StatusView | null = null;
  try {
    view = await statusView(uid, { sync: true });
  } catch (e) {
    root.replaceChildren(callout(e instanceof Error ? e.message : "Couldn't check the status.", "danger"));
    return null;
  }
  if (!frame.isOpen()) return view;
  if (!view) {
    root.replaceChildren(callout("Couldn't read that page or block.", "danger"));
    return null;
  }
  const v = view;
  const body = h("div", { class: "rp-tab-body" });
  const tabs: [Tab, string, () => void][] = [["page", v.state === "unpublished" ? "Publish" : `This ${v.kind}`, () => drawPage(body, uid, v, frame)]];
  if (yours(v)) tabs.push(["settings", "Settings", () => void renderPageSettings(body, uid, frame.onChange).then(frame.relayout)]);
  const bar = h("div", { class: "rp-tabs", role: "tablist" });
  const select = (t: Tab) => {
    const i = Math.max(0, tabs.findIndex(([k]) => k === t));
    bar.querySelectorAll("[role=tab]").forEach((b, j) => b.setAttribute("aria-selected", String(i === j)));
    tabs[i][2]();
    frame.relayout();
  };
  for (const [k, label] of tabs) bar.append(h("button", { type: "button", class: "rp-tab", role: "tab", onclick: () => select(k) }, label));
  // One tab (something new: Publish) needs no tab bar.
  root.replaceChildren(...(tabs.length > 1 ? [bar] : []), body);
  select(tab);
  return v;
}

/** The pop-up as a dialog, for the page and block menus and the command palette. Setup first when there's no key. */
export function openPanel(uid: string, tab: Tab = "page") {
  if (!getApiKey()) return openSetup(() => openPanel(uid, tab));
  const d = dialog("Roam Publish");
  d.body.classList.add("rp-panel");
  d.footer.closest(".bp3-dialog-footer")?.remove();
  void renderPanel(d.body, uid, tab, { relayout: () => {}, close: d.close, isOpen: d.isOpen, onChange: () => {} });
}

/** "This page": the Publish form when it isn't published; otherwise the status, the page's stats and its actions. */
function drawPage(root: HTMLElement, uid: string, view: StatusView, frame: Frame) {
  if (view.state === "unpublished") return void drawPublishForm(root, uid, view, frame);
  const stats = h("div", {});
  const { message, actions } = drawStatus(view, frame.close);
  // Stats sit between the status and its actions.
  root.replaceChildren(
    message,
    stats,
    actions,
    h(
      "div",
      { class: "rp-pop-foot" },
      h("a", { class: "rp-link", href: "#", onclick: (e: Event) => (e.preventDefault(), frame.close(), openDashboard()) }, "Open dashboard"),
    ),
  );
  if (yours(view)) void renderPageStats(stats, uid).then(frame.relayout);
}

/** The status, as the pop-up says it, with its actions. */
function drawStatus(view: StatusView, close: () => void) {
  const row = h("div", { class: "rp-row" });
  const add = (label: string, onClick: () => void, opts: { intent?: "primary" | "danger"; minimal?: boolean }, keepOpen = false) =>
    row.append(button(label, () => (keepOpen || close(), onClick()), opts));
  const last = view.actions.filter((a) => a.label === "Unpublish");
  view.actions
    .filter((a) => !last.includes(a))
    .forEach((a, i) => add(a.label, a.onClick, { intent: i === 0 && /^(Republish|Publish|Sync)/.test(a.label) ? "primary" : undefined }));
  // Links come from the server's responses; only ever open web pages from them.
  const link = view.link;
  if (link && /^https?:\/\//i.test(link)) add("Open ↗", () => void window.open(link, "_blank", "noopener"), {});
  // The permanent link to its status page on roam.pub, which the Roam Publish block used to be the only place for.
  const statusLink = view.c?.shortUrl;
  if (statusLink && /^https?:\/\//i.test(statusLink))
    add(
      "Copy status link",
      () =>
        void navigator.clipboard.writeText(statusLink).then(
          () => toast("Status link copied.", { intent: "success" }),
          () => toast(`Couldn't copy it. The link is ${statusLink}`),
        ),
      { minimal: true },
      true,
    );
  last.forEach((a) => add(a.label, a.onClick, { minimal: true, intent: "danger" }));
  return { message: h("div", {}, view.message), actions: row.childElementCount ? row : "" };
}

const LISTING_OPTIONS: { value: Listing; label: string }[] = [
  { value: "unlisted", label: "Unlisted" },
  { value: "listed", label: "Public" },
  { value: "discover", label: "Discover" },
];
const LISTING_NOTE: Record<Listing, string> = {
  unlisted: "Only people with the link can open it.",
  listed: "On your graph's front page.",
  discover: "On your graph's front page and roam.pub/discover.",
};
const DISCOVER_LOCKED = "Discover is only for pages anyone can read.";
/** The visibility picked last time, so publishing many pages the same way is one click each. */
let lastListing: Listing = "unlisted";

/**
 * Publish, for something not published yet: where it goes and, in its graph, its visibility, chosen
 * before anything is sent or written to the graph.
 */
async function drawPublishForm(root: HTMLElement, uid: string, view: StatusView, frame: Frame) {
  root.replaceChildren(h("div", { class: "rp-muted" }, "Loading…"));
  let choices: Awaited<ReturnType<typeof publishChoices>>;
  try {
    choices = await publishChoices();
  } catch (e) {
    root.replaceChildren(callout(e instanceof Error ? e.message : "Couldn't load where it can go.", "danger"));
    return frame.relayout();
  }
  if (!frame.isOpen()) return;
  const goTo = choices?.goTo ?? ["graph"];
  const where = choices && choices.options.length > 1 ? selectField("Publish to", choices.options, choices.value, { bare: true }) : null;
  const picked = () => where?.get() ?? choices?.value ?? "graph";
  const visibility = segmented("Visibility", LISTING_OPTIONS, lastListing);
  const note = h("span", { class: "rp-note" });
  const visibilityRow = h("div", { class: "rp-form-row" }, h("span", { class: "rp-form-label" }, "Visibility"), h("div", { class: "rp-form-field" }, visibility.group, note));
  const collectionNote = h("div", { class: "rp-form-row" }, h("span", {}), h("span", { class: "rp-note" }, "It starts out the way the collection says."));
  const draw = () => {
    const inGraph = choiceInGraph(picked(), goTo);
    // Password and members-only pages can't go on Discover: roam.pub would refuse it after publishing.
    const locked = !!choices?.locked.includes(picked());
    visibility.block("discover", locked ? DISCOVER_LOCKED : null);
    visibilityRow.hidden = !inGraph;
    collectionNote.hidden = inGraph;
    note.textContent = LISTING_NOTE[visibility.get() as Listing] + (locked ? ` ${DISCOVER_LOCKED}` : "");
    frame.relayout();
  };
  where?.row.querySelector("select")?.addEventListener("change", draw);
  visibility.group.addEventListener("click", draw);
  const go = button(
    `Publish ${view.kind}`,
    () => {
      const listing = visibility.get() as Listing;
      lastListing = listing;
      frame.close();
      void publish(uid, { ...(choices ? choiceOpts(picked(), goTo) : { noAsk: true }), listing });
    },
    { intent: "primary", small: false },
  );
  root.replaceChildren(
    h("div", {}, view.message),
    ...(where
      ? [h("div", { class: "rp-form-row" }, h("span", { class: "rp-form-label" }, "Publish to"), h("div", { class: "rp-form-field" }, where.row,
          // Why "Password, encrypted" can't be picked, in full: the option itself only says it's unavailable.
          choices?.encryptBlocked ? h("span", { class: "rp-note" }, `Encrypted: ${choices.encryptBlocked}`) : ""))]
      : []),
    visibilityRow,
    collectionNote,
    h("div", { class: "rp-row rp-row-end" }, button("Cancel", frame.close, { small: false }), go),
  );
  draw();
  go.focus();
}
