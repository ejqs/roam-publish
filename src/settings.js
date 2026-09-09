import { schedulePaint } from "./overlays.js";
import { setExtensionAPI } from "./settings-store.js";

/**
 * Roam Depot settings panel: API key + debug HUD only.
 * Published items live in the command-palette dialog (not here).
 * @param {any} extensionAPI
 */
export function buildSettings(extensionAPI) {
  setExtensionAPI(extensionAPI);

  void extensionAPI.settings.panel.create({
    tabTitle: "Roam Publish",
    settings: [
      {
        id: "api-key",
        name: "API key",
        description:
          "Stored in this graph’s extension settings. Used by the publish API layer (dummy mode still works if empty).",
        action: {
          type: "input",
          placeholder: "Paste API key…",
        },
      },
      {
        id: "debug-hud",
        name: "Show debug HUD",
        description:
          "Bottom-right debug panel (also enable with localStorage.rpDebug = '1'). Off by default. Share overlays stay on regardless.",
        action: {
          type: "switch",
          onChange: () => schedulePaint(),
        },
      },
    ],
  });
}
