import { getApiKey, getServer, resetShortlinkSettings } from "./state";
import { openChangeLogSettings, syncPublications } from "./publish";
import { toast } from "./toast";

export function createSettingsPanel(extensionAPI: ExtensionAPI) {
  extensionAPI.settings.panel.create({
    tabTitle: "Roam Publish",
    settings: [
      {
        id: "dashboard",
        name: "Dashboard",
        description: "Manage access, passwords, collections and members on the Roam Publish website.",
        action: {
          type: "button",
          content: "Open dashboard",
          onClick: () => void window.open(`${getServer()}/dashboard`, "_blank", "noopener"),
        },
      },
      {
        id: "get-key",
        name: "Get API key",
        description:
          "Opens your Roam Publish API keys. Connect this graph there (or accept an invite to it), copy its key, and paste it below.",
        action: {
          type: "button",
          content: "Get API key",
          onClick: () => {
            window.open(`${getServer()}/dashboard/keys`, "_blank", "noopener");
            if (getApiKey()) toast("This graph already has a key. Regenerating it on the website replaces this one.");
          },
        },
      },
      {
        id: "api-key",
        name: "API key",
        description: "Your key for this graph, from the Roam Publish website. Keep it secret.",
        action: { type: "input", placeholder: "rp_…" },
      },
      {
        id: "author-name",
        name: "Author name",
        description: "Shown on pages you publish when the graph or collection shows authors. Leave blank to use your @username.",
        action: { type: "input", placeholder: "Your name" },
      },
      {
        id: "shortlink-enabled",
        name: "Add Roam Publish block when publishing pages",
        description:
          "Adds a block with your tag and the page's status link (roam.pub/p/…), with change log entries under it if the change log is on. The link is for you and your graph's members, not for sharing. The block is never published.",
        action: { type: "switch" },
      },
      {
        id: "shortlink-blocks",
        name: "Add Roam Publish block when publishing blocks",
        description: "After publishing a block, add a Roam Publish block under it, with its status link and change log, like for pages.",
        action: { type: "switch" },
      },
      {
        id: "shortlink-tag",
        name: "Roam Publish block tag",
        description:
          "The Roam Publish block's text, with the status link under it. Starts as [[Roam Publish]]. Clear it for no text: a blank field means no tag, not the default. A change applies to existing blocks the next time you publish them.",
        action: { type: "input", placeholder: "(blank: no tag)" },
      },
      {
        id: "shortlink-text",
        name: "Status link text",
        description:
          "Shown for the status link, written as [text](roam.pub/p/…). Starts as Roam Publish Status. Clear it for the bare link: a blank field means no text, not the default. A change applies to existing blocks the next time you publish them.",
        action: { type: "input", placeholder: "(blank: bare link)" },
      },
      {
        id: "shortlink-position",
        name: "Roam Publish block position",
        description: "Where the Roam Publish block goes: first or last on the page (or under the block).",
        action: { type: "select", items: ["top", "bottom"] },
      },
      {
        id: "change-log",
        name: "Change log",
        description:
          "Opens this graph's change log settings on roam.pub: whether it's on and working, its append-only token, and turning it on or off.",
        action: { type: "button", content: "Open settings", onClick: openChangeLogSettings },
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
        id: "server-url",
        name: "Server URL",
        description: `Advanced. Defaults to ${__DEFAULT_SERVER__}`,
        action: { type: "input", placeholder: __DEFAULT_SERVER__ },
      },
      {
        id: "shortlink-reset",
        name: "Reset Roam Publish block settings",
        description:
          "Puts the five Roam Publish block settings back to their defaults. Roam keeps settings after you uninstall, so reinstalling doesn't reset them. Existing blocks change the next time you publish them.",
        action: {
          type: "button",
          content: "Reset",
          onClick: () =>
            void resetShortlinkSettings()
              .then(() => toast("Defaults restored. Close and reopen settings to see them."))
              .catch((e: Error) => toast(e.message, { intent: "danger" })),
        },
      },
    ],
  });
}
