import { verifyKey } from "./api";
import { restartMarks, startTopbar, stopTopbar } from "./decorate";
import { BLOCK_CHOICES, STATUS_CHOICES, STATUS_SETTING, TOP_BAR_SETTING, COLLAPSED_AS_IN_ROAM, COLLAPSED_EXPANDED, getApiKey, getServer, saveLegacyBlockSwitches, saveStatusMarks } from "./state";
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
  const { ok, message } = await verifyKey(key);
  toast(message, { intent: ok ? "success" : "danger" });
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
        id: STATUS_SETTING,
        name: "Status in Roam",
        description:
          "An icon after published page titles; a ring on published blocks' bullets and a bar beside blocks edited since publishing.",
        action: { type: "select", items: [...STATUS_CHOICES], onChange: (choice) => void saveStatusMarks(choice).then(restartMarks) },
      },
      {
        id: TOP_BAR_SETTING,
        name: "Top bar button",
        description: "A globe in Roam's top bar that opens the Roam Publish dashboard. It's also in the command palette.",
        action: {
          type: "switch",
          onChange: (e) => {
            stopTopbar();
            startTopbar(!!(e.target as HTMLInputElement | null)?.checked);
          },
        },
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
          "Off (new installs): nothing is written to your graph. On: a block with the status link, where roam.pub writes the change log. Never published.",
        action: { type: "select", items: [...BLOCK_CHOICES], onChange: (choice) => void saveLegacyBlockSwitches(choice) },
      },
      {
        id: "shortlink-position",
        name: "Block position",
        description: "With Roam Publish block on: first or last under the page or block.",
        action: { type: "select", items: ["First", "Last"] },
      },
      {
        id: "shortlink-tag",
        name: "Block tag",
        description: "With Roam Publish block on: the block's text. Blank: no tag. Existing blocks update when next published.",
        action: { type: "input", placeholder: "No tag" },
      },
    ],
  });
}
