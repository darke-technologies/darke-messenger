import { argon2idAsync } from "@noble/hashes/argon2.js";
import { darkeIdAuthLocal } from "./darkeId";

const PBKDF2_ITERS = 120_000;
const ARGON_OPTS = {
  t: 2,
  m: 19_456,
  p: 1,
  dkLen: 64,
  maxmem: 64 * 1024 * 1024,
};
const DB_NAME = "darke.vault";
const STORE = "identity";
const WRAP_SALT_PREFIX = "darke-wrap-v1:";
const AUTH_SALT_PREFIX = "darke-auth-v1:";

export type VaultRecord = {
  darkeId: string;
  iv: string;
  ciphertext: string;
  publicKey: string;
  createdAt: string;
  kdf?: "argon2id" | "pbkdf2";
};

export type UnlockedKeys = {
  publicKey: string;
  privateKeyPkcs8: Uint8Array;
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

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

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function argonSaltBytes(salt: string): Uint8Array {
  const raw = utf8(salt);
  if (raw.length >= 8) return raw;
  const pad = utf8("darke.kdf.v1:");
  const out = new Uint8Array(pad.length + raw.length);
  out.set(pad);
  out.set(raw, pad.length);
  return out;
}

async function argonMaterial(
  passphrase: string,
  salt: string,
): Promise<Uint8Array> {
  const raw = utf8(salt);
  const saltInput = raw.length >= 8 ? salt : argonSaltBytes(salt);
  const out = await argon2idAsync(passphrase, saltInput, ARGON_OPTS);
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}

async function aesKeyFromBytes(
  bits: Uint8Array,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    bits.slice(0, 32) as BufferSource,
    { name: "AES-GCM" },
    false,
    usages,
  );
}

async function pbkdf2Key(
  passphrase: string,
  salt: Uint8Array,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    utf8(passphrase),
    "PBKDF2",
    false,
    ["deriveKey", "deriveBits"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

async function pbkdf2Bits(
  passphrase: string,
  salt: Uint8Array,
  length = 256,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    utf8(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERS,
      hash: "SHA-256",
    },
    material,
    length,
  );
  return new Uint8Array(bits);
}

export async function deriveAuthPassword(
  darkeId: string,
  passphrase: string,
): Promise<string> {
  const bits = await argonMaterial(passphrase, darkeIdAuthLocal(darkeId));
  return bytesToHex(bits.slice(32));
}

async function deriveAuthPasswordLegacy(
  darkeId: string,
  passphrase: string,
): Promise<string> {
  const bits = await pbkdf2Bits(
    passphrase,
    utf8(AUTH_SALT_PREFIX + darkeIdAuthLocal(darkeId)),
  );
  return bytesToHex(bits);
}

export async function authSecretsForLogin(
  passphrase: string,
  darkeId?: string | null,
): Promise<string[]> {
  if (!darkeId) return [];
  const local = darkeIdAuthLocal(darkeId);
  const argon = await deriveAuthPassword(darkeId, passphrase);
  const prefixed = bytesToHex(
    (await argonMaterial(passphrase, AUTH_SALT_PREFIX + local)).slice(32),
  );
  const legacy = await deriveAuthPasswordLegacy(darkeId, passphrase);
  const out = [argon];
  if (!out.includes(prefixed)) out.push(prefixed);
  if (!out.includes(legacy)) out.push(legacy);
  const raw = passphrase.trim() || passphrase;
  if (raw.length >= 6 && !out.includes(raw)) out.push(raw);
  return out;
}

function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "darkeId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("Could not open DARKE ID vault."));
  });
}

async function putRecord(record: VaultRecord): Promise<void> {
  const db = await openVault();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("Could not save DARKE ID key."));
    tx.objectStore(STORE).put(record);
  });
  db.close();
}

async function getRecord(darkeId: string): Promise<VaultRecord | null> {
  const db = await openVault();
  const row = await new Promise<VaultRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(darkeId);
    req.onsuccess = () => resolve((req.result as VaultRecord | undefined) ?? null);
    req.onerror = () =>
      reject(req.error ?? new Error("Could not read DARKE ID key."));
  });
  db.close();
  return row;
}

export async function createAndStoreIdentityKeys(
  darkeId: string,
  passphrase: string,
): Promise<{ publicKey: string }> {
  const wrapBits = await argonMaterial(passphrase, darkeIdAuthLocal(darkeId));
  const wrapKey = await aesKeyFromBytes(wrapBits, ["encrypt"]);
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, pkcs8),
  );
  const publicKey = bytesToHex(spki);
  await putRecord({
    darkeId,
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(sealed),
    publicKey,
    createdAt: new Date().toISOString(),
    kdf: "argon2id",
  });
  rememberPrivateKey(pkcs8);
  return { publicKey };
}

async function unwrapRecord(
  record: VaultRecord,
  wrapKey: CryptoKey,
): Promise<Uint8Array> {
  const iv = b64ToBytes(record.iv);
  const sealed = b64ToBytes(record.ciphertext);
  const opened = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    wrapKey,
    sealed as BufferSource,
  );
  return new Uint8Array(opened);
}

export async function unlockIdentityKeys(
  darkeId: string,
  passphrase: string,
): Promise<UnlockedKeys | null> {
  const record = await getRecord(darkeId).catch(() => null);
  if (!record) return null;
  const attempts: Array<() => Promise<CryptoKey>> = [
    async () =>
      aesKeyFromBytes(
        await argonMaterial(passphrase, darkeIdAuthLocal(darkeId)),
        ["decrypt"],
      ),
    async () =>
      aesKeyFromBytes(
        await argonMaterial(
          passphrase,
          WRAP_SALT_PREFIX + darkeIdAuthLocal(darkeId),
        ),
        ["decrypt"],
      ),
    async () =>
      pbkdf2Key(
        passphrase,
        utf8(WRAP_SALT_PREFIX + darkeIdAuthLocal(darkeId)),
        ["decrypt"],
      ),
  ];
  for (const makeKey of attempts) {
    try {
      const wrapKey = await makeKey();
      const privateKeyPkcs8 = await unwrapRecord(record, wrapKey);
      rememberPrivateKey(privateKeyPkcs8);
      return { publicKey: record.publicKey, privateKeyPkcs8 };
    } catch {
      // Try the next KDF.
    }
  }
  return null;
}

let privateKeyMemory: Uint8Array | null = null;

export async function readVaultRecord(
  darkeId: string,
): Promise<VaultRecord | null> {
  return getRecord(darkeId);
}

export async function importVaultRecord(payload: unknown): Promise<{
  darkeId: string;
  handle: string | null;
}> {
  const p = payload as {
    darkeId?: unknown;
    handle?: unknown;
    record?: Partial<VaultRecord> | null;
  };
  const rawId = String(p.darkeId ?? p.record?.darkeId ?? "");
  const compact = rawId.trim().toUpperCase().replace(/[\s_]/g, "");
  const digits = compact.replace(/^DARKE-/, "").replace(/-/g, "");
  if (!/^\d{16}$/.test(digits)) {
    throw new Error("Invalid .darke key file.");
  }
  const darkeId = `DARKE-${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}-${digits.slice(12, 16)}`;
  const record = p.record;
  if (
    record &&
    typeof record.iv === "string" &&
    typeof record.ciphertext === "string" &&
    typeof record.publicKey === "string"
  ) {
    await putRecord({
      darkeId,
      iv: record.iv,
      ciphertext: record.ciphertext,
      publicKey: record.publicKey,
      createdAt:
        typeof record.createdAt === "string"
          ? record.createdAt
          : new Date().toISOString(),
      kdf: record.kdf === "pbkdf2" ? "pbkdf2" : "argon2id",
    });
  }
  return {
    darkeId,
    handle: typeof p.handle === "string" && p.handle ? p.handle : null,
  };
}

export function rememberPrivateKey(bytes: Uint8Array | null): void {
  privateKeyMemory = bytes;
}

export function getLivePrivateKey(): Uint8Array | null {
  return privateKeyMemory;
}

export function clearLivePrivateKey(): void {
  if (privateKeyMemory) privateKeyMemory.fill(0);
  privateKeyMemory = null;
}
