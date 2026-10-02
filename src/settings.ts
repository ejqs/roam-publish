import { getApiKey, getServer } from "./state";
import { syncPublications } from "./publish";
import { toast } from "./toast";

export function createSettingsPanel(extensionAPI: ExtensionAPI) {
  extensionAPI.settings.panel.create({
    tabTitle: "Roam Publish",
    settings: [
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
        name: "Add shortlink block",
        description:
          "After publishing, add a block with the page's permanent roam.pub/p/… link to the page or block. It's never published. With an append-only token in your graph's settings on the website, roam.pub logs changes under it.",
        action: { type: "switch" },
      },
      {
        id: "shortlink-tag",
        name: "Shortlink tag",
        description: "Written after the link, e.g. #published or [[Roam Publish]]. Leave blank for none.",
        action: { type: "input", placeholder: "#published" },
      },
      {
        id: "shortlink-position",
        name: "Shortlink position",
        description: "Where the shortlink block goes: first or last on the page (or under the block).",
        action: { type: "select", items: ["top", "bottom"] },
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
        description: "Manage access, passwords, collections and members on the Roam Publish website.",
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
