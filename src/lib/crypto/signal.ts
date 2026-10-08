import {
  Direction,
  EncryptionResultMessageType,
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  type DeviceType,
  type KeyPairType,
  type MessageType,
  type SessionRecordType,
  type StorageType,
} from "@wppconnect/libsignal-protocol";
import { sessionPublicUsername, supabase } from "../../supabase";
import { toSlug } from "../../slug";

export const SIGNAL_DEVICE_ID = 1;
export const SIGNAL_PREKEY_BATCH = 100;
export const SIGNAL_PREKEY_FLOOR = 20;
const IDB_NAME = "darke.signal";
const IDB_STORE = "kv";
const LS_READY = "darke.signal.ready";
const SIGNED_PREKEY_ID = 1;

export type SignalEnvelope = {
  v: 1;
  proto: "signal";
  type: number;
  body: string;
  registrationId?: number;
};

type StoreDump = Record<string, unknown>;

type LocalMeta = {
  userId: string;
  username: string;
  signedPreKeyId: number;
  signedPreKeySignature: string;
  nextPreKeyId: number;
};

let bootPromise: Promise<boolean> | null = null;
let storeSingleton: DarkeSignalStore | null = null;

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

function b64ToBytes(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toU8(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

async function resolveMaybe<T>(value: T | Promise<T>): Promise<T> {
  return await value;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("signal idb open"));
  });
}

async function idbGet(key: string): Promise<string | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => {
      resolve(typeof req.result === "string" ? req.result : undefined);
    };
    req.onerror = () => reject(req.error ?? new Error("signal idb get"));
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("signal idb put"));
  });
}

function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revive);
  if (!value || typeof value !== "object") return value;
  const rec = value as Record<string, unknown>;
  if (typeof rec.__u8 === "string") return b64ToBytes(rec.__u8);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = revive(v);
  return out;
}

function encodeStoreValue(value: unknown): unknown {
  if (value instanceof Uint8Array) return { __u8: bytesToB64(value) };
  if (Array.isArray(value)) return value.map(encodeStoreValue);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = encodeStoreValue(v);
  }
  return out;
}

function isKeyPair(value: unknown): value is KeyPairType {
  if (!value || typeof value !== "object") return false;
  const rec = value as KeyPairType;
  return rec.pubKey instanceof Uint8Array && rec.privKey instanceof Uint8Array;
}

class DarkeSignalStore implements StorageType {
  private data: StoreDump = {};
  private persistTimer: number | null = null;

  async hydrate(): Promise<void> {
    const raw = await idbGet("dump");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      this.data = (revive(parsed) as StoreDump) ?? {};
    } catch {
      this.data = {};
    }
  }

  private schedulePersist(): void {
    if (typeof window === "undefined") return;
    if (this.persistTimer != null) window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = null;
      void idbSet("dump", JSON.stringify(encodeStoreValue(this.data)));
    }, 20);
  }

  get(key: string): unknown {
    return this.data[key];
  }

  put(key: string, value: unknown): void {
    this.data[key] = value;
    this.schedulePersist();
  }

  remove(key: string): void {
    delete this.data[key];
    this.schedulePersist();
  }

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    const kp = this.get("identityKey");
    if (isKeyPair(kp) || kp === undefined) return kp;
    throw new Error("identity key has the wrong type");
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    const rid = this.get("registrationId");
    if (typeof rid === "number" || rid === undefined) return rid;
    throw new Error("registration id is not a number");
  }

  async isTrustedIdentity(
    identifier: string,
    identityKey: Uint8Array,
    _direction: Direction,
  ): Promise<boolean> {
    void _direction;
    const trusted = this.get("identityKey" + identifier);
    if (!(trusted instanceof Uint8Array)) return true;
    if (trusted.length !== identityKey.length) return false;
    return trusted.every((byte, i) => byte === identityKey[i]);
  }

  async saveIdentity(
    encodedAddress: string,
    publicKey: Uint8Array,
  ): Promise<boolean> {
    const address = SignalProtocolAddress.fromString(encodedAddress);
    const name = address.getName();
    const existing = this.get("identityKey" + name);
    this.put("identityKey" + name, publicKey);
    if (!(existing instanceof Uint8Array)) return false;
    if (existing.length !== publicKey.length) return true;
    return existing.some((byte, i) => byte !== publicKey[i]);
  }

  async loadPreKey(keyId: string | number): Promise<KeyPairType | undefined> {
    const res = this.get("25519KeypreKey" + keyId);
    if (isKeyPair(res) || res === undefined) return res;
    throw new Error("prekey has the wrong type");
  }

  async storePreKey(
    keyId: number | string,
    keyPair: KeyPairType,
  ): Promise<void> {
    this.put("25519KeypreKey" + keyId, keyPair);
  }

  async removePreKey(keyId: number | string): Promise<void> {
    this.remove("25519KeypreKey" + keyId);
  }

  async loadSignedPreKey(
    keyId: number | string,
  ): Promise<KeyPairType | undefined> {
    const res = this.get("25519KeysignedKey" + keyId);
    if (isKeyPair(res) || res === undefined) return res;
    throw new Error("signed prekey has the wrong type");
  }

  async storeSignedPreKey(
    keyId: number | string,
    keyPair: KeyPairType,
  ): Promise<void> {
    this.put("25519KeysignedKey" + keyId, keyPair);
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    this.remove("25519KeysignedKey" + keyId);
  }

  async loadSession(
    identifier: string,
  ): Promise<SessionRecordType | undefined> {
    const rec = this.get("session" + identifier);
    if (typeof rec === "string" || rec === undefined) return rec;
    throw new Error("session record is not a string");
  }

  async storeSession(
    identifier: string,
    record: SessionRecordType,
  ): Promise<void> {
    this.put("session" + identifier, record);
  }

  unusedPreKeyIds(): number[] {
    const ids: number[] = [];
    for (const key of Object.keys(this.data)) {
      if (!key.startsWith("25519KeypreKey")) continue;
      const id = Number(key.slice("25519KeypreKey".length));
      if (Number.isInteger(id)) ids.push(id);
    }
    return ids.sort((a, b) => a - b);
  }

  getMeta(): LocalMeta | null {
    const meta = this.get("meta");
    if (!meta || typeof meta !== "object") return null;
    const rec = meta as LocalMeta;
    if (!rec.userId || !rec.username) return null;
    return rec;
  }

  setMeta(meta: LocalMeta): void {
    this.put("meta", meta);
  }
}

async function getStore(): Promise<DarkeSignalStore> {
  if (storeSingleton) return storeSingleton;
  const store = new DarkeSignalStore();
  await store.hydrate();
  storeSingleton = store;
  return store;
}

export function signalAddress(username: string): SignalProtocolAddress {
  return new SignalProtocolAddress(toSlug(username), SIGNAL_DEVICE_ID);
}

export function isSignalEnvelope(value: unknown): value is SignalEnvelope {
  if (!value || typeof value !== "object") return false;
  const rec = value as SignalEnvelope;
  return (
    rec.v === 1 &&
    rec.proto === "signal" &&
    typeof rec.type === "number" &&
    typeof rec.body === "string" &&
    rec.body.length > 0
  );
}

export function parseSignalPayload(raw: string): SignalEnvelope | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isSignalEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function envelopeFromCipher(msg: MessageType): SignalEnvelope {
  const body = msg.body ?? "";
  return {
    v: 1,
    proto: "signal",
    type: msg.type,
    body: bytesToB64(new TextEncoder().encode(body)),
    registrationId: msg.registrationId,
  };
}

function cipherBodyFromEnvelope(envelope: SignalEnvelope): string {
  return new TextDecoder().decode(b64ToBytes(envelope.body));
}

async function currentAuth(): Promise<{ id: string; username: string } | null> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) return null;
  const username = (await sessionPublicUsername()) ?? "";
  const slug = toSlug(username);
  if (!slug) return null;
  return { id, username: slug };
}

async function generateLocalIdentity(
  store: DarkeSignalStore,
  auth: { id: string; username: string },
): Promise<void> {
  const existing = await store.getIdentityKeyPair();
  if (existing) {
    const meta = store.getMeta();
    if (!meta || meta.userId !== auth.id) {
      store.setMeta({
        userId: auth.id,
        username: auth.username,
        signedPreKeyId: meta?.signedPreKeyId ?? SIGNED_PREKEY_ID,
        signedPreKeySignature: meta?.signedPreKeySignature ?? "",
        nextPreKeyId: meta?.nextPreKeyId ?? SIGNED_PREKEY_ID + 1,
      });
    }
    return;
  }

  const identity = await resolveMaybe(KeyHelper.generateIdentityKeyPair());
  const registrationId = KeyHelper.generateRegistrationId();
  const signed = await resolveMaybe(
    KeyHelper.generateSignedPreKey(identity, SIGNED_PREKEY_ID),
  );
  store.put("identityKey", identity);
  store.put("registrationId", registrationId);
  await store.storeSignedPreKey(SIGNED_PREKEY_ID, signed.keyPair);

  let nextId = SIGNED_PREKEY_ID + 1;
  for (let i = 0; i < SIGNAL_PREKEY_BATCH; i += 1) {
    const pre = await resolveMaybe(KeyHelper.generatePreKey(nextId));
    await store.storePreKey(pre.keyId, pre.keyPair);
    nextId = pre.keyId + 1;
  }

  store.setMeta({
    userId: auth.id,
    username: auth.username,
    signedPreKeyId: SIGNED_PREKEY_ID,
    signedPreKeySignature: bytesToB64(toU8(signed.signature)),
    nextPreKeyId: nextId,
  });

  try {
    window.localStorage.setItem(
      LS_READY,
      JSON.stringify({
        userId: auth.id,
        username: auth.username,
        registrationId,
        at: Date.now(),
      }),
    );
  } catch {
    /* private browsing */
  }
}

async function replenishPreKeys(store: DarkeSignalStore): Promise<void> {
  const unused = store.unusedPreKeyIds();
  if (unused.length >= SIGNAL_PREKEY_FLOOR) return;
  const meta = store.getMeta();
  if (!meta) return;
  let nextId = meta.nextPreKeyId;
  const need = SIGNAL_PREKEY_BATCH - unused.length;
  for (let i = 0; i < need; i += 1) {
    const pre = await resolveMaybe(KeyHelper.generatePreKey(nextId));
    await store.storePreKey(pre.keyId, pre.keyPair);
    nextId = pre.keyId + 1;
  }
  store.setMeta({ ...meta, nextPreKeyId: nextId });
}

export async function syncPublicSignalBundle(): Promise<void> {
  const auth = await currentAuth();
  if (!auth) return;
  const store = await getStore();
  const identity = await store.getIdentityKeyPair();
  const registrationId = await store.getLocalRegistrationId();
  const meta = store.getMeta();
  if (!identity || registrationId == null || !meta?.signedPreKeySignature) {
    return;
  }
  const signedPair = await store.loadSignedPreKey(meta.signedPreKeyId);
  if (!signedPair) return;

  const { error: userError } = await supabase.from("users").upsert(
    {
      id: auth.id,
      username: auth.username,
      identity_key: bytesToB64(toU8(identity.pubKey)),
      registration_id: registrationId,
      signed_prekey_id: meta.signedPreKeyId,
      signed_prekey: bytesToB64(toU8(signedPair.pubKey)),
      signed_prekey_sig: meta.signedPreKeySignature,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (userError) return;

  const ids = store.unusedPreKeyIds();
  const rows: { user_id: string; key_id: number; public_key: string }[] = [];
  for (const keyId of ids) {
    const pair = await store.loadPreKey(keyId);
    if (!pair) continue;
    rows.push({
      user_id: auth.id,
      key_id: keyId,
      public_key: bytesToB64(toU8(pair.pubKey)),
    });
  }
  if (!rows.length) return;
  await supabase.from("prekeys").upsert(rows, {
    onConflict: "user_id,key_id",
    ignoreDuplicates: true,
  });
}

export async function ensureLocalSignalIdentity(): Promise<boolean> {
  if (typeof window === "undefined" || !window.indexedDB) return false;
  if (!bootPromise) {
    bootPromise = (async () => {
      const auth = await currentAuth();
      if (!auth) return false;
      const store = await getStore();
      await generateLocalIdentity(store, auth);
      await replenishPreKeys(store);
      await syncPublicSignalBundle();
      return true;
    })().catch(() => false);
  }
  const ok = await bootPromise;
  if (!ok) bootPromise = null;
  return ok;
}

export async function bootstrapSignalProtocol(): Promise<void> {
  await ensureLocalSignalIdentity();
}

type RemoteBundle = DeviceType<Uint8Array> & { registrationId: number };

async function fetchPeerBundle(username: string): Promise<RemoteBundle | null> {
  const slug = toSlug(username);
  if (!slug) return null;
  const { data: user, error } = await supabase
    .from("users")
    .select(
      "id,username,identity_key,registration_id,signed_prekey_id,signed_prekey,signed_prekey_sig",
    )
    .eq("username", slug)
    .maybeSingle();
  if (error || !user) return null;

  const { data: claimed } = await supabase.rpc("claim_prekey", {
    p_username: slug,
  });
  const oneTime = Array.isArray(claimed) ? claimed[0] : claimed;
  const preKey =
    oneTime &&
    typeof oneTime === "object" &&
    typeof (oneTime as { key_id?: unknown }).key_id === "number" &&
    typeof (oneTime as { public_key?: unknown }).public_key === "string"
      ? {
          keyId: (oneTime as { key_id: number }).key_id,
          publicKey: b64ToBytes((oneTime as { public_key: string }).public_key),
        }
      : undefined;

  return {
    identityKey: b64ToBytes(String(user.identity_key)),
    registrationId: Number(user.registration_id),
    signedPreKey: {
      keyId: Number(user.signed_prekey_id),
      publicKey: b64ToBytes(String(user.signed_prekey)),
      signature: b64ToBytes(String(user.signed_prekey_sig)),
    },
    ...(preKey ? { preKey } : {}),
  };
}

export async function ensureSession(peerUsername: string): Promise<boolean> {
  const ready = await ensureLocalSignalIdentity();
  if (!ready) return false;
  const slug = toSlug(peerUsername);
  if (!slug) return false;
  const store = await getStore();
  const address = signalAddress(slug);
  const cipher = new SessionCipher(store, address);
  if (await cipher.hasOpenSession()) return true;
  const bundle = await fetchPeerBundle(slug);
  if (!bundle) return false;
  const builder = new SessionBuilder(store, address);
  await builder.processPreKey(bundle);
  return cipher.hasOpenSession();
}

export async function wrapTextPayload(
  peerUsername: string,
  plaintext: string,
): Promise<string> {
  const text = plaintext ?? "";
  if (!text) return text;
  try {
    const ok = await ensureSession(peerUsername);
    if (!ok) return text;
    const store = await getStore();
    const cipher = new SessionCipher(store, signalAddress(peerUsername));
    const encrypted = await cipher.encrypt(new TextEncoder().encode(text));
    return JSON.stringify(envelopeFromCipher(encrypted));
  } catch {
    return text;
  }
}

export async function unwrapTextPayload(
  peerUsername: string,
  payload: string,
): Promise<string> {
  const envelope = parseSignalPayload(payload);
  if (!envelope) return payload;
  try {
    await ensureLocalSignalIdentity();
    const store = await getStore();
    const cipher = new SessionCipher(store, signalAddress(peerUsername));
    const body = cipherBodyFromEnvelope(envelope);
    const plain =
      envelope.type === EncryptionResultMessageType.PreKeyWhisperMessage
        ? await cipher.decryptPreKeyWhisperMessage(body, "binary")
        : await cipher.decryptWhisperMessage(body, "binary");
    return new TextDecoder().decode(plain);
  } catch {
    return payload;
  }
}
