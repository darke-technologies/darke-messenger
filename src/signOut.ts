import { gateMessage, supabase, withTimeout } from "./supabase";
import { clearLivePrivateKey } from "./darkeKeys";

/**
 * End the session on this device. Does not delete the cloud account.
 */
export async function signOutOfDarke(
  onStatus?: (message: string) => void,
): Promise<void> {
  onStatus?.("Signing out…");
  clearLivePrivateKey();
  try {
    await withTimeout(supabase.auth.signOut({ scope: "local" }), 5000, "signOut");
  } catch {
    // Gate still returns to Sign in.
  }
}

/**
 * Permanently delete the DARKE Auth account.
 */
export async function deleteDarkeAccount(_slug: string): Promise<void> {
  const { error } = await withTimeout(
    supabase.rpc("delete_own_account"),
    15000,
    "delete account",
  );
  if (error) {
    throw new Error(gateMessage(error));
  }
  try {
    await withTimeout(supabase.auth.signOut({ scope: "local" }), 5000, "signOut");
  } catch {
    // Account is already gone.
  }
}
