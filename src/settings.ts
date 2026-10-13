import { COLLAPSED_AS_IN_ROAM, COLLAPSED_EXPANDED, getApiKey, getServer, resetShortlinkSettings } from "./state";
import { openChangeLogSettings, syncPublications } from "./publish";
import { toast } from "./toast";

export function createSettingsPanel(extensionAPI: ExtensionAPI) {
  extensionAPI.settings.panel.create({
    tabTitle: "Roam Publish",
    settings: [
      {
        id: "dashboard",
        name: "Dashboard",
        description:
          "On roam.pub: get this graph's API key (opens there until you add one below), and manage access, passwords, collections and members.",
        action: {
          type: "button",
          content: "Open dashboard",
          // Straight to the keys until there's one, since that's the first thing to do there.
          onClick: () => void window.open(`${getServer()}/dashboard${getApiKey() ? "" : "/keys"}`, "_blank", "noopener"),
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
        id: "collapsed-blocks",
        name: "Collapsed blocks",
        description:
          "How blocks collapsed in Roam start out on a first publish; republishing keeps the published page's.",
        action: { type: "select", items: [COLLAPSED_AS_IN_ROAM, COLLAPSED_EXPANDED] },
      },
      {
        id: "change-log",
        name: "Change log",
        description:
          "On roam.pub: turn it on or off, check it works, and manage its token.",
        action: { type: "button", content: "Open settings", onClick: openChangeLogSettings },
      },
      {
        id: "shortlink-blocks",
        name: "Advanced: Add Roam Publish block when publishing blocks",
        description: "Adds the Roam Publish block under each block you publish.",
        action: { type: "switch" },
      },
      {
        id: "shortlink-tag",
        name: "Advanced: Roam Publish block tag",
        description:
          "The block's text. Starts as [[Roam Publish]]. Blank: no tag. Existing blocks update when you next publish them.",
        action: { type: "input", placeholder: "(blank: no tag)" },
      },
      {
        id: "shortlink-text",
        name: "Advanced: Status link text",
        description:
          "Written as [text](roam.pub/p/…). Starts as Roam Publish Status. Blank: bare link. Existing blocks update when you next publish them.",
        action: { type: "input", placeholder: "(blank: bare link)" },
      },
      {
        id: "shortlink-position",
        name: "Advanced: Roam Publish block position",
        description: "First or last on the page, or under the block.",
        action: { type: "select", items: ["top", "bottom"] },
      },
      {
        id: "sync",
        name: "Advanced: Sync published list",
        description: "Updates the extension's list of what you've published from roam.pub. Use it if a status looks wrong; the Page… and Block… menus already do this.",
        action: {
          type: "button",
          content: "Sync",
          onClick: () => void syncPublications().catch((e: Error) => toast(e.message, { intent: "danger" })),
        },
      },
      {
        id: "server-url",
        name: "Advanced: Server URL",
        description: "Blank: the default server. Must start with https://.",
        action: { type: "input", placeholder: __DEFAULT_SERVER__ },
      },
      {
        id: "shortlink-reset",
        name: "Advanced: Reset Roam Publish block settings",
        description:
          "Restores the defaults of the Roam Publish block settings. Reinstalling doesn't, since Roam keeps settings.",
        action: {
          type: "button",
          content: "Reset",
          // Asks first: it overwrites the tag, link text and position you set.
          onClick: () =>
            toast("Reset the Roam Publish block settings to their defaults? Your tag, link text and position are replaced.", {
              intent: "danger",
              actions: [
                {
                  label: "Reset",
                  onClick: () =>
                    void resetShortlinkSettings()
                      .then(() => toast("Defaults restored. Close and reopen settings to see them."))
                      .catch((e: Error) => toast(e.message, { intent: "danger" })),
                },
                { label: "Cancel", onClick: () => {} },
              ],
              durationMs: 15000,
            }),
        },
      },
    ],
  });
}
