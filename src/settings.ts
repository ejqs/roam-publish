import { api } from "./api";
import { BLOCK_CHOICES, COLLAPSED_AS_IN_ROAM, COLLAPSED_EXPANDED, getApiKey, getServer, saveLegacyBlockSwitches } from "./state";
import { toast } from "./toast";

/** Roam saves the key and calls onChange on every keystroke; the check waits until typing stops. */
const KEY_CHECK_DELAY_MS = 800;
let keyCheck: ReturnType<typeof setTimeout> | undefined;

/** Says at once whether a pasted key works for this graph, instead of at the first publish. */
export function checkKeySoon(value: string) {
  clearTimeout(keyCheck);
  const key = value.trim();
  if (!key) return;
  keyCheck = setTimeout(() => void checkKey(key), KEY_CHECK_DELAY_MS);
}

async function checkKey(key: string) {
  if (!key.startsWith("rp_")) {
    toast("API keys start with rp_. Copy the key from API keys on the dashboard.", { intent: "danger" });
    return;
  }
  try {
    const { graphName } = await api<{ graphName?: string }>("/api/ext/changelog", { key });
    toast(graphName ? `API key works for ${graphName}.` : "API key works.", { intent: "success" });
  } catch (e) {
    toast((e as Error).message, { intent: "danger" });
  }
}

export function createSettingsPanel(extensionAPI: ExtensionAPI) {
  extensionAPI.settings.panel.create({
    tabTitle: "Roam Publish",
    settings: [
      {
        id: "dashboard",
        name: "Dashboard",
        description: "On roam.pub: API keys, access, passwords, collections, members and the change log.",
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
        description: "This graph's key, from API keys on the dashboard. Keep it secret.",
        action: {
          type: "input",
          placeholder: "rp_…",
          onChange: (e) => checkKeySoon((e.target as HTMLInputElement | null)?.value ?? ""),
        },
      },
      {
        id: "author-name",
        name: "Author name",
        description: "Your byline on pages that show authors. Blank: your @username.",
        action: { type: "input", placeholder: "Your name" },
      },
      {
        id: "ask-where",
        name: "Ask where to publish",
        description:
          "Publish asks: your graph, your graph encrypted, or a collection. Off: it goes where New pages go to says on roam.pub.",
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
        id: "shortlink-add",
        name: "Roam Publish block",
        description:
          "A block with the status link, where roam.pub writes the change log. For you and your graph's members; never published.",
        action: { type: "select", items: [...BLOCK_CHOICES], onChange: (choice) => void saveLegacyBlockSwitches(choice) },
      },
      {
        id: "shortlink-position",
        name: "Block position",
        description: "First or last under the page or block.",
        action: { type: "select", items: ["First", "Last"] },
      },
      {
        id: "shortlink-tag",
        name: "Block tag",
        description: "The block's text. Blank: no tag. Existing blocks update when next published.",
        action: { type: "input", placeholder: "No tag" },
      },
    ],
  });
}
