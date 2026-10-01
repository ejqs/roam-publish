import { isPublished, publish, syncPublications, unpublish } from "./publish";
import { createSettingsPanel } from "./settings";
import { getApiKey, initState } from "./state";
import { removeToasts, toast } from "./toast";
import { stopPolling, tryClaim } from "./verify";

const BLOCK_PUBLISH = "Roam Publish: Publish block";
const BLOCK_UNPUBLISH = "Roam Publish: Unpublish block";
const PAGE_PUBLISH = "Roam Publish: Publish page";
const PAGE_UNPUBLISH = "Roam Publish: Unpublish page";
const CMD_PUBLISH_CURRENT = "Roam Publish: Publish current page";
const CMD_SYNC = "Roam Publish: Sync published list";

let extensionAPI: ExtensionAPI;

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
  ui.blockContextMenu.addCommand({ label: BLOCK_PUBLISH, callback: (c) => void publish(c["block-uid"]) });
  ui.blockContextMenu.addCommand({
    label: BLOCK_UNPUBLISH,
    callback: (c) => void unpublish(c["block-uid"]),
    "display-conditional": (c) => isPublished(c["block-uid"]),
  });
  ui.pageContextMenu.addCommand({ label: PAGE_PUBLISH, callback: (c) => void withPageUid(c, publish) });
  ui.pageContextMenu.addCommand({ label: PAGE_UNPUBLISH, callback: (c) => void withPageUid(c, unpublish) });

  api.ui.commandPalette.addCommand({
    label: CMD_PUBLISH_CURRENT,
    callback: async () => {
      const uid = await ui.mainWindow.getOpenPageOrBlockUid();
      if (uid) await publish(uid);
      else toast("Open a page first.");
    },
  });
  api.ui.commandPalette.addCommand({
    label: CMD_SYNC,
    callback: () => void syncPublications().catch((e: Error) => toast(e.message, { intent: "danger" })),
  });

  // Not connected yet? A verification block may already be waiting on today's daily note.
  if (!getApiKey()) void tryClaim().catch(() => {});
}

function onunload() {
  const { ui } = window.roamAlphaAPI;
  ui.blockContextMenu.removeCommand({ label: BLOCK_PUBLISH });
  ui.blockContextMenu.removeCommand({ label: BLOCK_UNPUBLISH });
  ui.pageContextMenu.removeCommand({ label: PAGE_PUBLISH });
  ui.pageContextMenu.removeCommand({ label: PAGE_UNPUBLISH });
  extensionAPI?.ui.commandPalette.removeCommand({ label: CMD_PUBLISH_CURRENT });
  extensionAPI?.ui.commandPalette.removeCommand({ label: CMD_SYNC });
  stopPolling();
  removeToasts();
}

export default { onload, onunload };
