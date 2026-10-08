import { useCallback, useEffect, useRef, useState } from "react";
import { TYPING_START, TYPING_STOP } from "./p2pProtocol";
import type { PeerChannel } from "./usePeerChannel";
import { getBroadcastTyping, TYPING_PREF_CHANGE } from "./welcomePrefs";

const START_THROTTLE_MS = 2000;
const IDLE_STOP_MS = 2500;
const STALE_CLEAR_MS = 4000;

export function useTypingSignal({
  channel,
  handle,
  connected: _connected,
}: {
  channel: PeerChannel;
  handle: string;
  connected: boolean;
}): {
  typingUsers: string[];
  notifyTyping: () => void;
  stopTyping: () => void;
} {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [broadcast, setBroadcast] = useState(true);
  const typingUsersRef = useRef(new Set<string>());
  const staleTimers = useRef(new Map<string, number>());
  const lastStartAt = useRef(0);
  const idleTimer = useRef<number | null>(null);
  const sentStart = useRef(false);
  const handleRef = useRef(handle);
  handleRef.current = handle;

  useEffect(() => {
    let cancelled = false;
    void getBroadcastTyping()
      .then((on) => {
        if (!cancelled) setBroadcast(on);
      })
      .catch(() => {
        if (!cancelled) setBroadcast(true);
      });
    const sync = (event: Event) => {
      const on = (event as CustomEvent<boolean>).detail;
      if (typeof on === "boolean") setBroadcast(on);
    };
    window.addEventListener(TYPING_PREF_CHANGE, sync);
    return () => {
      cancelled = true;
      window.removeEventListener(TYPING_PREF_CHANGE, sync);
    };
  }, []);

  const bumpTyping = useCallback((who: string) => {
    const key = who.replace(/^@/, "").trim().toLowerCase();
    if (!key || key === handleRef.current.replace(/^@/, "").trim().toLowerCase()) {
      return;
    }
    typingUsersRef.current.add(key);
    setTypingUsers([...typingUsersRef.current]);
    const prev = staleTimers.current.get(key);
    if (prev) window.clearTimeout(prev);
    staleTimers.current.set(
      key,
      window.setTimeout(() => {
        typingUsersRef.current.delete(key);
        staleTimers.current.delete(key);
        setTypingUsers([...typingUsersRef.current]);
      }, STALE_CLEAR_MS),
    );
  }, []);

  const dropTyping = useCallback((who: string) => {
    const key = who.replace(/^@/, "").trim().toLowerCase();
    if (!key) return;
    typingUsersRef.current.delete(key);
    const prev = staleTimers.current.get(key);
    if (prev) window.clearTimeout(prev);
    staleTimers.current.delete(key);
    setTypingUsers([...typingUsersRef.current]);
  }, []);

  useEffect(() => {
    return channel.onTyping((frame) => {
      if (frame.type === TYPING_START) bumpTyping(frame.handle);
      else dropTyping(frame.handle);
    });
  }, [channel, bumpTyping, dropTyping]);

  useEffect(() => {
    typingUsersRef.current.clear();
    for (const timer of staleTimers.current.values()) window.clearTimeout(timer);
    staleTimers.current.clear();
    setTypingUsers([]);
    lastStartAt.current = 0;
    sentStart.current = false;
    if (idleTimer.current) {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, [channel, handle]);

  const emitStop = useCallback(() => {
    if (idleTimer.current) {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    if (!sentStart.current) return;
    sentStart.current = false;
    lastStartAt.current = 0;
    if (handleRef.current) {
      channel.sendTyping(TYPING_STOP, handleRef.current);
    }
  }, [channel]);

  const notifyTyping = useCallback(() => {
    if (!handleRef.current) return;
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => emitStop(), IDLE_STOP_MS);
    if (!broadcast) return;
    const now = Date.now();
    if (!sentStart.current || now - lastStartAt.current >= START_THROTTLE_MS) {
      lastStartAt.current = now;
      sentStart.current = true;
      channel.sendTyping(TYPING_START, handleRef.current);
    }
  }, [broadcast, channel, emitStop]);

  useEffect(() => {
    if (!broadcast) emitStop();
  }, [broadcast, emitStop]);

  useEffect(() => () => emitStop(), [emitStop]);

  return { typingUsers, notifyTyping, stopTyping: emitStop };
}
