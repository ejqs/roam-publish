import { DEFAULT_API_BASE } from "./constants.js";
import { exchangeRoamToken } from "./api.js";
import { getGraphName } from "./graph.js";
import { notify } from "./notify.js";
import {
  getApiBase,
  getApiKey,
  getRoamToken,
  setExtensionAPI,
  setSetting,
} from "./settings-store.js";

/** @param {any} extensionAPI */
export function buildSettings(extensionAPI) {
  setExtensionAPI(extensionAPI);

  void extensionAPI.settings.panel.create({
    tabTitle: "Roam Publish",
    settings: [
      {
        id: "api-base",
        name: "Server URL",
        description: `Default: ${DEFAULT_API_BASE}`,
        action: { type: "input", placeholder: DEFAULT_API_BASE },
      },
      {
        id: "roam-token",
        name: "Roam temporary token",
        description:
          "Paste an append-only token (roam-graph-token-…), then Connect.",
        action: { type: "input", placeholder: "Paste token…" },
      },
      {
        id: "connect",
        name: "Connect",
        description: "Exchange token → API key for this graph.",
        action: {
          type: "button",
          onClick: () => {
            void runTokenExchange();
          },
        },
      },
      {
        id: "api-key",
        name: "API key",
        description: "Filled after Connect (or paste a key).",
        action: { type: "input", placeholder: "(not connected)" },
      },
    ],
  });
}

export async function runTokenExchange() {
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

  notify(`Connecting “${graphName}”…`);
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

export function connectionStatusMessage() {
  const key = getApiKey();
  if (!key) return `Not connected → ${getApiBase()}`;
  return `Connected (${key.slice(0, 6)}…) → ${getApiBase()}`;
}
