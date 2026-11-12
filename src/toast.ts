// Toasts for results ("Published. Link copied."), drawn with the Blueprint classes Roam already loads,
// so they follow Roam's light and dark themes. Choices about a page happen in its pop-up (panel.ts).
let container: HTMLDivElement | null = null;

type ToastAction = { label: string; onClick: () => void };

type ToastOptions = {
  intent?: "success" | "danger" | "none";
  link?: string;
  action?: ToastAction;
  /** Several buttons in a row; `action` is the one-button shorthand. */
  actions?: ToastAction[];
  durationMs?: number;
};

/** Whether Roam shows a dark theme, from the app's background; light when it can't tell (tests). */
function darkTheme() {
  if (typeof getComputedStyle !== "function") return false;
  const near = document.querySelector?.(".roam-body-main, .roam-app") ?? document.body;
  for (let e: Element | null = near; e; e = e.parentElement) {
    const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(getComputedStyle(e).backgroundColor);
    if (m && m[4] !== "0") return 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3] < 128;
  }
  return false;
}

export function toast(message: string, opts: ToastOptions = {}) {
  if (!container) {
    container = document.createElement("div");
    container.id = "roam-publish-toasts";
    container.className = "bp3-toast-container bp3-toast-container-top";
    // Screen readers announce each toast as it appears.
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    Object.assign(container.style, {
      position: "fixed", top: "0", left: "0", right: "0", zIndex: "1000", display: "flex", flexDirection: "column",
      alignItems: "center", pointerEvents: "none",
    });
    document.body.appendChild(container);
  }
  const intent = opts.intent === "success" ? " bp3-intent-success" : opts.intent === "danger" ? " bp3-intent-danger" : "";
  const el = document.createElement("div");
  el.className = `bp3-toast${intent}${darkTheme() ? " bp3-dark" : ""}`;
  Object.assign(el.style, {
    display: "block", margin: "12px 0 0", padding: "10px 14px", fontSize: "14px", lineHeight: "1.45",
    width: "min(480px, calc(100vw - 24px))", boxSizing: "border-box", pointerEvents: "all",
  });
  el.textContent = message;
  // Links come from the server's responses; only ever open web pages from them.
  if (opts.link && /^https?:\/\//i.test(opts.link)) {
    const a = document.createElement("a");
    a.href = opts.link;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = " Open ↗";
    Object.assign(a.style, { color: "inherit", fontWeight: "600", marginLeft: "6px", textDecoration: "underline" });
    el.appendChild(a);
  }
  const actions = [...(opts.action ? [opts.action] : []), ...(opts.actions ?? [])];
  // Every toast can be closed; Close sits at the right end of the button row.
  const row = document.createElement("div");
  // With no actions, Close sits on the message's line.
  if (actions.length) Object.assign(row.style, { display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" });
  else {
    Object.assign(el.style, { display: "flex", alignItems: "center", gap: "8px" });
    Object.assign(row.style, { marginLeft: "auto", flex: "none" });
  }
  for (const { label, onClick } of [...actions, { label: "Close", onClick: () => {} }]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `bp3-button bp3-small${label === "Close" ? " bp3-minimal" : ""}`;
    b.textContent = label;
    if (label === "Close" && actions.length) Object.assign(b.style, { marginLeft: "auto" });
    b.addEventListener("click", () => {
      el.remove();
      onClick();
    });
    row.appendChild(b);
  }
  el.appendChild(row);
  container.appendChild(el);
  // A toast stays while the pointer or focus is in it, and closes its usual time after that.
  const ms = opts.durationMs ?? (actions.length ? 12000 : opts.link ? 8000 : 4000);
  let timer = setTimeout(() => el.remove(), ms);
  const hold = () => clearTimeout(timer);
  const release = () => {
    if (el.matches(":hover") || el.contains(document.activeElement)) return;
    clearTimeout(timer);
    timer = setTimeout(() => el.remove(), ms);
  };
  el.addEventListener("mouseenter", hold);
  el.addEventListener("focusin", hold);
  el.addEventListener("mouseleave", release);
  el.addEventListener("focusout", () => setTimeout(release));
}

export function removeToasts() {
  container?.remove();
  container = null;
}
