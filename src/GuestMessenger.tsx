import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DmProvider, useDm } from "./DmContext";
import { formatBubbleTime, sessionShareLink } from "./dmSessions";
import { IconLock, IconPaperclip, IconSend } from "./icons";
import { PublicAuthHost, usePublicAuth, type AuthCreated } from "./PublicAuthHost";
import { TypingBar } from "./TypingBar";
import { JoinRoute } from "./JoinRoute";
import { usePeerChannel } from "./usePeerChannel";
import { useTypingSignal } from "./useTypingSignal";
import {
  hasOpenSignalSession,
  initializeX3DHSession,
  unwrapTextPayload,
  wrapTextPayload,
} from "./lib/crypto/signal";

type Props = {
  onHome: () => void;
  onPricing: () => void;
  onLoggedIn: (slug: string) => void;
  onAccountCreated: (result: AuthCreated) => void;
  onOpenLogin?: () => void;
};

export function GuestMessenger(props: Props) {
  return (
    <DmProvider slug="guest" guest>
      <GuestChatFrame {...props} />
    </DmProvider>
  );
}

function GuestChatFrame({
  onHome,
  onPricing,
  onLoggedIn,
  onAccountCreated,
  onOpenLogin,
}: Props) {
  const isJoin =
    typeof window !== "undefined" &&
    (window.location.pathname === "/join" ||
      window.location.pathname === "/join/");
  const isHost =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/messages");

  return (
    <div className="guest-frame">
      <PublicAuthHost
        onHome={onHome}
        onPricing={onPricing}
        onOpenLogin={onOpenLogin}
        onLoggedIn={onLoggedIn}
        onAccountCreated={onAccountCreated}
      >
        {isJoin ? (
          <GuestClaimBanner />
        ) : null}
        <GuestChatPane host={isHost} />
      </PublicAuthHost>
    </div>
  );
}

function GuestClaimBanner() {
  const { openSignup } = usePublicAuth();
  return (
    <div className="guest-banner">
      <span>🔒 P2P ENCRYPTED CHAT (GUEST NODE)</span>
      <button type="button" onClick={openSignup}>
        [ CLAIM ACCOUNT TO SAVE CHAT ]
      </button>
    </div>
  );
}

function GuestChatPane({ host }: { host: boolean }) {
  const {
    active,
    sendChat,
    receivePeerChat,
    roomReady,
    dismissRoomReady,
    copyChatLink,
    copied,
    draft: share,
    renameActive,
    slug,
    joinError,
  } = useDm();
  const channel = usePeerChannel(
    active?.sessionKey ?? null,
    active?.connectionState ?? "WAITING FOR PEER",
    (active?.peerUsername || active?.handle || "")
      .replace(/^@/, "")
      .trim()
      .toLowerCase() || null,
  );
  const [composer, setComposer] = useState("");
  const [signalSession, setSignalSession] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const connected = channel.connectionState === "CONNECTED";
  const { typingUsers, notifyTyping, stopTyping } = useTypingSignal({
    channel,
    handle: slug || "guest",
    connected,
  });

  useEffect(() => {
    const node = streamRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [active?.id, active?.messages.length]);

  const signalPeer = (active?.peerUsername || active?.handle || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();

  useEffect(() => {
    let cancelled = false;
    if (!signalPeer) {
      setSignalSession(false);
      return;
    }
    void (async () => {
      await initializeX3DHSession(signalPeer);
      const live = await hasOpenSignalSession(signalPeer);
      if (!cancelled) setSignalSession(live);
    })();
    return () => {
      cancelled = true;
    };
  }, [signalPeer, connected, active?.id]);

  useEffect(() => {
    return channel.onMessage((payload, replyToMessageId) => {
      void (async () => {
        const text = signalPeer
          ? await unwrapTextPayload(signalPeer, payload)
          : payload;
        receivePeerChat(text, { replyToMessageId });
        if (signalPeer) {
          setSignalSession(await hasOpenSignalSession(signalPeer));
        }
      })();
    });
  }, [channel, receivePeerChat, signalPeer]);

  function send(e?: FormEvent) {
    e?.preventDefault();
    const text = composer.trim();
    if (!text || !active) return;
    void (async () => {
      const payload = signalPeer
        ? await wrapTextPayload(signalPeer, text)
        : text;
      channel.sendMessage(payload);
      if (signalPeer) {
        setSignalSession(await hasOpenSignalSession(signalPeer));
      }
    })();
    void sendChat(text);
    stopTyping();
    setComposer("");
  }

  if (joinError) {
    return <JoinRoute error={joinError}>{null}</JoinRoute>;
  }

  if (!active) {
    return (
      <section className="dm-pane guest-empty">
        <p className="muted">Waiting for a valid chat key.</p>
      </section>
    );
  }

  const shareLink = share?.shareLink ?? sessionShareLink(active.sessionKey);
  const showDispatch = host && roomReady;

  return (
    <section className="dm-pane">
      <header className="dm-chat-head">
        <div>
          <h2>{active.displayName}</h2>
          <p>@{active.handle}</p>
        </div>
        <p
          className={`dm-sec-badge${connected || signalSession ? " is-on" : ""}`}
          title={
            signalSession
              ? "Signal session active. Messages are end-to-end encrypted."
              : "Peer channel encrypted. Establishing a Signal session…"
          }
        >
          {signalSession
            ? "E2EE · SIGNAL • GUEST NODE"
            : "P2P ENCRYPTED • GUEST NODE"}
        </p>
      </header>
      <div className="dm-stream" ref={streamRef}>
        {active.messages.map((msg) => (
          <article key={msg.id} className={`dm-bubble is-${msg.direction}`}>
            <p>{msg.body}</p>
            {msg.direction === "sent" && !connected ? (
              <span className="dm-pending-badge">
                [ ENCRYPTED • PENDING PEER ]
              </span>
            ) : null}
            <span className="dm-bubble-meta">
              <IconLock />
              {formatBubbleTime(msg.at)}
            </span>
          </article>
        ))}
      </div>
      <TypingBar handles={typingUsers} />
      <form className="dm-composer" onSubmit={send}>
        <button type="button" className="dm-attach" aria-label="Attach file">
          <IconPaperclip />
        </button>
        <textarea
          ref={areaRef}
          rows={1}
          value={composer}
          placeholder="Type an end-to-end encrypted message..."
          aria-label="Encrypted message"
          onChange={(e) => {
            setComposer(e.target.value);
            notifyTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="submit"
          className="term-btn term-btn-emerald dm-send"
          disabled={!composer.trim()}
        >
          <IconSend />
          SEND
        </button>
      </form>
      {showDispatch ? (
        <DispatchModal
          shareLink={shareLink}
          copied={copied}
          onCopy={() => void copyChatLink()}
          onCreate={(name) => {
            renameActive(name);
            void copyChatLink();
          }}
          onEnter={dismissRoomReady}
        />
      ) : null}
    </section>
  );
}

function DispatchModal({
  shareLink,
  copied,
  onCopy,
  onCreate,
  onEnter,
}: {
  shareLink: string;
  copied: boolean;
  onCopy: () => void;
  onCreate: (name: string) => void;
  onEnter: () => void;
}) {
  const [name, setName] = useState("");
  const [launched, setLaunched] = useState(false);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="apps-modal-backdrop dm-ready-backdrop" role="presentation">
      <div
        className="apps-modal dm-ready-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispatch-title"
      >
        <h3 id="dispatch-title">DISPATCH ENCRYPTED PAYLOAD</h3>
        <p className="muted apps-submit-note">
          Your payload is encrypted locally. Set a quick display name to launch
          your peer link—no phone or email required.
        </p>
        {!launched ? (
          <>
            <label className="dm-session-label" htmlFor="demo-display-name">
              Display Name
            </label>
            <input
              id="demo-display-name"
              className="dm-session-field"
              value={name}
              placeholder="DarkeMatter"
              autoFocus
              onChange={(e) => setName(e.target.value.slice(0, 40))}
            />
            <div className="projects-choice-actions dm-ready-actions">
              <button
                type="button"
                className="term-btn term-btn-emerald"
                disabled={!name.trim()}
                onClick={() => {
                  onCreate(name.trim());
                  setLaunched(true);
                }}
              >
                CREATE NODE & SHARE LINK →
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="dm-session-label" htmlFor="demo-share-link">
              Share link
            </label>
            <input
              id="demo-share-link"
              className="dm-session-field"
              readOnly
              value={shareLink}
              spellCheck={false}
            />
            <div className="projects-choice-actions dm-ready-actions">
              <button
                type="button"
                className="term-btn term-btn-emerald"
                onClick={onCopy}
              >
                {copied ? "COPIED TO CLIPBOARD!" : "COPY CHAT LINK"}
              </button>
              <button
                type="button"
                className="projects-choice-btn"
                onClick={onEnter}
              >
                ENTER CHAT ROOM
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
