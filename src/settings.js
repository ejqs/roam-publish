import { DEFAULT_API_BASE } from "./constants.js";
import { getGraphName } from "./graph.js";
import { notify } from "./notify.js";
import { schedulePaint } from "./overlays.js";
import { exchangeRoamToken } from "./api.js";
import {
  getApiBase,
  getApiKey,
  getRoamToken,
  setExtensionAPI,
  setSetting,
} from "./settings-store.js";

/**
 * Roam Depot settings: server URL, Roam token → API key exchange, debug HUD.
 * @param {any} extensionAPI
 */
export function buildSettings(extensionAPI) {
  setExtensionAPI(extensionAPI);

  void extensionAPI.settings.panel.create({
    tabTitle: "Roam Publish",
    settings: [
      {
        id: "api-base",
        name: "Server URL",
        description: `roam-publish-web base URL (no trailing slash). Default: ${DEFAULT_API_BASE}`,
        action: {
          type: "input",
          placeholder: DEFAULT_API_BASE,
        },
      },
      {
        id: "roam-token",
        name: "Roam temporary token",
        description:
          "Paste an append-only temporary token from your Roam account, then click Connect.",
        action: {
          type: "input",
          placeholder: "Paste append-only token…",
        },
      },
      {
        id: "connect",
        name: "Connect",
        description:
          "Exchange the Roam token for a server API key (stored below). Graph name is taken from the open graph.",
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
        description:
          "Filled automatically after Connect. Used as Bearer auth for publish calls. You can also paste a key directly.",
        action: {
          type: "input",
          placeholder: "(not connected)",
        },
      },
      {
        id: "clear-key",
        name: "Disconnect",
        description: "Clear the stored API key (and optional token field).",
        action: {
          type: "button",
          onClick: () => {
            void clearCredentials();
          },
        },
      },
      {
        id: "debug-hud",
        name: "Show debug HUD",
        description:
          "Bottom-right debug panel (also localStorage.rpDebug = '1'). Off by default.",
        action: {
          type: "switch",
          onChange: () => schedulePaint(),
        },
      },
    ],
  });
}

/** Command-palette / button entry point for token exchange. */
export async function runTokenExchange() {
  const token = getRoamToken();
  if (!token) {
    notify(
      "Paste a Roam temporary append-only token in Settings → Roam temporary token, then Connect.",
    );
    return null;
  }

  const graphName = getGraphName();
  if (!graphName) {
    notify("Could not detect the open graph name from the URL.");
    return null;
  }

  notify(`Connecting graph “${graphName}” to ${getApiBase()}…`);

  try {
    const result = await exchangeRoamToken({
      roamToken: token,
      graphName,
    });
    await setSetting("api-key", result.apiKey);
    if (result.baseUrl) {
      await setSetting("api-base", String(result.baseUrl).replace(/\/+$/, ""));
    }
    // Clear the short-lived Roam token from settings after a successful exchange.
    await setSetting("roam-token", "");
    notify(
      `Connected${result.graphName ? ` (${result.graphName})` : ""}. API key saved — you can publish now.`,
    );
    return result.apiKey;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("Roam Publish: token exchange failed", err);
    notify(`Connect failed: ${msg}`);
    return null;
  }
}

async function clearCredentials() {
  await setSetting("api-key", "");
  await setSetting("roam-token", "");
  if (getApiKey()) {
    notify("Could not clear API key (settings.set failed).");
    return;
  }
  notify("Disconnected. API key cleared.");
}
