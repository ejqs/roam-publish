import { getApiKey, getServer } from "./state";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.auth !== false) {
    const key = getApiKey();
    if (!key) throw new ApiError(0, "Log in to Roam Publish first (Settings → Roam Publish).");
    headers["x-api-key"] = key;
  }
  let res: Response;
  try {
    res = await fetch(getServer() + path, { ...init, headers });
  } catch {
    throw new ApiError(0, "Couldn't reach the Roam Publish server. Check your connection.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, reason } = body as { error?: string; reason?: string | null };
    // Moderation errors (suspended account/graph, removed page) carry their own message and reason.
    const msg =
      res.status === 401 && (!error || error === "Invalid API key")
        ? "Your Roam Publish API key is invalid. Log in again from the extension settings."
        : (error ?? `Request failed (${res.status})`) + (reason ? ` Reason: ${reason}` : "");
    throw new ApiError(res.status, msg);
  }
  return body as T;
}
