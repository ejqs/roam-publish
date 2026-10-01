import { getCache, onCacheChange, type PublicationCache } from "./state";
import { syncPublications } from "./publish";
import { openLogin, tryClaim } from "./verify";
import { toast } from "./toast";

function PublishedList() {
  const React = window.React;
  const [cache, setCache] = React.useState(getCache()) as [PublicationCache, (c: PublicationCache) => void];
  React.useEffect(() => {
    const off = onCacheChange(() => setCache(getCache()));
    return () => {
      off();
    };
  }, []);
  const items = Object.entries(cache).sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt));
  const h = React.createElement;
  if (items.length === 0) return h("div", { style: { color: "#5f6b7c" } }, "Nothing published yet.");
  return h(
    "ul",
    { style: { margin: 0, paddingLeft: 18, maxHeight: 240, overflowY: "auto" } },
    items.map(([uid, p]) =>
      h(
        "li",
        { key: uid },
        h("a", { href: p.url, target: "_blank", rel: "noopener" }, p.title || uid),
        h("span", { style: { color: "#8f99a8", marginLeft: 6 } }, p.kind),
      ),
    ),
  );
}

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
        id: "published",
        name: "Published",
        description: "Pages and blocks published from this graph.",
        action: { type: "reactComponent", component: PublishedList },
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
