import {
  BLOCK_CTX_LABEL,
  BLOCK_CTX_UNPUBLISH_LABEL,
  PAGE_CTX_LABEL,
  PAGE_CTX_UNPUBLISH_LABEL,
} from "./constants.js";
import { checkPublishState } from "./cache.js";
import { notify } from "./notify.js";
import { publish, refreshPublishCache, unpublish } from "./publish.js";
import { openPublishedItemsDialog } from "./published-list.js";
import { getGraphName } from "./graph.js";
import { refreshCachedOpenUid } from "./roam.js";
import { buildSettings as createSettingsPanel, runTokenExchange } from "./settings.js";
import { getApiBase, getApiKey } from "./settings-store.js";
import { openSharePopover } from "./share-popover.js";
import { publishCache } from "./state.js";
import { resolvePublishTarget } from "./target.js";
import { scopeLabel, statusLabel, visibilityLabel } from "./theme.js";

export const BLOCK_CTX_TREE_LABEL = `${BLOCK_CTX_LABEL} (+ children)`;
export const BLOCK_CTX_SHARE_LABEL = "Roam Publish: Share settings…";
export const PAGE_CTX_SHARE_LABEL = "Roam Publish: Share settings…";

async function alertPublishState(uid, label) {
  const state = uid ? checkPublishState(uid) : null;
  console.log("Roam Publish: check", label, uid, state);
  if (state) {
    const scope =
      state.kind === "block" ? `\nScope: ${scopeLabel(state.scope)}` : "";
    notify(
      `${label} ${uid}\n${state.kind} · ${statusLabel(state.status)} · ${visibilityLabel(
        state.visibility,
      )}${scope}${state.url ? `\n${state.url}` : ""}`,
    );
  } else {
    notify(`No publish record for ${uid || `(no ${label})`}`);
  }
}

async function openShareForKind(kind) {
  const target = await resolvePublishTarget({ kind });
  if (!target) return;
  openSharePopover(target.uid);
}

/** @type {Array<{ label: string, slash?: boolean, palette?: boolean, run: () => void | Promise<void> }>} */
const COMMANDS = [
  {
    label: "Roam Publish: Publish Page",
    slash: true,
    palette: true,
    run: () => publish({ kind: "page" }),
  },
  {
    label: "Roam Publish: Publish Block (this only)",
    slash: true,
    palette: true,
    run: () => publish({ kind: "block", scope: "self" }),
  },
  {
    label: "Roam Publish: Publish Block (+ children)",
    slash: true,
    palette: true,
    run: () => publish({ kind: "block", scope: "tree" }),
  },
  {
    label: "Roam Publish: Unpublish Page",
    slash: true,
    palette: true,
    run: () => unpublish({ kind: "page" }),
  },
  {
    label: "Roam Publish: Unpublish Block",
    slash: true,
    palette: true,
    run: () => unpublish({ kind: "block" }),
  },
  {
    label: "Roam Publish: Share settings…",
    slash: true,
    palette: true,
    run: async () => {
      const focused = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
      if (focused && publishCache.has(focused)) {
        openSharePopover(focused);
        return;
      }
      await openShareForKind("page");
    },
  },
  {
    label: "Roam Publish: Share settings for page…",
    palette: true,
    run: () => openShareForKind("page"),
  },
  {
    label: "Roam Publish: Share settings for block…",
    palette: true,
    run: () => openShareForKind("block"),
  },
  {
    label: "Roam Publish: Show published items",
    palette: true,
    run: () => openPublishedItemsDialog(),
  },
  {
    label: "Roam Publish: Connect (exchange token)",
    palette: true,
    run: () => runTokenExchange(),
  },
  {
    label: "Roam Publish: Refresh status cache",
    palette: true,
    run: () => refreshPublishCache(),
  },
  {
    label: "Roam Publish: Connection status",
    palette: true,
    run: () => {
      const key = getApiKey();
      const graph = getGraphName() || "(unknown)";
      notify(
        key
          ? `Connected to ${getApiBase()}\nGraph: ${graph}\nAPI key: ${key.length} chars`
          : `Not connected.\nServer: ${getApiBase()}\nGraph: ${graph}\nPaste a Roam token in Settings, then Connect.`,
      );
    },
  },
  {
    label: "Roam Publish: Log status cache",
    palette: true,
    run: () => {
      console.log("Roam Publish cache", Object.fromEntries(publishCache));
    },
  },
  {
    label: "Roam Publish: Check this page",
    slash: true,
    run: () =>
      refreshCachedOpenUid().then((uid) => alertPublishState(uid, "page")),
  },
  {
    label: "Roam Publish: Check this block",
    slash: true,
    run: () => {
      const uid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
      return alertPublishState(uid, "block");
    },
  },
];

/** @type {string[]} */
let registeredSlash = [];
/** @type {string[]} */
let registeredPalette = [];

/** @type {any} */
let savedExtensionAPI = null;

export function buildSettings(extensionAPI, _extension) {
  createSettingsPanel(extensionAPI);
}

export function registerCommands(extensionAPI, _extension) {
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
      void publish({ uid: ctx["block-uid"], kind: "block", scope: "self" });
    },
  });

  window.roamAlphaAPI.ui.blockContextMenu.addCommand({
    label: BLOCK_CTX_TREE_LABEL,
    callback: (ctx) => {
      void publish({ uid: ctx["block-uid"], kind: "block", scope: "tree" });
    },
  });

  window.roamAlphaAPI.ui.blockContextMenu.addCommand({
    label: BLOCK_CTX_SHARE_LABEL,
    callback: (ctx) => {
      openSharePopover(ctx["block-uid"]);
    },
  });

  window.roamAlphaAPI.ui.blockContextMenu.addCommand({
    label: BLOCK_CTX_UNPUBLISH_LABEL,
    callback: (ctx) => {
      void unpublish({ uid: ctx["block-uid"], kind: "block" });
    },
  });

  window.roamAlphaAPI.ui.pageContextMenu.addCommand({
    label: PAGE_CTX_LABEL,
    callback: (ctx) => {
      void publish({ uid: ctx["page-uid"], kind: "page" });
    },
  });

  window.roamAlphaAPI.ui.pageContextMenu.addCommand({
    label: PAGE_CTX_SHARE_LABEL,
    callback: (ctx) => {
      openSharePopover(ctx["page-uid"]);
    },
  });

  window.roamAlphaAPI.ui.pageContextMenu.addCommand({
    label: PAGE_CTX_UNPUBLISH_LABEL,
    callback: (ctx) => {
      void unpublish({ uid: ctx["page-uid"], kind: "page" });
    },
  });
}

/** @deprecated use registerCommands */
export const buildUserFlow = registerCommands;

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

  for (const label of [
    BLOCK_CTX_LABEL,
    BLOCK_CTX_TREE_LABEL,
    BLOCK_CTX_SHARE_LABEL,
    BLOCK_CTX_UNPUBLISH_LABEL,
  ]) {
    try {
      window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label });
    } catch (_) {}
  }
  for (const label of [
    PAGE_CTX_LABEL,
    PAGE_CTX_SHARE_LABEL,
    PAGE_CTX_UNPUBLISH_LABEL,
  ]) {
    try {
      window.roamAlphaAPI.ui.pageContextMenu.removeCommand({ label });
    } catch (_) {}
  }
}

/** @deprecated use teardownCommands */
export const teardownAlphaMenus = teardownCommands;
