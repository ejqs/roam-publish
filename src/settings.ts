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
        description: "Manage access, passwords, collections and members on roam.pub.",
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
          "Connect this graph on roam.pub (or accept an invite to it), then paste its key below.",
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
        description: "This graph's key. Keep it secret.",
        action: { type: "input", placeholder: "rp_…" },
      },
      {
        id: "author-name",
        name: "Author name",
        description: "Shown on your pages when authors are shown. Blank: your @username.",
        action: { type: "input", placeholder: "Your name" },
      },
      {
        id: "shortlink-enabled",
        name: "Add Roam Publish block when publishing pages",
        description:
          "Adds a block with the page's status link and change log. The link is for you and your graph's members, not for sharing. The block itself is never published.",
        action: { type: "switch" },
      },
      {
        id: "shortlink-blocks",
        name: "Add Roam Publish block when publishing blocks",
        description: "The same, under each block you publish.",
        action: { type: "switch" },
      },
      {
        id: "shortlink-tag",
        name: "Roam Publish block tag",
        description:
          "The block's text. Starts as [[Roam Publish]]. Blank: no tag. Existing blocks update when you next publish them.",
        action: { type: "input", placeholder: "(blank: no tag)" },
      },
      {
        id: "shortlink-text",
        name: "Status link text",
        description:
          "Written as [text](roam.pub/p/…). Starts as Roam Publish Status. Blank: bare link. Existing blocks update when you next publish them.",
        action: { type: "input", placeholder: "(blank: bare link)" },
      },
      {
        id: "shortlink-position",
        name: "Roam Publish block position",
        description: "First or last on the page, or under the block.",
        action: { type: "select", items: ["top", "bottom"] },
      },
      {
        id: "change-log",
        name: "Change log",
        description:
          "On roam.pub: turn it on or off, check it works, and manage its token.",
        action: { type: "button", content: "Open settings", onClick: openChangeLogSettings },
      },
      {
        id: "sync",
        name: "Sync published list",
        description: "Re-download the list of what you've published.",
        action: {
          type: "button",
          content: "Sync",
          onClick: () => void syncPublications().catch((e: Error) => toast(e.message, { intent: "danger" })),
        },
      },
      {
        id: "server-url",
        name: "Server URL",
        description: "Advanced. Blank: the default server.",
        action: { type: "input", placeholder: __DEFAULT_SERVER__ },
      },
      {
        id: "shortlink-reset",
        name: "Reset Roam Publish block settings",
        description:
          "Restores the defaults of the Roam Publish block settings. Reinstalling doesn't, since Roam keeps settings.",
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
