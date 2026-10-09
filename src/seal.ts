import { hashPayload, type Node, type Payload } from "./serialize";
import { getHashKey, savedHashKey } from "./state";

/**
 * Encrypting a page in Roam before it's published, so roam.pub never sees its text. Before each
 * publish, roam.pub says whether the page is encrypted (Password everywhere it's shown) and which
 * passwords' public keys to seal it to. The tree is encrypted under a fresh AES-256-GCM content key,
 * and that key is sealed to each public key (X25519, HKDF-SHA256). Its title is encrypted under the same
 * key, so roam.pub only knows it as "Encrypted page". Readers' browsers open both with the password, as
 * roam.pub's own lib/reader-crypto.ts does; the format here must match it byte for byte.
 */

export type SealTarget = { scope: "graph" | "collection" | "publication" | "entry"; id: string; publicKey: string | null };
export type SealPlan = ({ encrypt: false } | { encrypt: true; publicationId: string; locks: SealTarget[] }) & {
  /** Asked for Publish with encryption: why it can't be, or null. Missing from roam.pubs without it. */
  encryptBlocked?: string | null;
};
export type Sealed = {
  publicationId: string;
  cipher: string;
  titleCipher: string;
  keys: { scope: SealTarget["scope"]; id: string; publicKey: string; sealedKey: string }[];
};

type Bytes = Uint8Array<ArrayBuffer>;
const utf8 = (s: string): Bytes => new TextEncoder().encode(s) as Bytes;

export function b64(bytes: ArrayBuffer | Uint8Array) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64(s: string): Bytes {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** "{iv}.{tag}.{body}": AES-256-GCM, as roam.pub stores it (WebCrypto puts the tag after the body). */
async function gcmSeal(key: Bytes, plaintext: Bytes, aad: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(aad) }, k, plaintext));
  return [b64(iv), b64(out.slice(-16)), b64(out.slice(0, -16))];
}

/** The tree, encrypted for one page: bound to its id, so it can't be passed off as another page. */
export async function encryptTree(contentKey: Bytes, tree: Node, publicationId: string) {
  return ["v1", ...(await gcmSeal(contentKey, utf8(JSON.stringify(tree)), `tree:${publicationId}`))].join(".");
}

/** The title, encrypted for one page like its tree. */
export async function encryptTitle(contentKey: Bytes, title: string, publicationId: string) {
  return ["v1", ...(await gcmSeal(contentKey, utf8(title), `title:${publicationId}`))].join(".");
}

/** Seals a content key to a password's public key (SPKI, base64url), for only its private key to open. */
export async function sealContentKey(publicKey: string, contentKey: Bytes) {
  const recipient = await crypto.subtle.importKey("spki", unb64(publicKey), { name: "X25519" }, false, []);
  const eph = (await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
  const ephPub = new Uint8Array(await crypto.subtle.exportKey("spki", eph.publicKey));
  const shared = await crypto.subtle.deriveBits({ name: "X25519", public: recipient } as EcdhKeyDeriveParams, eph.privateKey, 256);
  const hkdf = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
  const key = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: ephPub, info: utf8("roam-publish:content-key") }, hkdf, 256),
  );
  return ["v1", b64(ephPub), ...(await gcmSeal(key, contentKey, "content-key"))].join(".");
}

let sealSupport: Promise<boolean> | null = null;
/**
 * Whether this browser (or Roam desktop) has X25519, checked once. Without it, pages are sent as before
 * and roam.pub encrypts them.
 */
export function canSeal() {
  sealSupport ??= (async () => {
    try {
      await crypto.subtle.generateKey({ name: "X25519" }, false, ["deriveBits"]);
      return true;
    } catch {
      return false;
    }
  })();
  return sealSupport;
}

/** Checks again next time; for tests. */
export function recheckCanSeal() {
  sealSupport = null;
}

/** Encrypts the tree and title and seals their key to every password in the plan that has a key pair. */
export async function sealTree(plan: SealPlan & { encrypt: true }, tree: Node, title: string): Promise<Sealed> {
  const contentKey = crypto.getRandomValues(new Uint8Array(32));
  const keys = await Promise.all(
    plan.locks
      .filter((l): l is SealTarget & { publicKey: string } => !!l.publicKey)
      .map(async (l) => ({ scope: l.scope, id: l.id, publicKey: l.publicKey, sealedKey: await sealContentKey(l.publicKey, contentKey) })),
  );
  return {
    publicationId: plan.publicationId,
    cipher: await encryptTree(contentKey, tree, plan.publicationId),
    titleCipher: await encryptTitle(contentKey, title, plan.publicationId),
    keys,
  };
}

/**
 * What an encrypted page's content hash is stored as: "k1." and an HMAC of its plain hash under a key
 * kept in this graph's extension settings. It tells whether a page changed without letting roam.pub
 * check a guess at the text. Only publishing makes the key (`create`); without one, null: a key made
 * anywhere else would make every page encrypted under the old one look changed.
 */
export async function keyedHash(plainHash: string, { create = false } = {}) {
  const saved = create ? await getHashKey() : savedHashKey();
  if (!saved) return null;
  const key = await crypto.subtle.importKey("raw", unb64(saved), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(plainHash)));
  return `k1.${[...mac].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export const isKeyedHash = (hash: string | undefined) => !!hash && hash.startsWith("k1.");

/**
 * The payload's hash as `published` was made: keyed when it's a page encrypted in Roam. Null when it
 * can't be told here: keyed, and this graph's key for it isn't in this Roam's settings (yet).
 */
export async function hashLike(published: string | undefined, p: Payload) {
  const plain = await hashPayload(p);
  return isKeyedHash(published) ? keyedHash(plain) : plain;
}
