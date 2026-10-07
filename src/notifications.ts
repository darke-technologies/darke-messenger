import { publicError, supabase, supabaseFetch, withTimeout } from "./supabase";
import {
  loadCommentsByIds,
  loadCommentsOnBeeps,
  loadUserSnippets,
  snippetDisplayName,
  type StatusComment,
  type UserSnippet,
} from "./status";

const TABLE = "notifications";

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

export type NotificationType =
  | "beep_comment"
  | "beep_reply"
  | "status_comment"
  | "status_reply"
  | "follow"
  | "channel_invite"
  | "workspace_invite";

export type DarkeNotification = {
  id: string;
  recipientId: string;
  actorId: string;
  type: NotificationType;
  statusId: string;
  beepId: string;
  commentId: string | null;
  inviteId: string | null;
  quote: string | null;
  read: boolean;
  createdAt: string;
  actor: UserSnippet | null;
};

export function isPendingInviteNotice(type: NotificationType): boolean {
  return type === "channel_invite" || type === "workspace_invite";
}

/** Likes, follows, and social-thread replies. Never badge Workspaces or Terminal. */
export function isDarkenetSocialNotice(type: NotificationType): boolean {
  return (
    type === "follow" ||
    type === "beep_comment" ||
    type === "beep_reply" ||
    type === "status_comment" ||
    type === "status_reply"
  );
}

export function notificationsError(err: unknown): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes("pgrst205") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the table") ||
    lower.includes("notifications")
  ) {
    return "Notifications are not set up yet. Run supabase/phase52.sql and supabase/phase73.sql in the Supabase SQL editor, then try again.";
  }
  return raw;
}

function asNotification(row: unknown): Omit<DarkeNotification, "actor" | "quote"> | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const typeRaw = typeof r.type === "string" ? r.type : "";
  const type: NotificationType | null =
    typeRaw === "follow"
      ? "follow"
      : typeRaw === "channel_invite"
        ? "channel_invite"
        : typeRaw === "workspace_invite"
          ? "workspace_invite"
          : typeRaw === "beep_comment" || typeRaw === "status_comment"
        ? "beep_comment"
        : typeRaw === "beep_reply" || typeRaw === "status_reply"
          ? "beep_reply"
          : null;
  if (!type) return null;
  const beepId =
    typeof r.beep_id === "string"
      ? r.beep_id
      : typeof r.status_id === "string"
        ? r.status_id
        : "";
  if (type !== "follow" && !isPendingInviteNotice(type) && !beepId) return null;
  if (typeof r.id !== "string" || typeof r.recipient_id !== "string") return null;
  if (typeof r.actor_id !== "string") return null;
  return {
    id: r.id,
    recipientId: r.recipient_id,
    actorId: r.actor_id,
    type,
    statusId: beepId,
    beepId,
    commentId:
      typeof r.comment_id === "string" && r.comment_id ? r.comment_id : null,
    inviteId: typeof r.invite_id === "string" && r.invite_id ? r.invite_id : null,
    read: r.read === true,
    createdAt: typeof r.created_at === "string" ? r.created_at : "",
  };
}

function atOrBefore(
  rows: StatusComment[],
  createdAt: string,
): StatusComment | null {
  if (rows.length === 0) return null;
  const at = (Date.parse(createdAt) || 0) + 2500;
  const prior = rows.filter((c) => (Date.parse(c.createdAt) || 0) <= at);
  const pool = prior.length > 0 ? prior : rows;
  return pool.slice().sort((a, b) => {
    return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
  })[0] ?? null;
}

export function pickCommentForNotice(
  row: {
    commentId: string | null;
    actorId: string;
    beepId: string;
    type: NotificationType;
    createdAt: string;
    quote?: string | null;
  },
  comments: StatusComment[],
): StatusComment | null {
  const onPost = comments.filter(
    (c) => !row.beepId || !c.statusId || c.statusId === row.beepId,
  );
  const fromActor = onPost.filter((c) => c.userId === row.actorId);
  const quote = row.quote?.trim() ?? "";

  if (row.commentId) {
    const hit = onPost.find((c) => c.id === row.commentId);
    if (hit) return hit;
  }

  if (quote) {
    const exact = fromActor.filter((c) => c.content.trim() === quote);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return atOrBefore(exact, row.createdAt);
  }

  const typed =
    row.type === "beep_reply"
      ? fromActor.filter((c) => c.parentId)
      : fromActor.filter((c) => !c.parentId);
  return atOrBefore(typed.length > 0 ? typed : fromActor, row.createdAt);
}

async function withQuotes(
  parsed: Omit<DarkeNotification, "actor" | "quote">[],
): Promise<Omit<DarkeNotification, "actor">[]> {
  const byId = await loadCommentsByIds(
    parsed.map((row) => row.commentId ?? "").filter(Boolean),
  );
  const missing = parsed.filter((row) => {
    if (row.type === "follow" || isPendingInviteNotice(row.type)) return false;
    if (row.commentId && byId.some((c) => c.id === row.commentId)) return false;
    return Boolean(row.beepId);
  });
  const onBeeps = await loadCommentsOnBeeps(missing.map((row) => row.beepId));
  const comments = [...byId, ...onBeeps];
  return parsed.map((row) => {
    const comment = pickCommentForNotice(row, comments);
    const commentId =
      row.commentId && comments.some((c) => c.id === row.commentId)
        ? row.commentId
        : (comment?.id ?? row.commentId);
    return {
      ...row,
      commentId,
      quote: comment?.content ?? null,
    };
  });
}

export async function loadUnreadNotificationCount(): Promise<number> {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) return 0;
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "id",
    recipient_id: `eq.${me}`,
    read: "eq.false",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "GET",
      headers: {
        ...authHeaders(token),
        Prefer: "count=exact",
        Range: "0-0",
      },
    }),
    15000,
    "unread notifications",
  );
  if (res.status === 416) return 0;
  if (!res.ok) {
    throw new Error((await res.text()) || `unread HTTP ${res.status}`);
  }
  const range = res.headers.get("content-range") ?? "";
  const total = range.split("/")[1];
  const n = total ? Number.parseInt(total, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function loadMyNotifications(): Promise<DarkeNotification[]> {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) return [];
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "id,recipient_id,actor_id,type,beep_id,comment_id,invite_id,read,created_at",
    recipient_id: `eq.${me}`,
    order: "created_at.desc",
    limit: "40",
  });
  let res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load notifications",
  );
  if (!res.ok) {
    const text = await res.text();
    const lower = text.toLowerCase();
    if (lower.includes("invite_id")) {
      qs.set("select", "id,recipient_id,actor_id,type,beep_id,comment_id,read,created_at");
      res = await withTimeout(
        supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
          method: "GET",
          headers: authHeaders(token),
        }),
        15000,
        "load notifications",
      );
    } else if (lower.includes("comment_id")) {
      qs.set("select", "id,recipient_id,actor_id,type,beep_id,read,created_at");
      res = await withTimeout(
        supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
          method: "GET",
          headers: authHeaders(token),
        }),
        15000,
        "load notifications",
      );
    } else if (lower.includes("beep_id")) {
      qs.set("select", "id,recipient_id,actor_id,type,status_id,read,created_at");
      res = await withTimeout(
        supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
          method: "GET",
          headers: authHeaders(token),
        }),
        15000,
        "load notifications",
      );
    }
    if (!res.ok) {
      throw new Error((await res.text()) || text || `load notifications HTTP ${res.status}`);
    }
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  const parsed = rows
    .map(asNotification)
    .filter((row): row is Omit<DarkeNotification, "actor" | "quote"> => row != null);
  const quoted = await withQuotes(parsed);
  const snippets = await loadUserSnippets(quoted.map((row) => row.actorId));
  return quoted.map((row) => ({
    ...row,
    actor: snippets.get(row.actorId) ?? null,
  }));
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return;
  const token = await accessToken();
  const qs = new URLSearchParams({
    id: `in.(${unique.join(",")})`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "PATCH",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ read: true }),
    }),
    15000,
    "mark notifications read",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `mark read HTTP ${res.status}`);
  }
}

export async function markNotificationsUnread(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return;
  const token = await accessToken();
  const qs = new URLSearchParams({
    id: `in.(${unique.join(",")})`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "PATCH",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ read: false }),
    }),
    15000,
    "mark notifications unread",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `mark unread HTTP ${res.status}`);
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) return;
  const token = await accessToken();
  const qs = new URLSearchParams({
    recipient_id: `eq.${me}`,
    read: "eq.false",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "PATCH",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ read: true }),
    }),
    15000,
    "mark all read",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `mark all read HTTP ${res.status}`);
  }
}

export function notificationActorName(row: DarkeNotification): string {
  const handle = row.actor?.username?.trim();
  return snippetDisplayName(row.actor, handle ? `@${handle}` : "Someone");
}

export function notificationCopy(row: DarkeNotification): string {
  if (row.type === "follow") {
    return `${notificationActorName(row)} followed you.`;
  }
  if (row.type === "channel_invite") {
    return `${notificationActorName(row)} invited you to a channel.`;
  }
  if (row.type === "workspace_invite") {
    return `${notificationActorName(row)} invited you to a workspace.`;
  }
  const quote = row.quote?.trim() ?? "";
  const label = row.type === "beep_reply" ? "Replied:" : "Commented:";
  return quote ? `${label} ${quote}` : label;
}

export function notificationAction(row: DarkeNotification): string {
  if (row.type === "follow") return "followed you";
  if (row.type === "channel_invite") return "invited you to a channel";
  if (row.type === "workspace_invite") return "invited you to a workspace";
  if (row.type === "beep_reply") return "Replied to your post";
  return "Commented on your post";
}
