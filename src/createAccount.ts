import { DARKE_AVATAR_PRESETS } from "./darkeAvatars";
import {
  createAndStoreIdentityKeys,
  deriveAuthPassword,
} from "./darkeKeys";
import { toSlug } from "./slug";
import {
  isValidDisplayName,
  isValidUsername,
  normalizeDisplayNameInput,
  normalizeUsername,
} from "./personDirectory";
import {
  ensureProfile,
  rollbackAuth,
  supabase,
  syntheticAuthEmail,
  usernameAvailable,
  withTimeout,
} from "./supabase";
import { ensurePrimaryWorkspace } from "./workspaces";

export function generateAnonHandle(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return `darke_user_${100 + (n[0] % 900)}`;
}

export async function createDarkeAccount(opts: {
  passphrase: string;
  username: string;
  displayName: string;
  darkeId?: string;
}): Promise<{ slug: string; darkeId: string; publicKey: string }> {
  const slug = normalizeUsername(opts.username);
  if (!isValidUsername(slug)) {
    throw new Error("Username must be 3–30 characters: letters, numbers, or underscores.");
  }
  const name = normalizeDisplayNameInput(opts.displayName);
  if (!isValidDisplayName(name)) {
    throw new Error("Display name is required (1–50 characters).");
  }
  const passphrase = opts.passphrase;
  const available = await withTimeout(
    usernameAvailable(slug),
    15000,
    "available",
  );
  if (!available) {
    throw new Error("already taken — sign in");
  }

  const vaultKey = slug;
  const mail = syntheticAuthEmail(vaultKey);
  const { publicKey } = await createAndStoreIdentityKeys(vaultKey, passphrase);
  const authPassword = await deriveAuthPassword(vaultKey, passphrase);

  const { data, error: signError } = await withTimeout(
    Promise.resolve(
      supabase.auth.signUp({
        email: mail,
        password: authPassword,
        options: {
          data: {
            username: slug,
            display_name: name,
            darke_id: vaultKey,
            handle: slug,
          },
        },
      }),
    ),
    20000,
    "signUp",
  );
  if (signError) throw signError;

  let session = data.session;
  if (data.user && !session) {
    const signed = await withTimeout(
      Promise.resolve(
        supabase.auth.signInWithPassword({
          email: mail,
          password: authPassword,
        }),
      ),
      20000,
      "signIn after signUp",
    );
    if (signed.error) throw signed.error;
    session = signed.data.session;
  }
  if (!data.user || !session) {
    throw new Error("Could not start a session. Try signing in.");
  }

  const preset =
    DARKE_AVATAR_PRESETS[
      Math.floor(Math.random() * DARKE_AVATAR_PRESETS.length)
    ];

  try {
    await ensureProfile({
      slug,
      displayName: name,
      darkeId: vaultKey,
      publicKey,
      avatarUrl: preset.url,
      isPrivate: false,
    });
    await ensurePrimaryWorkspace(slug).catch(() => null);
  } catch (profileErr) {
    await rollbackAuth();
    throw profileErr;
  }

  return { slug, darkeId: vaultKey, publicKey };
}

export async function pickAvailableHandle(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const handle = generateAnonHandle();
    const ok = await usernameAvailable(toSlug(handle)).catch(() => true);
    if (ok) return handle;
  }
  return generateAnonHandle();
}
