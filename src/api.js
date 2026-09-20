/**
 * HTTP client for roam-publish-web (simple prototype).
 * Contract: docs/api-contract.md
 */

import {
  contentFingerprintForPublish,
  serializeForPublish,
} from "./content.js";
import { getGraphName } from "./graph.js";
import { contentFingerprintFor } from "./roam.js";
import { getApiBase, getApiKey } from "./settings-store.js";

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
        "Not connected. Settings → paste Roam token → Connect.",
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
    const msg =
      data?.error || data?.message
        ? `${data.error || data.message}${data?.detail ? `: ${data.detail}` : ""}`
        : `${res.status} ${res.statusText}`;
    throw new Error(String(msg));
  }
  return data;
}

/**
 * @param {{ roamToken: string, graphName: string }} input
 */
export async function exchangeRoamToken({ roamToken, graphName }) {
  const data = await request("/api/auth/exchange", {
    method: "POST",
    auth: false,
    body: { roamToken, graphName },
  });
  const apiKey = typeof data?.apiKey === "string" ? data.apiKey : "";
  if (!apiKey) throw new Error("Server did not return an API key.");
  return {
    apiKey,
    graphName: data.graphName || graphName,
    baseUrl: data.baseUrl,
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
  const scope = target.kind === "block" ? target.scope || "tree" : undefined;
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
    visibility: target.visibility || "unlisted",
    contentFingerprint: fingerprint,
  };
  if (target.kind === "block") body.scope = scope;

  const data = await request("/api/publish", { method: "POST", body });
  const graphName = getGraphName();
  const url =
    data?.url ||
    (graphName
      ? `${getApiBase()}/${encodeURIComponent(graphName)}/${encodeURIComponent(target.uid)}`
      : "");
  return {
    uid: data?.uid || target.uid,
    kind: data?.kind || target.kind,
    title: data?.title || target.title,
    url,
    visibility: data?.visibility || "unlisted",
  };
}

/** @param {string} uid */
export async function postUnpublish(uid) {
  await request(`/api/publish/${encodeURIComponent(uid)}`, {
    method: "DELETE",
  });
  return { ok: true, uid };
}
