export const TYPING_START = "TYPING_START";
export const TYPING_STOP = "TYPING_STOP";
export const P2P_MESSAGE = "MESSAGE";

export type TypingKind = typeof TYPING_START | typeof TYPING_STOP;

export type TypingFrame = {
  type: TypingKind;
  handle: string;
};

export type ChatFrame = {
  type: typeof P2P_MESSAGE;
  body: string;
  reply_to_message_id?: string;
};

export type P2pFrame = TypingFrame | ChatFrame;

export function encodeTyping(kind: TypingKind, handle: string): string {
  const frame: TypingFrame = { type: kind, handle };
  return JSON.stringify(frame);
}

export function encodeChat(body: string, replyToMessageId?: string): string {
  const frame: ChatFrame = { type: P2P_MESSAGE, body };
  if (replyToMessageId) frame.reply_to_message_id = replyToMessageId;
  return JSON.stringify(frame);
}

export function parseP2pFrame(raw: string): P2pFrame | null {
  try {
    const parsed = JSON.parse(raw) as Partial<P2pFrame>;
    if (parsed.type === TYPING_START || parsed.type === TYPING_STOP) {
      const handle =
        typeof parsed.handle === "string" ? parsed.handle.trim() : "";
      if (!handle) return null;
      return { type: parsed.type, handle };
    }
    if (parsed.type === P2P_MESSAGE && typeof parsed.body === "string") {
      const reply =
        typeof (parsed as ChatFrame).reply_to_message_id === "string"
          ? (parsed as ChatFrame).reply_to_message_id?.trim()
          : "";
      return {
        type: P2P_MESSAGE,
        body: parsed.body,
        ...(reply ? { reply_to_message_id: reply } : {}),
      };
    }
  } catch {
    /* plain-text chat fallback */
  }
  return null;
}

export function isTypingFrame(frame: P2pFrame | null): frame is TypingFrame {
  return frame?.type === TYPING_START || frame?.type === TYPING_STOP;
}
