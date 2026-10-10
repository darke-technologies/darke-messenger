import {
  crypto as signalCrypto,
  GroupCipher,
  GroupSessionBuilder,
  SenderKeyDistributionMessage,
  SenderKeyMessage,
  SenderKeyName,
  type SenderKeyStore,
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
  const hit = raw.match(/0x[0-9a-fA-F]{16,64}/);
  return hit ? `0x${hit[0].slice(2).toUpperCase()}` : raw;
}

function senderKeyName(groupId: string, sender: string): SenderKeyName {
  return new SenderKeyName(canonGroupId(groupId), signalAddress(sender));
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

async function roomGroupSession(groupId: string, sender: string) {
  patchGroupCipherRatchet();
  const store = await getSignalStore();
  const name = senderKeyName(groupId, sender);
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
  const who = toSlug(sender);
  if (!groupId || !who) return null;
  const ready = await ensureLocalSignalIdentity();
  if (!ready) return null;
  const { name, builder } = await roomGroupSession(groupId, who);
  return withSkLock(name.toString(), async () => {
    try {
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
  const who = toSlug(sender);
  if (!groupId || !who || !distributionB64) return false;
  const ready = await ensureLocalSignalIdentity();
  if (!ready) return false;
  const { name, builder } = await roomGroupSession(groupId, who);
  return withSkLock(name.toString(), async () => {
    try {
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
  const who = toSlug(sender);
  const text = plaintext ?? "";
  if (!groupId || !who || !text) return null;
  const ready = await ensureLocalSignalIdentity();
  if (!ready) return null;
  const { name, cipher, builder } = await roomGroupSession(groupId, who);
  return withSkLock(name.toString(), async () => {
    try {
      const skdm = await builder.create(name);
      const packed = await cipher.encrypt(new TextEncoder().encode(text));
      const envelope: SenderKeyEnvelope = {
        v: 2,
        proto: "signal-sk",
        groupId: canonGroupId(groupId),
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
  const who = toSlug(sender);
  if (!groupId || !who) return null;
  try {
    const parsed = parseSenderKeyEnvelope(payload);
    if (!parsed) return null;
    const from = parsed.sender ? toSlug(parsed.sender) : who;
    const ids = [...new Set([groupId, parsed.groupId].filter(Boolean))];
    let text: string | null = null;
    for (const gid of ids) {
      const { name, cipher, builder } = await roomGroupSession(gid, from);
      text = await withSkLock(name.toString(), async () => {
        try {
          if (parsed.skdm) {
            const skdm = SenderKeyDistributionMessage.deserialize(
              b64ToBytes(parsed.skdm),
            );
            await builder.process(name, skdm);
          }
          const plain = await cipher.decrypt(b64ToBytes(parsed.body));
          return new TextDecoder().decode(packedBytes(plain));
        } catch {
          return null;
        }
      });
      if (text) break;
    }
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
