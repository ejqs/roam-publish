import assert from "node:assert/strict";
import { createDecipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, type KeyObject } from "node:crypto";
import { describe, test } from "node:test";
import { b64, isKeyedHash, keyedHash, type SealPlan, sealTree } from "../src/seal";
import { initState } from "../src/state";

const settings = new Map<string, unknown>();
initState({ settings: { get: (k: string) => settings.get(k) ?? null, set: async (k: string, v: unknown) => void settings.set(k, v) } } as never);

/**
 * How roam.pub and readers' browsers open what the extension seals (roam-publish-web
 * src/lib/encryption.ts and src/lib/reader-crypto.ts), written out again with Node's crypto.
 */
const unb64 = (s: string) => Buffer.from(s, "base64url");
function gcmOpen(key: Buffer, [iv, tag, body]: string[], aad: string) {
  const d = createDecipheriv("aes-256-gcm", key, unb64(iv));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(unb64(tag));
  return Buffer.concat([d.update(unb64(body)), d.final()]);
}
function openContentKey(sealed: string, privateKey: KeyObject) {
  const [v, eph, ...parts] = sealed.split(".");
  assert.equal(v, "v1");
  const ephPub = unb64(eph);
  const shared = diffieHellman({ privateKey, publicKey: createPublicKey({ key: ephPub, format: "der", type: "spki" }) });
  return gcmOpen(Buffer.from(hkdfSync("sha256", shared, ephPub, "roam-publish:content-key", 32)), parts, "content-key");
}
const decryptTree = (ck: Buffer, cipher: string, id: string) => {
  const [v, ...parts] = cipher.split(".");
  assert.equal(v, "v1");
  return JSON.parse(gcmOpen(ck, parts, `tree:${id}`).toString());
};

const lock = () => {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  return { publicKey: b64(publicKey.export({ type: "spki", format: "der" })), privateKey };
};

describe("sealing a page", () => {
  const tree = { uid: "page1", string: "", children: [{ uid: "b1", string: "the launch code is zanzibar", children: [] }] };

  test("opens with each password's private key, the way roam.pub's readers open it", async () => {
    const graph = lock();
    const coll = lock();
    const plan: SealPlan = {
      encrypt: true,
      publicationId: "3f0c8a62-0a3e-4a43-9b38-6a1f1b0e7d11",
      locks: [
        { scope: "graph", id: "g1", publicKey: graph.publicKey },
        { scope: "collection", id: "c1", publicKey: coll.publicKey },
        // A password with no key pair: nothing to seal to, roam.pub marks the page for a republish.
        { scope: "entry", id: "e1", publicKey: null },
      ],
    };
    const sealed = await sealTree(plan, tree);
    assert.equal(sealed.publicationId, plan.publicationId);
    assert.deepEqual(sealed.keys.map((k) => [k.scope, k.id, k.publicKey]), [["graph", "g1", graph.publicKey], ["collection", "c1", coll.publicKey]]);
    assert.doesNotMatch(JSON.stringify(sealed), /zanzibar/);
    for (const [k, l] of [[sealed.keys[0], graph], [sealed.keys[1], coll]] as const)
      assert.deepEqual(decryptTree(openContentKey(k.sealedKey, l.privateKey), sealed.cipher, plan.publicationId), tree);
    // Bound to the page: it doesn't open as another one.
    const ck = openContentKey(sealed.keys[0].sealedKey, graph.privateKey);
    assert.throws(() => decryptTree(ck, sealed.cipher, "another-page"));
  });

  test("the keyed hash is stable per graph, and isn't the plain hash", async () => {
    const plain = "a".repeat(64);
    const h = await keyedHash(plain);
    assert.match(h, /^k1\.[0-9a-f]{64}$/);
    assert.ok(isKeyedHash(h));
    assert.equal(await keyedHash(plain), h);
    assert.notEqual(await keyedHash("b".repeat(64)), h);
    // Another graph has its own key.
    settings.clear();
    assert.notEqual(await keyedHash(plain), h);
  });
});
