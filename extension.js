// src/constants.js
var BLOCK_CTX_LABEL = "Roam Publish: Publish Block";
var BLOCK_CTX_UNPUBLISH_LABEL = "Roam Publish: Unpublish Block";
var PAGE_CTX_LABEL = "Roam Publish: Publish Page";
var PAGE_CTX_UNPUBLISH_LABEL = "Roam Publish: Unpublish Page";
var DEFAULT_API_BASE = "https://roampub.up.railway.app";

// src/roam.js
function isPageEntity(pull) {
  return Boolean(pull && pull[":node/title"] != null);
}
function entityTitleFromPull(pull, uid) {
  return pull?.[":node/title"] || pull?.[":block/string"] || uid;
}
function pullEntity(uid) {
  if (!uid) return null;
  try {
    return window.roamAlphaAPI.pull(
      "[:block/uid :node/title :block/string]",
      [":block/uid", uid]
    );
  } catch (err) {
    console.warn("Roam Publish: pull failed", uid, err);
    return null;
  }
}
function contentFingerprintFor(uid) {
  const pull = pullEntity(uid);
  if (!pull) return "";
  return String(pull[":node/title"] ?? pull[":block/string"] ?? "");
}
async function getOpenUid() {
  try {
    return await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid();
  } catch (err) {
    console.warn("Roam Publish: open uid failed", err);
    return null;
  }
}

// src/content.js
var TREE_PULL = "[:block/uid :node/title :block/string :block/order {:block/children ...}]";
var SELF_PULL = "[:block/uid :node/title :block/string :block/order]";
function serializeForPublish(uid, { scope = "self", kind } = {}) {
  if (!uid) return null;
  const wantTree = kind === "page" || scope === "tree";
  let pull = null;
  try {
    pull = window.roamAlphaAPI.pull(wantTree ? TREE_PULL : SELF_PULL, [
      ":block/uid",
      uid
    ]);
  } catch (err) {
    console.warn("Roam Publish: tree pull failed, falling back", uid, err);
    pull = pullEntity(uid);
  }
  if (!pull) return null;
  const root = normalizeChild(pull, wantTree);
  const payload = {
    format: "roam-json-v1",
    uid: root.uid
  };
  if (root.title != null) payload.title = root.title;
  if (root.string != null) payload.string = root.string;
  if (wantTree && Array.isArray(root.children)) {
    payload.children = root.children;
  } else if (kind === "page") {
    payload.children = root.children || [];
  }
  return payload;
}
function normalizeChild(pull, includeChildren) {
  const node = {};
  if (pull[":block/uid"] != null) node.uid = String(pull[":block/uid"]);
  if (pull[":node/title"] != null) node.title = String(pull[":node/title"]);
  if (pull[":block/string"] != null) node.string = String(pull[":block/string"]);
  if (includeChildren) {
    const kids = Array.isArray(pull[":block/children"]) ? pull[":block/children"] : [];
    const sorted = [...kids].sort(
      (a, b) => (a?.[":block/order"] ?? 0) - (b?.[":block/order"] ?? 0)
    );
    node.children = sorted.map((child) => normalizeChild(child, true));
  }
  return node;
}
function contentFingerprintForPublish(uid, opts = {}) {
  const tree = serializeForPublish(uid, opts);
  if (!tree) return "";
  try {
    return JSON.stringify(tree);
  } catch (_) {
    return tree.title || tree.string || uid;
  }
}

// src/graph.js
function getGraphName() {
  try {
    const hash = String(window.location?.hash || "");
    const m = hash.match(/#\/app\/([^/?#]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
  } catch (_) {
  }
  try {
    const path = String(window.location?.pathname || "");
    const m = path.match(/\/app\/([^/?#]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
  } catch (_) {
  }
  return "";
}

// src/settings-store.js
var extensionAPI = null;
function setExtensionAPI(api) {
  extensionAPI = api;
}
function getSetting(key) {
  try {
    return extensionAPI?.settings?.get?.(key) ?? null;
  } catch (_) {
    return null;
  }
}
async function setSetting(key, value) {
  try {
    await extensionAPI?.settings?.set?.(key, value);
  } catch (err) {
    console.warn("Roam Publish: settings.set failed", key, err);
  }
}
function getApiKey() {
  const v = getSetting("api-key");
  return typeof v === "string" && v.trim() ? v.trim() : "";
}
function getRoamToken() {
  const v = getSetting("roam-token");
  return typeof v === "string" && v.trim() ? v.trim() : "";
}
function getApiBase() {
  const v = getSetting("api-base");
  const raw = typeof v === "string" && v.trim() ? v.trim() : DEFAULT_API_BASE;
  return raw.replace(/\/+$/, "");
}

// src/api.js
async function request(path, { method = "GET", body, auth = true } = {}) {
  const base = getApiBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = { Accept: "application/json" };
  if (body !== void 0) headers["Content-Type"] = "application/json";
  if (auth) {
    const key = getApiKey();
    if (!key) {
      throw new Error(
        "Not connected. Settings \u2192 paste Roam token \u2192 Connect."
      );
    }
    headers.Authorization = `Bearer ${key}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== void 0 ? JSON.stringify(body) : void 0
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { error: text };
    }
  }
  if (!res.ok) {
    const msg = data?.error || data?.message ? `${data.error || data.message}${data?.detail ? `: ${data.detail}` : ""}` : `${res.status} ${res.statusText}`;
    throw new Error(String(msg));
  }
  return data;
}
async function exchangeRoamToken({ roamToken, graphName }) {
  const data = await request("/api/auth/exchange", {
    method: "POST",
    auth: false,
    body: { roamToken, graphName }
  });
  const apiKey = typeof data?.apiKey === "string" ? data.apiKey : "";
  if (!apiKey) throw new Error("Server did not return an API key.");
  return {
    apiKey,
    graphName: data.graphName || graphName,
    baseUrl: data.baseUrl
  };
}
async function postPublish(target) {
  const scope = target.kind === "block" ? target.scope || "tree" : void 0;
  const content = serializeForPublish(target.uid, {
    kind: target.kind,
    scope: scope || "self"
  });
  if (!content) throw new Error(`Could not serialize ${target.uid}`);
  const fingerprint = contentFingerprintForPublish(target.uid, {
    kind: target.kind,
    scope: scope || "self"
  }) || contentFingerprintFor(target.uid);
  const body = {
    uid: target.uid,
    kind: target.kind,
    title: target.title,
    content,
    visibility: target.visibility || "unlisted",
    contentFingerprint: fingerprint
  };
  if (target.kind === "block") body.scope = scope;
  const data = await request("/api/publish", { method: "POST", body });
  const graphName = getGraphName();
  const url = data?.url || (graphName ? `${getApiBase()}/${encodeURIComponent(graphName)}/${encodeURIComponent(target.uid)}` : "");
  return {
    uid: data?.uid || target.uid,
    kind: data?.kind || target.kind,
    title: data?.title || target.title,
    url,
    visibility: data?.visibility || "unlisted"
  };
}
async function postUnpublish(uid) {
  await request(`/api/publish/${encodeURIComponent(uid)}`, {
    method: "DELETE"
  });
  return { ok: true, uid };
}

// src/notify.js
function notify(message) {
  window.alert(message);
}

// src/settings.js
function buildSettings(extensionAPI2) {
  setExtensionAPI(extensionAPI2);
  void extensionAPI2.settings.panel.create({
    tabTitle: "Roam Publish",
    settings: [
      {
        id: "api-base",
        name: "Server URL",
        description: `Default: ${DEFAULT_API_BASE}`,
        action: { type: "input", placeholder: DEFAULT_API_BASE }
      },
      {
        id: "roam-token",
        name: "Roam temporary token",
        description: "Paste an append-only token (roam-graph-token-\u2026), then Connect.",
        action: { type: "input", placeholder: "Paste token\u2026" }
      },
      {
        id: "connect",
        name: "Connect",
        description: "Exchange token \u2192 API key for this graph.",
        action: {
          type: "button",
          onClick: () => {
            void runTokenExchange();
          }
        }
      },
      {
        id: "api-key",
        name: "API key",
        description: "Filled after Connect (or paste a key).",
        action: { type: "input", placeholder: "(not connected)" }
      }
    ]
  });
}
async function runTokenExchange() {
  const token = getRoamToken();
  if (!token) {
    notify("Paste a Roam token in Settings first, then Connect.");
    return null;
  }
  const graphName = getGraphName();
  if (!graphName) {
    notify("Could not read graph name from the URL.");
    return null;
  }
  notify(`Connecting \u201C${graphName}\u201D\u2026`);
  try {
    const result = await exchangeRoamToken({ roamToken: token, graphName });
    await setSetting("api-key", result.apiKey);
    if (result.baseUrl) {
      await setSetting("api-base", String(result.baseUrl).replace(/\/+$/, ""));
    }
    await setSetting("roam-token", "");
    notify(`Connected. You can publish now. (${getApiBase()})`);
    return result.apiKey;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("Roam Publish: connect failed", err);
    notify(`Connect failed: ${msg}`);
    return null;
  }
}
function connectionStatusMessage() {
  const key = getApiKey();
  if (!key) return `Not connected \u2192 ${getApiBase()}`;
  return `Connected (${key.slice(0, 6)}\u2026) \u2192 ${getApiBase()}`;
}

// src/commands.js
var registeredSlash = [];
var registeredPalette = [];
var savedExtensionAPI = null;
function requireKey() {
  if (!getApiKey()) {
    notify("Not connected. Settings \u2192 token \u2192 Connect.");
    return false;
  }
  return true;
}
async function publishTarget(target) {
  if (!requireKey()) return;
  const pull = pullEntity(target.uid);
  const title = entityTitleFromPull(pull, target.uid);
  notify(`Publishing ${target.kind}\u2026`);
  try {
    const result = await postPublish({
      uid: target.uid,
      kind: target.kind,
      title,
      scope: target.kind === "block" ? target.scope || "tree" : void 0,
      visibility: "unlisted"
    });
    notify(result.url ? `Published.
${result.url}` : `Published ${target.uid}.`);
  } catch (err) {
    notify(`Publish failed: ${err instanceof Error ? err.message : err}`);
  }
}
async function unpublishUid(uid) {
  if (!requireKey()) return;
  notify("Unpublishing\u2026");
  try {
    await postUnpublish(uid);
    notify(`Unpublished ${uid}.`);
  } catch (err) {
    notify(`Unpublish failed: ${err instanceof Error ? err.message : err}`);
  }
}
var COMMANDS = [
  {
    label: "Roam Publish: Connect (exchange token)",
    palette: true,
    run: () => runTokenExchange()
  },
  {
    label: "Roam Publish: Connection status",
    palette: true,
    run: () => {
      const graph = getGraphName() || "(unknown)";
      notify(`${connectionStatusMessage()}
Graph: ${graph}`);
    }
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
    }
  },
  {
    label: "Roam Publish: Publish Block",
    slash: true,
    palette: true,
    run: async () => {
      const focused = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
      const uid = focused || await getOpenUid();
      if (!uid) {
        notify("Focus a block first.");
        return;
      }
      await publishTarget({ uid, kind: "block", scope: "tree" });
    }
  },
  {
    label: "Roam Publish: Unpublish open",
    slash: true,
    palette: true,
    run: async () => {
      const focused = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
      const uid = focused || await getOpenUid();
      if (!uid) {
        notify("Nothing open to unpublish.");
        return;
      }
      await unpublishUid(uid);
    }
  }
];
function registerCommands(extensionAPI2) {
  savedExtensionAPI = extensionAPI2;
  registeredSlash = [];
  registeredPalette = [];
  for (const cmd of COMMANDS) {
    if (cmd.slash) {
      extensionAPI2.ui.slashCommand.addCommand({
        label: cmd.label,
        callback: () => {
          void cmd.run();
          return "";
        }
      });
      registeredSlash.push(cmd.label);
    }
    if (cmd.palette) {
      extensionAPI2.ui.commandPalette.addCommand({
        label: cmd.label,
        callback: () => {
          void cmd.run();
        }
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
        scope: "tree"
      });
    }
  });
  window.roamAlphaAPI.ui.blockContextMenu.addCommand({
    label: BLOCK_CTX_UNPUBLISH_LABEL,
    callback: (ctx) => {
      void unpublishUid(ctx["block-uid"]);
    }
  });
  window.roamAlphaAPI.ui.pageContextMenu.addCommand({
    label: PAGE_CTX_LABEL,
    callback: (ctx) => {
      void publishTarget({ uid: ctx["page-uid"], kind: "page" });
    }
  });
  window.roamAlphaAPI.ui.pageContextMenu.addCommand({
    label: PAGE_CTX_UNPUBLISH_LABEL,
    callback: (ctx) => {
      void unpublishUid(ctx["page-uid"]);
    }
  });
}
function teardownCommands(extensionAPI2 = savedExtensionAPI) {
  for (const label of registeredSlash) {
    try {
      extensionAPI2?.ui?.slashCommand?.removeCommand?.({ label });
    } catch (_) {
    }
  }
  for (const label of registeredPalette) {
    try {
      extensionAPI2?.ui?.commandPalette?.removeCommand?.({ label });
    } catch (_) {
    }
  }
  registeredSlash = [];
  registeredPalette = [];
  for (const label of [BLOCK_CTX_LABEL, BLOCK_CTX_UNPUBLISH_LABEL]) {
    try {
      window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label });
    } catch (_) {
    }
  }
  for (const label of [PAGE_CTX_LABEL, PAGE_CTX_UNPUBLISH_LABEL]) {
    try {
      window.roamAlphaAPI.ui.pageContextMenu.removeCommand({ label });
    } catch (_) {
    }
  }
}

// src/index.js
function teardown() {
  teardownCommands();
  setExtensionAPI(null);
}
var index_default = {
  onload: ({ extensionAPI: extensionAPI2, extension }) => {
    console.log("Roam Publish (simple)", extension?.version);
    setExtensionAPI(extensionAPI2);
    buildSettings(extensionAPI2);
    registerCommands(extensionAPI2);
    return teardown;
  },
  onunload: teardown
};
export {
  index_default as default
};
