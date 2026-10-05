// Tiny self-contained toast so we don't depend on Roam internals.
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

export function toast(message: string, opts: ToastOptions = {}) {
  if (!container) {
    container = document.createElement("div");
    container.id = "roam-publish-toasts";
    // Screen readers announce each toast as it appears.
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    Object.assign(container.style, {
      position: "fixed", top: "12px", left: "50%", transform: "translateX(-50%)",
      zIndex: "1000", display: "flex", flexDirection: "column", gap: "8px", alignItems: "center",
    });
    document.body.appendChild(container);
  }
  const bg = opts.intent === "success" ? "#238551" : opts.intent === "danger" ? "#cd4246" : "#404854";
  const el = document.createElement("div");
  Object.assign(el.style, {
    background: bg, color: "#fff", padding: "10px 14px", borderRadius: "2px", fontSize: "14px",
    boxShadow: "0 0 0 1px rgba(17,20,24,.1), 0 2px 4px rgba(17,20,24,.2), 0 8px 24px rgba(17,20,24,.2)",
    maxWidth: "480px", position: "relative", paddingRight: "36px",
  });
  el.textContent = message;
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Dismiss");
  close.title = "Dismiss";
  // A generous square in the corner with the × centered in it. Set as !important, which beats any
  // stylesheet: Roam's own button styles otherwise move the clickable area off the ×.
  const closeStyle: Record<string, string> = {
    all: "unset", position: "absolute", top: "0", right: "0", width: "32px", height: "32px",
    "box-sizing": "border-box", display: "flex", "align-items": "center", "justify-content": "center",
    cursor: "pointer", color: "#fff", "font-size": "18px", "line-height": "1", "font-family": "inherit",
  };
  for (const [k, v] of Object.entries(closeStyle)) close.style.setProperty(k, v, "important");
  close.addEventListener("click", () => el.remove());
  el.appendChild(close);
  // Links come from the server's responses; only ever open web pages from them.
  if (opts.link && /^https?:\/\//i.test(opts.link)) {
    const a = document.createElement("a");
    a.href = opts.link;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = " Open ↗";
    Object.assign(a.style, { color: "#fff", fontWeight: "600", marginLeft: "6px" });
    el.appendChild(a);
  }
  const actions = [...(opts.action ? [opts.action] : []), ...(opts.actions ?? [])];
  if (actions.length) {
    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" });
    for (const { label, onClick } of actions) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      Object.assign(b.style, {
        padding: "4px 10px", cursor: "pointer",
        background: "rgba(255,255,255,.15)", color: "#fff", fontSize: "13px", fontWeight: "600",
        border: "1px solid rgba(255,255,255,.4)", borderRadius: "2px",
      });
      b.addEventListener("click", () => {
        el.remove();
        onClick();
      });
      row.appendChild(b);
    }
    el.appendChild(row);
  }
  container.appendChild(el);
  setTimeout(() => el.remove(), opts.durationMs ?? (actions.length ? 12000 : opts.link ? 8000 : 4000));
}

export function removeToasts() {
  container?.remove();
  container = null;
}
