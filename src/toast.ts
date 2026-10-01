// Tiny self-contained toast so we don't depend on Roam internals.
let container: HTMLDivElement | null = null;

type ToastOptions = {
  intent?: "success" | "danger" | "none";
  link?: string;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
};

export function toast(message: string, opts: ToastOptions = {}) {
  if (!container) {
    container = document.createElement("div");
    container.id = "roam-publish-toasts";
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
  if (opts.link) {
    const a = document.createElement("a");
    a.href = opts.link;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = " Open ↗";
    Object.assign(a.style, { color: "#fff", fontWeight: "600", marginLeft: "6px" });
    el.appendChild(a);
  }
  if (opts.action) {
    const { label, onClick } = opts.action;
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    Object.assign(b.style, {
      display: "block", marginTop: "8px", padding: "4px 10px", cursor: "pointer",
      background: "rgba(255,255,255,.15)", color: "#fff", fontSize: "13px", fontWeight: "600",
      border: "1px solid rgba(255,255,255,.4)", borderRadius: "2px",
    });
    b.addEventListener("click", () => {
      el.remove();
      onClick();
    });
    el.appendChild(b);
  }
  container.appendChild(el);
  setTimeout(() => el.remove(), opts.durationMs ?? (opts.action ? 12000 : opts.link ? 8000 : 4000));
}

export function removeToasts() {
  container?.remove();
  container = null;
}
