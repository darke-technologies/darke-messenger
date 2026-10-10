import {
  crypto as signalCrypto,
  GroupSessionBuilder,
  SenderKeyDistributionMessage,
  SenderKeyMessage,
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
  hasSenderMessageKey: (iteration: number) => boolean;
  addSenderMessageKey: (key: unknown) => void;
  removeSenderMessageKey: (iteration: number) =>
    | {
        iteration: number;
        cipherKey: Uint8Array;
        iv: Uint8Array;
      }
    | undefined;
};

const skLocks = new Map<string, Promise<unknown>>();

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

function canonGroupId(raw: string): string {
  const hit = raw.match(/0x[0-9a-fA-F]{16,64}/);
  return hit ? `0x${hit[0].slice(2).toUpperCase()}` : raw;
}

function senderKeyName(groupId: string, sender: string): SenderKeyName {
  return new SenderKeyName(canonGroupId(groupId), signalAddress(sender));
}

function messageKeyFor(
  state: SenderKeyStateLike,
  iteration: number,
): {
  iteration: number;
  cipherKey: Uint8Array;
  iv: Uint8Array;
} {
  let chain = state.senderChainKey;
  if (chain.iteration > iteration) {
    const cached = state.removeSenderMessageKey(iteration);
    if (!cached) {
      throw new Error(
        `Received message with old counter: ${chain.iteration}, ${iteration}`,
      );
    }
    return cached;
  }
  if (iteration - chain.iteration > 2000) {
    throw new Error("Over 2000 messages into the future!");
  }
  while (chain.iteration < iteration) {
    state.addSenderMessageKey(chain.getSenderMessageKey());
    chain = chain.getNext();
  }
  state.senderChainKey = chain.getNext();
  return chain.getSenderMessageKey();
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
  const name = senderKeyName(groupId, who);
  return withSkLock(name.toString(), async () => {
    try {
      const store = await getSignalStore();
      const builder = new GroupSessionBuilder(store);
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
  const name = senderKeyName(groupId, who);
  return withSkLock(name.toString(), async () => {
    try {
      const store = await getSignalStore();
      const builder = new GroupSessionBuilder(store);
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
  const name = senderKeyName(groupId, who);
  return withSkLock(name.toString(), async () => {
    try {
      const store = await getSignalStore();
      const builder = new GroupSessionBuilder(store);
      const skdm = await builder.create(name);
      const record = await store.loadSenderKey(name);
      const state = record.getSenderKeyState() as SenderKeyStateLike;
      const iteration = state.senderChainKey.iteration;
      const senderKey = messageKeyFor(state, iteration);
      const ciphertext = signalCrypto.encrypt(
        senderKey.cipherKey,
        new TextEncoder().encode(text),
        senderKey.iv,
      );
      const signingKeyPrivate = state.signingKey.private;
      if (!signingKeyPrivate) throw new Error("Missing signing key");
      const packedCt =
        ciphertext instanceof Uint8Array
          ? ciphertext
          : new Uint8Array(ciphertext);
      const msg = await SenderKeyMessage.create(
        state.keyId,
        senderKey.iteration,
        packedCt,
        new Uint8Array(signingKeyPrivate),
      );
      await store.storeSenderKey(name, record);
      const envelope: SenderKeyEnvelope = {
        v: 2,
        proto: "signal-sk",
        groupId: canonGroupId(groupId),
        sender: who,
        body: bytesToB64(msg.serialize()),
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
    const parsed = JSON.parse(payload) as SenderKeyEnvelope;
    const from = parsed.sender ? toSlug(parsed.sender) : who;
    const ids = [...new Set([groupId, parsed.groupId].filter(Boolean))];
    if (parsed.skdm) {
      for (const gid of ids) {
        await processRoomSenderDistribution(gid, from, parsed.skdm);
      }
    }
    const store = await getSignalStore();
    const packed = b64ToBytes(parsed.body);
    let text: string | null = null;
    for (const gid of ids) {
      const name = senderKeyName(gid, from);
      text = await withSkLock(name.toString(), async () => {
        try {
          const record = await store.loadSenderKey(name);
          if (record.isEmpty()) return null;
          const msg = SenderKeyMessage.fromSerialized(packed);
          const state = record.getSenderKeyStateById(
            msg.keyId,
          ) as SenderKeyStateLike;
          const signingKeyPublic = state.signingKey.public;
          if (!signingKeyPublic) return null;
          if (!(await msg.verifySignature(new Uint8Array(signingKeyPublic)))) {
            return null;
          }
          const senderKey = messageKeyFor(state, msg.iteration);
          const plain = signalCrypto.decrypt(
            senderKey.cipherKey,
            msg.ciphertext,
            senderKey.iv,
          );
          await store.storeSenderKey(name, record);
          return new TextDecoder().decode(
            plain instanceof Uint8Array ? plain : new Uint8Array(plain),
          );
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
