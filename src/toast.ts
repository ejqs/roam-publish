// Tiny self-contained toast so we don't depend on Roam internals.
let container: HTMLDivElement | null = null;

type ToastAction = { label: string; onClick: () => void };

/** A dropdown above the buttons; picking an option closes the toast and runs `onChoose`. */
type ToastSelect = {
  placeholder: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChoose: (value: string) => void;
};

type ToastOptions = {
  intent?: "success" | "danger" | "none";
  link?: string;
  action?: ToastAction;
  /** Several buttons in a row; `action` is the one-button shorthand. */
  actions?: ToastAction[];
  select?: ToastSelect;
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
    maxWidth: "480px",
  });
  el.textContent = message;
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
  if (opts.select) {
    const { placeholder, options, onChoose } = opts.select;
    const sel = document.createElement("select");
    sel.setAttribute("aria-label", placeholder);
    Object.assign(sel.style, {
      display: "block", width: "100%", marginTop: "8px", padding: "4px 6px", fontSize: "13px",
      color: "#1c2127", background: "#fff", border: "1px solid rgba(255,255,255,.4)", borderRadius: "2px",
    });
    const first = document.createElement("option");
    first.textContent = placeholder;
    first.value = "";
    first.disabled = true;
    first.selected = true;
    sel.appendChild(first);
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      opt.disabled = !!o.disabled;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => {
      if (!sel.value) return;
      el.remove();
      onChoose(sel.value);
    });
    el.appendChild(sel);
  }
  const actions = [...(opts.action ? [opts.action] : []), ...(opts.actions ?? [])];
  // Every toast can be closed; Close sits at the right end of the button row.
  const row = document.createElement("div");
  Object.assign(row.style, { display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" });
  for (const { label, onClick } of [...actions, { label: "Close", onClick: () => {} }]) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    Object.assign(b.style, {
      padding: "4px 10px", cursor: "pointer",
      background: "rgba(255,255,255,.15)", color: "#fff", fontSize: "13px", fontWeight: "600",
      border: "1px solid rgba(255,255,255,.4)", borderRadius: "2px",
      ...(label === "Close" && { marginLeft: "auto" }),
    });
    b.addEventListener("click", () => {
      el.remove();
      onClick();
    });
    row.appendChild(b);
  }
  el.appendChild(row);
  container.appendChild(el);
  // A toast stays while the pointer or focus is in it (picking from its dropdown, say), and closes
  // its usual time after that.
  const ms = opts.durationMs ?? (actions.length || opts.select ? 12000 : opts.link ? 8000 : 4000);
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
