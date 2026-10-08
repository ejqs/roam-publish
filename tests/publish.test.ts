import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, mock, test } from "node:test";
import {
  addToCollection,
  chooseCollection,
  confirmChangeLogBlocks,
  confirmUnpublish,
  publish,
  publishStatus,
  syncPublications,
} from "../src/publish";
import { hashPayload, serialize } from "../src/serialize";
import { initState, resetShortlinkSettings, withoutUndefined } from "../src/state";
import { fakeRoam } from "./fake-roam";

(globalThis as unknown as { __DEFAULT_SERVER__: string }).__DEFAULT_SERVER__ = "https://roam.pub";
mock.timers.enable({ apis: ["setTimeout"] });

/** Just enough DOM for toasts: the messages shown, and their buttons by label. */
type El = { textContent?: string; style: object; click?: () => void; [k: string]: unknown };
const toasts: string[] = [];
let buttons: El[] = [];
let selects: El[] = [];
const el = (): El => ({
  style: {},
  children: [] as El[],
  setAttribute() {},
  addEventListener(_: string, fn: () => void) {
    this.click = fn;
  },
  remove() {},
  appendChild(c: El) {
    (this.children as El[]).push(c);
    if (this === container && c.textContent) toasts.push(c.textContent);
  },
});
const container = el();
let created = 0;
(globalThis as unknown as { document: unknown }).document = {
  createElement: (tag: string) => {
    const e = created++ === 0 ? container : el();
    if (tag === "button") buttons.push(e);
    if (tag === "select") selects.push(e);
    return e;
  },
  body: { appendChild() {} },
};
const button = (label: string) => buttons.find((b) => b.textContent === label);
/** Buttons other than each toast's Close. */
const actions = () => buttons.filter((b) => b.textContent !== "Close");

const settings = new Map<string, unknown>();
/** Like Roam, refuses a value holding undefined anywhere. */
const holdsUndefined = (v: unknown): boolean =>
  v === undefined || (typeof v === "object" && v !== null && Object.values(v).some(holdsUndefined));
async function refusingSet(k: string, v: unknown) {
  if (holdsUndefined(v)) throw new Error(`transaction failed: Data returned contains undefined in ${k}`);
  settings.set(k, v);
}
initState({
  settings: {
    // Roam returns null for a setting never saved.
    get: (k: string) => settings.get(k) ?? null,
    set: refusingSet,
  },
} as never);

const SHORT = "https://roam.pub/p/abcd2345";
let roam: ReturnType<typeof fakeRoam>;

/** A fake roam.pub: answers by method and path, records each call. */
function server(routes: Record<string, (body: Record<string, unknown>) => [number, unknown]> = {}) {
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const path = new URL(url).pathname;
    const body = JSON.parse((init.body as string) ?? "{}");
    const route = routes[`${method} ${path}`];
    // Asked before every publish; unless a test says otherwise, nothing is encrypted, and it isn't listed.
    if (!route && method === "GET" && path.endsWith("/seal")) return new Response(JSON.stringify({ encrypt: false }));
    calls.push({ method, path, body });
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
  selects = [];
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
    // An older server doesn't say whether it can be Discoverable, so only Make listed is offered.
    assert.deepEqual(actions().map((b) => b.textContent), ["Make listed"]);
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

describe("encrypted in Roam", () => {
  const publicKey = generateKeyPairSync("x25519").publicKey.export({ type: "spki", format: "der" }).toString("base64url");
  const plan = { encrypt: true, publicationId: "3f0c8a62-0a3e-4a43-9b38-6a1f1b0e7d11", locks: [{ scope: "graph", id: "g1", publicKey }] };
  const accept = (body: Record<string, unknown>): [number, unknown] => [200, {
    status: "updated", url: "https://roam.pub/g/x", contentHash: body.contentHash, visibility: "unlisted", encrypted: true,
  }];

  test("a Password page reaches roam.pub only as a cipher, with a keyed hash", async () => {
    let stored = "";
    const calls = server({
      "GET /api/ext/publications/page1/seal": () => [200, plan],
      "POST /api/ext/publications": (b) => ((stored = b.contentHash as string), accept(b)),
      "GET /api/ext/publications": () => [200, {
        publications: [{ rootUid: "page1", kind: "page", title: "Page", url: "https://roam.pub/g/x", contentHash: stored,
          visibility: "unlisted", listing: "unlisted", updatedAt: "", folded: [], encrypted: true }],
      }],
    });
    await publish("page1");
    const post = calls.find((c) => c.method === "POST")!.body;
    assert.equal(post.tree, undefined);
    assert.doesNotMatch(JSON.stringify(post), /hello/);
    assert.deepEqual(Object.keys(post.sealed as object), ["publicationId", "cipher", "keys"]);
    assert.match(post.contentHash as string, /^k1\.[0-9a-f]{64}$/);
    assert.deepEqual(post.folded, []);
    assert.equal((settings.get("publications") as Record<string, { hash: string }>).page1.hash, post.contentHash);
    // The keyed hash still tells that nothing changed in Roam since.
    buttons = [];
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /up to date/);
    assert.equal(button("Republish"), undefined);
  });

  test("encrypts again when the passwords changed while it was publishing", async () => {
    let first = true;
    const calls = server({
      "GET /api/ext/publications/page1/seal": () => [200, plan],
      "POST /api/ext/publications": (b) => (first ? ((first = false), [409, { error: "changed", reseal: true }]) : accept(b)),
    });
    await publish("page1");
    assert.deepEqual(calls.map((c) => c.method), ["GET", "POST", "GET", "POST"]);
    assert.match(toasts.at(-1)!, /republished/);
  });
});

describe("collapsed blocks", () => {
  const folded = (open = false) =>
    fakeRoam([
      {
        uid: "page1",
        title: "Page",
        children: [
          { uid: "b1", string: "hello", open, children: [{ uid: "b2", string: "inside" }] },
          { uid: "b3", string: "other", children: [{ uid: "b4", string: "inside" }] },
        ],
      },
    ]);
  /** Lets a publish started by a click finish: until `done`, for as many turns as it takes. */
  const settle = async (done: () => boolean) => {
    for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setImmediate(r));
  };
  const posts = (calls: { method: string; body: Record<string, unknown> }[]) => calls.filter((c) => c.method === "POST");
  const sentTree = (calls: { method: string; body: Record<string, unknown> }[]) => JSON.stringify(posts(calls).at(-1)?.body.tree);
  const routes = (hash = "old") => ({
    "GET /api/ext/publications": (): [number, unknown] => [200, {
      publications: hash ? [{ rootUid: "page1", kind: "page", title: "Page", url: "https://roam.pub/g/x", contentHash: hash,
        visibility: "unlisted", listing: "unlisted", updatedAt: "" }] : [],
    }],
    "POST /api/ext/publications": (body: Record<string, unknown>): [number, unknown] => [200, {
      status: "updated", url: "https://roam.pub/g/x", contentHash: body.contentHash, visibility: "unlisted",
    }],
  });
  const labels = () => actions().map((b) => b.textContent).filter((l) => /^(Republish|Publish|Sync)/.test(l ?? ""));

  test("the first publish asks, writes nothing until answered, and remembers what's collapsed", async () => {
    settings.set("publications", {});
    roam = folded();
    const calls = server(routes(""));
    await publish("page1");
    assert.equal(posts(calls).length, 0);
    assert.deepEqual(roam.blocks.get("page1")!.children!.map((c) => c.uid), ["b1", "b3"]);
    assert.match(toasts.at(-1)!, /1 block on this page is collapsed in Roam/);
    assert.deepEqual(labels(), ["Publish as is (Collapsed)", "Publish expanded"]);
    button("Publish as is (Collapsed)")!.click!();
    await settle(() => !!(settings.get("publications") as Record<string, { folded?: string[] }>).page1?.folded);
    assert.match(sentTree(calls), /"collapsed":true/);
    assert.deepEqual((settings.get("publications") as Record<string, { folded?: string[] }>).page1.folded, ["b1"]);
    // Nothing changed in Roam since: republishing doesn't ask again.
    buttons = [];
    await publish("page1");
    assert.deepEqual(labels(), []);
    assert.equal(posts(calls).length, 2);
  });

  test("when Roam's collapsed blocks differ, republishing asks: as is, or keep the published page's", async () => {
    roam = folded();
    settings.set("publications", cached({ hash: "old", folded: [] }));
    const calls = server(routes());
    await publish("page1");
    assert.equal(posts(calls).length, 0);
    assert.match(toasts.at(-1)!, /aren't the ones collapsed on the published page/);
    assert.deepEqual(labels(), ["Republish as is", "Republish, keep open/collapsed"]);
    button("Republish, keep open/collapsed")!.click!();
    await settle(() => (settings.get("publications") as Record<string, { hash: string }>).page1.hash !== "old");
    assert.doesNotMatch(sentTree(calls), /collapsed/);
    buttons = [];
    await publish("page1", { folds: "asIs" });
    assert.match(sentTree(calls), /"collapsed":true/);
  });

  test("which blocks are collapsed on the website comes from the server, so another computer knows too", async () => {
    roam = folded();
    settings.set("publications", {});
    const calls = server({
      "GET /api/ext/publications": () => [200, {
        publications: [{ rootUid: "page1", kind: "page", title: "Page", url: "https://roam.pub/g/x", contentHash: "old",
          visibility: "unlisted", listing: "unlisted", updatedAt: "", folded: [] }],
      }],
    });
    await syncPublications({ quiet: true });
    await publish("page1");
    assert.equal(posts(calls).length, 0);
    assert.deepEqual(labels(), ["Republish as is", "Republish, keep open/collapsed"]);
  });

  test("the status says when only collapsed blocks differ, and offers both after an edit", async () => {
    roam = folded();
    const asPublished = await hashPayload({ ...(await serialize("page1"))!, tree: JSON.parse(JSON.stringify((await serialize("page1"))!.tree).replace(',"collapsed":true', "")) });
    settings.set("publications", cached({ hash: asPublished, folded: [] }));
    server(routes(asPublished));
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /up to date.*Collapsed blocks differ/);
    assert.deepEqual(labels(), ["Sync open/collapsed blocks"]);

    // Publishing then only offers the sync.
    buttons = [];
    await publish("page1");
    assert.match(toasts.at(-1)!, /Only which blocks are collapsed changed/);
    assert.deepEqual(labels(), ["Sync open/collapsed blocks"]);

    buttons = [];
    settings.set("publications", cached({ hash: "old", folded: [] }));
    server(routes("old"));
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /, changed since last published/);
    assert.deepEqual(labels(), ["Republish as is", "Republish, keep open/collapsed"]);
  });
});

describe("saved settings", () => {
  test("leave out undefined at any depth, which Roam refuses", () => {
    assert.deepEqual(withoutUndefined({ a: 1, b: undefined, c: { d: undefined, e: [1, undefined, { f: undefined }] }, g: null }), {
      a: 1,
      c: { e: [1, {}] },
      g: null,
    });
  });

  test("first-time setup saves the defaults, and resetting saves them again", async () => {
    settings.clear();
    initState({ settings: { get: (k: string) => settings.get(k) ?? null, set: refusingSet } } as never);
    // A new graph gets the defaults saved, so the settings panel shows them.
    assert.equal(settings.get("shortlink-enabled"), true);
    assert.equal(settings.get("shortlink-position"), "top");
    settings.set("shortlink-tag", "#mine");
    await resetShortlinkSettings();
    assert.equal(settings.get("shortlink-tag"), "[[Roam Publish]]");
  });


  test("saves pages with no byline and fields an older server leaves out", async () => {
    // Roam refuses settings holding undefined, which once failed every sync of a page published without an author.
    server({
      "GET /api/ext/publications": () => [
        200,
        { publications: [{ rootUid: "page2", kind: "page", title: "Other", url: "https://roam.pub/g/y", contentHash: "y", visibility: "unlisted", updatedAt: "" }] },
      ],
    });
    await syncPublications({ quiet: true });
    assert.deepEqual(Object.keys(settings.get("publications") as object), ["page2"]);
  });

  test("the first publish in a new graph saves", async () => {
    settings.delete("publications");
    server({ "GET /api/ext/publications": () => [200, { publications: [] }] });
    await publish("page1");
    assert.deepEqual(Object.keys(settings.get("publications") as object), ["page1"]);
  });

  test("publishing with no author name saves", async () => {
    server();
    await publish("page1");
    assert.equal((settings.get("publications") as Record<string, { author?: string }>).page1.author, "");
  });
});

describe("add to collection", () => {
  const choices = [
    { id: "c1", name: "Writing", listing: "listed", access: "open", entryUrl: "https://roam.pub/c/aaa", movesOutOfGraph: false },
    { id: "c2", name: "Best of", listing: "discover", access: "open", entryUrl: null, movesOutOfGraph: false },
    { id: "c3", name: "Private", listing: "listed", access: "password", entryUrl: null, movesOutOfGraph: true },
  ];
  const tick = () => new Promise((r) => setImmediate(r));

  test("isn't offered to someone with no collections", async () => {
    server({ "POST /api/ext/publications": (b) => [200, { status: "created", url: "https://roam.pub/g/x", contentHash: b.contentHash, visibility: "unlisted", listing: "unlisted", collections: 0 }] });
    await publish("page1");
    assert.ok(!button("Add to collection…"));
  });

  test("the publish toast offers it; the dropdown says how the page starts in each, and adding moves it when stricter", async () => {
    const calls = server({
      "POST /api/ext/publications": (b) => [200, { status: "created", url: "https://roam.pub/g/x", contentHash: b.contentHash, visibility: "unlisted", listing: "unlisted", collections: 3 }],
      "GET /api/ext/publications/page1/collections": () => [200, { collections: choices }],
      "POST /api/ext/publications/page1/collections": () => [200, {
        name: "Private", entryUrl: "https://roam.pub/c/bbb", listing: "listed", access: "password",
        movedOutOfGraph: true, encrypted: false, url: "https://roam.pub/c/bbb",
      }],
    });
    await publish("page1");
    button("Add to collection…")!.click!();
    await tick();
    assert.match(toasts.at(-1)!, /Add “Page” to a collection/);
    const sel = selects.at(-1)!;
    const options = (sel.children as El[]).slice(1).map((o) => [o.textContent, !!o.disabled]);
    assert.deepEqual(options, [
      ["Writing (already there)", true],
      ["Best of: listed and on Discover", false],
      ["Private: password-protected, leaves your graph", false],
    ]);
    sel.value = "c3";
    sel.click!();
    await tick();
    assert.deepEqual(calls.at(-1), { method: "POST", path: "/api/ext/publications/page1/collections", body: { collectionId: "c3" } });
    assert.match(toasts.at(-1)!, /^Added to Private, password-protected there\. It left your graph, so its graph link can't get around the password\./);
    assert.equal((settings.get("publications") as Record<string, { url: string }>).page1.url, "https://roam.pub/c/bbb");
  });

  test("a new page that went only to collections isn't called unlisted or offered Make listed", async () => {
    server({ "POST /api/ext/publications": (b) => [200, { status: "created", url: "https://roam.pub/c/aaa", contentHash: b.contentHash, visibility: "unlisted", listing: "unlisted", inGraph: false, encrypted: true, collections: 2 }] });
    await publish("page1");
    assert.match(toasts.at(-1)!, /^Page published to collections only\./);
    assert.deepEqual(actions().map((b) => b.textContent), ["Add to collection…"]);
  });

  describe("an encrypted page", () => {
    const added = {
      name: "Private", entryUrl: "https://roam.pub/c/bbb", listing: "listed", access: "password",
      movedOutOfGraph: false, encrypted: true, needsRepublish: true, url: "https://roam.pub/g/x",
    };
    const encryptedCache = async (hash?: string) => {
      const payload = (await serialize("page1", new Set()))!;
      settings.set("publications", cached({ hash: hash ?? (await hashPayload(payload)), encrypted: true, folded: [] }));
    };

    test("the dropdown leaves out collections whose password can't encrypt", async () => {
      await encryptedCache();
      server({
        "GET /api/ext/publications/page1/collections": () => [200, { collections: [
          { ...choices[1], blocked: "This page is encrypted. Give Best of a password first." },
          { ...choices[2], movesOutOfGraph: false, blocked: null },
        ] }],
      });
      await chooseCollection("page1");
      const options = (selects.at(-1)!.children as El[]).slice(1).map((o) => [o.textContent, !!o.disabled]);
      assert.deepEqual(options, [
        ["Best of (needs a password that can encrypt)", true],
        ["Private: password-protected", false],
      ]);
    });

    test("is added and republished in one go, so it opens in the new collection", async () => {
      await encryptedCache();
      const calls = server({
        "POST /api/ext/publications/page1/collections": () => [200, added],
        "POST /api/ext/publications": (b) => [200, { status: "updated", url: "https://roam.pub/g/x", contentHash: b.contentHash, visibility: "unlisted", listing: "unlisted", encrypted: true }],
      });
      await addToCollection("page1", "c3");
      assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ["POST /api/ext/publications/page1/collections", "POST /api/ext/publications"]);
      assert.match(toasts.at(-1)!, /^Added to Private and republished, so it opens there with Private's password\./);
    });

    test("asks first when the page changed in Roam, since republishing publishes the changes", async () => {
      await encryptedCache("not-the-hash");
      const calls = server({
        "POST /api/ext/publications/page1/collections": () => [200, added],
        "POST /api/ext/publications": (b) => [200, { status: "updated", url: "https://roam.pub/g/x", contentHash: b.contentHash, visibility: "unlisted" }],
      });
      await addToCollection("page1", "c3");
      assert.equal(calls.length, 0);
      assert.match(toasts.at(-1)!, /changed in Roam since it was last published/);
      button("Add and republish")!.click!();
      // Adding, then republishing (which reads and hashes the page), each take a few turns.
      for (let i = 0; i < 1000 && !/^Added to/.test(toasts.at(-1)!); i++) await tick();
      assert.deepEqual(calls.map((c) => c.path), ["/api/ext/publications/page1/collections", "/api/ext/publications"]);
    });
  });

  test("the status toast offers it too", async () => {
    server({
      "GET /api/ext/publications": () => [200, {
        collections: 1,
        publications: [{ rootUid: "page1", kind: "page", title: "Page", url: "https://roam.pub/g/x", contentHash: "x", visibility: "unlisted", listing: "unlisted", updatedAt: "" }],
      }],
    });
    await publishStatus("page1");
    assert.ok(button("Add to collection…"));
  });
});

describe("unpublish", () => {
  const published = (over: object = {}) => ({
    "GET /api/ext/publications": (): [number, unknown] => [200, {
      publications: [{ rootUid: "page1", kind: "page", title: "Page", url: "https://roam.pub/g/x", contentHash: "x",
        visibility: "unlisted", updatedAt: "", ...over }],
    }],
  });
  const deletes = (calls: { method: string }[]) => calls.filter((c) => c.method === "DELETE");

  test("asks first, and only unpublishes when confirmed", async () => {
    const calls = server({ ...published(), "DELETE /api/ext/publications/page1": () => [200, { deleted: true }] });
    await confirmUnpublish("page1");
    assert.equal(deletes(calls).length, 0);
    assert.match(toasts.at(-1)!, /Unpublish “Page”\? .*deleted/);
    button("Unpublish")!.click!();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(deletes(calls).map((c) => `${c.method} ${c.path}`), ["DELETE /api/ext/publications/page1"]);
  });

  test("doesn't ask about a page that isn't published", async () => {
    server({ "GET /api/ext/publications": () => [200, { publications: [] }] });
    await confirmUnpublish("page1");
    assert.match(toasts.at(-1)!, /isn't published/);
    assert.equal(actions().length, 0);
  });

  test("doesn't ask about another member's page", async () => {
    server(published({ mine: false }));
    await confirmUnpublish("page1");
    assert.match(toasts.at(-1)!, /Another member/);
    assert.equal(actions().length, 0);
  });
});

describe("no API key", () => {
  test("status says to add the key instead of offering buttons from the last sync", async () => {
    settings.delete("api-key");
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /Add your API key first/);
    assert.equal(actions().length, 0);
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
    assert.equal(actions().length, 0);
  });

  const remote = (over: object) => ({
    "GET /api/ext/publications": (): [number, unknown] => [200, {
      publications: [{ rootUid: "page1", kind: "page", title: "Page", url: "https://roam.pub/g/x", contentHash: "x",
        updatedAt: "", ...over }],
    }],
  });
  const labels = () => actions().map((b) => b.textContent);

  test("uses the website's words and offers the other two listings", async () => {
    const calls = server({
      ...remote({ visibility: "unlisted", listing: "unlisted", discoverBlocked: null }),
      "PATCH /api/ext/publications/page1": (b) => [200, { visibility: "public", listing: b.listing, discoverBlocked: null, url: "https://roam.pub/g/x" }],
    });
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /^Unlisted page, /);
    assert.deepEqual(labels().filter((l) => l?.startsWith("Make")), ["Make listed", "Make discoverable"]);
    button("Make discoverable")!.click!();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(calls.at(-1)!.body, { listing: "discover" });
    assert.match(toasts.at(-1)!, /Now discoverable/);
  });

  test("asks before taking a Discoverable page off Discover", async () => {
    const calls = server({
      ...remote({ visibility: "public", listing: "discover", discoverBlocked: null }),
      "PATCH /api/ext/publications/page1": (b) => [200, { visibility: "public", listing: b.listing, discoverBlocked: null, url: "https://roam.pub/g/x" }],
    });
    await publishStatus("page1");
    assert.deepEqual(labels().filter((l) => l?.startsWith("Make")), ["Make listed", "Make unlisted"]);
    const before = calls.length;
    button("Make unlisted")!.click!();
    await new Promise((r) => setImmediate(r));
    assert.equal(calls.length, before);
    assert.match(toasts.at(-1)!, /Take “Page” off roam.pub\/discover\? .*only people with the link/);
    buttons.findLast((b) => b.textContent === "Cancel")!.click!();
    await new Promise((r) => setImmediate(r));
    assert.equal(calls.length, before);
    button("Make unlisted")!.click!();
    buttons.findLast((b) => b.textContent === "Make unlisted")!.click!();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(calls.at(-1)!.body, { listing: "unlisted" });
    assert.match(toasts.at(-1)!, /Now unlisted/);
  });

  test("leaves out Make discoverable and says why when it can't be", async () => {
    server(remote({ visibility: "public", listing: "listed", discoverBlocked: "Turn on search engines in Sharing to make pages Discoverable." }));
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /^Listed page, .*Turn on search engines/);
    assert.deepEqual(labels().filter((l) => l?.startsWith("Make")), ["Make unlisted"]);
  });

  test("doesn't claim the front page lists a page when the graph's front page is off", async () => {
    const note = "Your graph's front page is off, so nothing lists this page yet: only people with the link will find it.";
    server({
      ...remote({ visibility: "unlisted", listing: "unlisted", discoverBlocked: "Turn on this graph's front page in Sharing to make pages Discoverable.", listedNote: null }),
      "PATCH /api/ext/publications/page1": (b) => [200, { visibility: "public", listing: b.listing, discoverBlocked: null, listedNote: note, url: "https://roam.pub/g/x" }],
    });
    await publishStatus("page1");
    button("Make listed")!.click!();
    await new Promise((r) => setImmediate(r));
    assert.match(toasts.at(-1)!, /^Now listed, but your graph's front page is off/);
    assert.doesNotMatch(toasts.at(-1)!, /on your graph's front page/);
  });

  test("the status of a listed page says when nothing lists it", async () => {
    server(remote({ visibility: "public", listing: "listed", discoverBlocked: "x", listedNote: "Your graph's front page is off." }));
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /^Listed page, .*front page is off/);
  });

  test("a page only in collections offers no Make … buttons and says where it's listed", async () => {
    server({
      "GET /api/ext/publications": () => [200, {
        collections: 2,
        publications: [{ rootUid: "page1", kind: "page", title: "Page", url: "https://roam.pub/c/aaa", contentHash: "x", updatedAt: "",
          visibility: "unlisted", listing: "unlisted", inGraph: false,
          discoverBlocked: "This page is only in collections, so it can't be Discoverable from its graph." }],
      }],
    });
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /^Page in collections only, /);
    assert.match(toasts.at(-1)!, /Each collection sets its listing\./);
    assert.doesNotMatch(toasts.at(-1)!, /unlisted|Discoverable/);
    assert.deepEqual(labels().filter((l) => l !== "Republish"), ["Add to collection…", "Unpublish"]);
  });

  test("an encrypted page can be added to collections from Roam too", async () => {
    server({
      "GET /api/ext/publications": () => [200, {
        collections: 2,
        publications: [{ rootUid: "page1", kind: "page", title: "Page", url: "https://roam.pub/c/aaa", contentHash: "x", updatedAt: "",
          visibility: "unlisted", listing: "unlisted", inGraph: false, encrypted: true }],
      }],
    });
    await publishStatus("page1");
    assert.doesNotMatch(toasts.at(-1)!, /roam\.pub/);
    assert.deepEqual(labels().filter((l) => l !== "Republish"), ["Add to collection…", "Unpublish"]);
  });

  test("an older server that only says public still gets the new words", async () => {
    server(remote({ visibility: "public" }));
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /^Listed page, /);
    assert.deepEqual(labels().filter((l) => l?.startsWith("Make")), ["Make unlisted"]);
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
