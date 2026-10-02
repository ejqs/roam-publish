import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { api, ApiError } from "../src/api";
import { initState } from "../src/state";

/** Settings the extension reads through Roam Depot's extensionAPI. */
const settings = new Map<string, unknown>([["api-key", "rp_test"], ["server-url", "https://srv.example/"]]);
const extensionAPI = { settings: { get: (k: string) => settings.get(k), set: async (k: string, v: unknown) => void settings.set(k, v) } };
(globalThis as unknown as { __DEFAULT_SERVER__: string }).__DEFAULT_SERVER__ = "https://roam.pub";

initState(extensionAPI as never);

function respond(status: number, body: unknown) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string> });
    return new Response(JSON.stringify(body), { status });
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

  test("without a key nothing is sent", async () => {
    settings.set("api-key", "");
    const calls = respond(200, {});
    await assert.rejects(api("/x"));
    assert.equal(calls.length, 0);
    settings.set("api-key", "rp_test");
  });
});
