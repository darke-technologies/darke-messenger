import {
  ensureProfile,
  loginEmailsForIdentity,
  loginIdentityForUsername,
  signInWithPasswordCandidates,
  probeSupabase,
  supabase,
  withTimeout,
} from "./supabase";
import { ACCESS_DENIED } from "./darkeId";
import { authSecretsForLogin, unlockIdentityKeys } from "./darkeKeys";
import { loadMyProfile } from "./profile";
import { toSlug } from "./slug";

export async function sessionIsSignedIn(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session?.access_token);
}

export async function completeUsernameLogin(
  usernameRaw: string,
  passphrase: string,
): Promise<{
  slug: string;
  darkeId: string;
  displayName: string | null;
  publicKey: string | null;
}> {
  const slug = toSlug(usernameRaw);
  if (!slug) throw new Error("[ACCESS DENIED] Enter a username.");
  if (!passphrase) throw new Error(ACCESS_DENIED);
  const secret = passphrase.trim() || passphrase;

  try {
    await probeSupabase();
  } catch (probeErr) {
    console.log("completeUsernameLogin: probe failed", probeErr);
  }

  const ident = await withTimeout(
    loginIdentityForUsername(usernameRaw),
    15000,
    "login identity",
  );
  const vaultKeys = [
    ...new Set(
      [slug, toSlug(ident.publicUsername), ident.darkeId].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  ];
  const secrets: string[] = [];
  for (const key of vaultKeys) {
    try {
      const next = await authSecretsForLogin(secret, key);
      for (const item of next) {
        if (!secrets.includes(item)) secrets.push(item);
      }
    } catch {
      /* Skip a vault key that cannot be derived; try the next identity. */
    }
  }
  if (!secrets.length) throw new Error(ACCESS_DENIED);

  const emails = loginEmailsForIdentity({
    ...ident,
    publicUsername: toSlug(ident.publicUsername) || slug,
  });
  const data = await withTimeout(
    signInWithPasswordCandidates(emails, secrets),
    20000,
    "signInWithPassword",
  );
  if (!data.session) throw new Error(ACCESS_DENIED);

  try {
    await ensureProfile(ident.publicUsername);
  } catch {
    /* session is valid */
  }

  let unlocked: { publicKey: string } | null = null;
  let vaultKey = slug;
  for (const key of vaultKeys) {
    const keys = await unlockIdentityKeys(key, passphrase).catch(() => null);
    if (keys) {
      unlocked = keys;
      vaultKey = key;
      break;
    }
  }
  const profile = await loadMyProfile().catch(() => null);
  return {
    slug: ident.publicUsername,
    darkeId: vaultKey,
    displayName: profile?.display_name ?? null,
    publicKey: unlocked?.publicKey ?? profile?.public_key ?? null,
  };
}

/** @deprecated Use completeUsernameLogin. */
export async function completeDarkeLogin(
  usernameRaw: string,
  passphrase: string,
) {
  return completeUsernameLogin(usernameRaw, passphrase);
}

/** @deprecated Use completeUsernameLogin. */
export async function signInWithUsername(
  username: string,
  password: string,
): Promise<string> {
  const result = await completeUsernameLogin(username, password);
  return result.slug;
}
