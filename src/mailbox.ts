import {
  isSignalV2Ciphertext,
  recipientCanReceiveSignal,
  unwrapBytesPayload,
  unwrapTextPayload,
  wrapBytesPayload,
  wrapTextPayload,
} from "./lib/crypto/signal";
import {
  isSignalSenderKeyCiphertext,
  processRoomSenderDistribution,
  unwrapRoomSenderKeyPayload,
  wrapRoomSenderKeyPayload,
} from "./lib/crypto/signalRooms";
import {
  inspectClientDecrypt,
  inspectRelayInsert,
} from "./lib/crypto/e2eeInspect";
import { toSlug } from "./slug";
import { supabase } from "./supabase";

export const MAILBOX_BUCKET = "pending-mailbox";

export type MailboxKind =
  | "text"
  | "file"
  | "edit"
  | "delete"
  | "pin"
  | "skdm"
  | "room"
  | "room-join";

export type MailboxPlain = {
  v: 2;
  sessionKey: string;
  kind: MailboxKind;
  body?: string;
  fileName?: string;
  mime?: string;
  messageId?: string;
  pinned?: boolean;
  pinUntil?: number | null;
  pinAt?: number;
  title?: string;
  topic?: string;
  members?: string[];
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

export function parseMailboxPlain(raw: string): MailboxPlain | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MailboxPlain>;
    if (parsed.v !== 2 || typeof parsed.sessionKey !== "string") {
      return null;
    }
    if (
      parsed.kind !== "text" &&
      parsed.kind !== "file" &&
      parsed.kind !== "edit" &&
      parsed.kind !== "delete" &&
      parsed.kind !== "pin" &&
      parsed.kind !== "skdm" &&
      parsed.kind !== "room" &&
      parsed.kind !== "room-join"
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
      messageId:
        typeof parsed.messageId === "string" ? parsed.messageId : undefined,
      pinned: parsed.pinned === true,
      pinUntil:
        typeof parsed.pinUntil === "number"
          ? parsed.pinUntil
          : parsed.pinUntil === null
            ? null
            : undefined,
      pinAt: typeof parsed.pinAt === "number" ? parsed.pinAt : undefined,
      title: typeof parsed.title === "string" ? parsed.title : undefined,
      topic: typeof parsed.topic === "string" ? parsed.topic : undefined,
      members: Array.isArray(parsed.members)
        ? parsed.members.filter((row): row is string => typeof row === "string")
        : undefined,
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
  messageId?: string;
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
      messageId: opts.messageId,
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

export async function queueMailboxControl(opts: {
  sender: string;
  recipient: string;
  sessionKey: string;
  kind: "edit" | "delete" | "pin";
  messageId: string;
  body?: string;
  pinned?: boolean;
  pinUntil?: number | null;
  pinAt?: number;
}): Promise<MailboxEnqueue> {
  const snippet = (opts.body ?? "").trim();
  const secrets = snippet.length >= 8 ? [snippet] : [];
  const packed = await wrapMailboxInner(
    opts.recipient,
    {
      v: 2,
      sessionKey: opts.sessionKey,
      kind: opts.kind,
      messageId: opts.messageId,
      body: snippet || undefined,
      pinned: opts.pinned === true,
      pinUntil: opts.pinUntil ?? null,
      pinAt: opts.pinAt,
    },
    secrets,
  );
  if (!packed.ok || !packed.envelope) return packed;
  return insertCiphertextOnly({
    sender: opts.sender,
    recipient: opts.recipient,
    ciphertext: packed.envelope,
    secrets,
  });
}

function isReservedMailboxHandle(raw: string): boolean {
  const handle = toSlug(raw);
  return !handle || handle === "room" || handle === "guest" || handle === "peer";
}

export async function queueRoomSenderKey(opts: {
  sender: string;
  recipient: string;
  sessionKey: string;
  distribution: string;
  title?: string;
  topic?: string;
  members?: string[];
}): Promise<MailboxEnqueue> {
  if (isReservedMailboxHandle(opts.recipient)) {
    return { ok: false, reason: "error" };
  }
  const packed = await wrapMailboxInner(
    opts.recipient,
    {
      v: 2,
      sessionKey: opts.sessionKey,
      kind: "skdm",
      body: opts.distribution,
      title: opts.title,
      topic: opts.topic,
      members: opts.members,
    },
    [opts.distribution],
  );
  if (!packed.ok || !packed.envelope) return packed;
  inspectRelayInsert({
    kind: "skdm",
    sender: opts.sender,
    recipient: opts.recipient,
    wire: packed.envelope,
    secrets: [opts.distribution, opts.title ?? "", opts.topic ?? ""],
    innerSkdm: opts.distribution,
    pairwisePrekeysOk: await recipientCanReceiveSignal(opts.recipient),
  });
  return insertCiphertextOnly({
    sender: opts.sender,
    recipient: opts.recipient,
    ciphertext: packed.envelope,
    secrets: [opts.distribution],
  });
}

export async function queueRoomJoinRequest(opts: {
  sender: string;
  recipient: string;
  sessionKey: string;
}): Promise<MailboxEnqueue> {
  const packed = await wrapMailboxInner(
    opts.recipient,
    {
      v: 2,
      sessionKey: opts.sessionKey,
      kind: "room-join",
    },
    [],
  );
  if (!packed.ok || !packed.envelope) return packed;
  return insertCiphertextOnly({
    sender: opts.sender,
    recipient: opts.recipient,
    ciphertext: packed.envelope,
    secrets: [],
  });
}

export async function queueRoomMessage(opts: {
  sender: string;
  recipient: string;
  sessionKey: string;
  body: string;
  messageId?: string;
}): Promise<MailboxEnqueue> {
  if (isReservedMailboxHandle(opts.recipient)) {
    return { ok: false, reason: "error" };
  }
  const text = opts.body.trim();
  if (!text) return { ok: false, reason: "error" };
  const inner = JSON.stringify({
    v: 2,
    sessionKey: opts.sessionKey,
    kind: "text",
    body: text,
    messageId: opts.messageId,
  });
  const sk = await wrapRoomSenderKeyPayload(opts.sessionKey, opts.sender, inner);
  if (!sk || !isSignalSenderKeyCiphertext(sk)) {
    return { ok: false, reason: "pending-keys" };
  }
  const packed = await wrapMailboxInner(
    opts.recipient,
    {
      v: 2,
      sessionKey: opts.sessionKey,
      kind: "room",
      body: sk,
      messageId: opts.messageId,
    },
    [text],
  );
  if (!packed.ok || !packed.envelope) return packed;
  inspectRelayInsert({
    kind: "room",
    sender: opts.sender,
    recipient: opts.recipient,
    wire: packed.envelope,
    secrets: [text],
    innerSenderKey: sk,
    pairwisePrekeysOk: await recipientCanReceiveSignal(opts.recipient),
  });
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
  messageId?: string;
  pinned?: boolean;
  pinUntil?: number | null;
  pinAt?: number;
  title?: string;
  topic?: string;
  members?: string[];
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
  const deferred: { row: MailboxRow; meta: MailboxPlain }[] = [];

  function toFetched(
    row: MailboxRow,
    meta: MailboxPlain,
    extra?: { body?: string; fileUrl?: string; fileSize?: number },
  ): FetchedMailbox {
    return {
      id: row.id,
      sender: row.sender_username,
      sessionKey: meta.sessionKey,
      kind: meta.kind,
      body:
        extra?.body ??
        (meta.kind === "file" ? meta.fileName || "Encrypted file" : meta.body || ""),
      fileName: meta.fileName,
      fileUrl: extra?.fileUrl,
      fileSize: extra?.fileSize,
      at: Date.parse(row.created_at) || Date.now(),
      messageId: meta.messageId,
      pinned: meta.pinned,
      pinUntil: meta.pinUntil,
      pinAt: meta.pinAt,
      title: meta.title,
      topic: meta.topic,
      members: meta.members,
    };
  }

  for (const raw of data) {
    const row = raw as MailboxRow;
    try {
      if (claimedMailboxIds.has(row.id)) continue;
      const blob = row.encrypted_content ?? "";
      if (!isSignalV2Ciphertext(blob)) continue;
      const opened = await unwrapTextPayload(row.sender_username, blob);
      if (!opened) continue;
      const meta = parseMailboxPlain(opened);
      if (!meta) continue;
      if (meta.kind === "skdm" || meta.kind === "room") {
        inspectClientDecrypt({
          stage: "pairwise-mailbox",
          sender: row.sender_username,
          ok: true,
          kind: meta.kind,
        });
        deferred.push({ row, meta });
        continue;
      }
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
      out.push(toFetched(row, meta, { fileUrl, fileSize }));
      await purgeRow(row);
    } catch {
      /* leave opaque ciphertext until this device can decrypt */
    }
  }

  for (const item of deferred) {
    if (item.meta.kind !== "skdm") continue;
    try {
      const ok = await processRoomSenderDistribution(
        item.meta.sessionKey,
        item.row.sender_username,
        item.meta.body || "",
      );
      inspectClientDecrypt({
        stage: "sender-key",
        sender: item.row.sender_username,
        ok,
        kind: "skdm",
      });
      if (!ok) continue;
      claimedMailboxIds.add(item.row.id);
      out.push(toFetched(item.row, item.meta));
      await purgeRow(item.row);
    } catch {
      /* keep SKDM until this device can process it */
    }
  }

  for (const item of deferred) {
    if (item.meta.kind !== "room") continue;
    try {
      const opened = await unwrapRoomSenderKeyPayload(
        item.meta.sessionKey,
        item.row.sender_username,
        item.meta.body || "",
      );
      if (!opened) continue;
      claimedMailboxIds.add(item.row.id);
      out.push(toFetched(item.row, item.meta, { body: opened }));
      await purgeRow(item.row);
    } catch {
      /* keep room ciphertext until Sender Key decrypts */
    }
  }
  return out;
}
