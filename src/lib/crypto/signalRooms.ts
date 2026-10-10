import {
  GroupCipher,
  GroupSessionBuilder,
  SenderKeyDistributionMessage,
  SenderKeyName,
} from "@wppconnect/libsignal-protocol";
import { toSlug } from "../../slug";
import {
  ensureLocalSignalIdentity,
  getSignalStore,
  signalAddress,
} from "./signal";
import { inspectClientDecrypt } from "./e2eeInspect";

export type SenderKeyEnvelope = {
  v: 2;
  proto: "signal-sk";
  groupId: string;
  sender: string;
  body: string;
};

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

function senderKeyName(groupId: string, sender: string): SenderKeyName {
  return new SenderKeyName(groupId, signalAddress(sender));
}

export function isSignalSenderKeyCiphertext(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as Partial<SenderKeyEnvelope>;
    return (
      parsed.v === 2 &&
      parsed.proto === "signal-sk" &&
      typeof parsed.groupId === "string" &&
      typeof parsed.sender === "string" &&
      typeof parsed.body === "string" &&
      parsed.body.length > 8
    );
  } catch {
    return false;
  }
}

export async function createRoomSenderDistribution(
  groupId: string,
  sender: string,
): Promise<string | null> {
  const who = toSlug(sender);
  if (!groupId || !who) return null;
  const ready = await ensureLocalSignalIdentity();
  if (!ready) return null;
  try {
    const store = await getSignalStore();
    const builder = new GroupSessionBuilder(store);
    const skdm = await builder.create(senderKeyName(groupId, who));
    return bytesToB64(skdm.serialize());
  } catch {
    return null;
  }
}

export async function processRoomSenderDistribution(
  groupId: string,
  sender: string,
  distributionB64: string,
): Promise<boolean> {
  const who = toSlug(sender);
  if (!groupId || !who || !distributionB64) return false;
  const ready = await ensureLocalSignalIdentity();
  if (!ready) return false;
  try {
    const store = await getSignalStore();
    const builder = new GroupSessionBuilder(store);
    const skdm = SenderKeyDistributionMessage.deserialize(
      b64ToBytes(distributionB64),
    );
    await builder.process(senderKeyName(groupId, who), skdm);
    return true;
  } catch {
    return false;
  }
}

export async function wrapRoomSenderKeyPayload(
  groupId: string,
  sender: string,
  plaintext: string,
): Promise<string | null> {
  const who = toSlug(sender);
  const text = plaintext ?? "";
  if (!groupId || !who || !text) return null;
  const ready = await ensureLocalSignalIdentity();
  if (!ready) return null;
  try {
    const store = await getSignalStore();
    const builder = new GroupSessionBuilder(store);
    await builder.create(senderKeyName(groupId, who));
    const cipher = new GroupCipher(store, senderKeyName(groupId, who));
    const packed = await cipher.encrypt(new TextEncoder().encode(text));
    const envelope: SenderKeyEnvelope = {
      v: 2,
      proto: "signal-sk",
      groupId,
      sender: who,
      body: bytesToB64(packed),
    };
    const raw = JSON.stringify(envelope);
    return isSignalSenderKeyCiphertext(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function unwrapRoomSenderKeyPayload(
  groupId: string,
  sender: string,
  payload: string,
): Promise<string | null> {
  if (!isSignalSenderKeyCiphertext(payload)) return null;
  const who = toSlug(sender);
  if (!groupId || !who) return null;
  try {
    const parsed = JSON.parse(payload) as SenderKeyEnvelope;
    const store = await getSignalStore();
    const cipher = new GroupCipher(store, senderKeyName(groupId, who));
    const plain = await cipher.decrypt(b64ToBytes(parsed.body));
    const text = new TextDecoder().decode(plain);
    inspectClientDecrypt({
      stage: "sender-key",
      sender: who,
      ok: Boolean(text),
      kind: "room",
    });
    return text;
  } catch {
    inspectClientDecrypt({
      stage: "sender-key",
      sender: who,
      ok: false,
      kind: "room",
    });
    return null;
  }
}
