/** Temporary ROOMS E2EE boundary logger. Off in production builds. */

const TAG = "[e2ee-inspect]";

export function e2eeInspectEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    if (typeof window === "undefined") return false;
    return window.localStorage?.getItem("darke.e2ee.inspect") === "1";
  }
  if (typeof window !== "undefined") {
    return window.localStorage?.getItem("darke.e2ee.inspect") !== "0";
  }
  return true;
}

function looksSignalV2(blob: string): boolean {
  try {
    const rec = JSON.parse(blob) as Record<string, unknown>;
    return (
      rec.v === 2 &&
      rec.proto === "signal" &&
      typeof rec.type === "number" &&
      typeof rec.body === "string" &&
      rec.body.length > 0
    );
  } catch {
    return false;
  }
}

function looksSenderKey(blob: string): boolean {
  try {
    const rec = JSON.parse(blob) as Record<string, unknown>;
    return (
      rec.v === 2 &&
      rec.proto === "signal-sk" &&
      typeof rec.groupId === "string" &&
      typeof rec.sender === "string" &&
      typeof rec.body === "string" &&
      rec.body.length > 8
    );
  } catch {
    return false;
  }
}

function containsSecret(blob: string, secret: string): boolean {
  const needle = secret.trim();
  return needle.length >= 8 && blob.includes(needle);
}

function clip(blob: string, max = 280): string {
  const compact = blob.replace(/\s+/g, " ");
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

export function inspectRelayInsert(opts: {
  kind: "room" | "skdm";
  sender: string;
  recipient: string;
  wire: string;
  secrets: string[];
  innerSenderKey?: string | null;
  innerSkdm?: string | null;
  pairwisePrekeysOk: boolean;
}): void {
  if (!e2eeInspectEnabled()) return;
  const leaks = opts.secrets
    .filter((secret) => containsSecret(opts.wire, secret))
    .map(() => true);
  const skOnWire =
    Boolean(opts.innerSenderKey) &&
    containsSecret(opts.wire, opts.innerSenderKey as string);
  const skdmOnWire =
    Boolean(opts.innerSkdm) && containsSecret(opts.wire, opts.innerSkdm as string);
  const innerSk = opts.innerSenderKey ? looksSenderKey(opts.innerSenderKey) : false;
  const report = {
    table: "pending_messages",
    kind: opts.kind,
    sender: opts.sender,
    recipient: opts.recipient,
    wire: {
      signalV2Pairwise: looksSignalV2(opts.wire),
      proto: (() => {
        try {
          return (JSON.parse(opts.wire) as { proto?: string }).proto ?? null;
        } catch {
          return null;
        }
      })(),
      type: (() => {
        try {
          return (JSON.parse(opts.wire) as { type?: number }).type ?? null;
        } catch {
          return null;
        }
      })(),
      bytes: opts.wire.length,
      sample: clip(opts.wire),
    },
    plaintextOnWire: leaks.length > 0,
    senderKeyJsonOnWire: skOnWire,
    skdmRawOnWire: skdmOnWire,
    innerSenderKeyEnvelope: innerSk,
    pairwisePrekeyOrSession: opts.pairwisePrekeysOk,
    decryptLocation: "not on server — client IndexedDB Signal store only",
    pass:
      looksSignalV2(opts.wire) &&
      leaks.length === 0 &&
      !skOnWire &&
      !skdmOnWire &&
      opts.pairwisePrekeysOk &&
      (opts.kind !== "room" || innerSk),
  };
  console.info(TAG, opts.kind === "skdm" ? "SKDM → relay" : "ROOM MSG → relay", report);
}

export function inspectClientDecrypt(opts: {
  stage: "pairwise-mailbox" | "sender-key";
  sender: string;
  ok: boolean;
  kind?: string;
}): void {
  if (!e2eeInspectEnabled()) return;
  console.info(TAG, "on-device decrypt", {
    stage: opts.stage,
    sender: opts.sender,
    kind: opts.kind ?? null,
    ok: opts.ok,
    location:
      opts.stage === "pairwise-mailbox"
        ? "src/mailbox.ts unwrapTextPayload (SessionCipher)"
        : "src/lib/crypto/signalRooms.ts GroupCipher.decrypt",
  });
}
