import {
  Direction,
  EncryptionResultMessageType,
  KeyHelper,
  proto,
  SenderKeyName,
  SenderKeyRecord,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  type DeviceType,
  type KeyPairType,
  type MessageType,
  type SenderKeyStore,
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

/** Double Ratchet header carried beside the libsignal protobuf body. */
export type RatchetHeader = {
  /** Sender DH / ephemeral ratchet public key (base64). */
  dh: string;
  /** Message number in the current sending chain. */
  n: number;
  /** Length of the previous sending chain (PN). */
  pn: number;
};

export type SignalEnvelope = {
  v: 1 | 2;
  proto: "signal";
  type: number;
  body: string;
  registrationId?: number;
  header?: RatchetHeader;
};

export type PublicPreKeyBundle = {
  username: string;
  identityKey: Uint8Array;
  registrationId: number;
  signedPreKey: {
    keyId: number;
    publicKey: Uint8Array;
    signature: Uint8Array;
  };
  oneTimePreKey?: { keyId: number; publicKey: Uint8Array };
};

const peerLocks = new Map<string, Promise<unknown>>();

function withPeerLock<T>(peer: string, job: () => Promise<T>): Promise<T> {
  const key = toSlug(peer);
  const prior = peerLocks.get(key) ?? Promise.resolve();
  const next = prior.then(job, job);
  peerLocks.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

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

class DarkeSignalStore implements StorageType, SenderKeyStore {
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

  private persistChain: Promise<void> = Promise.resolve();

  private schedulePersist(): void {
    if (typeof window === "undefined") return;
    if (this.persistTimer != null) window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, 20);
  }

  persistNow(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    if (this.persistTimer != null) {
      window.clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const snapshot = JSON.stringify(encodeStoreValue(this.data));
    this.persistChain = this.persistChain
      .then(() => idbSet("dump", snapshot))
      .catch(() => undefined);
    return this.persistChain;
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
    await this.persistNow();
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
    await this.persistNow();
  }

  async removePreKey(keyId: number | string): Promise<void> {
    this.remove("25519KeypreKey" + keyId);
    await this.persistNow();
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
    await this.persistNow();
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
    await this.persistNow();
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

  async storeSenderKey(
    senderKeyName: SenderKeyName,
    record: SenderKeyRecord,
  ): Promise<void> {
    const encoded = SenderKeyRecord.encode(record).finish();
    this.put(`senderKey:${senderKeyName.toString()}`, bytesToB64(encoded));
    await this.persistNow();
  }

  async loadSenderKey(senderKeyName: SenderKeyName): Promise<SenderKeyRecord> {
    const raw = this.get(`senderKey:${senderKeyName.toString()}`);
    if (typeof raw !== "string" || !raw) return new SenderKeyRecord();
    try {
      return SenderKeyRecord.decode(b64ToBytes(raw));
    } catch {
      return new SenderKeyRecord();
    }
  }
}

export async function getSignalStore(): Promise<DarkeSignalStore> {
  if (storeSingleton) return storeSingleton;
  const store = new DarkeSignalStore();
  await store.hydrate();
  storeSingleton = store;
  if (typeof window !== "undefined") {
    const flush = () => {
      void store.persistNow();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
  }
  return store;
}

export async function hasOpenSignalSession(
  peerUsername: string,
): Promise<boolean> {
  const slug = toSlug(peerUsername);
  if (!slug || typeof window === "undefined") return false;
  try {
    await ensureLocalSignalIdentity();
    const store = await getSignalStore();
    const cipher = new SessionCipher(store, signalAddress(slug));
    return cipher.hasOpenSession();
  } catch {
    return false;
  }
}

export function signalAddress(username: string): SignalProtocolAddress {
  return new SignalProtocolAddress(toSlug(username), SIGNAL_DEVICE_ID);
}

export function isSignalEnvelope(value: unknown): value is SignalEnvelope {
  if (!value || typeof value !== "object") return false;
  const rec = value as SignalEnvelope;
  return (
    (rec.v === 1 || rec.v === 2) &&
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

export function isSignalV2Ciphertext(raw: string): boolean {
  const envelope = parseSignalPayload(raw);
  return Boolean(envelope && envelope.v === 2 && envelope.proto === "signal");
}

function binaryStringToBytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) out[i] = value.charCodeAt(i) & 0xff;
  return out;
}

type WhisperFields = {
  ratchetKey?: Uint8Array;
  counter?: number;
  previousCounter?: number;
};

function decodeWhisper(bytes: Uint8Array): WhisperFields | null {
  const ts = (
    proto as {
      textsecure?: {
        SignalMessage: { decode: (b: Uint8Array) => WhisperFields };
        PreKeySignalMessage: { decode: (b: Uint8Array) => { message?: Uint8Array } };
      };
    }
  ).textsecure;
  if (!ts) return null;
  try {
    if (bytes.length < 10) return null;
    return ts.SignalMessage.decode(bytes.subarray(1, bytes.length - 8));
  } catch {
    return null;
  }
}

function ratchetHeaderFromCipher(msg: MessageType): RatchetHeader | undefined {
  const body = msg.body ?? "";
  if (!body) return undefined;
  const raw = binaryStringToBytes(body);
  const ts = (
    proto as {
      textsecure?: {
        SignalMessage: { decode: (b: Uint8Array) => WhisperFields };
        PreKeySignalMessage: {
          decode: (b: Uint8Array) => { message?: Uint8Array };
        };
      };
    }
  ).textsecure;
  if (!ts) return undefined;
  try {
    let whisper = raw;
    if (msg.type === EncryptionResultMessageType.PreKeyWhisperMessage) {
      const pre = ts.PreKeySignalMessage.decode(raw.subarray(1));
      if (!pre.message || pre.message.length < 10) return undefined;
      whisper = pre.message;
    }
    const fields = decodeWhisper(whisper);
    if (!fields?.ratchetKey) return undefined;
    return {
      dh: bytesToB64(toU8(fields.ratchetKey)),
      n: Number(fields.counter ?? 0),
      pn: Number(fields.previousCounter ?? 0),
    };
  } catch {
    return undefined;
  }
}

function envelopeFromCipher(msg: MessageType): SignalEnvelope {
  const body = msg.body ?? "";
  const header = ratchetHeaderFromCipher(msg);
  return {
    v: 2,
    proto: "signal",
    type: msg.type,
    body: bytesToB64(new TextEncoder().encode(body)),
    registrationId: msg.registrationId,
    ...(header ? { header } : {}),
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
  const store = await getSignalStore();
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
      const store = await getSignalStore();
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

function toDeviceType(bundle: PublicPreKeyBundle): DeviceType<Uint8Array> {
  return {
    identityKey: bundle.identityKey,
    registrationId: bundle.registrationId,
    signedPreKey: bundle.signedPreKey,
    ...(bundle.oneTimePreKey ? { preKey: bundle.oneTimePreKey } : {}),
  };
}

/**
 * Fetch a recipient's public X3DH prekey bundle from Supabase
 * (`users` identity + signed prekey, `prekeys` one-time key via claim_prekey).
 */
export async function fetchRecipientPreKeyBundle(
  username: string,
): Promise<PublicPreKeyBundle | null> {
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
  if (
    !String(user.identity_key || "").trim() ||
    !String(user.signed_prekey || "").trim() ||
    !String(user.signed_prekey_sig || "").trim()
  ) {
    return null;
  }

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
    username: slug,
    identityKey: b64ToBytes(String(user.identity_key)),
    registrationId: Number(user.registration_id),
    signedPreKey: {
      keyId: Number(user.signed_prekey_id),
      publicKey: b64ToBytes(String(user.signed_prekey)),
      signature: b64ToBytes(String(user.signed_prekey_sig)),
    },
    ...(preKey ? { oneTimePreKey: preKey } : {}),
  };
}

/**
 * X3DH handshake: consume the peer bundle and persist a Double Ratchet
 * session whose root key is the X3DH shared master secret.
 */
export async function initializeX3DHSession(
  peerUsername: string,
): Promise<boolean> {
  const ready = await ensureLocalSignalIdentity();
  if (!ready) return false;
  const slug = toSlug(peerUsername);
  if (!slug) return false;
  const store = await getSignalStore();
  const address = signalAddress(slug);
  const cipher = new SessionCipher(store, address);
  if (await cipher.hasOpenSession()) return true;
  const bundle = await fetchRecipientPreKeyBundle(slug);
  if (!bundle) return false;
  const builder = new SessionBuilder(store, address);
  await builder.processPreKey(toDeviceType(bundle));
  return cipher.hasOpenSession();
}

export async function ensureSession(peerUsername: string): Promise<boolean> {
  return initializeX3DHSession(peerUsername);
}

async function encryptEnvelope(
  peerUsername: string,
  bytes: Uint8Array,
): Promise<string | null> {
  if (!bytes.length) return null;
  return withPeerLock(peerUsername, async () => {
    try {
      const ok = await initializeX3DHSession(peerUsername);
      if (!ok) return null;
      const store = await getSignalStore();
      const cipher = new SessionCipher(store, signalAddress(peerUsername));
      const encrypted = await cipher.encrypt(bytes);
      const envelope = envelopeFromCipher(encrypted);
      if (envelope.v !== 2 || envelope.proto !== "signal" || !envelope.body) {
        return null;
      }
      return JSON.stringify(envelope);
    } catch {
      return null;
    }
  });
}

async function decryptEnvelope(
  peerUsername: string,
  payload: string,
): Promise<Uint8Array | null> {
  const envelope = parseSignalPayload(payload);
  if (!envelope) return null;
  return withPeerLock(peerUsername, async () => {
    try {
      await ensureLocalSignalIdentity();
      const store = await getSignalStore();
      const cipher = new SessionCipher(store, signalAddress(peerUsername));
      const body = cipherBodyFromEnvelope(envelope);
      const plain =
        envelope.type === EncryptionResultMessageType.PreKeyWhisperMessage
          ? await cipher.decryptPreKeyWhisperMessage(body, "binary")
          : await cipher.decryptWhisperMessage(body, "binary");
      return plain instanceof Uint8Array ? plain : new Uint8Array(plain);
    } catch {
      return null;
    }
  });
}

export async function peekPublishedPreKeyBundle(
  username: string,
): Promise<boolean> {
  const slug = toSlug(username);
  if (!slug) return false;
  const { data, error } = await supabase
    .from("users")
    .select("identity_key,signed_prekey,signed_prekey_sig,registration_id")
    .eq("username", slug)
    .maybeSingle();
  if (error || !data) return false;
  return (
    String(data.identity_key || "").length > 8 &&
    String(data.signed_prekey || "").length > 8 &&
    String(data.signed_prekey_sig || "").length > 8 &&
    Number(data.registration_id) > 0
  );
}

export async function recipientCanReceiveSignal(
  username: string,
): Promise<boolean> {
  if (await hasOpenSignalSession(username)) return true;
  return peekPublishedPreKeyBundle(username);
}

export async function wrapTextPayload(
  peerUsername: string,
  plaintext: string,
): Promise<string | null> {
  const text = plaintext ?? "";
  if (!text) return null;
  return encryptEnvelope(peerUsername, new TextEncoder().encode(text));
}

export async function wrapBytesPayload(
  peerUsername: string,
  bytes: Uint8Array,
): Promise<string | null> {
  return encryptEnvelope(peerUsername, bytes);
}

export async function unwrapTextPayload(
  peerUsername: string,
  payload: string,
): Promise<string | null> {
  const plain = await decryptEnvelope(peerUsername, payload);
  if (!plain) return null;
  return new TextDecoder().decode(plain);
}

export async function unwrapBytesPayload(
  peerUsername: string,
  payload: string,
): Promise<Uint8Array | null> {
  return decryptEnvelope(peerUsername, payload);
}
