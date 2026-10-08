import { getLivePrivateKey } from "./darkeKeys";
import { unwrapTextPayload, wrapTextPayload } from "./lib/crypto/signal";
import { loadProfileByUsername } from "./profile";
import { toSlug } from "./slug";
import { supabase } from "./supabase";

export const MAILBOX_BUCKET = "pending-mailbox";

export type MailboxKind = "text" | "file";

export type MailboxPlain = {
  v: 1;
  sessionKey: string;
  kind: MailboxKind;
  body?: string;
  fileName?: string;
  mime?: string;
};

export type MailboxRow = {
  id: string;
  recipient_username: string;
  sender_username: string;
  encrypted_content: string | null;
  file_path: string | null;
  created_at: string;
};

type Seal = { eph: string; iv: string; ct: string };

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

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-f]/gi, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function importRecipientPublic(hex: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    hexToBytes(hex) as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

async function importPrivate(pkcs8: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8 as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
}

async function aesFromBits(
  bits: ArrayBuffer,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    bits.slice(0, 32),
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

async function sealBytes(
  plain: Uint8Array,
  recipientPubHex: string,
): Promise<Seal> {
  const recipient = await importRecipientPublic(recipientPubHex);
  const eph = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipient },
    eph.privateKey,
    256,
  );
  const key = await aesFromBits(bits, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plain as BufferSource,
    ),
  );
  const ephSpki = new Uint8Array(
    await crypto.subtle.exportKey("spki", eph.publicKey),
  );
  return {
    eph: bytesToB64(ephSpki),
    iv: bytesToB64(iv),
    ct: bytesToB64(ct),
  };
}

async function openSeal(
  seal: Seal,
  privatePkcs8: Uint8Array,
): Promise<Uint8Array> {
  const eph = await crypto.subtle.importKey(
    "spki",
    b64ToBytes(seal.eph) as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const mine = await importPrivate(privatePkcs8);
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: eph },
    mine,
    256,
  );
  const key = await aesFromBits(bits, ["decrypt"]);
  const iv = b64ToBytes(seal.iv);
  const opened = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    b64ToBytes(seal.ct) as BufferSource,
  );
  return new Uint8Array(opened);
}

function parseSeal(raw: string): Seal | null {
  try {
    const parsed = JSON.parse(raw) as Partial<Seal>;
    if (
      typeof parsed.eph === "string" &&
      typeof parsed.iv === "string" &&
      typeof parsed.ct === "string"
    ) {
      return { eph: parsed.eph, iv: parsed.iv, ct: parsed.ct };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function loadRecipientPublicKey(
  username: string,
): Promise<string | null> {
  const profile = await loadProfileByUsername(username).catch(() => null);
  const key = profile?.public_key?.trim() || null;
  return key && key.length > 16 ? key : null;
}

export async function queueMailboxMessage(opts: {
  sender: string;
  recipient: string;
  sessionKey: string;
  body: string;
}): Promise<string | null> {
  const pub = await loadRecipientPublicKey(opts.recipient);
  if (!pub) return null;
  const cipherBody = await wrapTextPayload(opts.recipient, opts.body);
  const plain: MailboxPlain = {
    v: 1,
    sessionKey: opts.sessionKey,
    kind: "text",
    body: cipherBody,
  };
  const seal = await sealBytes(
    new TextEncoder().encode(JSON.stringify(plain)),
    pub,
  );
  const { data, error } = await supabase
    .from("pending_messages")
    .insert({
      recipient_username: toSlug(opts.recipient),
      sender_username: toSlug(opts.sender),
      encrypted_content: JSON.stringify(seal),
      file_path: null,
    })
    .select("id")
    .single();
  if (error || !data?.id) return null;
  return data.id as string;
}

export async function queueMailboxFile(opts: {
  sender: string;
  recipient: string;
  sessionKey: string;
  file: File;
}): Promise<string | null> {
  const pub = await loadRecipientPublicKey(opts.recipient);
  if (!pub) return null;
  const id = crypto.randomUUID();
  const recipient = toSlug(opts.recipient);
  const path = `${recipient}/${id}.enc`;
  const buf = new Uint8Array(await opts.file.arrayBuffer());
  const fileSeal = await sealBytes(buf, pub);
  const blob = new Blob([JSON.stringify(fileSeal)], {
    type: "application/octet-stream",
  });
  const up = await supabase.storage.from(MAILBOX_BUCKET).upload(path, blob, {
    contentType: "application/octet-stream",
    upsert: false,
  });
  if (up.error) return null;
  const meta: MailboxPlain = {
    v: 1,
    sessionKey: opts.sessionKey,
    kind: "file",
    fileName: opts.file.name,
    mime: opts.file.type || "application/octet-stream",
  };
  const metaSeal = await sealBytes(
    new TextEncoder().encode(JSON.stringify(meta)),
    pub,
  );
  const { data, error } = await supabase
    .from("pending_messages")
    .insert({
      recipient_username: recipient,
      sender_username: toSlug(opts.sender),
      encrypted_content: JSON.stringify(metaSeal),
      file_path: path,
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    await supabase.storage.from(MAILBOX_BUCKET).remove([path]).catch(() => null);
    return null;
  }
  return data.id as string;
}

async function purgeRow(row: MailboxRow): Promise<void> {
  if (row.file_path) {
    await supabase.storage
      .from(MAILBOX_BUCKET)
      .remove([row.file_path])
      .catch(() => null);
  }
  await supabase.from("pending_messages").delete().eq("id", row.id);
}

export async function listSentMailboxIds(sender: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("pending_messages")
    .select("id")
    .eq("sender_username", toSlug(sender));
  if (error || !Array.isArray(data)) return new Set();
  return new Set(
    data
      .map((row) => (typeof row.id === "string" ? row.id : ""))
      .filter(Boolean),
  );
}

export type FetchedMailbox = {
  id: string;
  sender: string;
  sessionKey: string;
  kind: MailboxKind;
  body: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  at: number;
};

export async function fetchAndPurgeMailbox(
  recipient: string,
): Promise<FetchedMailbox[]> {
  const privateKey = getLivePrivateKey();
  if (!privateKey) return [];
  const { data, error } = await supabase
    .from("pending_messages")
    .select("id,recipient_username,sender_username,encrypted_content,file_path,created_at")
    .eq("recipient_username", toSlug(recipient))
    .order("created_at", { ascending: true });
  if (error || !Array.isArray(data)) return [];
  const out: FetchedMailbox[] = [];
  for (const raw of data) {
    const row = raw as MailboxRow;
    try {
      const seal = parseSeal(row.encrypted_content ?? "");
      if (!seal) {
        await purgeRow(row);
        continue;
      }
      const opened = await openSeal(seal, privateKey);
      const meta = JSON.parse(new TextDecoder().decode(opened)) as MailboxPlain;
      let fileUrl: string | undefined;
      let fileSize: number | undefined;
      if (row.file_path && meta.kind === "file") {
        const down = await supabase.storage
          .from(MAILBOX_BUCKET)
          .download(row.file_path);
        if (down.data) {
          const packed = JSON.parse(await down.data.text()) as Seal;
          const fileBytes = await openSeal(packed, privateKey);
          const blob = new Blob([fileBytes], {
            type: meta.mime || "application/octet-stream",
          });
          fileUrl = URL.createObjectURL(blob);
          fileSize = blob.size;
        }
      }
      const openedBody =
        meta.kind === "file"
          ? meta.fileName || "Encrypted file"
          : await unwrapTextPayload(row.sender_username, meta.body || "");
      out.push({
        id: row.id,
        sender: row.sender_username,
        sessionKey: meta.sessionKey,
        kind: meta.kind,
        body: openedBody,
        fileName: meta.fileName,
        fileUrl,
        fileSize,
        at: Date.parse(row.created_at) || Date.now(),
      });
      await purgeRow(row);
    } catch {
      /* leave for a later pass if keys are not ready */
    }
  }
  return out;
}
