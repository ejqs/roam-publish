import assert from "node:assert/strict";
import { beforeEach, describe, mock, test } from "node:test";
import { confirmChangeLogBlocks, confirmUnpublish, publish, publishStatus } from "../src/publish";
import { hashPayload, serialize } from "../src/serialize";
import { initState } from "../src/state";
import { fakeRoam } from "./fake-roam";

(globalThis as unknown as { __DEFAULT_SERVER__: string }).__DEFAULT_SERVER__ = "https://roam.pub";
mock.timers.enable({ apis: ["setTimeout"] });

/** Just enough DOM for toasts: the messages shown, and their buttons by label. */
type El = { textContent?: string; style: object; click?: () => void; [k: string]: unknown };
const toasts: string[] = [];
let buttons: El[] = [];
const el = (): El => ({
  style: {},
  setAttribute() {},
  addEventListener(_: string, fn: () => void) {
    this.click = fn;
  },
  remove() {},
  appendChild(c: El) {
    if (this === container && c.textContent) toasts.push(c.textContent);
  },
});
const container = el();
let created = 0;
(globalThis as unknown as { document: unknown }).document = {
  createElement: (tag: string) => {
    const e = created++ === 0 ? container : el();
    if (tag === "button") buttons.push(e);
    return e;
  },
  body: { appendChild() {} },
};
const button = (label: string) => buttons.find((b) => b.textContent === label);

const settings = new Map<string, unknown>();
initState({ settings: { get: (k: string) => settings.get(k), set: async (k: string, v: unknown) => void settings.set(k, v) } } as never);

const SHORT = "https://roam.pub/p/abcd2345";
let roam: ReturnType<typeof fakeRoam>;

/** A fake roam.pub: answers by method and path, records each call. */
function server(routes: Record<string, (body: Record<string, unknown>) => [number, unknown]> = {}) {
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const path = new URL(url).pathname;
    const body = JSON.parse((init.body as string) ?? "{}");
    calls.push({ method, path, body });
    const route = routes[`${method} ${path}`];
    const [status, res] = route
      ? route(body)
      : [200, { status: "created", url: "https://roam.pub/g/x", contentHash: body.contentHash, visibility: "unlisted" }];
    return new Response(JSON.stringify(res), { status });
  }) as never;
  return calls;
}

const cached = (over: object = {}) => ({
  page1: { hash: "x", url: "https://roam.pub/g/x", title: "Page", kind: "page", visibility: "unlisted", updatedAt: "", ...over },
});

beforeEach(() => {
  settings.clear();
  settings.set("api-key", "rp_test");
  settings.set("shortlink-enabled", false);
  settings.set("publications", cached());
  toasts.length = 0;
  buttons = [];
  roam = fakeRoam([{ uid: "page1", title: "Page", children: [{ uid: "b1", string: "hello" }] }]);
});

describe("publish", () => {
  test("asks the server even when the cache says it's unchanged", async () => {
    // Cached as published with this exact content, but it was unpublished on the website since.
    const hash = await hashPayload((await serialize("page1"))!);
    settings.set("publications", cached({ hash }));
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

  test("a refused publish takes back the Roam Publish block it wrote", async () => {
    settings.set("shortlink-enabled", true);
    settings.set("publications", cached({ shortUrl: SHORT }));
    server({ "POST /api/ext/publications": () => [413, { error: "Content too large" }] });
    await publish("page1");
    assert.deepEqual(roam.blocks.get("page1")!.children!.map((c) => c.uid), ["b1"]);
    assert.match(toasts.at(-1)!, /Content too large/);
  });

  test("the block stays when the server couldn't be reached, for the next publish to reuse", async () => {
    settings.set("shortlink-enabled", true);
    settings.set("publications", cached({ shortUrl: SHORT }));
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as never;
    await publish("page1");
    assert.equal(roam.blocks.get("page1")!.children!.length, 2);
  });

  test("a pasted status link isn't mistaken for the Roam Publish block", async () => {
    roam = fakeRoam([
      { uid: "page1", title: "Page", children: [{ uid: "rel", string: "Related:", children: [{ uid: "pasted", string: SHORT }] }] },
    ]);
    settings.set("shortlink-enabled", true);
    settings.set("publications", cached({ shortUrl: SHORT }));
    const calls = server();
    await publish("page1");
    assert.equal(roam.blocks.get("rel")!.string, "Related:");
    const [tag, rel] = roam.blocks.get("page1")!.children!;
    assert.equal(tag.string, "[[Roam Publish]]");
    // The page is published with "Related:" and without the link pasted under it.
    const tree = calls.at(-1)!.body.tree as { children: { uid: string; children: unknown[] }[] };
    assert.equal(rel.uid, "rel");
    assert.deepEqual(tree.children.map((c) => [c.uid, c.children.length]), [["rel", 0]]);
  });
});

describe("unpublish", () => {
  test("asks first, and only unpublishes when confirmed", async () => {
    const calls = server({ "DELETE /api/ext/publications/page1": () => [200, { deleted: true }] });
    confirmUnpublish("page1");
    assert.equal(calls.length, 0);
    assert.match(toasts.at(-1)!, /Unpublish “Page”\? .*deleted/);
    button("Unpublish")!.click!();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ["DELETE /api/ext/publications/page1"]);
  });
});

describe("status", () => {
  test("another member's page offers nothing this key can't do", async () => {
    server({
      "GET /api/ext/publications": () => [200, {
        publications: [{ rootUid: "page1", kind: "page", title: "Page", url: "https://roam.pub/g/x", contentHash: "x",
          visibility: "public", updatedAt: "", mine: false }],
      }],
    });
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /by another member/);
    assert.equal(buttons.length, 0);
  });
});

describe("change log confirmations", () => {
  test("a graph with more than the server takes per request is confirmed in batches", async () => {
    settings.set("shortlink-enabled", true);
    const pubs: Record<string, object> = {};
    for (let i = 0; i < 2001; i++) pubs[`root${i}`] = { ...cached().page1, anchorUid: `anchor${i}` };
    settings.set("publications", pubs);
    const calls = server({ "POST /api/ext/changelog/confirm": () => [200, { changeLog: { status: "ok", lastOkAt: null } }] });
    await confirmChangeLogBlocks();
    const sizes = calls.map((c) => (c.body.present as unknown[]).length + (c.body.missing as unknown[]).length);
    assert.deepEqual(sizes, [2000, 1]);
  });
});
