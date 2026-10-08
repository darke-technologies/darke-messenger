"use client";

import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { DarkeIdentityProvider, useDarkeIdentity } from "./DarkeIdentityContext";
import { clearLivePrivateKey } from "./darkeKeys";
import { Gate } from "./Gate";
import { LandingPage } from "./LandingPage";
import { LoginPage } from "./LoginPage";
import { PricingPage } from "./PricingPage";
import { ManualPane } from "./ManualPane";
import { bootstrapSignalProtocol } from "./lib/crypto/signal";
import { loadMyProfile } from "./profile";
import { sessionPublicUsername, supabase, supabaseConfigured } from "./supabase";
import {
  consumeAuthCallback,
  isPasswordRecoveryPending,
  markPasswordRecoveryPending,
} from "./authCallback";
import { resetWelcomePrefsCache, hydrateThemeFromVault } from "./welcomePrefs";
import { initTheme } from "./theme";
import { captureJoinIntent } from "./dmSessions";
import { GuestMessenger } from "./GuestMessenger";
import { UpgradeModal } from "./UpgradeModal";
import { OPEN_PRICING_EVENT } from "./useUpgradeModalStore";
import { isP2pJoinPath, isTeamHandlePath } from "./teamContainer";

const Shell = lazy(() => import("./Shell").then((m) => ({ default: m.Shell })));

function resetSessionCaches() {
  resetWelcomePrefsCache();
}

class ShellErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.stack || error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("DARKE UI crash", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-frame">
          <div className="gate">
            <div className="gate-card">
              <h1>DARKE hit a problem</h1>
              <p className="copy">The window stayed dark because the UI crashed. Details:</p>
              <pre className="copy" style={{ whiteSpace: "pre-wrap", textAlign: "left" }}>
                {this.state.error}
              </pre>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type Screen =
  | { kind: "missing-env" }
  | { kind: "boot" }
  | { kind: "landing" }
  | { kind: "login" }
  | { kind: "pricing" }
  | { kind: "public-manual" }
  | { kind: "gate"; startCard: "create" | "signin" | "aborted" | "forgot" | "reset" }
  | { kind: "guest-chat" }
  | { kind: "app"; slug: string };

function pathScreenFromPath(path: string): Screen {
  if (isTeamHandlePath(path) || path.startsWith("/teams")) {
    return { kind: "boot" };
  }
  if (isP2pJoinPath(path) || path.startsWith("/messages")) {
    return { kind: "guest-chat" };
  }
  if (path.startsWith("/app")) {
    return { kind: "boot" };
  }
  if (path.startsWith("/manual")) return { kind: "public-manual" };
  if (path.startsWith("/pricing")) return { kind: "pricing" };
  if (path.startsWith("/login")) return { kind: "login" };
  return { kind: "landing" };
}

function initialAuthFromPath(path: string): "login" | "signup" | null {
  if (path.startsWith("/signup")) return "signup";
  return null;
}

function pathScreen(): Screen {
  if (typeof window === "undefined") return { kind: "landing" };
  return pathScreenFromPath(window.location.pathname);
}

export default function App({ initialPath = "/" }: { initialPath?: string }) {
  return (
    <DarkeIdentityProvider>
      <AppBody initialPath={initialPath} />
      <UpgradeModal />
    </DarkeIdentityProvider>
  );
}

function AppBody({ initialPath }: { initialPath: string }) {
  const { setIdentity } = useDarkeIdentity();
  const [pendingAuth, setPendingAuth] = useState<"login" | "signup" | null>(() =>
    initialAuthFromPath(initialPath),
  );
  const [screen, setScreen] = useState<Screen>(() =>
    supabaseConfigured
      ? pathScreenFromPath(initialPath)
      : { kind: "missing-env" },
  );
  const screenRef = useRef(screen);
  screenRef.current = screen;

  function go(path: string, next: Screen) {
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", path);
    }
    setScreen(next);
  }

  function goLogin() {
    go("/login", { kind: "login" });
  }

  function goSignup() {
    setPendingAuth("signup");
    go("/", { kind: "landing" });
  }

  function enterApp(slug: string, _dest: "home" | "chat" = "chat") {
    resetSessionCaches();
    void hydrateThemeFromVault().catch(() => null);
    go("/app", { kind: "app", slug });
  }

  useEffect(() => {
    initTheme();
    captureJoinIntent();
  }, []);

  useEffect(() => {
    function onPop() {
      if (screenRef.current.kind === "app") return;
      setScreen(pathScreen());
    }
    function onPricing() {
      setScreen({ kind: "pricing" });
    }
    window.addEventListener("popstate", onPop);
    window.addEventListener(OPEN_PRICING_EVENT, onPricing);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener(OPEN_PRICING_EVENT, onPricing);
    };
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "PASSWORD_RECOVERY") return;
      markPasswordRecoveryPending();
      if (!cancelled) setScreen({ kind: "gate", startCard: "reset" });
    });
    void (async () => {
      try {
        const callback = await consumeAuthCallback();
        if (cancelled) return;
        if (callback === "recovery" || isPasswordRecoveryPending()) {
          setScreen({ kind: "gate", startCard: "reset" });
          return;
        }
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!data.session) {
          if (
            window.location.pathname.startsWith("/app") ||
            window.location.pathname.startsWith("/teams") ||
            isTeamHandlePath(window.location.pathname)
          ) {
            setScreen({ kind: "login" });
          }
          return;
        }
        const slug = await sessionPublicUsername();
        if (cancelled || !slug) {
          if (
            window.location.pathname.startsWith("/app") ||
            window.location.pathname.startsWith("/teams") ||
            isTeamHandlePath(window.location.pathname)
          ) {
            setScreen({ kind: "login" });
          }
          return;
        }
        resetSessionCaches();
        await hydrateThemeFromVault().catch(() => null);
        await bootstrapSignalProtocol().catch(() => null);
        const profile = await loadMyProfile().catch(() => null);
        if (profile?.darke_id) {
          setIdentity({
            darkeId: profile.darke_id,
            handle: profile.username,
            displayName: profile.display_name,
            publicKey: profile.public_key ?? null,
          });
        }
        if (typeof window !== "undefined") {
          const path = window.location.pathname;
          if (path === "/" || path === "") {
            window.history.replaceState(null, "", "/app");
          }
        }
        setScreen({ kind: "app", slug });
      } catch {
        // Stay on Gate.
      }
    })();
    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, []);

  if (screen.kind === "missing-env") {
    return (
      <div className="app-frame">
        <div className="gate">
          <div className="gate-card">
            <h1>DARKE</h1>
            <p className="copy">
              Copy <code>.env.example</code> to <code>.env</code> and set{" "}
              <code>VITE_SUPABASE_URL</code> (or <code>NEXT_PUBLIC_SUPABASE_URL</code>) and{" "}
              <code>VITE_SUPABASE_ANON_KEY</code>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (screen.kind === "boot") {
    return (
      <div className="app-frame">
        <p className="copy" style={{ margin: "auto", textAlign: "center" }}>
          Opening DARKE…
        </p>
      </div>
    );
  }

  if (screen.kind === "guest-chat") {
    return (
      <div className="app-frame">
        <GuestMessenger
          onHome={() => go("/", { kind: "landing" })}
          onPricing={() => go("/pricing", { kind: "pricing" })}
          onOpenLogin={goLogin}
          onLoggedIn={(slug) => enterApp(slug)}
          onAccountCreated={(result) => enterApp(result.slug)}
        />
      </div>
    );
  }

  if (screen.kind === "app") {
    return (
      <ShellErrorBoundary>
        <Suspense
          fallback={
            <div className="app-frame">
              <p className="copy" style={{ margin: "auto", textAlign: "center" }}>
                Opening DARKE…
              </p>
            </div>
          }
        >
        <Shell
          slug={screen.slug}
          onSlugChanged={(next) => setScreen({ kind: "app", slug: next })}
          onSignedOut={() => {
            resetSessionCaches();
            clearLivePrivateKey();
            setIdentity(null);
            go("/", { kind: "landing" });
          }}
          onAborted={() => {
            resetSessionCaches();
            clearLivePrivateKey();
            setIdentity(null);
            go("/", { kind: "landing" });
          }}
          onAccountDeleted={() => {
            resetSessionCaches();
            clearLivePrivateKey();
            setIdentity(null);
            go("/", { kind: "landing" });
          }}
        />
        </Suspense>
      </ShellErrorBoundary>
    );
  }

  if (screen.kind === "login") {
    return (
      <div className="app-frame">
        <LoginPage
          onHome={() => go("/", { kind: "landing" })}
          onPricing={() => go("/pricing", { kind: "pricing" })}
          onSignup={goSignup}
          onLoggedIn={(slug) => enterApp(slug)}
        />
      </div>
    );
  }

  if (screen.kind === "pricing") {
    return (
      <div className="app-frame">
        <PricingPage
          onHome={() => go("/", { kind: "landing" })}
          onPricing={() => go("/pricing", { kind: "pricing" })}
          onOpenLogin={goLogin}
          onLoggedIn={(slug) => enterApp(slug)}
          onAccountCreated={(result) => enterApp(result.slug)}
        />
      </div>
    );
  }

  if (screen.kind === "landing" || screen.kind === "public-manual") {
    return (
      <div className="app-frame">
        <LandingPage
          onHome={() => go("/", { kind: "landing" })}
          onPricing={() => go("/pricing", { kind: "pricing" })}
          onManual={() => go("/manual", { kind: "public-manual" })}
          onOpenLogin={goLogin}
          initialAuth={pendingAuth}
          onAuthConsumed={() => setPendingAuth(null)}
          onLoggedIn={(slug) => enterApp(slug)}
          onLaunchWorkspace={(slug, roomKind) => {
            resetSessionCaches();
            void hydrateThemeFromVault().catch(() => null);
            const type = roomKind === "team" ? "team" : "direct";
            go(`/app?type=${type}`, { kind: "app", slug });
          }}
        >
          {screen.kind === "public-manual" ? (
            <ManualPane onHome={() => go("/", { kind: "landing" })} />
          ) : null}
        </LandingPage>
      </div>
    );
  }

  return (
    <div className="app-frame">
      <Gate
        startCard={screen.startCard}
        onHome={() => go("/", { kind: "landing" })}
        onReady={(slug) => {
          resetSessionCaches();
          void hydrateThemeFromVault().catch(() => null);
          void bootstrapSignalProtocol().catch(() => null);
          if (typeof window !== "undefined") {
            const path = window.location.pathname;
            captureJoinIntent();
            if (isTeamHandlePath(path) || path.startsWith("/teams")) {
              // Keep /teams/[slug] and /join/[slug].
            } else if (
              isP2pJoinPath(path) ||
              path.startsWith("/messages")
            ) {
              window.history.replaceState(
                null,
                "",
                `/app${window.location.hash || ""}`,
              );
            } else if (!path.startsWith("/app")) {
              window.history.replaceState(null, "", "/app");
            }
          }
          setScreen({ kind: "app", slug });
        }}
      />
    </div>
  );
}
