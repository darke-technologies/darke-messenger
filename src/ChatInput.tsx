"use client";

import { FormEvent, useRef } from "react";
import { IconArrowUp, IconPaperclip } from "./icons";
import { COMMENT_MAX } from "./status";

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

  function grow() {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
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
          placeholder={placeholder || "Enter message..."}
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
