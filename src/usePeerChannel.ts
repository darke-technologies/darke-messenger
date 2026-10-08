import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { PeerConnectionState } from "./dmSessions";
import { normalizeSessionKey } from "./dmSessions";
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
  isSignalV2Ciphertext,
  unwrapTextPayload,
  wrapTextPayload,
} from "./lib/crypto/signal";
import { supabase } from "./supabase";

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
  onMessage: (
    handler: (payload: string, replyToMessageId?: string) => void,
  ) => () => void;
  onTyping: (handler: (frame: TypingFrame) => void) => () => void;
  ingestRemote: (raw: string) => void;
};

function typingTopic(sessionKey: string): string {
  const key = (normalizeSessionKey(sessionKey) ?? sessionKey)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 80);
  return `signal-ephemeral:${key}`;
}

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

export function usePeerChannel(
  sessionKey: string | null,
  peerState: PeerConnectionState,
  peerUsername?: string | null,
): PeerChannel {
  const [connectionState, setConnectionState] =
    useState<PeerConnectionState>(peerState);
  const connectedRef = useRef(peerState === "CONNECTED");
  const messageHandlers = useRef(
    new Set<(payload: string, replyToMessageId?: string) => void>(),
  );
  const typingHandlers = useRef(new Set<(frame: TypingFrame) => void>());
  const sessionRef = useRef(sessionKey);
  const peerRef = useRef(peerUsername ?? null);
  const realtimeRef = useRef<RealtimeChannel | null>(null);
  sessionRef.current = sessionKey;
  peerRef.current = peerUsername ?? null;

  useEffect(() => {
    setConnectionState(peerState);
    connectedRef.current = peerState === "CONNECTED";
  }, [peerState, sessionKey]);

  useEffect(() => {
    const key = sessionKey?.trim() || "";
    const peer = (peerUsername ?? "").replace(/^@/, "").trim().toLowerCase();
    if (!key || !peer) {
      realtimeRef.current = null;
      return;
    }
    const channel = supabase.channel(typingTopic(key), {
      config: { broadcast: { ack: false, self: false } },
    });
    channel.on(
      "broadcast",
      { event: "typing" },
      (msg: { payload?: { ct?: unknown } }) => {
        const ct = typeof msg.payload?.ct === "string" ? msg.payload.ct : "";
        if (!ct || !isSignalV2Ciphertext(ct)) return;
        void (async () => {
          const opened = await unwrapTextPayload(peer, ct);
          if (!opened) return;
          const inner = parseTypingInner(opened);
          if (!inner) return;
          const liveKey = sessionRef.current ?? "";
          if (
            (normalizeSessionKey(inner.s) ?? inner.s) !==
            (normalizeSessionKey(liveKey) ?? liveKey)
          ) {
            return;
          }
          const frame: TypingFrame = { type: inner.t, handle: peer };
          typingHandlers.current.forEach((handler) => handler(frame));
        })();
      },
    );
    void channel.subscribe();
    realtimeRef.current = channel;
    return () => {
      realtimeRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [sessionKey, peerUsername]);

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
    const peer = (peerRef.current ?? "").replace(/^@/, "").trim().toLowerCase();
    const live = realtimeRef.current;
    if (!key || !peer || !live) return;
    void (async () => {
      const envelope = await wrapTextPayload(
        peer,
        JSON.stringify({
          v: 2,
          kind: "typing",
          t: kind,
          s: key,
        } satisfies TypingInner),
      );
      if (!envelope || !isSignalV2Ciphertext(envelope)) return;
      await live.send({
        type: "broadcast",
        event: "typing",
        payload: { ct: envelope },
      });
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

  const onTyping = useCallback((handler: (frame: TypingFrame) => void) => {
    typingHandlers.current.add(handler);
    return () => {
      typingHandlers.current.delete(handler);
    };
  }, []);

  return useMemo(
    () => ({
      connectionState,
      p2pLive: false,
      sendMessage,
      sendTyping,
      onMessage,
      onTyping,
      ingestRemote,
    }),
    [
      connectionState,
      sendMessage,
      sendTyping,
      onMessage,
      onTyping,
      ingestRemote,
    ],
  );
}
