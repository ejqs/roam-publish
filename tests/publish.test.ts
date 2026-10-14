import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, mock, test } from "node:test";
import {
  addToCollection,
  chooseCollection,
  confirmChangeLogBlocks,
  confirmLeaveDiscover,
  confirmUnpublish,
  publish,
  publishStatus,
  syncPublications,
} from "../src/publish";
import { recheckCanSeal } from "../src/seal";
import { hashPayload, serialize } from "../src/serialize";
import { getShortlinkEnabled, getShortlinkOnBlocks, getShortlinkPosition, initState, withoutUndefined } from "../src/state";
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
  const calls: { method: string; path: string; search?: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const { pathname: path, search } = new URL(url);
    const body = JSON.parse((init.body as string) ?? "{}");
    const route = routes[`${method} ${path}`];
    // Asked before every publish; unless a test says otherwise, nothing is encrypted, and it isn't listed.
    if (!route && method === "GET" && path.endsWith("/seal")) return new Response(JSON.stringify({ encrypt: false }));
    // And it can't publish where you pick (as before "Publish where?"), so Publish doesn't ask.
    if (!route && method === "GET" && path === "/api/ext/places") return new Response("{}", { status: 404 });
    calls.push({ method, path, ...(search && { search }), body });
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
    // An older server doesn't say whether it can go on Discover, so only Make public is offered.
    assert.deepEqual(actions().map((b) => b.textContent), ["Make public"]);
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
        publications: [{ rootUid: "page1", kind: "page", title: "Encrypted page", url: "https://roam.pub/g/x", contentHash: stored,
          visibility: "unlisted", listing: "unlisted", updatedAt: "", folded: [], encrypted: true }],
      }],
    });
    await publish("page1");
    const post = calls.find((c) => c.method === "POST")!.body;
    assert.equal(post.tree, undefined);
    // The title is encrypted too.
    assert.equal(post.title, undefined);
    assert.doesNotMatch(JSON.stringify(post), /hello|Page/);
    assert.deepEqual(Object.keys(post.sealed as object), ["publicationId", "cipher", "titleCipher", "keys"]);
    assert.match(post.contentHash as string, /^k1\.[0-9a-f]{64}$/);
    assert.deepEqual(post.folded, []);
    assert.equal((settings.get("publications") as Record<string, { hash: string }>).page1.hash, post.contentHash);
    // The keyed hash still tells that nothing changed in Roam since.
    buttons = [];
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /^Encrypted unlisted page, up to date/);
    assert.equal(button("Republish"), undefined);
    // roam.pub only knows it as "Encrypted page"; the title published from here is kept.
    assert.equal((settings.get("publications") as Record<string, { title: string }>).page1.title, "Page");
  });

  test("where Roam can't encrypt, it's sent as before and the toast says roam.pub encrypted it", async (t) => {
    t.mock.method(crypto.subtle, "generateKey", async () => {
      throw new Error("X25519 not supported");
    });
    recheckCanSeal();
    t.after(recheckCanSeal);
    const calls = server({
      "GET /api/ext/publications/page1/seal": () => [200, plan],
      "POST /api/ext/publications": accept,
    });
    await publish("page1");
    const post = calls.find((c) => c.method === "POST")!.body;
    assert.equal(post.sealed, undefined);
    assert.ok(post.tree);
    assert.match(toasts.at(-1)!, /republished.*roam\.pub encrypted it, since this Roam can't encrypt pages itself/);
  });

  test("a page encrypted elsewhere, without this graph's key here yet: can't tell, and no key is made", async () => {
    settings.set("publications", cached({ hash: `k1.${"0".repeat(64)}`, encrypted: true, folded: [] }));
    server({
      "GET /api/ext/publications": () => [200, {
        publications: [{ rootUid: "page1", kind: "page", title: "Encrypted page", url: "https://roam.pub/g/x", contentHash: `k1.${"0".repeat(64)}`,
          visibility: "unlisted", listing: "unlisted", updatedAt: "", folded: [], encrypted: true }],
      }],
    });
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /^Encrypted unlisted page, last published .*Can't tell here whether it changed\. Republish to be sure\./);
    assert.ok(button("Republish"));
    assert.equal(settings.get("hash-key"), undefined);
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

describe("Publish with encryption", () => {
  const publicKey = generateKeyPairSync("x25519").publicKey.export({ type: "spki", format: "der" }).toString("base64url");
  const plan = { encrypt: true, publicationId: "3f0c8a62-0a3e-4a43-9b38-6a1f1b0e7d11", locks: [{ scope: "graph", id: "g1", publicKey }], encryptBlocked: null };
  const created = (body: Record<string, unknown>): [number, unknown] => [200, {
    status: "created", url: "https://roam.pub/g/x", contentHash: body.contentHash, visibility: "unlisted", listing: "unlisted", encrypted: true,
  }];
  const unpublished = { "GET /api/ext/publications": (): [number, unknown] => [200, { publications: [] }] };

  test("the pop-up for a page that isn't published offers it next to Publish when Publish doesn't ask", async () => {
    settings.set("publications", {});
    server(unpublished);
    await publishStatus("page1");
    assert.deepEqual(actions().map((b) => b.textContent), ["Publish page"]);
    buttons = [];
    settings.set("ask-where", false);
    await publishStatus("page1");
    assert.deepEqual(actions().map((b) => b.textContent), ["Publish page", "Publish with encryption"]);
  });

  test("asks roam.pub for it, encrypts in Roam and says it opens with the graph password", async () => {
    settings.set("publications", {});
    const calls = server({ "GET /api/ext/publications/page1/seal": () => [200, plan], "POST /api/ext/publications": created });
    await publish("page1", { encrypt: true });
    assert.equal(calls.find((c) => c.path.endsWith("/seal"))!.search, "?encrypt=1");
    const post = calls.find((c) => c.method === "POST")!.body;
    assert.equal(post.encrypt, true);
    assert.ok(post.sealed);
    assert.doesNotMatch(JSON.stringify(post), /hello/);
    assert.match(toasts.at(-1)!, /published with encryption: it opens with your graph password/);
  });

  test("when roam.pub says it can't be, nothing is published and it says why", async () => {
    settings.set("publications", {});
    const calls = server({
      "GET /api/ext/publications/page1/seal": () => [200, { encrypt: false, encryptBlocked: "First set a graph password." }],
    });
    await publish("page1", { encrypt: true });
    assert.equal(calls.filter((c) => c.method === "POST").length, 0);
    assert.match(toasts.at(-1)!, /First set a graph password/);
  });

  test("for something already published, it changes nothing and says so", async () => {
    settings.set("publications", cached({ encrypted: false }));
    const calls = server();
    await publish("page1", { encrypt: true });
    assert.equal(calls.length, 0);
    assert.match(toasts.at(-1)!, /already published, so this doesn't change it\. To encrypt it, give it a password on roam\.pub/);
    settings.set("publications", cached({ encrypted: true }));
    await publish("page1", { encrypt: true });
    assert.match(toasts.at(-1)!, /already published, encrypted\./);
  });

  test("a roam.pub without it: nothing is published", async () => {
    settings.set("publications", {});
    const calls = server();
    await publish("page1", { encrypt: true });
    assert.equal(calls.filter((c) => c.method === "POST").length, 0);
    assert.match(toasts.at(-1)!, /can't publish with encryption yet/);
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

  const savedFolds = () => (settings.get("publications") as Record<string, { folded?: string[] }>).page1?.folded;

  test("the first publish keeps blocks collapsed as in Roam by default, without asking, and remembers them", async () => {
    settings.set("publications", {});
    roam = folded();
    const calls = server(routes(""));
    await publish("page1");
    assert.equal(posts(calls).length, 1);
    assert.match(sentTree(calls), /"collapsed":true/);
    assert.deepEqual(savedFolds(), ["b1"]);
    // Nothing changed in Roam since: republishing offers nothing about collapsed blocks.
    buttons = [];
    await publish("page1");
    assert.deepEqual(labels(), []);
    assert.equal(posts(calls).length, 2);
  });

  test("with the Collapsed blocks setting on Expanded, the first publish opens every block", async () => {
    settings.set("publications", {});
    settings.set("collapsed-blocks", "Expanded");
    roam = folded();
    const calls = server(routes(""));
    await publish("page1");
    assert.equal(posts(calls).length, 1);
    assert.doesNotMatch(sentTree(calls), /collapsed/);
    assert.deepEqual(savedFolds(), []);
  });

  test("when Roam's collapsed blocks differ, republishing keeps the published page's without asking", async () => {
    roam = folded();
    settings.set("publications", cached({ hash: "old", folded: [] }));
    const calls = server(routes());
    await publish("page1");
    assert.equal(posts(calls).length, 1);
    assert.doesNotMatch(sentTree(calls), /collapsed/);
    assert.deepEqual(labels(), []);
    buttons = [];
    await publish("page1", { folds: "asIs" });
    assert.match(sentTree(calls), /"collapsed":true/);
  });

  test("which blocks are collapsed on the website comes from the server, so another computer knows too", async () => {
    roam = folded();
    settings.set("publications", {});
    const calls = server({
      ...routes(),
      "GET /api/ext/publications": () => [200, {
        publications: [{ rootUid: "page1", kind: "page", title: "Page", url: "https://roam.pub/g/x", contentHash: "old",
          visibility: "unlisted", listing: "unlisted", updatedAt: "", folded: [] }],
      }],
    });
    await syncPublications({ quiet: true });
    await publish("page1");
    assert.equal(posts(calls).length, 1);
    assert.doesNotMatch(sentTree(calls), /collapsed/);
  });

  test("the status offers Sync when only collapsed blocks differ, and one Republish that keeps them after an edit", async () => {
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
    const calls = server(routes("old"));
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /, changed since last published.*Republish keeps the published ones\./);
    assert.deepEqual(labels(), ["Republish"]);
    button("Republish")!.click!();
    await settle(() => posts(calls).length > 0);
    await settle(() => (settings.get("publications") as Record<string, { hash: string }>).page1.hash !== "old");
    assert.doesNotMatch(sentTree(calls), /collapsed/);
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

  test("first-time setup saves the defaults, so the settings panel shows them", () => {
    settings.clear();
    initState({ settings: { get: (k: string) => settings.get(k) ?? null, set: refusingSet } } as never);
    assert.equal(settings.get("shortlink-add"), "Pages");
    assert.equal(settings.get("shortlink-position"), "First");
    assert.equal(settings.get("collapsed-blocks"), "As in Roam");
    assert.equal(settings.get("shortlink-tag"), "[[Roam Publish]]");
  });

  test("the two Roam Publish block switches and top/bottom carry over", () => {
    const cases: [boolean | null, boolean | null, string][] = [
      [null, null, "Pages"],
      [true, true, "Pages and blocks"],
      [false, true, "Blocks only"],
      [false, false, "Off"],
    ];
    for (const [pages, blocks, choice] of cases) {
      settings.clear();
      if (pages != null) settings.set("shortlink-enabled", pages);
      if (blocks != null) settings.set("shortlink-blocks", blocks);
      settings.set("shortlink-position", "bottom");
      initState({ settings: { get: (k: string) => settings.get(k) ?? null, set: refusingSet } } as never);
      assert.equal(settings.get("shortlink-add"), choice);
      assert.equal(getShortlinkEnabled(), pages !== false);
      assert.equal(getShortlinkOnBlocks(), blocks === true);
      assert.equal(settings.get("shortlink-position"), "Last");
      assert.equal(getShortlinkPosition(), "bottom");
    }
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

describe("publish where?", () => {
  const places = (over: object = {}) => ({
    graph: { name: "notes", access: "open", encrypted: false, encryptBlocked: null },
    collections: [
      { id: "c1", name: "Writing", access: "open", listing: "listed", encrypted: false },
      { id: "c2", name: "Private", access: "password", listing: "listed", encrypted: true },
    ],
    newPagesGoTo: ["graph"],
    ...over,
  });
  const optionsOf = (s: El) => (s.children as El[]).map((o) => o.textContent);
  type Calls = ReturnType<typeof server>;
  /** The publish sent once the click's publish has run. */
  const posted = async (calls: Calls) => {
    for (let i = 0; i < 1000 && !calls.some((c) => c.method === "POST"); i++) await new Promise((r) => setImmediate(r));
    return calls.find((c) => c.method === "POST")!;
  };
  // Nothing published yet.
  const NONE = { "GET /api/ext/publications": () => [200, { publications: [] }] as [number, unknown] };
  beforeEach(() => settings.set("publications", {}));

  test("asks before publishing something new, starting on where New pages go to says", async () => {
    const calls = server({ ...NONE, "GET /api/ext/places": () => [200, places()] });
    await publish("page1");
    assert.deepEqual(calls.map((c) => c.path).filter((p) => p !== "/api/ext/publications"), ["/api/ext/places"]);
    assert.match(toasts.at(-1)!, /Publish “Page” to:/);
    assert.deepEqual(optionsOf(selects[0]), [
      "Graph: notes (Open)",
      "Graph: notes (Password, encrypted)",
      "Collection: Writing (Open)",
      "Collection: Private (Password, encrypted)",
    ]);
    assert.equal(selects[0].value, "graph");
    // One click publishes there.
    button("Publish")!.click!();
    assert.deepEqual((await posted(calls)).body.to, ["graph"]);
  });

  test("a collection picked is where it goes, and the seal plan is asked for it", async () => {
    const calls = server({ ...NONE, "GET /api/ext/places": () => [200, places()] });
    await publish("page1");
    selects[0].value = "c2";
    button("Publish")!.click!();
    assert.deepEqual((await posted(calls)).body.to, ["c2"]);
  });

  test("starts on New pages go to when that's several places, and sends them all", async () => {
    const calls = server({ ...NONE, "GET /api/ext/places": () => [200, places({ newPagesGoTo: ["graph", "c1"] })] });
    await publish("page1");
    assert.equal(optionsOf(selects[0])[0], "New pages setting: notes + Writing");
    button("Publish")!.click!();
    assert.deepEqual((await posted(calls)).body.to, ["graph", "c1"]);
  });

  test("doesn't ask with nothing to choose, when switched off, or for a republish", async () => {
    // No collection, and the graph can't be published encrypted: nothing to choose.
    const graphOnly = { name: "notes", access: "open", encrypted: false, encryptBlocked: "No password" };
    let calls = server({ ...NONE, "GET /api/ext/places": () => [200, places({ collections: [], graph: graphOnly })] });
    await publish("page1");
    assert.equal((await posted(calls)).body.to, undefined);

    settings.set("ask-where", false);
    settings.set("publications", {});
    calls = server({ ...NONE, "GET /api/ext/places": () => [200, places()] });
    await publish("page1");
    assert.ok(!calls.some((c) => c.path === "/api/ext/places"));
    assert.ok(await posted(calls));

    settings.set("ask-where", true);
    settings.set("publications", cached());
    calls = server({ "GET /api/ext/places": () => [200, places()] });
    await publish("page1");
    assert.ok(!calls.some((c) => c.path === "/api/ext/places"));
  });

  test("encrypted is one of the choices; picking it publishes with encryption", async () => {
    const calls = server({ ...NONE, "GET /api/ext/places": () => [200, places({ collections: [] })] });
    await publish("page1");
    assert.deepEqual(optionsOf(selects[0]), ["Graph: notes (Open)", "Graph: notes (Password, encrypted)"]);
    selects[0].value = "graph-encrypted";
    button("Publish")!.click!();
    for (let i = 0; i < 1000 && !calls.some((c) => c.path.endsWith("/seal")); i++) await new Promise((r) => setImmediate(r));
    // Refused here (the fake plan can't encrypt), so it asked roam.pub with encrypt=1 and sent nothing.
    for (let i = 0; i < 1000 && !/can't publish with encryption/.test(toasts.at(-1) ?? ""); i++) await new Promise((r) => setImmediate(r));
    assert.ok(!calls.some((c) => c.method === "POST"));
  });

  test("encrypted can't be picked without a graph password that can encrypt, and isn't offered when the graph encrypts anyway", async () => {
    server({ ...NONE, "GET /api/ext/places": () => [200, places({ graph: { name: "notes", access: "open", encrypted: false, encryptBlocked: "No password" } })] });
    await publish("page1");
    const enc = (selects[0].children as El[]).find((o) => o.value === "graph-encrypted")!;
    assert.equal(enc.textContent, "Graph: notes (Password, encrypted), needs a graph password that can encrypt");
    assert.equal(enc.disabled, true);

    selects = [];
    server({ ...NONE, "GET /api/ext/places": () => [200, places({ graph: { name: "notes", access: "password", encrypted: true, encryptBlocked: null } })] });
    await publish("page1");
    assert.deepEqual(optionsOf(selects[0])[0], "Graph: notes (Password, encrypted)");
    assert.equal(optionsOf(selects[0]).length, 3);
  });

  test("Publish with encryption doesn't ask: it goes to the graph", async () => {
    const calls = server({
      "GET /api/ext/places": () => [200, places()],
      ...NONE,
      "GET /api/ext/publications/page1/seal": () => [200, { encrypt: false, encryptBlocked: "No graph password" }],
    });
    await publish("page1", { encrypt: true });
    assert.ok(!calls.some((c) => c.path === "/api/ext/places"));
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
      ["Best of: public and on Discover", false],
      ["Private: password-protected, leaves your graph", false],
    ]);
    sel.value = "c3";
    sel.click!();
    await tick();
    assert.deepEqual(calls.at(-1), { method: "POST", path: "/api/ext/publications/page1/collections", body: { collectionId: "c3" } });
    assert.match(toasts.at(-1)!, /^Added to Private, password-protected there\. It left your graph, so its graph link can't get around the password\./);
    assert.equal((settings.get("publications") as Record<string, { url: string }>).page1.url, "https://roam.pub/c/bbb");
  });

  test("a new page that went only to collections isn't called unlisted or offered Make public", async () => {
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

  /** A first publish, answered the way roam.pub answers a new page. */
  const created = (over: object = {}) => ({
    "GET /api/ext/publications": (): [number, unknown] => [200, { publications: [] }],
    "POST /api/ext/publications": (b: Record<string, unknown>): [number, unknown] => [200, {
      status: "created", url: "https://roam.pub/g/x", contentHash: b.contentHash, visibility: "unlisted", listing: "unlisted",
      discoverBlocked: null, ...over,
    }],
    "PATCH /api/ext/publications/page1": (b: Record<string, unknown>): [number, unknown] => [200, {
      visibility: "public", listing: b.listing, discoverBlocked: null, url: "https://roam.pub/g/x",
    }],
  });

  test("uses the website's words and offers one action, leaving visibility to the status page it links to", async () => {
    server(remote({ visibility: "unlisted", listing: "unlisted", discoverBlocked: null }));
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /^Unlisted page, changed since/);
    assert.deepEqual(labels(), ["Republish", "Unpublish"]);
  });

  test("an up-to-date page offers no republish", async () => {
    settings.set("shortlink-enabled", false);
    const hash = await hashPayload((await serialize("page1"))!);
    server(remote({ visibility: "public", listing: "discover", discoverBlocked: null, contentHash: hash, author: "" }));
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /^Page on Discover, up to date\./);
    assert.deepEqual(labels(), ["Unpublish"]);
  });

  test("a first publish offers the other two listings", async () => {
    settings.set("publications", {});
    const calls = server(created());
    await publish("page1");
    assert.match(toasts.at(-1)!, /published as unlisted/);
    assert.deepEqual(labels().filter((l) => /^(Make|Put)/.test(l ?? "")), ["Make public", "Put on Discover"]);
    button("Put on Discover")!.click!();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(calls.at(-1)!.body, { listing: "discover" });
    assert.match(toasts.at(-1)!, /Now on Discover/);
  });

  test("asks before taking a page off Discover", async () => {
    settings.set("publications", cached({ visibility: "public", listing: "discover" }));
    const calls = server(created());
    confirmLeaveDiscover("page1", "unlisted");
    assert.equal(calls.length, 0);
    assert.match(toasts.at(-1)!, /Take “Page” off roam.pub\/discover\? .*only people with the link/);
    buttons.findLast((b) => b.textContent === "Cancel")!.click!();
    await new Promise((r) => setImmediate(r));
    assert.equal(calls.length, 0);
    confirmLeaveDiscover("page1", "unlisted");
    buttons.findLast((b) => b.textContent === "Make unlisted")!.click!();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(calls.at(-1)!.body, { listing: "unlisted" });
    assert.match(toasts.at(-1)!, /Now unlisted/);
  });

  test("a first publish leaves out Put on Discover when it can't be", async () => {
    settings.set("publications", {});
    server(created({ discoverBlocked: "Turn on search engines in Sharing to make pages Discoverable." }));
    await publish("page1");
    assert.deepEqual(labels().filter((l) => /^(Make|Put)/.test(l ?? "")), ["Make public"]);
  });

  test("doesn't claim the front page lists a page when the graph's front page is off", async () => {
    const note = "Your graph's front page is off, so nothing lists this page yet: only people with the link will find it.";
    settings.set("publications", {});
    server({
      ...created({ discoverBlocked: "Turn on this graph's front page in Sharing to make pages Discoverable." }),
      "PATCH /api/ext/publications/page1": (b) => [200, { visibility: "public", listing: b.listing, discoverBlocked: null, listedNote: note, url: "https://roam.pub/g/x" }],
    });
    await publish("page1");
    button("Make public")!.click!();
    await new Promise((r) => setImmediate(r));
    assert.match(toasts.at(-1)!, /^Now public, but your graph's front page is off/);
    assert.doesNotMatch(toasts.at(-1)!, /on your graph's front page/);
  });

  test("the status of a public page says when nothing lists it", async () => {
    server(remote({ visibility: "public", listing: "listed", discoverBlocked: "x", listedNote: "Your graph's front page is off." }));
    await publishStatus("page1");
    assert.match(toasts.at(-1)!, /^Public page, .*front page is off/);
  });

  test("a page only in collections isn't called unlisted", async () => {
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
    assert.match(toasts.at(-1)!, /^Public page, /);
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
