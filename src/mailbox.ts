import {
  isSignalV2Ciphertext,
  recipientCanReceiveSignal,
  unwrapBytesPayload,
  unwrapTextPayload,
  wrapBytesPayload,
  wrapTextPayload,
} from "./lib/crypto/signal";
import { toSlug } from "./slug";
import { supabase } from "./supabase";

export const MAILBOX_BUCKET = "pending-mailbox";

export type MailboxKind = "text" | "file";

export type MailboxPlain = {
  v: 2;
  sessionKey: string;
  kind: MailboxKind;
  body?: string;
  fileName?: string;
  mime?: string;
};

export type MailboxEnqueue =
  | { ok: true; id: string }
  | { ok: false; reason: "pending-keys" | "error" };

export type MailboxRow = {
  id: string;
  recipient_username: string;
  sender_username: string;
  encrypted_content: string | null;
  file_path: string | null;
  created_at: string;
};

function parseInner(raw: string): MailboxPlain | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MailboxPlain>;
    if (
      parsed.v !== 2 ||
      typeof parsed.sessionKey !== "string" ||
      (parsed.kind !== "text" && parsed.kind !== "file")
    ) {
      return null;
    }
    return {
      v: 2,
      sessionKey: parsed.sessionKey,
      kind: parsed.kind,
      body: parsed.body,
      fileName: parsed.fileName,
      mime: parsed.mime,
    };
  } catch {
    return null;
  }
}

function ciphertextLeaksPlaintext(blob: string, secret: string): boolean {
  const needle = secret.trim();
  return needle.length >= 8 && blob.includes(needle);
}

async function insertCiphertextOnly(opts: {
  sender: string;
  recipient: string;
  ciphertext: string;
  secrets: string[];
  filePath?: string | null;
}): Promise<MailboxEnqueue> {
  if (!isSignalV2Ciphertext(opts.ciphertext)) {
    return { ok: false, reason: "pending-keys" };
  }
  for (const secret of opts.secrets) {
    if (ciphertextLeaksPlaintext(opts.ciphertext, secret)) {
      return { ok: false, reason: "error" };
    }
  }
  const { data, error } = await supabase
    .from("pending_messages")
    .insert({
      recipient_username: toSlug(opts.recipient),
      sender_username: toSlug(opts.sender),
      encrypted_content: opts.ciphertext,
      file_path: opts.filePath ?? null,
    })
    .select("id")
    .single();
  if (error || !data?.id) return { ok: false, reason: "error" };
  return { ok: true, id: data.id as string };
}

async function wrapMailboxInner(
  recipient: string,
  inner: MailboxPlain,
  secrets: string[],
): Promise<MailboxEnqueue & { envelope?: string }> {
  if (!(await recipientCanReceiveSignal(recipient))) {
    return { ok: false, reason: "pending-keys" };
  }
  const envelope = await wrapTextPayload(recipient, JSON.stringify(inner));
  if (!envelope || !isSignalV2Ciphertext(envelope)) {
    return { ok: false, reason: "pending-keys" };
  }
  for (const secret of secrets) {
    if (ciphertextLeaksPlaintext(envelope, secret)) {
      return { ok: false, reason: "error" };
    }
  }
  return { ok: true, id: "", envelope };
}

export async function queueMailboxMessage(opts: {
  sender: string;
  recipient: string;
  sessionKey: string;
  body: string;
}): Promise<MailboxEnqueue> {
  const text = opts.body.trim();
  if (!text) return { ok: false, reason: "error" };
  const packed = await wrapMailboxInner(
    opts.recipient,
    {
      v: 2,
      sessionKey: opts.sessionKey,
      kind: "text",
      body: text,
    },
    [text],
  );
  if (!packed.ok || !packed.envelope) return packed;
  return insertCiphertextOnly({
    sender: opts.sender,
    recipient: opts.recipient,
    ciphertext: packed.envelope,
    secrets: [text],
  });
}

export async function queueMailboxFile(opts: {
  sender: string;
  recipient: string;
  sessionKey: string;
  file: File;
}): Promise<MailboxEnqueue> {
  const recipient = toSlug(opts.recipient);
  if (!(await recipientCanReceiveSignal(opts.recipient))) {
    return { ok: false, reason: "pending-keys" };
  }
  const buf = new Uint8Array(await opts.file.arrayBuffer());
  const fileEnvelope = await wrapBytesPayload(opts.recipient, buf);
  if (!fileEnvelope || !isSignalV2Ciphertext(fileEnvelope)) {
    return { ok: false, reason: "pending-keys" };
  }
  const packed = await wrapMailboxInner(
    opts.recipient,
    {
      v: 2,
      sessionKey: opts.sessionKey,
      kind: "file",
      fileName: opts.file.name,
      mime: opts.file.type || "application/octet-stream",
    },
    [opts.file.name],
  );
  if (!packed.ok || !packed.envelope) return packed;
  const id = crypto.randomUUID();
  const path = `${recipient}/${id}.enc`;
  const up = await supabase.storage.from(MAILBOX_BUCKET).upload(
    path,
    new Blob([fileEnvelope], { type: "application/octet-stream" }),
    {
      contentType: "application/octet-stream",
      upsert: false,
    },
  );
  if (up.error) return { ok: false, reason: "error" };
  const inserted = await insertCiphertextOnly({
    sender: opts.sender,
    recipient,
    ciphertext: packed.envelope,
    secrets: [opts.file.name],
    filePath: path,
  });
  if (!inserted.ok) {
    await supabase.storage.from(MAILBOX_BUCKET).remove([path]).catch(() => null);
  }
  return inserted;
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

const claimedMailboxIds = new Set<string>();
let mailboxFetchChain: Promise<unknown> = Promise.resolve();

export async function fetchAndPurgeMailbox(
  recipient: string,
): Promise<FetchedMailbox[]> {
  const run = mailboxFetchChain.then(() => loadAndPurgeMailbox(recipient));
  mailboxFetchChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function loadAndPurgeMailbox(
  recipient: string,
): Promise<FetchedMailbox[]> {
  const { data, error } = await supabase
    .from("pending_messages")
    .select(
      "id,recipient_username,sender_username,encrypted_content,file_path,created_at",
    )
    .eq("recipient_username", toSlug(recipient))
    .order("created_at", { ascending: true });
  if (error || !Array.isArray(data)) return [];
  const out: FetchedMailbox[] = [];
  for (const raw of data) {
    const row = raw as MailboxRow;
    try {
      if (claimedMailboxIds.has(row.id)) continue;
      const blob = row.encrypted_content ?? "";
      if (!isSignalV2Ciphertext(blob)) continue;
      const opened = await unwrapTextPayload(row.sender_username, blob);
      if (!opened) continue;
      const meta = parseInner(opened);
      if (!meta) continue;
      let fileUrl: string | undefined;
      let fileSize: number | undefined;
      if (row.file_path && meta.kind === "file") {
        const down = await supabase.storage
          .from(MAILBOX_BUCKET)
          .download(row.file_path);
        const packed = down.data ? await down.data.text() : "";
        if (!packed || !isSignalV2Ciphertext(packed)) continue;
        const fileBytes = await unwrapBytesPayload(
          row.sender_username,
          packed,
        );
        if (!fileBytes) continue;
        const file = new Blob([fileBytes], {
          type: meta.mime || "application/octet-stream",
        });
        fileUrl = URL.createObjectURL(file);
        fileSize = file.size;
      }
      claimedMailboxIds.add(row.id);
      out.push({
        id: row.id,
        sender: row.sender_username,
        sessionKey: meta.sessionKey,
        kind: meta.kind,
        body:
          meta.kind === "file"
            ? meta.fileName || "Encrypted file"
            : meta.body || "",
        fileName: meta.fileName,
        fileUrl,
        fileSize,
        at: Date.parse(row.created_at) || Date.now(),
      });
      await purgeRow(row);
    } catch {
      /* leave opaque ciphertext until this device can decrypt */
    }
  }
  return out;
}
