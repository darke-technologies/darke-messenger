import { publicError, supabase, supabaseFetch, withTimeout } from "./supabase";

const TABLE = "follows";

import { supabaseAnonKey, supabaseUrl } from "./env";
const baseUrl = () => supabaseUrl();
const anonKey = () => supabaseAnonKey();

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");
  return token;
}

function authHeaders(token: string): Record<string, string> {
  return {
    apikey: anonKey(),
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

export type FollowStats = {
  followers: number;
  following: number;
  isFollowing: boolean;
  followsYou: boolean;
};

export function followsError(err: unknown): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes("pgrst205") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the table") ||
    lower.includes("follows")
  ) {
    return "Follows are not set up yet. Run supabase/phase49.sql in the Supabase SQL editor, then try again.";
  }
  if (lower.includes("follows_not_self") || lower.includes("check constraint")) {
    return "You cannot follow yourself.";
  }
  return raw;
}

async function countFollows(filter: string): Promise<number> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/${TABLE}?select=follower_id&${filter}`,
      {
        method: "GET",
        headers: {
          ...authHeaders(token),
          Prefer: "count=exact",
          Range: "0-0",
        },
      },
    ),
    15000,
    "follow count",
  );
  if (res.status === 416) return 0;
  if (!res.ok) {
    throw new Error((await res.text()) || `follow count HTTP ${res.status}`);
  }
  const range = res.headers.get("content-range") ?? "";
  const total = range.split("/")[1];
  const n = total ? Number.parseInt(total, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function loadFollowStats(userId: string): Promise<FollowStats> {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id ?? null;
  const [followers, following, isFollowing, followsYou] = await Promise.all([
    countFollows(`following_id=eq.${encodeURIComponent(userId)}`),
    countFollows(`follower_id=eq.${encodeURIComponent(userId)}`),
    me && me !== userId ? loadIsFollowing(userId, me) : Promise.resolve(false),
    me && me !== userId ? loadIsFollowing(me, userId) : Promise.resolve(false),
  ]);
  return { followers, following, isFollowing, followsYou };
}

export async function loadIsFollowing(
  userId: string,
  followerId?: string,
): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const me = followerId ?? data.session?.user.id;
  if (!me || me === userId) return false;
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "follower_id",
    follower_id: `eq.${me}`,
    following_id: `eq.${userId}`,
    limit: "1",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "check follow",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `check follow HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

export async function loadMyFollowingIds(): Promise<Set<string>> {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) return new Set();
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "following_id",
    follower_id: `eq.${me}`,
    order: "created_at.desc",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load following",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `load following HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const ids = new Set<string>();
  if (!Array.isArray(rows)) return ids;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { following_id?: unknown }).following_id;
    if (typeof id === "string" && id) ids.add(id);
  }
  return ids;
}

export async function loadMyMutualFollowIds(): Promise<Set<string>> {
  const following = await loadMyFollowingIds();
  if (following.size === 0) return new Set();
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) return new Set();
  const token = await accessToken();
  const ids = [...following];
  const qs = new URLSearchParams({
    select: "follower_id",
    following_id: `eq.${me}`,
    follower_id: `in.(${ids.join(",")})`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load mutual follows",
  );
  if (!res.ok) return new Set();
  const rows: unknown = await res.json();
  const mutual = new Set<string>();
  if (!Array.isArray(rows)) return mutual;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { follower_id?: unknown }).follower_id;
    if (typeof id === "string" && following.has(id)) mutual.add(id);
  }
  return mutual;
}

export async function setFollowing(
  userId: string,
  follow: boolean,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) throw new Error("Not signed in.");
  if (me === userId) throw new Error("You cannot follow yourself.");
  const token = await accessToken();
  if (follow) {
    const res = await withTimeout(
      supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}`, {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          follower_id: me,
          following_id: userId,
        }),
      }),
      15000,
      "follow",
    );
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 409 || text.toLowerCase().includes("duplicate")) {
        return;
      }
      throw new Error(text || `follow HTTP ${res.status}`);
    }
    return;
  }
  const qs = new URLSearchParams({
    follower_id: `eq.${me}`,
    following_id: `eq.${userId}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
    15000,
    "unfollow",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `unfollow HTTP ${res.status}`);
  }
}
