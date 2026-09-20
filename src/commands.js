import {
  BLOCK_CTX_LABEL,
  BLOCK_CTX_UNPUBLISH_LABEL,
  PAGE_CTX_LABEL,
  PAGE_CTX_UNPUBLISH_LABEL,
} from "./constants.js";
import { postPublish, postUnpublish } from "./api.js";
import { getGraphName } from "./graph.js";
import { notify } from "./notify.js";
import {
  entityTitleFromPull,
  getOpenUid,
  isPageEntity,
  pullEntity,
} from "./roam.js";
import { connectionStatusMessage, runTokenExchange } from "./settings.js";
import { getApiKey } from "./settings-store.js";

/** @type {string[]} */
let registeredSlash = [];
/** @type {string[]} */
let registeredPalette = [];
/** @type {any} */
let savedExtensionAPI = null;

function requireKey() {
  if (!getApiKey()) {
    notify("Not connected. Settings → token → Connect.");
    return false;
  }
  return true;
}

/**
 * @param {{ uid: string, kind: "page" | "block", scope?: "self" | "tree" }} target
 */
async function publishTarget(target) {
  if (!requireKey()) return;
  const pull = pullEntity(target.uid);
  const title = entityTitleFromPull(pull, target.uid);
  notify(`Publishing ${target.kind}…`);
  try {
    const result = await postPublish({
      uid: target.uid,
      kind: target.kind,
      title,
      scope: target.kind === "block" ? target.scope || "tree" : undefined,
      visibility: "unlisted",
    });
    notify(result.url ? `Published.\n${result.url}` : `Published ${target.uid}.`);
  } catch (err) {
    notify(`Publish failed: ${err instanceof Error ? err.message : err}`);
  }
}

/** @param {string} uid */
async function unpublishUid(uid) {
  if (!requireKey()) return;
  notify("Unpublishing…");
  try {
    await postUnpublish(uid);
    notify(`Unpublished ${uid}.`);
  } catch (err) {
    notify(`Unpublish failed: ${err instanceof Error ? err.message : err}`);
  }
}

const COMMANDS = [
  {
    label: "Roam Publish: Connect (exchange token)",
    palette: true,
    run: () => runTokenExchange(),
  },
  {
    label: "Roam Publish: Connection status",
    palette: true,
    run: () => {
      const graph = getGraphName() || "(unknown)";
      notify(`${connectionStatusMessage()}\nGraph: ${graph}`);
    },
  },
  {
    label: "Roam Publish: Publish Page",
    slash: true,
    palette: true,
    run: async () => {
      const uid = await getOpenUid();
      if (!uid) {
        notify("No open page.");
        return;
      }
      const pull = pullEntity(uid);
      if (!isPageEntity(pull)) {
        notify("Open a page (not a block zoom) to publish as a page.");
        return;
      }
      await publishTarget({ uid, kind: "page" });
    },
  },
  {
    label: "Roam Publish: Publish Block",
    slash: true,
    palette: true,
    run: async () => {
      const focused = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
      const uid = focused || (await getOpenUid());
      if (!uid) {
        notify("Focus a block first.");
        return;
      }
      await publishTarget({ uid, kind: "block", scope: "tree" });
    },
  },
  {
    label: "Roam Publish: Unpublish open",
    slash: true,
    palette: true,
    run: async () => {
      const focused = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
      const uid = focused || (await getOpenUid());
      if (!uid) {
        notify("Nothing open to unpublish.");
        return;
      }
      await unpublishUid(uid);
    },
  },
];

/** @param {any} extensionAPI */
export function registerCommands(extensionAPI) {
  savedExtensionAPI = extensionAPI;
  registeredSlash = [];
  registeredPalette = [];

  for (const cmd of COMMANDS) {
    if (cmd.slash) {
      extensionAPI.ui.slashCommand.addCommand({
        label: cmd.label,
        callback: () => {
          void cmd.run();
          return "";
        },
      });
      registeredSlash.push(cmd.label);
    }
    if (cmd.palette) {
      extensionAPI.ui.commandPalette.addCommand({
        label: cmd.label,
        callback: () => {
          void cmd.run();
        },
      });
      registeredPalette.push(cmd.label);
    }
  }

  window.roamAlphaAPI.ui.blockContextMenu.addCommand({
    label: BLOCK_CTX_LABEL,
    callback: (ctx) => {
      void publishTarget({
        uid: ctx["block-uid"],
        kind: "block",
        scope: "tree",
      });
    },
  });
  window.roamAlphaAPI.ui.blockContextMenu.addCommand({
    label: BLOCK_CTX_UNPUBLISH_LABEL,
    callback: (ctx) => {
      void unpublishUid(ctx["block-uid"]);
    },
  });
  window.roamAlphaAPI.ui.pageContextMenu.addCommand({
    label: PAGE_CTX_LABEL,
    callback: (ctx) => {
      void publishTarget({ uid: ctx["page-uid"], kind: "page" });
    },
  });
  window.roamAlphaAPI.ui.pageContextMenu.addCommand({
    label: PAGE_CTX_UNPUBLISH_LABEL,
    callback: (ctx) => {
      void unpublishUid(ctx["page-uid"]);
    },
  });
}

export function teardownCommands(extensionAPI = savedExtensionAPI) {
  for (const label of registeredSlash) {
    try {
      extensionAPI?.ui?.slashCommand?.removeCommand?.({ label });
    } catch (_) {}
  }
  for (const label of registeredPalette) {
    try {
      extensionAPI?.ui?.commandPalette?.removeCommand?.({ label });
    } catch (_) {}
  }
  registeredSlash = [];
  registeredPalette = [];

  for (const label of [BLOCK_CTX_LABEL, BLOCK_CTX_UNPUBLISH_LABEL]) {
    try {
      window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label });
    } catch (_) {}
  }
  for (const label of [PAGE_CTX_LABEL, PAGE_CTX_UNPUBLISH_LABEL]) {
    try {
      window.roamAlphaAPI.ui.pageContextMenu.removeCommand({ label });
    } catch (_) {}
  }
}
