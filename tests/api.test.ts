import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { api, ApiError, MIN_VERSION_HEADER, olderThan, updateNotice } from "../src/api";
import { initState } from "../src/state";

/** Settings the extension reads through Roam Depot's extensionAPI. */
const settings = new Map<string, unknown>([["api-key", "rp_test"], ["server-url", "https://srv.example/"]]);
const extensionAPI = { settings: { get: (k: string) => settings.get(k) ?? null, set: async (k: string, v: unknown) => void settings.set(k, v) } };
(globalThis as unknown as { __DEFAULT_SERVER__: string }).__DEFAULT_SERVER__ = "https://roam.pub";

initState(extensionAPI as never);

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string> });
    return new Response(JSON.stringify(body), { status, headers });
  }) as never;
  return calls;
}

describe("api", () => {
  test("sends the key only to the configured server", async () => {
    const calls = respond(200, { ok: 1 });
    await api("/api/ext/publications");
    assert.equal(calls[0].url, "https://srv.example/api/ext/publications");
    assert.equal(calls[0].headers["x-api-key"], "rp_test");
  });

  test("names the Roam graph it's in, so the server can refuse another graph's key", async () => {
    const calls = respond(200, {});
    await api("/x");
    assert.equal(calls[0].headers["x-roam-graph"], undefined);
    (globalThis as unknown as { window: unknown }).window = { roamAlphaAPI: { graph: { name: "my-graph" } } };
    try {
      await api("/x");
      assert.equal(calls[1].headers["x-roam-graph"], "my-graph");
    } finally {
      delete (globalThis as unknown as { window?: unknown }).window;
    }
  });

  test("says which extension version is calling, so roam.pub knows when an older API can go", async () => {
    const calls = respond(200, {});
    await api("/x");
    assert.equal(calls[0].headers["x-roam-publish-version"], undefined);
    (globalThis as unknown as { __VERSION__?: string }).__VERSION__ = "0.2.0";
    try {
      await api("/x");
      assert.equal(calls[1].headers["x-roam-publish-version"], "0.2.0");
    } finally {
      delete (globalThis as unknown as { __VERSION__?: string }).__VERSION__;
    }
  });

  test("says whether Roam can encrypt pages here, which version alone doesn't", async () => {
    const calls = respond(200, {});
    await api("/x");
    // Node has X25519, like current browsers; older Roam desktop apps don't, and send "0".
    assert.equal(calls[0].headers["x-roam-publish-can-seal"], "1");
  });

  test("asks once to update when roam.pub needs a newer version than this one", async () => {
    const shown: string[] = [];
    updateNotice.show = (m) => void shown.push(m);
    const g = globalThis as unknown as { __VERSION__?: string };
    g.__VERSION__ = "0.2.0";
    try {
      respond(200, {}, { [MIN_VERSION_HEADER]: "0.2.0" });
      await api("/x");
      assert.deepEqual(shown, []);
      respond(200, {}, { [MIN_VERSION_HEADER]: "0.3.0" });
      await api("/x");
      await api("/x");
      assert.equal(shown.length, 1);
      assert.match(shown[0], /this is 0\.2\.0; it needs 0\.3\.0/);
    } finally {
      delete g.__VERSION__;
      updateNotice.asked = false;
    }
  });

  test("compares versions part by part", () => {
    assert.equal(olderThan("0.9.0", "0.10.0"), true);
    assert.equal(olderThan("0.10.0", "0.9.0"), false);
    assert.equal(olderThan("1.0.0", "1.0.0"), false);
    assert.equal(olderThan("dev", "1.0.0"), false);
  });

  test("a key for another graph shows the server's words", async () => {
    respond(409, { error: "This API key is for the graph a, but you're in b.", keyGraph: "a" });
    await assert.rejects(api("/x"), (e: InstanceType<typeof ApiError>) => e.status === 409 && /for the graph a/.test(e.message));
  });

  test("an invalid key says to get a new one", async () => {
    respond(401, { error: "Invalid API key" });
    await assert.rejects(api("/x"), (e: InstanceType<typeof ApiError>) => e.status === 401 && /Get a new one/.test(e.message));
  });

  test("moderation errors are shown with their reason", async () => {
    respond(403, { error: "This page was removed by a moderator", reason: "spam" });
    await assert.rejects(api("/x"), (e: Error) => e.message === "This page was removed by a moderator Reason: spam");
  });

  test("a network failure is a friendly error, not a crash", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as never;
    await assert.rejects(api("/x"), (e: InstanceType<typeof ApiError>) => e.status === 0);
  });

  test("the key is never sent over plain http, except to this machine", async () => {
    const calls = respond(200, {});
    settings.set("server-url", "http://srv.example");
    await assert.rejects(api("/x"), /must start with https/);
    assert.equal(calls.length, 0);
    settings.set("server-url", "http://localhost:3000");
    await api("/x");
    assert.equal(calls.length, 1);
    settings.set("server-url", "https://srv.example/");
  });

  test("a server that never answers times out with a friendly error", async () => {
    globalThis.fetch = (async () => {
      throw new DOMException("timed out", "TimeoutError");
    }) as never;
    await assert.rejects(api("/x"), (e: InstanceType<typeof ApiError>) => e.status === 0 && /took too long/.test(e.message));
  });

  test("without a key nothing is sent", async () => {
    settings.set("api-key", "");
    const calls = respond(200, {});
    await assert.rejects(api("/x"));
    assert.equal(calls.length, 0);
    settings.set("api-key", "rp_test");
  });
});
