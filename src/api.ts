import { getApiKey, getServer } from "./state";

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

export async function api<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const server = getServer();
  if (!isSafeServer(server))
    throw new ApiError(-1, `The Server URL must start with https:// (it's ${server}). Settings → Roam Publish → Server URL.`);
  if (init.auth !== false) {
    const key = getApiKey();
    if (!key) throw new ApiError(0, "Add your API key first: Settings → Roam Publish → Open dashboard.");
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
