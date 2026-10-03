import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import { publish } from "../src/publish";
import { hashPayload, serialize } from "../src/serialize";
import { initState } from "../src/state";
import { fakeRoam } from "./fake-roam";

(globalThis as unknown as { __DEFAULT_SERVER__: string }).__DEFAULT_SERVER__ = "https://roam.pub";
mock.timers.enable({ apis: ["setTimeout"] });

/** Just enough DOM for toasts; the messages shown are collected. */
const toasts: string[] = [];
const el = (): Record<string, unknown> => ({
  style: {},
  setAttribute() {},
  addEventListener() {},
  remove() {},
  appendChild(c: { textContent?: string }) {
    if (this === container && c.textContent) toasts.push(c.textContent);
  },
});
const container = el();
let created = 0;
(globalThis as unknown as { document: unknown }).document = {
  createElement: () => (created++ === 0 ? container : el()),
  body: { appendChild() {} },
};

const settings = new Map<string, unknown>([["api-key", "rp_test"], ["shortlink-enabled", false]]);
initState({ settings: { get: (k: string) => settings.get(k), set: async (k: string, v: unknown) => void settings.set(k, v) } } as never);

fakeRoam([{ uid: "page1", title: "Page", children: [{ uid: "b1", string: "hello" }] }]);

function server() {
  const calls: { method: string; url: string }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ method: init.method ?? "GET", url });
    const body = JSON.parse((init.body as string) ?? "{}");
    return new Response(
      JSON.stringify({ status: "created", url: "https://roam.pub/g/x", contentHash: body.contentHash, visibility: "unlisted" }),
    );
  }) as never;
  return calls;
}

describe("publish", () => {
  test("asks the server even when the cache says it's unchanged", async () => {
    // Cached as published with this exact content, but it was unpublished on the website since.
    const hash = await hashPayload((await serialize("page1"))!);
    settings.set("publications", {
      page1: { hash, url: "https://roam.pub/g/x", title: "Page", kind: "page", visibility: "unlisted", updatedAt: "" },
    });
    const calls = server();
    await publish("page1");
    assert.deepEqual(calls.map((c) => c.method), ["POST"]);
    assert.match(toasts.at(-1)!, /published as unlisted/);
    // No clipboard here, so it doesn't claim the link was copied.
    assert.doesNotMatch(toasts.at(-1)!, /Link copied/);
  });

  test("a second click while publishing doesn't publish twice", async () => {
    const calls = server();
    await Promise.all([publish("page1"), publish("page1")]);
    assert.equal(calls.length, 1);
    assert.ok(toasts.some((t) => /Already publishing/.test(t)));
  });
});
