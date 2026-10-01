import { getServer } from "./state";
import { syncPublications } from "./publish";
import { openLogin, tryClaim } from "./verify";
import { toast } from "./toast";

export function createSettingsPanel(extensionAPI: ExtensionAPI) {
  extensionAPI.settings.panel.create({
    tabTitle: "Roam Publish",
    settings: [
      {
        id: "login",
        name: "Log in to Roam Publish",
        description: "Opens the website to sign in and connect this graph. Setup finishes automatically.",
        action: { type: "button", content: "Log in to Roam Publish", onClick: () => openLogin() },
      },
      {
        id: "finish-setup",
        name: "Finish setup",
        description: "Run this if the API key didn't fill in automatically after verifying on the website.",
        action: { type: "button", content: "Finish setup", onClick: () => void tryClaim({ manual: true }) },
      },
      {
        id: "api-key",
        name: "API key",
        description: "Filled in automatically after setup. Keep it secret.",
        action: { type: "input", placeholder: "rp_…" },
      },
      {
        id: "sync",
        name: "Sync published list",
        description: "Re-download the list of published pages and blocks from the server.",
        action: {
          type: "button",
          content: "Sync",
          onClick: () => void syncPublications().catch((e: Error) => toast(e.message, { intent: "danger" })),
        },
      },
      {
        id: "dashboard",
        name: "Dashboard",
        description: "See and manage everything you've published on the Roam Publish website.",
        action: {
          type: "button",
          content: "Open dashboard",
          onClick: () => void window.open(`${getServer()}/dashboard`, "_blank", "noopener"),
        },
      },
      {
        id: "server-url",
        name: "Server URL",
        description: `Advanced. Defaults to ${__DEFAULT_SERVER__}`,
        action: { type: "input", placeholder: __DEFAULT_SERVER__ },
      },
    ],
  });
}
