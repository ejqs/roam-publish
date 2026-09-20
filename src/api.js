/**
 * HTTP client for roam-publish-web.
 * Contract: Project store docs/api-contract.md
 */

import {
  contentFingerprintForPublish,
  serializeForPublish,
} from "./content.js";
import { getGraphName } from "./graph.js";
import { contentFingerprintFor } from "./roam.js";
import { getApiBase, getApiKey } from "./settings-store.js";
import { normalizeScope, normalizeVisibility } from "./theme.js";

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown, auth?: boolean }} [opts]
 */
async function request(path, { method = "GET", body, auth = true } = {}) {
  const base = getApiBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  /** @type {Record<string, string>} */
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const key = getApiKey();
    if (!key) {
      throw new Error(
        "No API key. Open Settings → paste a Roam temporary token → Connect.",
      );
    }
    headers.Authorization = `Bearer ${key}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const code = data?.error || data?.message;
    const msg = code
      ? `${code}${data?.detail ? `: ${data.detail}` : ""}`
      : `${res.status} ${res.statusText}`;
    throw new Error(String(msg));
  }
  return data;
}

/**
 * Exchange a Roam temporary append-only token for a server API key.
 * @param {{ roamToken: string, graphName: string }} input
 * @returns {Promise<{ apiKey: string, graphName?: string, baseUrl?: string }>}
 */
export async function exchangeRoamToken({ roamToken, graphName }) {
  const data = await request("/api/auth/exchange", {
    method: "POST",
    auth: false,
    body: { roamToken, graphName },
  });
  const apiKey =
    typeof data?.apiKey === "string"
      ? data.apiKey
      : typeof data?.key === "string"
        ? data.key
        : "";
  if (!apiKey) throw new Error("Server did not return an API key.");
  return {
    apiKey,
    graphName: data.graphName || graphName,
    baseUrl: data.baseUrl,
  };
}

/** @returns {Promise<{ ok: boolean, fetchedAt: string, items: Array<object> }>} */
export async function fetchPublishedIndex() {
  if (!getApiKey()) {
    return { ok: true, fetchedAt: new Date().toISOString(), items: [] };
  }
  const data = await request("/api/publish");
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    items: items.map(normalizeRecord),
  };
}

/**
 * @param {{
 *   uid: string,
 *   kind: "page" | "block",
 *   title: string,
 *   scope?: "self" | "tree",
 *   visibility?: string,
 * }} target
 */
export async function postPublish(target) {
  const scope =
    target.kind === "block" ? normalizeScope(target.scope) : undefined;
  const content = serializeForPublish(target.uid, {
    kind: target.kind,
    scope: scope || "self",
  });
  if (!content) throw new Error(`Could not serialize ${target.uid}`);

  const fingerprint =
    contentFingerprintForPublish(target.uid, {
      kind: target.kind,
      scope: scope || "self",
    }) || contentFingerprintFor(target.uid);

  /** @type {Record<string, unknown>} */
  const body = {
    uid: target.uid,
    kind: target.kind,
    title: target.title,
    content,
    visibility: normalizeVisibility(target.visibility),
    contentFingerprint: fingerprint,
  };
  if (target.kind === "block") body.scope = scope;

  const data = await request("/api/publish", {
    method: "POST",
    body,
  });

  return normalizeRecord({
    ...data,
    uid: data?.uid || target.uid,
    kind: data?.kind || target.kind,
    title: data?.title || target.title,
    scope: data?.scope ?? scope,
    visibility: data?.visibility || target.visibility,
    contentFingerprint: data?.contentFingerprint || fingerprint,
  });
}

/**
 * @param {string} uid
 * @param {{ visibility?: string, scope?: string, title?: string }} patch
 * @param {object} current
 */
export async function postShareSettings(uid, patch, current) {
  /** @type {Record<string, unknown>} */
  const body = {};
  if (patch.visibility != null) body.visibility = patch.visibility;
  if (current.kind === "block" && patch.scope != null) body.scope = patch.scope;
  if (patch.title != null) body.title = patch.title;

  const data = await request(`/api/publish/${encodeURIComponent(uid)}`, {
    method: "PATCH",
    body,
  });
  return normalizeRecord({
    ...current,
    ...data,
    uid,
    kind: data?.kind || current.kind,
  });
}

/**
 * Republish = upsert again (no separate /republish route).
 * @param {string} uid
 * @param {object} current
 */
export async function postRepublish(uid, current) {
  return postPublish({
    uid,
    kind: current.kind === "block" ? "block" : "page",
    title: current.title || uid,
    scope: current.scope,
    visibility: current.visibility,
  });
}

/** @param {string} uid */
export async function postUnpublish(uid) {
  await request(`/api/publish/${encodeURIComponent(uid)}`, {
    method: "DELETE",
  });
  return { ok: true, uid };
}

/**
 * @param {object} raw
 */
function normalizeRecord(raw) {
  if (!raw) return raw;
  const graphName = raw.graphName || getGraphName();
  const uid = raw.uid;
  let url = raw.url;
  if (!url && graphName && uid) {
    url = `${getApiBase()}/${encodeURIComponent(graphName)}/${encodeURIComponent(uid)}`;
  } else if (typeof url === "string" && url.startsWith("/")) {
    url = `${getApiBase()}${url}`;
  }
  return {
    uid,
    kind: raw.kind === "block" ? "block" : "page",
    status: raw.status || "published",
    scope: raw.scope || undefined,
    visibility: raw.visibility || "unlisted",
    title: raw.title,
    url,
    publishedAt: raw.publishedAt || raw.updatedAt,
    contentFingerprint: raw.contentFingerprint,
    graphName,
  };
}
