import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { PeerConnectionState } from "./dmSessions";
import {
  encodeChat,
  encodeTyping,
  isTypingFrame,
  parseP2pFrame,
  TYPING_START,
  TYPING_STOP,
  type TypingFrame,
  type TypingKind,
} from "./p2pProtocol";
import {
  initializeX3DHSession,
  isSignalV2Ciphertext,
  unwrapTextPayload,
  wrapTextPayload,
} from "./lib/crypto/signal";
import { parseMailboxPlain } from "./mailbox";
import { supabase } from "./supabase";
import { toSlug } from "./slug";
import type { ThreadPinEvent } from "./dmSessions";

/**
 * Local stand-in for a WebRTC DataChannel.
 * Chat ciphertext still goes through the Signal mailbox while this
 * channel is a stub (`p2pLive: false`). Typing is an ephemeral Signal
 * envelope on a Realtime broadcast — the relay never sees plaintext.
 */
export type PeerChannel = {
  connectionState: PeerConnectionState;
  p2pLive: boolean;
  sendMessage: (payload: string, replyToMessageId?: string) => void;
  sendTyping: (kind: TypingKind, handle: string) => void;
  sendPin: (event: {
    sessionKey: string;
    messageId: string;
    pinned: boolean;
    pinUntil?: number | null;
    snippet?: string;
    pinAt?: number;
  }) => void;
  onMessage: (
    handler: (payload: string, replyToMessageId?: string) => void,
  ) => () => void;
  onTyping: (handler: (frame: TypingFrame) => void) => () => void;
  onPin: (handler: (event: ThreadPinEvent) => void) => () => void;
  ingestRemote: (raw: string) => void;
};

function typingTopic(self: string, peer: string): string {
  const pair = [toSlug(self), toSlug(peer)].filter(Boolean).sort().join("-");
  return `signal-ephemeral:${pair.slice(0, 80)}`;
}

function roomTypingTopic(sessionKey: string): string {
  const key = sessionKey.trim();
  const hit = key.match(/0x[0-9a-fA-F]+/);
  const id = (hit ? hit[0] : key).replace(/[^0-9a-zA-Z]/g, "").slice(0, 80);
  return `room:${id}:typing`;
}

const ROOM_TYPING_KEY = "__room__";

type TypingInner = {
  v: 2;
  kind: "typing";
  t: TypingKind;
  s: string;
};

function parseTypingInner(raw: string): TypingInner | null {
  try {
    const parsed = JSON.parse(raw) as Partial<TypingInner>;
    if (parsed.v !== 2 || parsed.kind !== "typing") return null;
    if (parsed.t !== TYPING_START && parsed.t !== TYPING_STOP) return null;
    if (typeof parsed.s !== "string" || !parsed.s) return null;
    return { v: 2, kind: "typing", t: parsed.t, s: parsed.s };
  } catch {
    return null;
  }
}

function peerList(
  peerUsername: string | string[] | null | undefined,
  self: string,
): string[] {
  const raw = Array.isArray(peerUsername)
    ? peerUsername
    : peerUsername
      ? [peerUsername]
      : [];
  const skip = new Set(["", self, "room", "guest", "peer", "__self__"]);
  const out: string[] = [];
  for (const row of raw) {
    const handle = toSlug(row);
    if (!handle || skip.has(handle) || out.includes(handle)) continue;
    out.push(handle);
  }
  return out;
}

export function usePeerChannel(
  sessionKey: string | null,
  peerState: PeerConnectionState,
  peerUsername?: string | string[] | null,
  selfUsername?: string | null,
  roomSessionKey?: string | null,
): PeerChannel {
  const [connectionState, setConnectionState] =
    useState<PeerConnectionState>(peerState);
  const connectedRef = useRef(peerState === "CONNECTED");
  const messageHandlers = useRef(
    new Set<(payload: string, replyToMessageId?: string) => void>(),
  );
  const typingHandlers = useRef(new Set<(frame: TypingFrame) => void>());
  const pinHandlers = useRef(new Set<(event: ThreadPinEvent) => void>());
  const sessionRef = useRef(sessionKey);
  const peerRef = useRef<string[]>([]);
  const selfRef = useRef(selfUsername ?? null);
  const realtimeRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const subscribedRef = useRef(false);
  const self = toSlug(selfUsername ?? "");
  const peers = peerList(peerUsername, self);
  const peerKey = peers.join(",");
  const roomTopic = roomSessionKey ? roomTypingTopic(roomSessionKey) : "";
  sessionRef.current = sessionKey;
  selfRef.current = selfUsername ?? null;
  peerRef.current = peers;

  useEffect(() => {
    setConnectionState(peerState);
    connectedRef.current = peerState === "CONNECTED";
  }, [peerState, sessionKey]);

  useEffect(() => {
    if (!self || (!roomTopic && !peers.length)) {
      realtimeRef.current = new Map();
      subscribedRef.current = false;
      return;
    }
    const channels = new Map<string, RealtimeChannel>();
    let live = 0;
    if (roomTopic) {
      const channel = supabase.channel(roomTopic, {
        config: { broadcast: { ack: false, self: false } },
      });
      channel.on(
        "broadcast",
        { event: "typing" },
        (msg: { payload?: { t?: unknown; s?: unknown; handle?: unknown } }) => {
          const kind =
            msg.payload?.t === TYPING_START || msg.payload?.t === TYPING_STOP
              ? msg.payload.t
              : null;
          const handle = toSlug(
            typeof msg.payload?.s === "string"
              ? msg.payload.s
              : typeof msg.payload?.handle === "string"
                ? msg.payload.handle
                : "",
          );
          if (!kind || !handle || handle === self) return;
          const frame: TypingFrame = { type: kind, handle };
          typingHandlers.current.forEach((handler) => handler(frame));
        },
      );
      void channel.subscribe((status) => {
        if (status === "SUBSCRIBED") live += 1;
        subscribedRef.current = live > 0;
      });
      channels.set(ROOM_TYPING_KEY, channel);
    }
    for (const peer of peers) {
      const channel = supabase.channel(typingTopic(self, peer), {
        config: { broadcast: { ack: false, self: false } },
      });
      async function openEnvelope(ct: string) {
        if (!ct || !isSignalV2Ciphertext(ct)) return null;
        return unwrapTextPayload(peer, ct);
      }
      channel.on(
        "broadcast",
        { event: "typing" },
        (msg: { payload?: { ct?: unknown } }) => {
          const ct = typeof msg.payload?.ct === "string" ? msg.payload.ct : "";
          void (async () => {
            const opened = await openEnvelope(ct);
            if (!opened) return;
            const inner = parseTypingInner(opened);
            if (!inner) return;
            const frame: TypingFrame = { type: inner.t, handle: peer };
            typingHandlers.current.forEach((handler) => handler(frame));
          })();
        },
      );
      channel.on(
        "broadcast",
        { event: "pin" },
        (msg: { payload?: { ct?: unknown } }) => {
          const ct = typeof msg.payload?.ct === "string" ? msg.payload.ct : "";
          void (async () => {
            const opened = await openEnvelope(ct);
            if (!opened) return;
            const inner = parseMailboxPlain(opened);
            if (!inner || inner.kind !== "pin") return;
            const event: ThreadPinEvent = {
              pinned: inner.pinned === true,
              by: peer,
              sessionKey: inner.sessionKey,
              messageId: inner.messageId,
              pinUntil: inner.pinUntil,
              snippet: inner.body,
              pinAt: inner.pinAt,
            };
            pinHandlers.current.forEach((handler) => handler(event));
          })();
        },
      );
      void channel.subscribe((status) => {
        if (status === "SUBSCRIBED") live += 1;
        subscribedRef.current = live > 0;
      });
      channels.set(peer, channel);
    }
    realtimeRef.current = channels;
    return () => {
      subscribedRef.current = false;
      realtimeRef.current = new Map();
      for (const channel of channels.values()) {
        void supabase.removeChannel(channel);
      }
    };
  }, [peerKey, roomTopic, self]);

  const transmit = useCallback(
    (payload: string) => {
      if (!sessionKey || !payload || !connectedRef.current) return;
      void payload;
    },
    [sessionKey],
  );

  const ingestRemote = useCallback((raw: string) => {
    const frame = parseP2pFrame(raw);
    if (isTypingFrame(frame)) {
      typingHandlers.current.forEach((handler) => handler(frame));
      return;
    }
    const body = frame?.type === "MESSAGE" ? frame.body : raw;
    if (!body) return;
    const reply =
      frame?.type === "MESSAGE" ? frame.reply_to_message_id : undefined;
    messageHandlers.current.forEach((handler) => handler(body, reply));
  }, []);

  const sendMessage = useCallback(
    (payload: string, replyToMessageId?: string) => {
      if (!payload) return;
      transmit(encodeChat(payload, replyToMessageId));
    },
    [transmit],
  );

  const sendTyping = useCallback((kind: TypingKind, handle: string) => {
    const who = handle.trim();
    if (!who) return;
    if (connectedRef.current) {
      transmit(encodeTyping(kind, who));
    }
    const key = sessionRef.current?.trim() || "";
    const peers = peerRef.current;
    const channels = realtimeRef.current;
    const roomLive = channels.get(ROOM_TYPING_KEY);
    if (!channels.size) return;
    void (async () => {
      if (!subscribedRef.current) {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      if (roomLive) {
        await roomLive.send({
          type: "broadcast",
          event: "typing",
          payload: {
            v: 2,
            kind: "typing",
            t: kind,
            s: toSlug(who),
            handle: toSlug(who),
          },
        });
        return;
      }
      if (!peers.length) return;
      for (const peer of peers) {
        const live = channels.get(peer);
        if (!live) continue;
        await initializeX3DHSession(peer);
        const envelope = await wrapTextPayload(
          peer,
          JSON.stringify({
            v: 2,
            kind: "typing",
            t: kind,
            s: key || peer,
          } satisfies TypingInner),
        );
        if (!envelope || !isSignalV2Ciphertext(envelope)) continue;
        await live.send({
          type: "broadcast",
          event: "typing",
          payload: { ct: envelope },
        });
      }
    })();
  }, [transmit]);

  const onMessage = useCallback(
    (handler: (payload: string, replyToMessageId?: string) => void) => {
      messageHandlers.current.add(handler);
      return () => {
        messageHandlers.current.delete(handler);
      };
    },
    [],
  );

  const sendPin = useCallback(
    (event: {
      sessionKey: string;
      messageId: string;
      pinned: boolean;
      pinUntil?: number | null;
      snippet?: string;
      pinAt?: number;
    }) => {
      const peers = peerRef.current;
      const channels = realtimeRef.current;
      if (!peers.length || !channels.size || !event.messageId) return;
      void (async () => {
        if (!subscribedRef.current) {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
        for (const peer of peers) {
          const live = channels.get(peer);
          if (!live) continue;
          await initializeX3DHSession(peer);
          const envelope = await wrapTextPayload(
            peer,
            JSON.stringify({
              v: 2,
              sessionKey: event.sessionKey,
              kind: "pin",
              messageId: event.messageId,
              body: event.snippet,
              pinned: event.pinned === true,
              pinUntil: event.pinUntil ?? null,
              pinAt: event.pinAt,
            }),
          );
          if (!envelope || !isSignalV2Ciphertext(envelope)) continue;
          await live.send({
            type: "broadcast",
            event: "pin",
            payload: { ct: envelope },
          });
        }
      })();
    },
    [],
  );

  const onTyping = useCallback((handler: (frame: TypingFrame) => void) => {
    typingHandlers.current.add(handler);
    return () => {
      typingHandlers.current.delete(handler);
    };
  }, []);

  const onPin = useCallback((handler: (event: ThreadPinEvent) => void) => {
    pinHandlers.current.add(handler);
    return () => {
      pinHandlers.current.delete(handler);
    };
  }, []);

  return useMemo(
    () => ({
      connectionState,
      p2pLive: false,
      sendMessage,
      sendTyping,
      sendPin,
      onMessage,
      onTyping,
      onPin,
      ingestRemote,
    }),
    [
      connectionState,
      sendMessage,
      sendTyping,
      sendPin,
      onMessage,
      onTyping,
      onPin,
      ingestRemote,
    ],
  );
}
