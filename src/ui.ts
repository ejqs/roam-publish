/**
 * Small DOM helpers for the extension's own panels, drawn with the Blueprint 3 classes Roam already
 * loads, so Roam's light, dark and custom themes apply. Text always goes in as textContent, never as
 * HTML, so nothing from roam.pub or the graph can run as markup.
 */

type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;
type Child = Node | string | null | undefined | false;

/** An element with attributes (`on…` ones become listeners) and children (strings become text). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = String(v);
    else if (k === "text") el.textContent = String(v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

/** Whether Roam is showing a dark theme here, from the page's own background. */
export function isDark(near: Element = document.body) {
  for (let e: Element | null = near; e; e = e.parentElement) {
    const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(getComputedStyle(e).backgroundColor);
    if (m && m[4] !== "0") return 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3] < 128;
  }
  return false;
}

/** Only ever open web pages from links the server sent. */
export const openUrl = (url: string | null | undefined) => {
  if (url && /^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener");
};

export const icon = (name: string) => h("span", { class: `bp3-icon bp3-icon-standard bp3-icon-${name}`, "aria-hidden": "true" });

export function button(label: string, onClick: () => void, opts: { intent?: "primary" | "danger"; minimal?: boolean; small?: boolean; disabled?: boolean; title?: string } = {}) {
  return h(
    "button",
    {
      type: "button",
      class: ["bp3-button", opts.small !== false && "bp3-small", opts.minimal && "bp3-minimal", opts.intent && `bp3-intent-${opts.intent}`]
        .filter(Boolean)
        .join(" "),
      disabled: opts.disabled,
      title: opts.title,
      onclick: () => onClick(),
    },
    label,
  );
}

export type Option = { value: string; label: string; disabled?: string | null };

/** A labelled dropdown; a disabled option says why in its label. */
export function selectField(label: string, options: Option[], value: string, opts: { disabled?: boolean; note?: string } = {}) {
  const select = h("select", { disabled: opts.disabled, "aria-label": label });
  for (const o of options) {
    const opt = h("option", { value: o.value, disabled: !!o.disabled }, o.disabled ? `${o.label} (${o.disabled})` : o.label);
    if (o.value === value) opt.selected = true;
    select.append(opt);
  }
  const row = h(
    "label",
    { class: "rp-field" },
    h("span", { class: "rp-field-label" }, label),
    h("div", { class: "bp3-html-select bp3-small bp3-fill" }, select, icon("double-caret-vertical")),
  );
  if (opts.note) row.append(h("span", { class: "rp-note" }, opts.note));
  return { row, get: () => select.value };
}

export function switchField(label: string, checked: boolean, opts: { disabled?: string | null | boolean; note?: string } = {}) {
  const input = h("input", { type: "checkbox", disabled: !!opts.disabled && !checked });
  input.checked = checked;
  const row = h("label", { class: "bp3-control bp3-switch rp-switch" }, input, h("span", { class: "bp3-control-indicator" }), label);
  const why = typeof opts.disabled === "string" ? opts.disabled : opts.note;
  if (why) row.append(h("span", { class: "rp-note" }, why));
  return { row, get: () => input.checked };
}

export function textField(label: string, value: string, opts: { multiline?: boolean; disabled?: boolean; maxLength?: number } = {}) {
  const input = opts.multiline
    ? h("textarea", { class: "bp3-input bp3-fill bp3-small", rows: 3, disabled: opts.disabled, maxlength: opts.maxLength })
    : h("input", { class: "bp3-input bp3-fill bp3-small", type: "text", disabled: opts.disabled, maxlength: opts.maxLength });
  input.value = value;
  return { row: h("label", { class: "rp-field" }, h("span", { class: "rp-field-label" }, label), input), get: () => input.value };
}

export const callout = (text: string, intent: "danger" | "primary" | "none" = "none") =>
  h("div", { class: `bp3-callout rp-callout${intent === "none" ? "" : ` bp3-intent-${intent}`}` }, text);

const DIALOG_CLASS = "roam-publish-dialog";
let openDialogs: (() => void)[] = [];

/**
 * A Blueprint dialog over Roam, closed by its X, Escape or a click on the backdrop. Returns its
 * body and footer to fill, and `close`.
 */
export function dialog(title: string, { wide = false }: { wide?: boolean } = {}) {
  const body = h("div", { class: "bp3-dialog-body" });
  const footer = h("div", { class: "bp3-dialog-footer-actions" });
  const close = () => {
    portal.remove();
    document.removeEventListener("keydown", onKey, true);
    openDialogs = openDialogs.filter((c) => c !== close);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || openDialogs[openDialogs.length - 1] !== close) return;
    e.stopPropagation();
    close();
  };
  const box = h(
    "div",
    { class: `bp3-dialog ${DIALOG_CLASS}${wide ? " rp-wide" : ""}`, role: "dialog", "aria-label": title },
    h(
      "div",
      { class: "bp3-dialog-header" },
      h("h4", { class: "bp3-heading" }, title),
      h("button", { type: "button", class: "bp3-button bp3-minimal bp3-dialog-close-button", "aria-label": "Close", onclick: () => close() }, icon("small-cross")),
    ),
    body,
    h("div", { class: "bp3-dialog-footer" }, footer),
  );
  const container = h("div", { class: "bp3-dialog-container bp3-overlay-content" }, box);
  // A press that starts and ends outside the dialog closes it; one that starts inside (selecting text) doesn't.
  let downOutside = false;
  container.addEventListener("mousedown", (e) => (downOutside = e.target === container));
  container.addEventListener("click", (e) => downOutside && e.target === container && close());
  const portal = h(
    "div",
    { class: `bp3-portal roam-publish-portal${isDark() ? " bp3-dark" : ""}` },
    h("div", { class: "bp3-overlay bp3-overlay-open bp3-overlay-scroll-container" }, h("div", { class: "bp3-overlay-backdrop" }), container),
  );
  document.body.append(portal);
  document.addEventListener("keydown", onKey, true);
  openDialogs.push(close);
  return { body, footer, close, isOpen: () => portal.isConnected };
}

/** Closes every dialog this extension opened (on unload). */
export function closeDialogs() {
  [...openDialogs].forEach((c) => c());
}
