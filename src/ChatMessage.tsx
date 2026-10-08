import { isLocalOnlySystemNotice } from "./chatService";
import {
  formatBubbleTime,
  NODE_GREETING,
  P2P_ENCLAVE_BODY,
  P2P_ENCLAVE_TITLE,
  type DmMessage,
} from "./dmSessions";
import { UserAvatar } from "./UserAvatar";

function ReplyIcon() {
  return (
    <svg
      className="newsfeed-reply-icon"
      viewBox="0 0 16 16"
      width="12"
      height="12"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M6.2 2.3a.75.75 0 0 1 .05 1.06L4.36 5.5H9.5A4.5 4.5 0 0 1 14 10v1.25a.75.75 0 0 1-1.5 0V10A3 3 0 0 0 9.5 7H4.36l1.89 2.14a.75.75 0 1 1-1.12 1L2.2 7.28a.75.75 0 0 1 0-1.06l2.93-3.14a.75.75 0 0 1 1.06-.05Z"
      />
    </svg>
  );
}

export type ChatPerson = {
  handle: string;
  display: string;
  avatar: string | null;
};

export function ChatMessage({
  msg,
  quoted,
  highlighted,
  connected,
  onReply,
  onOpenQuote,
  onAddPeople: _onAddPeople,
  canInvite: _canInvite = false,
  you,
  peer,
  isAdmin = false,
  isGroup = false,
}: {
  msg: DmMessage;
  quoted?: DmMessage | null;
  highlighted?: boolean;
  connected: boolean;
  onReply: (msg: DmMessage) => void;
  onOpenQuote?: (id: string) => void;
  onAddPeople?: () => void;
  canInvite?: boolean;
  you: ChatPerson;
  peer: ChatPerson;
  isAdmin?: boolean;
  isGroup?: boolean;
}) {
  const system = isLocalOnlySystemNotice(msg);
  const mine = msg.direction === "sent";
  const who = system
    ? { handle: "darke", display: "DARKE Node", avatar: "/darke.png" }
    : mine
      ? you
      : peer;
  const quoteText =
    (quoted?.fileName || quoted?.body || msg.replyToSnippet || "").trim();
  const quoteId = quoted?.id || msg.replyToMessageId;
  const body = msg.fileName ? (
    msg.fileUrl ? (
      <a href={msg.fileUrl} download={msg.fileName}>
        {msg.fileName}
      </a>
    ) : (
      msg.fileName
    )
  ) : (
    msg.body
  );
  void connected;
  const status =
    msg.relay === "pending-keys"
      ? "Waiting for recipient to initialize security keys"
      : null;

  const replyBtn = (
    <button
      type="button"
      className="newsfeed-reply-btn"
      onClick={() => onReply(msg)}
    >
      <ReplyIcon />
      Reply
    </button>
  );

  if (system) {
    const title = msg.title?.trim() || P2P_ENCLAVE_TITLE;
    const body =
      msg.body === NODE_GREETING || !msg.body.trim()
        ? P2P_ENCLAVE_BODY
        : msg.body;
    return (
      <article
        data-msg-id={msg.id}
        className={`p2p-enclave-card${highlighted ? " is-search-hit is-target" : ""}`}
      >
        <h3>{title}</h3>
        <p>{body}</p>
      </article>
    );
  }

  return (
    <article
      data-msg-id={msg.id}
      className={`dm-bubble-row${mine ? " is-mine" : " is-theirs"}${highlighted ? " is-search-hit is-target" : ""}${isGroup ? "" : " is-direct"}`}
    >
      {!mine && isGroup ? (
        <UserAvatar
          username={who.display || who.handle}
          url={who.avatar}
          className="dm-bubble-avatar"
          initialsLength={2}
        />
      ) : null}
      {mine && !isGroup ? replyBtn : null}
      <div className="dm-bubble-col">
        {!mine && isGroup ? (
          <span className="dm-bubble-name">
            {who.display}
            {isAdmin ? <span className="newsfeed-author-badge">ADMIN</span> : null}
          </span>
        ) : null}
        {quoteId && quoteText ? (
          <button
            type="button"
            className="dm-quote"
            onClick={() => quoteId && onOpenQuote?.(quoteId)}
          >
            {quoteText}
          </button>
        ) : msg.replyToMessageId ? (
          <p className="dm-quote is-missing">Original message unavailable</p>
        ) : null}
        <div className={`dm-bubble${mine ? " is-sent" : " is-received"}`}>
          <p>
            {body}
            {!isGroup ? (
              <time
                className="dm-bubble-time"
                dateTime={new Date(msg.at).toISOString()}
              >
                {formatBubbleTime(msg.at)}
              </time>
            ) : null}
          </p>
        </div>
        {mine && status ? <span className="dm-bubble-status">{status}</span> : null}
        {isGroup ? replyBtn : null}
      </div>
      {!mine && !isGroup ? replyBtn : null}
    </article>
  );
}
