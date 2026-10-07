import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useDarkeIdentity } from "./DarkeIdentityContext";
import {
  generateSessionKey,
  markChatLinkCopiedToast,
  sessionShareLink,
  stashPendingLaunch,
  type RoomKind,
} from "./dmSessions";
import { IconPlay } from "./icons";
import { PublicAuthHost, usePublicAuth } from "./PublicAuthHost";

type Props = {
  onHome: () => void;
  onPricing: () => void;
  onManual: () => void;
  onLaunchWorkspace: (slug: string, roomKind: RoomKind) => void;
  onLoggedIn: (slug: string) => void;
  onOpenLogin?: () => void;
  initialAuth?: "login" | "signup" | null;
  onAuthConsumed?: () => void;
  children?: ReactNode;
};

const COMPARE = [
  {
    index: "01",
    title: "VS. SIGNAL",
    competitor:
      "Signal relies on central relay servers that route every message through cloud infrastructure, creating traffic metadata and requiring a real-world phone number.",
    darke:
      "DARKE operates on true direct Peer-to-Peer (P2P) architecture—routing payloads node-to-node with zero middleman servers and no phone number required.",
  },
  {
    index: "02",
    title: "VS. TELEGRAM",
    competitor:
      "Telegram stores standard chats and group channels unencrypted on cloud servers by default, holding decryption access on their infrastructure.",
    darke:
      "DARKE enforces “Always-On” End-to-End Encryption across every 1-on-1 DM, group, and channel without fallback to server plaintext.",
  },
  {
    index: "03",
    title: "VS. SLACK",
    competitor:
      "Slack uses server-managed encryption where company admins, Slack employees, or corporate subpoenas can access and export your team communications.",
    darke:
      "DARKE utilizes local zero-knowledge key generation, ensuring only authorized device holders hold keys to private team chats.",
  },
] as const;

export function LandingPage({
  onHome,
  onPricing,
  onManual,
  onLaunchWorkspace,
  onLoggedIn,
  onOpenLogin,
  initialAuth = null,
  onAuthConsumed,
  children,
}: Props) {
  const { identity, setIdentity } = useDarkeIdentity();
  const [sessionKey, setSessionKey] = useState("");

  useEffect(() => {
    setSessionKey(generateSessionKey());
  }, []);

  function launchAs(slug: string) {
    const key = sessionKey || generateSessionKey();
    if (!sessionKey) setSessionKey(key);
    stashPendingLaunch("", key, { quiet: true, roomKind: "team" });
    void navigator.clipboard.writeText(sessionShareLink(key)).then(
      () => markChatLinkCopiedToast(),
      () => null,
    );
    onLaunchWorkspace(slug, "team");
  }

  return (
    <div className="landing">
      <div className="landing-inner">
        <PublicAuthHost
          onHome={onHome}
          onPricing={onPricing}
          onOpenLogin={onOpenLogin}
          initialAuth={initialAuth}
          onAuthConsumed={onAuthConsumed}
          onAlreadyAuthed={() => {
            if (identity?.handle) launchAs(identity.handle);
          }}
          onLoggedIn={onLoggedIn}
          onAccountCreated={({ slug, darkeId, publicKey, handle }) => {
            setIdentity({
              darkeId,
              handle: slug,
              displayName: handle,
              publicKey,
            });
            launchAs(slug);
          }}
        >
        <main className={`landing-main${children ? "" : " landing-home"}`}>
          {children ?? (
            <>
              <section className="landing-hero" aria-label="DARKE">
                <HeroLaunch />
              </section>
              <section className="landing-explainer" aria-label="DARKE explainer">
                <LandingExplainerVideo />
              </section>

              <section className="landing-ops" aria-label="Comparative security">
                <div className="landing-ops-lead">
                  <p className="landing-ops-label">THE STANDARD</p>
                  <h2 className="landing-ops-title">
                    THE MOST SECURE MESSENGER. PERIOD.
                  </h2>
                  <p className="landing-ops-copy">
                    True P2P routing. Always-on encryption. Cryptographic
                    DARKE IDs. Private team chats without a central keyholder.
                  </p>
                </div>
                <ol className="landing-ops-list">
                  {COMPARE.map((row) => (
                    <li key={row.title} className="landing-ops-row">
                      <span className="landing-ops-index" aria-hidden>
                        {row.index}
                      </span>
                      <div>
                        <h3>{row.title}</h3>
                        <p>{row.competitor}</p>
                        <p className="landing-ops-darke">{row.darke}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </main>

        <LandingFoot onManual={onManual} />
        </PublicAuthHost>
      </div>
    </div>
  );
}

function HeroLaunch() {
  const { openSignup } = usePublicAuth();
  return (
    <div className="landing-hero-copy-col">
      <h1 className="landing-hero-title">
        <span className="landing-hero-knox">BUNKER-GRADE</span>
        <span className="landing-hero-knox">MESSAGING PLATFORM</span>
      </h1>
      <p className="landing-hero-sub">
        Encrypted P2P messaging and file transfer for privacy-forward individuals and teams who demand total sovereignty.
      </p>
      <div className="landing-try">
        <button
          type="button"
          className="term-btn term-btn-emerald landing-try-btn"
          onClick={openSignup}
        >
          START MESSAGING
        </button>
      </div>
    </div>
  );
}

function LandingFoot({ onManual }: { onManual: () => void }) {
  const { openLogin } = usePublicAuth();
  return (
    <footer className="landing-foot">
      <div className="landing-foot-links">
        <button type="button" className="landing-ghost" onClick={openLogin}>
          LOGIN
        </button>
        <button type="button" className="landing-ghost" onClick={onManual}>
          MANUAL
        </button>
      </div>
      <p className="landing-copy">
        © DARKE. TRUE P2P. ALWAYS-ON ENCRYPTION.
      </p>
    </footer>
  );
}

function LandingExplainerVideo() {
  return (
    <div className="landing-video-frame">
      <div
        className="landing-video-stage"
        role="img"
        aria-label="How DARKE encrypts team and 1-on-1 rooms"
      >
        <span className="landing-video-play" aria-hidden>
          <IconPlay />
        </span>
        <span className="landing-video-caption">
          How DARKE encrypts team and 1-on-1 rooms
        </span>
      </div>
    </div>
  );
}
