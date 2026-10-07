import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DarkeIdRequiredModal } from "./DarkeIdRequiredModal";
import { DarkeLoginModal } from "./DarkeLoginModal";
import { useDarkeIdentity } from "./DarkeIdentityContext";
import { PublicHeader } from "./PublicHeader";

export type AuthCreated = {
  slug: string;
  darkeId: string;
  publicKey: string;
  handle: string;
};

const PublicAuthContext = createContext<{
  openSignup: () => void;
  openLogin: () => void;
}>({
  openSignup: () => {},
  openLogin: () => {},
});

export function usePublicAuth() {
  return useContext(PublicAuthContext);
}

export function PublicAuthHost({
  onHome,
  onPricing,
  onLoggedIn,
  onAccountCreated,
  onAlreadyAuthed,
  onOpenLogin,
  initialAuth = null,
  onAuthConsumed,
  children,
}: {
  onHome: () => void;
  onPricing: () => void;
  onLoggedIn: (slug: string) => void;
  onAccountCreated: (result: AuthCreated) => void;
  onAlreadyAuthed?: () => void;
  onOpenLogin?: () => void;
  initialAuth?: "login" | "signup" | null;
  onAuthConsumed?: () => void;
  children: ReactNode;
}) {
  const { identity, setIdentity } = useDarkeIdentity();
  const [signupOpen, setSignupOpen] = useState(initialAuth === "signup");
  const [loginOpen, setLoginOpen] = useState(
    initialAuth === "login" && !onOpenLogin,
  );

  useEffect(() => {
    if (initialAuth !== "login" && initialAuth !== "signup") return;
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    if (path.startsWith("/signup")) {
      window.history.replaceState(null, "", "/");
    }
    onAuthConsumed?.();
  }, [initialAuth, onAuthConsumed]);

  const api = useMemo(
    () => ({
      openSignup: () => {
        if (identity?.handle && onAlreadyAuthed) {
          onAlreadyAuthed();
          return;
        }
        setLoginOpen(false);
        setSignupOpen(true);
      },
      openLogin: () => {
        setSignupOpen(false);
        if (onOpenLogin) {
          onOpenLogin();
          return;
        }
        setLoginOpen(true);
      },
    }),
    [identity?.handle, onAlreadyAuthed, onOpenLogin],
  );

  return (
    <PublicAuthContext.Provider value={api}>
      <PublicHeader
        onHome={onHome}
        onPricing={onPricing}
        onLogin={api.openLogin}
        onSignup={api.openSignup}
      />
      {children}
      <DarkeIdRequiredModal
        open={signupOpen}
        onClose={() => setSignupOpen(false)}
        onCreated={(result) => {
          setIdentity({
            darkeId: result.darkeId,
            handle: result.slug,
            displayName: result.handle,
            publicKey: result.publicKey,
          });
          onAccountCreated(result);
        }}
      />
      <DarkeLoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLoggedIn={onLoggedIn}
      />
    </PublicAuthContext.Provider>
  );
}
