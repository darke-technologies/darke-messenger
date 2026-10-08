import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PeerConnectionState } from "./dmSessions";
import {
  unwrapTextPayload,
  wrapTextPayload,
} from "./lib/crypto/signal";
import {
  encodeChat,
  encodeTyping,
  isTypingFrame,
  parseP2pFrame,
  type TypingFrame,
  type TypingKind,
} from "./p2pProtocol";

/**
 * Local stand-in for a WebRTC DataChannel.
 * sendMessage / onMessage / connectionState match the payload surface
 * a DataChannel will use once signaling is wired.
 *
 * Typing frames are ephemeral JSON events. They are never written to
 * chat history or Supabase.
 */
export type PeerChannel = {
  connectionState: PeerConnectionState;
  sendMessage: (payload: string, replyToMessageId?: string) => void;
  sendTyping: (kind: TypingKind, handle: string) => void;
  onMessage: (handler: (payload: string) => void) => () => void;
  onTyping: (handler: (frame: TypingFrame) => void) => () => void;
  ingestRemote: (raw: string) => void;
};

export function usePeerChannel(
  sessionKey: string | null,
  peerState: PeerConnectionState,
  peerUsername?: string | null,
): PeerChannel {
  const [connectionState, setConnectionState] =
    useState<PeerConnectionState>(peerState);
  const connectedRef = useRef(peerState === "CONNECTED");
  const peerRef = useRef((peerUsername ?? "").trim().toLowerCase());
  const messageHandlers = useRef(new Set<(payload: string) => void>());
  const typingHandlers = useRef(new Set<(frame: TypingFrame) => void>());

  useEffect(() => {
    peerRef.current = (peerUsername ?? "").trim().toLowerCase();
  }, [peerUsername]);

  useEffect(() => {
    setConnectionState(peerState);
    connectedRef.current = peerState === "CONNECTED";
  }, [peerState, sessionKey]);

  const transmit = useCallback(
    (payload: string) => {
      if (!sessionKey || !payload || !connectedRef.current) return;
      // DataChannel.send(payload) lands here.
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
    const peer = peerRef.current;
    void (async () => {
      const plain = peer ? await unwrapTextPayload(peer, body) : body;
      messageHandlers.current.forEach((handler) => handler(plain));
    })();
  }, []);

  const sendMessage = useCallback(
    (payload: string, replyToMessageId?: string) => {
      if (!payload) return;
      const peer = peerRef.current;
      void (async () => {
        const wrapped = peer ? await wrapTextPayload(peer, payload) : payload;
        transmit(encodeChat(wrapped, replyToMessageId));
      })();
    },
    [transmit],
  );

  const sendTyping = useCallback(
    (kind: TypingKind, handle: string) => {
      const who = handle.trim();
      if (!who) return;
      transmit(encodeTyping(kind, who));
    },
    [transmit],
  );

  const onMessage = useCallback((handler: (payload: string) => void) => {
    messageHandlers.current.add(handler);
    return () => {
      messageHandlers.current.delete(handler);
    };
  }, []);

  const onTyping = useCallback((handler: (frame: TypingFrame) => void) => {
    typingHandlers.current.add(handler);
    return () => {
      typingHandlers.current.delete(handler);
    };
  }, []);

  return useMemo(
    () => ({
      connectionState,
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
