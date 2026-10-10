import {
  crypto as signalCrypto,
  GroupCipher,
  GroupSessionBuilder,
  SenderKeyDistributionMessage,
  SenderKeyMessage,
  SenderKeyName,
  SenderKeyRecord,
  type SenderKeyStore,
} from "@wppconnect/libsignal-protocol";
import { toSlug } from "../../slug";
import { normalizeSessionKey } from "../../dmSessions";
import {
  ensureLocalSignalIdentity,
  getSignalStore,
  signalAddress,
} from "./signal";
import { inspectClientDecrypt, inspectRoomSenderKey } from "./e2eeInspect";

export type SenderKeyEnvelope = {
  v: 2;
  proto: "signal-sk";
  groupId: string;
  sender: string;
  body: string;
  skdm?: string;
};

type SenderKeyStateLike = {
  keyId: number;
  senderChainKey: {
    iteration: number;
    getSenderMessageKey: () => {
      iteration: number;
      cipherKey: Uint8Array;
      iv: Uint8Array;
    };
    getNext: () => SenderKeyStateLike["senderChainKey"];
  };
  signingKey: { public?: Uint8Array; private?: Uint8Array };
};

type GroupCipherInternals = {
  senderKeyStore: SenderKeyStore;
  senderKeyId: SenderKeyName;
  getSenderKey: (
    state: SenderKeyStateLike,
    iteration: number,
  ) => {
    iteration: number;
    cipherKey: Uint8Array;
    iv: Uint8Array;
  };
};

const skLocks = new Map<string, Promise<unknown>>();
const roomSessions = new Map<
  string,
  { cipher: GroupCipher; builder: GroupSessionBuilder }
>();

let groupCipherPatched = false;

function withSkLock<T>(id: string, job: () => Promise<T>): Promise<T> {
  const prior = skLocks.get(id) ?? Promise.resolve();
  const next = prior.then(job, job);
  skLocks.set(
    id,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
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

function packedBytes(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function canonGroupId(raw: string): string {
  return normalizeSessionKey(raw) ?? raw.trim();
}

function canonSender(raw: string): string {
  return toSlug(raw);
}

/** Uni-directional chain id: (roomId, senderHandle, deviceId). Never the recipient handle. */
export function roomSenderKeyName(
  groupId: string,
  senderHandle: string,
): SenderKeyName {
  return new SenderKeyName(
    canonGroupId(groupId),
    signalAddress(canonSender(senderHandle)),
  );
}

export function roomSenderKeyLabel(
  groupId: string,
  senderHandle: string,
): string {
  return `${canonGroupId(groupId)}:${canonSender(senderHandle)}`;
}

/**
 * Upstream GroupCipher.encrypt skips chain iteration 1 (`iteration === 0 ? 0 : iteration + 1`)
 * and GroupCipher.decrypt ignores SenderKeyMessage.iteration. Patch both so the
 * sender-key ratchet stays aligned with GroupSessionBuilder SKDMs.
 */
function patchGroupCipherRatchet(): void {
  if (groupCipherPatched) return;
  groupCipherPatched = true;

  GroupCipher.prototype.encrypt = async function (
    this: GroupCipher,
    paddedPlaintext: Uint8Array,
  ) {
    const self = this as unknown as GroupCipherInternals;
    const record = await self.senderKeyStore.loadSenderKey(self.senderKeyId);
    const senderKeyState = record.getSenderKeyState() as SenderKeyStateLike;
    const iteration = senderKeyState.senderChainKey.iteration;
    const senderKey = self.getSenderKey(senderKeyState, iteration);
    const ciphertext = packedBytes(
      signalCrypto.encrypt(
        senderKey.cipherKey,
        paddedPlaintext,
        senderKey.iv,
      ) as Uint8Array,
    );
    const signingKeyPrivate = senderKeyState.signingKey.private;
    if (!signingKeyPrivate) throw new Error("Missing signing key");
    const msg = await SenderKeyMessage.create(
      senderKeyState.keyId,
      senderKey.iteration,
      ciphertext,
      packedBytes(signingKeyPrivate),
    );
    await self.senderKeyStore.storeSenderKey(self.senderKeyId, record);
    return packedBytes(msg.serialize());
  };

  GroupCipher.prototype.decrypt = async function (
    this: GroupCipher,
    senderKeyMessageBytes: Uint8Array,
  ) {
    const self = this as unknown as GroupCipherInternals;
    const record = await self.senderKeyStore.loadSenderKey(self.senderKeyId);
    if (record.isEmpty()) {
      throw new Error("No sender key for: " + self.senderKeyId.toString());
    }
    const msg = SenderKeyMessage.fromSerialized(senderKeyMessageBytes);
    const senderKeyState = record.getSenderKeyStateById(
      msg.keyId,
    ) as SenderKeyStateLike;
    const signingKeyPublic = senderKeyState.signingKey.public;
    if (!signingKeyPublic) throw new Error("Missing signing key");
    if (!(await msg.verifySignature(packedBytes(signingKeyPublic)))) {
      throw new Error("Invalid signature");
    }
    const senderKey = self.getSenderKey(senderKeyState, msg.iteration);
    const plaintext = signalCrypto.decrypt(
      senderKey.cipherKey,
      msg.ciphertext,
      senderKey.iv,
    );
    await self.senderKeyStore.storeSenderKey(self.senderKeyId, record);
    return packedBytes(plaintext as Uint8Array);
  };
}

async function roomGroupSession(groupId: string, senderHandle: string) {
  patchGroupCipherRatchet();
  const store = await getSignalStore();
  const name = roomSenderKeyName(groupId, senderHandle);
  const id = name.toString();
  const hit = roomSessions.get(id);
  if (hit) return { store, name, ...hit };
  const session = {
    cipher: new GroupCipher(store, name),
    builder: new GroupSessionBuilder(store),
  };
  roomSessions.set(id, session);
  return { store, name, ...session };
}

async function sendingRecordIsOurs(
  store: Awaited<ReturnType<typeof getSignalStore>>,
  name: SenderKeyName,
): Promise<boolean> {
  const record = await store.loadSenderKey(name);
  if (record.isEmpty()) return false;
  const state = record.getSenderKeyState() as SenderKeyStateLike;
  return Boolean(state.signingKey?.private);
}

export function parseSenderKeyEnvelope(raw: string): SenderKeyEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SenderKeyEnvelope>;
    if (
      parsed.v !== 2 ||
      parsed.proto !== "signal-sk" ||
      typeof parsed.groupId !== "string" ||
      typeof parsed.sender !== "string" ||
      typeof parsed.body !== "string" ||
      parsed.body.length <= 8
    ) {
      return null;
    }
    return {
      v: 2,
      proto: "signal-sk",
      groupId: parsed.groupId,
      sender: parsed.sender,
      body: parsed.body,
      skdm: typeof parsed.skdm === "string" && parsed.skdm ? parsed.skdm : undefined,
    };
  } catch {
    return null;
  }
}

export function isSignalSenderKeyCiphertext(raw: string): boolean {
  return Boolean(parseSenderKeyEnvelope(raw));
}

export async function createRoomSenderDistribution(
  groupId: string,
  sender: string,
): Promise<string | null> {
  const who = canonSender(sender);
  const roomId = canonGroupId(groupId);
  if (!roomId || !who) return null;
  const ready = await ensureLocalSignalIdentity();
  if (!ready) return null;
  const { store, name, builder } = await roomGroupSession(roomId, who);
  return withSkLock(name.toString(), async () => {
    try {
      if (!(await sendingRecordIsOurs(store, name))) {
        await store.storeSenderKey(name, new SenderKeyRecord());
      }
      inspectRoomSenderKey({
        role: "SENDER",
        roomId,
        senderHandle: who,
        storeId: name.toString(),
        hasPrivate: true,
      });
      const skdm = await builder.create(name);
      return bytesToB64(skdm.serialize());
    } catch {
      return null;
    }
  });
}

export async function processRoomSenderDistribution(
  groupId: string,
  sender: string,
  distributionB64: string,
): Promise<boolean> {
  const who = canonSender(sender);
  const roomId = canonGroupId(groupId);
  if (!roomId || !who || !distributionB64) return false;
  const ready = await ensureLocalSignalIdentity();
  if (!ready) return false;
  const { store, name, builder } = await roomGroupSession(roomId, who);
  return withSkLock(name.toString(), async () => {
    try {
      inspectRoomSenderKey({
        role: "RECIPIENT",
        roomId,
        senderHandle: who,
        storeId: name.toString(),
        hasRecord: !(await store.loadSenderKey(name)).isEmpty(),
      });
      const skdm = SenderKeyDistributionMessage.deserialize(
        b64ToBytes(distributionB64),
      );
      await builder.process(name, skdm);
      return true;
    } catch {
      return false;
    }
  });
}

export async function wrapRoomSenderKeyPayload(
  groupId: string,
  sender: string,
  plaintext: string,
): Promise<string | null> {
  const who = canonSender(sender);
  const roomId = canonGroupId(groupId);
  const text = plaintext ?? "";
  if (!roomId || !who || !text) return null;
  const ready = await ensureLocalSignalIdentity();
  if (!ready) return null;
  const { store, name, cipher, builder } = await roomGroupSession(roomId, who);
  return withSkLock(name.toString(), async () => {
    try {
      if (!(await sendingRecordIsOurs(store, name))) {
        await store.storeSenderKey(name, new SenderKeyRecord());
      }
      inspectRoomSenderKey({
        role: "SENDER",
        roomId,
        senderHandle: who,
        storeId: name.toString(),
        hasPrivate: true,
      });
      const skdm = await builder.create(name);
      const packed = await cipher.encrypt(new TextEncoder().encode(text));
      const envelope: SenderKeyEnvelope = {
        v: 2,
        proto: "signal-sk",
        groupId: roomId,
        sender: who,
        body: bytesToB64(packedBytes(packed)),
        skdm: bytesToB64(skdm.serialize()),
      };
      const raw = JSON.stringify(envelope);
      return isSignalSenderKeyCiphertext(raw) ? raw : null;
    } catch {
      return null;
    }
  });
}

export async function unwrapRoomSenderKeyPayload(
  groupId: string,
  sender: string,
  payload: string,
): Promise<string | null> {
  if (!isSignalSenderKeyCiphertext(payload)) return null;
  const parsed = parseSenderKeyEnvelope(payload);
  if (!parsed) return null;
  const who = canonSender(parsed.sender || sender);
  const roomId = canonGroupId(parsed.groupId || groupId);
  if (!roomId || !who) return null;
  try {
    const { store, name, cipher, builder } = await roomGroupSession(roomId, who);
    const text = await withSkLock(name.toString(), async () => {
      try {
        if (parsed.skdm) {
          const skdm = SenderKeyDistributionMessage.deserialize(
            b64ToBytes(parsed.skdm),
          );
          await builder.process(name, skdm);
        }
        const record = await store.loadSenderKey(name);
        inspectRoomSenderKey({
          role: "RECIPIENT",
          roomId,
          senderHandle: who,
          storeId: name.toString(),
          hasRecord: !record.isEmpty(),
        });
        if (record.isEmpty()) return null;
        const plain = await cipher.decrypt(b64ToBytes(parsed.body));
        return new TextDecoder().decode(packedBytes(plain));
      } catch {
        return null;
      }
    });
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
