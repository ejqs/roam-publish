import { verifyKey } from "./api";
import { getServer, saveApiKey } from "./state";
import { toast } from "./toast";
import { button, callout, dialog, h, openUrl } from "./ui";

/** Waits this long after typing stops before checking a key. */
const CHECK_DELAY_MS = 500;

/**
 * First use, with no API key: the steps to get one and a field to paste it into, right where the
 * person tried to publish, instead of a message pointing to Settings. The key is checked as it's
 * pasted and saved like the settings panel's field. `then` runs once it's saved.
 */
export function openSetup(then?: () => void) {
  const d = dialog("Set up Roam Publish");
  const graph = window.roamAlphaAPI.graph.name;
  const input = h("input", { class: "bp3-input bp3-fill", type: "text", placeholder: "rp_…", "aria-label": "API key", spellcheck: "false", autocomplete: "off" });
  const status = h("div", { class: "rp-status", role: "status" });
  let checked = "";
  const save = button(
    "Save",
    async () => {
      save.disabled = true;
      await saveApiKey(checked);
      d.close();
      toast(`Roam Publish is set up for ${graph}.`, { intent: "success" });
      then?.();
    },
    { intent: "primary", small: false, disabled: true },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    checked = "";
    save.disabled = true;
    const key = input.value.trim();
    status.replaceChildren(key ? h("span", { class: "rp-muted" }, "Checking…") : "");
    if (!key) return;
    timer = setTimeout(async () => {
      const res = await verifyKey(key);
      if (input.value.trim() !== key || !d.isOpen()) return;
      status.replaceChildren(callout(res.message, res.ok ? "primary" : "danger"));
      if (res.ok) {
        checked = key;
        save.disabled = false;
      }
    }, CHECK_DELAY_MS);
  });
  const step = (n: number, ...content: (Node | string)[]) =>
    h("div", { class: "rp-step" }, h("span", { class: "rp-step-n" }, String(n)), h("div", {}, ...content));
  d.body.append(
    h("p", {}, `Publishing from ${graph} needs this graph's API key from roam.pub.`),
    step(
      1,
      "Sign up at roam.pub and connect this graph with an ",
      h("b", {}, "append-only"),
      " API token (Roam: Settings → Graph → API tokens). This verifies that you own the graph: roam.pub adds a block to today's daily note, which you can delete afterwards.",
    ),
    step(2, "On roam.pub, open ", h("b", {}, "API keys"), " and copy this graph's key.", h("div", { class: "rp-row" }, button("Open roam.pub ↗", () => openUrl(`${getServer()}/dashboard/keys`)))),
    step(3, "Paste it here. It's saved in Settings → Roam Publish, where you can change it later.", h("div", { class: "rp-key" }, input), status),
  );
  d.footer.append(button("Cancel", d.close, { small: false }), save);
  input.focus();
}
