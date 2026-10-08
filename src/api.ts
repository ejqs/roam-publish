import { getApiKey, getServer } from "./state";
import { toast } from "./toast";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Long enough for a large page on a slow connection; a hung request otherwise never ends. */
const TIMEOUT_MS = 60_000;

/** The key only travels encrypted; plain http is for a server on this machine (development). */
const isSafeServer = (server: string) =>
  /^https:\/\//i.test(server) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(server);

/**
 * roam.pub names, on every response, the oldest extension version it still fully supports. When an API
 * changes, it raises this once older versions can be left behind, and an extension older than it asks
 * the person to update instead of failing in confusing ways.
 */
export const MIN_VERSION_HEADER = "x-roam-publish-min-version";

const parts = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : null);

/** Whether `version` is older than `min`; false when either isn't a plain x.y.z. */
export function olderThan(version: string, min: string) {
  const a = parts(version);
  const b = parts(min);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/** Shows the update notice; swapped out in tests. */
export const updateNotice = {
  asked: false,
  show: (message: string) => toast(message, { intent: "danger", durationMs: 30_000 }),
};

/** Asks once per session when roam.pub needs a newer extension than this one. */
export function checkMinVersion(min: string | null) {
  if (!min || updateNotice.asked || typeof __VERSION__ !== "string" || !olderThan(__VERSION__, min)) return;
  updateNotice.asked = true;
  updateNotice.show(
    `Roam Publish needs an update to keep working with roam.pub (this is ${__VERSION__}; it needs ${min} or newer). Update it in Settings → Roam Depot → Installed extensions, then reload Roam.`,
  );
}

export async function api<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  // Lets roam.pub see which versions are still in use, so it knows when an older API can be retired.
  if (typeof __VERSION__ === "string") headers["x-roam-publish-version"] = __VERSION__;
  const server = getServer();
  if (!isSafeServer(server))
    throw new ApiError(-1, `The Server URL must start with https:// (it's ${server}). Settings → Roam Publish → Server URL.`);
  if (init.auth !== false) {
    const key = getApiKey();
    // Not 0: that means the server couldn't be reached, and the status menu falls back to the last sync then.
    if (!key) throw new ApiError(-1, "Add your API key first: Settings → Roam Publish → Open dashboard.");
    headers["x-api-key"] = key;
    // The server refuses a key that belongs to another graph, so its pages never publish under that graph's name.
    const graph = globalThis.window?.roamAlphaAPI?.graph?.name;
    if (graph) headers["x-roam-graph"] = graph;
  }
  let res: Response;
  try {
    res = await fetch(server + path, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError")
      throw new ApiError(0, "The Roam Publish server took too long to answer. Try again in a moment.");
    throw new ApiError(0, "Couldn't reach the Roam Publish server. Check your connection.");
  }
  checkMinVersion(res.headers?.get(MIN_VERSION_HEADER) ?? null);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, reason } = body as { error?: string; reason?: string | null };
    // Moderation errors (suspended account/graph, removed page) carry their own message and reason.
    const msg =
      res.status === 401 && (!error || error === "Invalid API key")
        ? "Your Roam Publish API key is invalid. Get a new one under API keys on the dashboard (Settings → Roam Publish → Open dashboard)."
        : (error ?? `Request failed (${res.status})`) + (reason ? ` Reason: ${reason}` : "");
    throw new ApiError(res.status, msg);
  }
  return body as T;
}
