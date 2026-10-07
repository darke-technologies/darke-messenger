"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { IconArrowUp, IconPaperclip } from "./icons";
import { COMMENT_MAX } from "./status";
import { startLocalVoiceCapture, type VoiceCapture } from "./voiceService";

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onTyping,
  disabled,
  placeholder,
  replyLabel,
  onCancelReply,
  onAttach,
  areaRef,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (e?: FormEvent) => void;
  onTyping: () => void;
  disabled: boolean;
  placeholder?: string;
  replyLabel: string | null;
  onCancelReply: () => void;
  onAttach: (file: File | undefined) => void;
  areaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<VoiceCapture | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  useEffect(() => {
    return () => captureRef.current?.cancel();
  }, []);

  function grow() {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function appendTranscript(text: string) {
    if (!text) return;
    const prefix = value.trim();
    const next = prefix ? `${prefix} ${text}` : text;
    onChange(next.slice(0, COMMENT_MAX));
    requestAnimationFrame(grow);
  }
// @ts-ignore
  async function toggleMic() {
    if (disabled || busy) return;
    setVoiceError(null);
    if (recording && captureRef.current) {
      setRecording(false);
      setBusy(true);
      try {
        const text = await captureRef.current.stop();
        captureRef.current = null;
        appendTranscript(text);
      } catch (err) {
        setVoiceError(
          err instanceof Error ? err.message : "On-device transcription failed.",
        );
        captureRef.current = null;
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      captureRef.current = await startLocalVoiceCapture();
      setRecording(true);
    } catch {
      setVoiceError("Microphone permission is required for on-device dictation.");
    }
  }

  return (
    <form className="dm-chat-console" onSubmit={onSubmit}>
      {replyLabel ? (
        <div className="newsfeed-replying">
          <span>Replying to {replyLabel}</span>
          <button type="button" onClick={onCancelReply}>
            Cancel
          </button>
        </div>
      ) : null}
      {voiceError ? (
        <p className="dm-voice-error" role="status">
          {voiceError}
        </p>
      ) : null}
      <div className="dm-chat-console-row">
        <button
          type="button"
          className="dm-chat-attach"
          title="P2P file transfer"
          aria-label="Attach file"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
        >
          <IconPaperclip />
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            onAttach(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <textarea
          ref={areaRef}
          rows={value.includes("\n") ? 2 : 1}
          value={value}
          maxLength={COMMENT_MAX}
          disabled={disabled}
          placeholder={
            recording
              ? "Listening on this device…"
              : busy
                ? "Transcribing on this device…"
                : placeholder || "Enter message..."
          }
          aria-label="Encrypted message"
          onChange={(e) => {
            onChange(e.target.value.slice(0, COMMENT_MAX));
            grow();
            onTyping();
          }}
          onInput={grow}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <button
          type="submit"
          className="dm-chat-send"
          disabled={disabled || !value.trim()}
          aria-label="Send"
        >
          <IconArrowUp />
        </button>
      </div>
    </form>
  );
}
