import { publicError, supabase, supabaseFetch, withTimeout } from "./supabase";

export const INVITE_ORIGIN = "https://darke.ai";

export function inviteUrlForSlug(slug: string): string {
  const name = slug.trim().toLowerCase();
  return `${INVITE_ORIGIN}/?ref=${encodeURIComponent(name)}`;
}

export function invitesError(err: unknown): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes("pgrst205") ||
    lower.includes("schema cache") ||
    lower.includes("invite_visits") ||
    lower.includes("record_invite_visit")
  ) {
    return "Invite tracking is not set up yet. Run supabase/phase17.sql in the Supabase SQL editor.";
  }
  return raw;
}

import { supabaseAnonKey, supabaseUrl } from "./env";
const baseUrl = () => supabaseUrl();
const anonKey = () => supabaseAnonKey();

export async function loadMyInviteVisitorCount(): Promise<number> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  const token = data.session?.access_token;
  if (!userId || !token) throw new Error("Not signed in.");
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/invite_visits?select=visitor_key&referrer_id=eq.${encodeURIComponent(userId)}`,
      {
        method: "GET",
        headers: {
          apikey: anonKey(),
          Authorization: `Bearer ${token}`,
          Prefer: "count=exact",
          Range: "0-0",
        },
      },
    ),
    15000,
    "invite count",
  );
  if (res.status === 416) return 0;
  if (!res.ok) {
    throw new Error((await res.text()) || `invite count HTTP ${res.status}`);
  }
  const range = res.headers.get("content-range") ?? "";
  const total = range.split("/")[1];
  const n = total ? Number.parseInt(total, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}
