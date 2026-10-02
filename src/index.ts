import { confirmChangeLogBlocks, publish, publishStatus, unpublish } from "./publish";
import { createSettingsPanel } from "./settings";
import { initState } from "./state";
import { removeToasts, toast } from "./toast";

const BLOCK_MENU = "Roam Publish: Block…";
const PAGE_MENU = "Roam Publish: Page…";

/** Command palette: the current page, or the block being edited. */
const PALETTE: { label: string; target: "page" | "block"; run: (uid: string) => Promise<void> }[] = [
  { label: "Roam Publish: Publish current page", target: "page", run: publish },
  { label: "Roam Publish: Unpublish current page", target: "page", run: unpublish },
  { label: "Roam Publish: Current page status", target: "page", run: publishStatus },
  { label: "Roam Publish: Publish focused block", target: "block", run: publish },
  { label: "Roam Publish: Unpublish focused block", target: "block", run: unpublish },
  { label: "Roam Publish: Focused block status", target: "block", run: publishStatus },
];

let extensionAPI: ExtensionAPI;
let confirmTimers: ReturnType<typeof setTimeout>[] = [];

/** The blocks the change log goes under are confirmed shortly after load, then every few minutes while Roam is open. */
const CONFIRM_EVERY_MS = 5 * 60_000;
const confirm = () => void confirmChangeLogBlocks().catch(() => {});

/** The page context menu's context shape is undocumented; accept the likely keys. */
async function pageUidFromContext(ctx: Record<string, unknown>): Promise<string | null> {
  const uid = (ctx["page-uid"] ?? ctx["uid"] ?? ctx["block-uid"]) as string | undefined;
  if (uid) return uid;
  const title = (ctx["page-title"] ?? ctx["title"]) as string | undefined;
  if (!title) {
    console.warn("[roam-publish] unknown page context menu context", ctx);
    return null;
  }
  return window.roamAlphaAPI.data.async.q(
    "[:find ?u . :in $ ?t :where [?p :node/title ?t] [?p :block/uid ?u]]",
    title,
  );
}

/** The open page, also when zoomed into one of its blocks. */
async function currentPageUid() {
  const uid = await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid();
  if (!uid) return null;
  const b = await window.roamAlphaAPI.data.async.pull("[:node/title {:block/page [:block/uid]}]", `[:block/uid "${uid}"]`);
  return b?.[":block/page"]?.[":block/uid"] ?? uid;
}

async function withTarget(target: "page" | "block", fn: (uid: string) => Promise<void>) {
  const uid = target === "page" ? await currentPageUid() : window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
  if (uid) await fn(uid);
  else toast(target === "page" ? "Open a page first." : "Click into a block first, then run the command.");
}

async function withPageUid(ctx: Record<string, unknown>, fn: (uid: string) => Promise<void>) {
  const uid = await pageUidFromContext(ctx);
  if (uid) await fn(uid);
  else toast("Couldn't identify that page. Use the command palette: “Publish current page”.", { intent: "danger" });
}

async function onload({ extensionAPI: api }: { extensionAPI: ExtensionAPI }) {
  extensionAPI = api;
  initState(api);
  createSettingsPanel(api);

  const { ui } = window.roamAlphaAPI;
  // One entry per menu: it shows the status and offers what can be done from there.
  ui.blockContextMenu.addCommand({ label: BLOCK_MENU, callback: (c) => void publishStatus(c["block-uid"]) });
  ui.pageContextMenu.addCommand({ label: PAGE_MENU, callback: (c) => void withPageUid(c, publishStatus) });

  for (const c of PALETTE) api.ui.commandPalette.addCommand({ label: c.label, callback: () => void withTarget(c.target, c.run) });
  confirmTimers = [setTimeout(confirm, 20_000), setInterval(confirm, CONFIRM_EVERY_MS)];
}

function onunload() {
  const { ui } = window.roamAlphaAPI;
  ui.blockContextMenu.removeCommand({ label: BLOCK_MENU });
  ui.pageContextMenu.removeCommand({ label: PAGE_MENU });
  for (const c of PALETTE) extensionAPI?.ui.commandPalette.removeCommand({ label: c.label });
  confirmTimers.forEach((t) => clearTimeout(t));
  confirmTimers = [];
  removeToasts();
}

export default { onload, onunload };
