/**
 * Simple prototype: Connect → Publish / Unpublish.
 * No overlays, share popover, teams, or outdated scanner.
 */

import { registerCommands, teardownCommands } from "./commands.js";
import { buildSettings } from "./settings.js";
import { setExtensionAPI } from "./settings-store.js";

function teardown() {
  teardownCommands();
  setExtensionAPI(null);
}

export default {
  onload: ({ extensionAPI, extension }) => {
    console.log("Roam Publish (simple)", extension?.version);
    setExtensionAPI(extensionAPI);
    buildSettings(extensionAPI);
    registerCommands(extensionAPI);
    return teardown;
  },
  onunload: teardown,
};
