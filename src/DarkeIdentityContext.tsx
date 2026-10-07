import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { clearLivePrivateKey } from "./darkeKeys";

export type DarkeSessionIdentity = {
  darkeId: string;
  handle: string;
  displayName: string | null;
  publicKey: string | null;
};

const IDENTITY_STORE = "darke.session.identity";
const LAST_USERNAME_STORE = "darke.session.lastUsername";

export function readLastUsername(): string {
  try {
    const stored = localStorage.getItem(LAST_USERNAME_STORE);
    if (stored) return stored;
    const ident = readStoredIdentity();
    return ident?.handle || "";
  } catch {
    return "";
  }
}

function writeLastUsername(username: string) {
  try {
    if (username) localStorage.setItem(LAST_USERNAME_STORE, username);
  } catch {
    /* ignore */
  }
}

function readStoredIdentity(): DarkeSessionIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_STORE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DarkeSessionIdentity>;
    if (typeof parsed.handle !== "string" && typeof parsed.darkeId !== "string") {
      return null;
    }
    const handle = typeof parsed.handle === "string" ? parsed.handle : "";
    const darkeId =
      typeof parsed.darkeId === "string" && parsed.darkeId
        ? parsed.darkeId
        : handle;
    if (!darkeId && !handle) return null;
    return {
      darkeId,
      handle,
      displayName:
        typeof parsed.displayName === "string" ? parsed.displayName : null,
      publicKey: typeof parsed.publicKey === "string" ? parsed.publicKey : null,
    };
  } catch {
    return null;
  }
}

function writeStoredIdentity(next: DarkeSessionIdentity | null) {
  try {
    if (!next) localStorage.removeItem(IDENTITY_STORE);
    else localStorage.setItem(IDENTITY_STORE, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

const IdentityContext = createContext<{
  identity: DarkeSessionIdentity | null;
  setIdentity: (next: DarkeSessionIdentity | null) => void;
}>({
  identity: null,
  setIdentity: () => {},
});

export function DarkeIdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentityState] = useState<DarkeSessionIdentity | null>(
    () => (typeof window === "undefined" ? null : readStoredIdentity()),
  );
  const value = useMemo(
    () => ({
      identity,
      setIdentity: (next: DarkeSessionIdentity | null) => {
        if (!next) clearLivePrivateKey();
        else writeLastUsername(next.handle);
        writeStoredIdentity(next);
        setIdentityState(next);
      },
    }),
    [identity],
  );
  return (
    <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
  );
}

export function useDarkeIdentity() {
  return useContext(IdentityContext);
}
