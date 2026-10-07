import { publicError, supabase, supabaseFetch, withTimeout } from "./supabase";

const UPDATES = "beeps";
const COMMENTS = "beep_comments";
const READS = "beep_reads";

export const STATUS_MAX = 3000;
export const BEEP_MAX = 3000;
export const COMMENT_MAX = 1250;
export const PROFILE_STATUS_LIMIT = 10;
export const FEED_STATUS_LIMIT = 80;
export const CHANNEL_FILE_MAX = 8 * 1024 * 1024;
export const CHANNEL_FILE_LIMIT = 4;

const CHANNEL_FILE_EXT = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "pdf",
  "txt",
  "md",
  "csv",
  "json",
  "js",
  "jsx",
  "ts",
  "tsx",
  "css",
  "html",
  "xml",
  "py",
  "rs",
  "go",
  "java",
  "rb",
  "php",
  "sql",
  "zip",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
]);

export function channelFileAllowed(file: File): string | null {
  if (file.size > CHANNEL_FILE_MAX) {
    return "Each file must be 8MB or smaller.";
  }
  const ext = file.name.split(".").pop()?.trim().toLowerCase() ?? "";
  if (!ext || !CHANNEL_FILE_EXT.has(ext)) {
    return "That file type is not allowed in channels.";
  }
  return null;
}

function fileExt(name: string): string {
  const ext = name.split(".").pop()?.trim().toLowerCase() ?? "bin";
  return ext.replace(/[^a-z0-9]/g, "") || "bin";
}

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

export type UserSnippet = {
  id: string;
  username: string;
  displayName: string | null;
  headline: string | null;
  avatarUrl: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  createdAt: string | null;
};

export function snippetDisplayName(
  row: UserSnippet | null | undefined,
  fallback = "unknown",
): string {
  const name = row?.displayName?.trim();
  if (name) return name;
  const handle = row?.username?.trim();
  return handle || fallback;
}

export type StatusUpdate = {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  workspaceId: string | null;
  channelId: string | null;
};

export type Beep = StatusUpdate;

export type CommentAttachment = {
  url: string;
  name: string;
  mime: string;
  size: number;
};

export type StatusComment = {
  id: string;
  statusId: string;
  parentId: string | null;
  userId: string;
  content: string;
  createdAt: string;
  attachments: CommentAttachment[];
};

export type BeepComment = StatusComment;

export function statusError(err: unknown): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes("pgrst205") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the table") ||
    lower.includes("status_updates") ||
    lower.includes("status_comments") ||
    lower.includes("beeps") ||
    lower.includes("beep_comments") ||
    lower.includes("beep_reads") ||
    lower.includes("beep_bookmarks")
  ) {
    if (lower.includes("beep_bookmarks")) {
      return "Bookmarks are not set up yet. Run supabase/phase78.sql in the Supabase SQL editor, then try again.";
    }
    if (lower.includes("channel-files") || lower.includes("attachments")) {
      return "Channel files are not set up yet. Run supabase/phase81.sql in the Supabase SQL editor, then try again.";
    }
    if (lower.includes("beep_reads")) {
      return "Post reads are not set up yet. Run supabase/phase71.sql in the Supabase SQL editor, then try again.";
    }
    if (lower.includes("workspace")) {
      return "Workspaces are not set up yet. Run supabase/phase74.sql in the Supabase SQL editor, then try again.";
    }
    return "Beeps are not set up yet. Run supabase/phase52.sql in the Supabase SQL editor, then try again.";
  }
  if (
    lower.includes("status_updates_content_len") ||
    lower.includes("beeps_content_len")
  ) {
    return `Keep posts to ${STATUS_MAX} characters.`;
  }
  if (
    lower.includes("status_comments_content_len") ||
    lower.includes("beep_comments_content_len")
  ) {
    return `Keep replies to ${COMMENT_MAX} characters.`;
  }
  return raw;
}

export function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const delta = Math.max(0, Date.now() - then);
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(then).toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}

export function exactTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  return new Date(then).toLocaleString();
}

/** Default post/comment/reply time: 1h, 1d, then a short date. */
export function feedCardTime(iso: string): string {
  return relativeTime(iso);
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asUserSnippet(r: Record<string, unknown>): UserSnippet | null {
  if (typeof r.id !== "string" || typeof r.username !== "string") return null;
  return {
    id: r.id,
    username: r.username,
    displayName: optionalText(r.display_name),
    headline: optionalText(r.headline),
    avatarUrl: optionalText(r.avatar_url),
    city: optionalText(r.city),
    region: optionalText(r.region),
    country: optionalText(r.country),
    createdAt: optionalText(r.created_at),
  };
}

function asStatus(row: unknown): StatusUpdate | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.user_id !== "string") return null;
  if (typeof r.content !== "string") return null;
  const content = r.content.trim();
  if (!content) return null;
  return {
    id: r.id,
    userId: r.user_id,
    content,
    createdAt: typeof r.created_at === "string" ? r.created_at : "",
    workspaceId:
      typeof r.workspace_id === "string" && r.workspace_id
        ? r.workspace_id
        : null,
    channelId:
      typeof r.channel_id === "string" && r.channel_id ? r.channel_id : null,
  };
}

const BEEP_SELECT = "id,user_id,content,created_at,workspace_id,channel_id";
const BEEP_SELECT_BASIC = "id,user_id,content,created_at";

async function fetchBeeps(
  extra: URLSearchParams,
  label: string,
  opts?: { dropWorkspaceFilter?: boolean },
): Promise<StatusUpdate[]> {
  const token = await accessToken();
  const run = async (select: string, params: URLSearchParams) => {
    const qs = new URLSearchParams(params);
    qs.set("select", select);
    return withTimeout(
      supabaseFetch(`${baseUrl()}/rest/v1/${UPDATES}?${qs}`, {
        method: "GET",
        headers: authHeaders(token),
      }),
      15000,
      label,
    );
  };
  let res = await run(BEEP_SELECT, extra);
  if (!res.ok) {
    const text = await res.text();
    if (text.toLowerCase().includes("workspace_id") || text.toLowerCase().includes("channel_id")) {
      const fallback = new URLSearchParams(extra);
      if (opts?.dropWorkspaceFilter !== false) {
        fallback.delete("workspace_id");
        fallback.delete("channel_id");
      }
      res = await run(BEEP_SELECT_BASIC, fallback);
      if (!res.ok) {
        throw new Error(
          (await res.text()) || text || `${label} HTTP ${res.status}`,
        );
      }
    } else {
      throw new Error(text || `${label} HTTP ${res.status}`);
    }
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows.map(asStatus).filter((row): row is StatusUpdate => row != null);
}

function asAttachments(raw: unknown): CommentAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: CommentAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.url !== "string" || !r.url.trim()) continue;
    out.push({
      url: r.url.trim(),
      name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : "file",
      mime: typeof r.mime === "string" ? r.mime : "",
      size: typeof r.size === "number" && Number.isFinite(r.size) ? r.size : 0,
    });
  }
  return out;
}

function asComment(row: unknown): StatusComment | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const beepId =
    typeof r.beep_id === "string"
      ? r.beep_id
      : typeof r.status_id === "string"
        ? r.status_id
        : null;
  if (typeof r.id !== "string" || !beepId) return null;
  if (typeof r.user_id !== "string") return null;
  const attachments = asAttachments(r.attachments);
  const content = typeof r.content === "string" ? r.content.trim() : "";
  if (!content && attachments.length === 0) return null;
  return {
    id: r.id,
    statusId: beepId,
    parentId: typeof r.parent_id === "string" && r.parent_id ? r.parent_id : null,
    userId: r.user_id,
    content,
    createdAt: typeof r.created_at === "string" ? r.created_at : "",
    attachments,
  };
}

export async function loadUserSnippets(
  ids: string[],
): Promise<Map<string, UserSnippet>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, UserSnippet>();
  if (unique.length === 0) return out;
  const token = await accessToken();
  const qs = new URLSearchParams({
    select:
      "id,username,display_name,headline,avatar_url,city,region,country,created_at",
    id: `in.(${unique.join(",")})`,
  });
  let res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/profiles?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load beep profiles",
  );
  if (!res.ok) {
    qs.set("select", "id,username,display_name,headline,avatar_url");
    res = await withTimeout(
      supabaseFetch(`${baseUrl()}/rest/v1/profiles?${qs}`, {
        method: "GET",
        headers: authHeaders(token),
      }),
      15000,
      "load beep profiles",
    );
  }
  if (!res.ok) {
    qs.set("select", "id,username,display_name,avatar_url");
    res = await withTimeout(
      supabaseFetch(`${baseUrl()}/rest/v1/profiles?${qs}`, {
        method: "GET",
        headers: authHeaders(token),
      }),
      15000,
      "load beep profiles",
    );
  }
  if (!res.ok) return out;
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const snip = asUserSnippet(row as Record<string, unknown>);
    if (snip) out.set(snip.id, snip);
  }
  return out;
}

export async function loadStatusUpdates(
  userId: string,
  limit = PROFILE_STATUS_LIMIT,
): Promise<StatusUpdate[]> {
  const id = userId.trim();
  if (!id) return [];
  const qs = new URLSearchParams({
    user_id: `eq.${id}`,
    workspace_id: "is.null",
    order: "created_at.desc",
    limit: String(Math.max(1, Math.min(limit, FEED_STATUS_LIMIT))),
  });
  return fetchBeeps(qs, "load beeps");
}

export async function loadStatusUpdate(id: string): Promise<StatusUpdate | null> {
  const postId = id.trim();
  if (!postId) return null;
  const qs = new URLSearchParams({
    id: `eq.${postId}`,
    limit: "1",
  });
  const rows = await fetchBeeps(qs, "load beep").catch(() => []);
  return rows[0] ?? null;
}

export async function loadStatusCount(userId: string): Promise<number> {
  const id = userId.trim();
  if (!id) return 0;
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "id",
    user_id: `eq.${id}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${UPDATES}?${qs}`, {
      method: "GET",
      headers: {
        ...authHeaders(token),
        Prefer: "count=exact",
        Range: "0-0",
      },
    }),
    15000,
    "count beeps",
  );
  if (res.status === 416) return 0;
  if (!res.ok) return 0;
  const range = res.headers.get("content-range") ?? "";
  const total = range.split("/")[1];
  const n = total ? Number.parseInt(total, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function loadUserCommentCount(userId: string): Promise<number> {
  const id = userId.trim();
  if (!id) return 0;
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "id",
    user_id: `eq.${id}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${COMMENTS}?${qs}`, {
      method: "GET",
      headers: {
        ...authHeaders(token),
        Prefer: "count=exact",
        Range: "0-0",
      },
    }),
    15000,
    "count authored comments",
  );
  if (res.status === 416) return 0;
  if (!res.ok) return 0;
  const range = res.headers.get("content-range") ?? "";
  const total = range.split("/")[1];
  const n = total ? Number.parseInt(total, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function loadFollowingStatusUpdates(
  followingIds: string[],
  limit = FEED_STATUS_LIMIT,
): Promise<StatusUpdate[]> {
  const ids = [...new Set(followingIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];
  const qs = new URLSearchParams({
    user_id: `in.(${ids.join(",")})`,
    workspace_id: "is.null",
    order: "created_at.desc",
    limit: String(Math.max(1, Math.min(limit, 80))),
  });
  return fetchBeeps(qs, "load following beeps");
}

export async function loadWorkspaceStatusUpdates(
  workspaceIds: string[],
  limit = FEED_STATUS_LIMIT,
): Promise<StatusUpdate[]> {
  const ids = [
    ...new Set(workspaceIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (ids.length === 0) return [];
  const qs = new URLSearchParams({
    workspace_id: `in.(${ids.join(",")})`,
    order: "created_at.desc",
    limit: String(Math.max(1, Math.min(limit, 80))),
  });
  return fetchBeeps(qs, "load workspace beeps", { dropWorkspaceFilter: false });
}

export async function loadChannelStatusUpdates(
  channelId: string,
  limit = FEED_STATUS_LIMIT,
): Promise<StatusUpdate[]> {
  const id = channelId.trim();
  if (!id) return [];
  const qs = new URLSearchParams({
    channel_id: `eq.${id}`,
    order: "created_at.desc",
    limit: String(Math.max(1, Math.min(limit, 80))),
  });
  return fetchBeeps(qs, "load channel beeps", { dropWorkspaceFilter: false });
}

export async function loadGlobalBeeps(
  limit = FEED_STATUS_LIMIT,
): Promise<StatusUpdate[]> {
  const qs = new URLSearchParams({
    workspace_id: "is.null",
    order: "created_at.desc",
    limit: String(Math.max(1, Math.min(limit, 80))),
  });
  return fetchBeeps(qs, "load global beeps");
}

const BOOKMARKS = "beep_bookmarks";

export async function loadMyBookmarkIds(): Promise<string[]> {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) return [];
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "beep_id,created_at",
    user_id: `eq.${me}`,
    order: "created_at.desc",
    limit: "80",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${BOOKMARKS}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load bookmarks",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `load bookmarks HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  const ids: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { beep_id?: unknown }).beep_id;
    if (typeof id === "string" && id) ids.push(id);
  }
  return ids;
}

export async function loadBookmarkedStatusUpdates(
  limit = FEED_STATUS_LIMIT,
): Promise<StatusUpdate[]> {
  const ids = (await loadMyBookmarkIds()).slice(
    0,
    Math.max(1, Math.min(limit, 80)),
  );
  if (ids.length === 0) return [];
  const qs = new URLSearchParams({
    id: `in.(${ids.join(",")})`,
    limit: String(ids.length),
  });
  const rows = await fetchBeeps(qs, "load bookmarked beeps");
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is StatusUpdate => row != null);
}

export async function setBeepBookmarked(
  statusId: string,
  on: boolean,
): Promise<void> {
  const id = statusId.trim();
  if (!id) return;
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) throw new Error("Not signed in.");
  const token = await accessToken();
  if (on) {
    const res = await withTimeout(
      supabaseFetch(
        `${baseUrl()}/rest/v1/${BOOKMARKS}?on_conflict=user_id,beep_id`,
        {
          method: "POST",
          headers: {
            ...authHeaders(token),
            "Content-Type": "application/json",
            Prefer: "return=minimal,resolution=ignore-duplicates",
          },
          body: JSON.stringify({ user_id: me, beep_id: id }),
        },
      ),
      15000,
      "save bookmark",
    );
    if (!res.ok) {
      throw new Error((await res.text()) || `bookmark HTTP ${res.status}`);
    }
    return;
  }
  const qs = new URLSearchParams({
    user_id: `eq.${me}`,
    beep_id: `eq.${id}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${BOOKMARKS}?${qs}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
    15000,
    "remove bookmark",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `unbookmark HTTP ${res.status}`);
  }
}

export function channelPostContent(
  _name: string,
  description?: string | null,
): string {
  const text = description?.trim() ?? "";
  if (text) return text.slice(0, STATUS_MAX);
  return "\u200b";
}

export async function ensureChannelBeep(
  channelId: string,
  workspaceId: string,
  name: string,
  description?: string | null,
): Promise<StatusUpdate> {
  const rows = await loadChannelStatusUpdates(channelId);
  if (rows.length > 0) {
    return [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  }
  return createStatusUpdate(
    channelPostContent(name, description),
    workspaceId,
    channelId,
  );
}

export async function syncChannelSeedBeep(
  channelId: string,
  workspaceId: string,
  name: string,
  description?: string | null,
): Promise<void> {
  const seed = await ensureChannelBeep(
    channelId,
    workspaceId,
    name,
    description,
  );
  const content = channelPostContent(name, description);
  if (seed.content !== content) {
    await updateStatusUpdate(seed.id, content).catch(() => null);
  }
}

export async function createStatusUpdate(
  content: string,
  workspaceId?: string | null,
  channelId?: string | null,
): Promise<StatusUpdate> {
  const text = content.trim();
  if (!text) throw new Error("Write a Beep.");
  if (text.length > STATUS_MAX) {
    throw new Error(`Keep Beeps to ${STATUS_MAX} characters.`);
  }
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) throw new Error("Not signed in.");
  const token = await accessToken();
  const body: Record<string, string> = { user_id: me, content: text };
  if (workspaceId) body.workspace_id = workspaceId;
  if (channelId) body.channel_id = channelId;
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${UPDATES}`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    }),
    15000,
    "transmit beep",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `transmit HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const row = Array.isArray(rows) ? asStatus(rows[0]) : asStatus(rows);
  if (!row) throw new Error("Beep did not save.");
  return row;
}

export async function loadStatusComments(
  statusId: string,
): Promise<StatusComment[]> {
  const id = statusId.trim();
  if (!id) return [];
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "id,beep_id,parent_id,user_id,content,created_at,attachments",
    beep_id: `eq.${id}`,
    order: "created_at.desc",
  });
  let res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${COMMENTS}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load comments",
  );
  if (!res.ok) {
    const text = await res.text();
    if (text.toLowerCase().includes("parent_id") || text.toLowerCase().includes("attachments")) {
      qs.set("select", "id,beep_id,user_id,content,created_at");
      res = await withTimeout(
        supabaseFetch(`${baseUrl()}/rest/v1/${COMMENTS}?${qs}`, {
          method: "GET",
          headers: authHeaders(token),
        }),
        15000,
        "load comments",
      );
    }
    if (!res.ok) {
      throw new Error((await res.text()) || text || `load comments HTTP ${res.status}`);
    }
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows.map(asComment).filter((row): row is StatusComment => row != null);
}

async function fetchCommentRows(
  qs: URLSearchParams,
  label: string,
): Promise<StatusComment[]> {
  const token = await accessToken();
  let res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${COMMENTS}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    label,
  );
  if (!res.ok) {
    const text = await res.text();
    if (
      text.toLowerCase().includes("parent_id") ||
      text.toLowerCase().includes("attachments")
    ) {
      const select = qs.get("select") ?? "";
      qs.set(
        "select",
        select
          .replace(",attachments", "")
          .replace("attachments,", "")
          .replace(",parent_id", "")
          .replace("parent_id,", ""),
      );
      res = await withTimeout(
        supabaseFetch(`${baseUrl()}/rest/v1/${COMMENTS}?${qs}`, {
          method: "GET",
          headers: authHeaders(token),
        }),
        15000,
        label,
      );
    }
    if (!res.ok) return [];
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows.map(asComment).filter((row): row is StatusComment => row != null);
}

export async function loadCommentsByIds(ids: string[]): Promise<StatusComment[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const qs = new URLSearchParams({
    select: "id,beep_id,parent_id,user_id,content,created_at,attachments",
    id: `in.(${unique.join(",")})`,
  });
  return fetchCommentRows(qs, "load comments by id");
}

export async function loadCommentsOnBeeps(
  beepIds: string[],
): Promise<StatusComment[]> {
  const unique = [...new Set(beepIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const qs = new URLSearchParams({
    select: "id,beep_id,parent_id,user_id,content,created_at,attachments",
    beep_id: `in.(${unique.join(",")})`,
    order: "created_at.desc",
  });
  return fetchCommentRows(qs, "load comments on beeps");
}

export type ProfileInteractionKind =
  | "they_commented"
  | "they_replied"
  | "you_commented"
  | "you_replied";

export type ProfileInteractionSummary = {
  count: number;
  latest: { kind: ProfileInteractionKind; at: string } | null;
};

export async function loadProfileInteractions(
  myId: string,
  theirId: string,
): Promise<ProfileInteractionSummary> {
  const me = myId.trim();
  const them = theirId.trim();
  if (!me || !them || me === them) return { count: 0, latest: null };
  const qs = new URLSearchParams({
    select: "id,beep_id,parent_id,user_id,content,created_at,attachments",
    or: `(user_id.eq.${me},user_id.eq.${them})`,
    order: "created_at.desc",
    limit: "80",
  });
  const comments = await fetchCommentRows(qs, "profile interactions");
  if (comments.length === 0) return { count: 0, latest: null };

  const parentIds = [
    ...new Set(comments.map((c) => c.parentId ?? "").filter(Boolean)),
  ];
  const beepIds = [...new Set(comments.map((c) => c.statusId).filter(Boolean))];
  const [parents, token] = await Promise.all([
    loadCommentsByIds(parentIds),
    accessToken(),
  ]);
  const parentById = new Map(parents.map((c) => [c.id, c.userId]));
  const authors = new Map<string, string>();
  if (beepIds.length > 0) {
    const beepQs = new URLSearchParams({
      select: "id,user_id",
      id: `in.(${beepIds.join(",")})`,
    });
    const res = await withTimeout(
      supabaseFetch(`${baseUrl()}/rest/v1/${UPDATES}?${beepQs}`, {
        method: "GET",
        headers: authHeaders(token),
      }),
      15000,
      "interaction beeps",
    );
    if (res.ok) {
      const rows: unknown = await res.json();
      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (!row || typeof row !== "object") continue;
          const r = row as { id?: unknown; user_id?: unknown };
          if (typeof r.id === "string" && typeof r.user_id === "string") {
            authors.set(r.id, r.user_id);
          }
        }
      }
    }
  }

  const hits: { kind: ProfileInteractionKind; at: string }[] = [];
  for (const row of comments) {
    const postAuthor = authors.get(row.statusId) ?? "";
    const parentAuthor = row.parentId ? (parentById.get(row.parentId) ?? "") : "";
    let kind: ProfileInteractionKind | null = null;
    if (row.userId === them) {
      if (parentAuthor === me) kind = "they_replied";
      else if (!row.parentId && postAuthor === me) kind = "they_commented";
      else if (postAuthor === me && parentAuthor && parentAuthor !== them) {
        kind = "they_commented";
      }
    } else if (row.userId === me) {
      if (parentAuthor === them) kind = "you_replied";
      else if (!row.parentId && postAuthor === them) kind = "you_commented";
    }
    if (kind) hits.push({ kind, at: row.createdAt });
  }

  hits.sort(
    (a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0),
  );
  return { count: hits.length, latest: hits[0] ?? null };
}

export async function loadCommentCounts(
  statusIds: string[],
): Promise<Map<string, number>> {
  const ids = [...new Set(statusIds.map((id) => id.trim()).filter(Boolean))];
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "beep_id",
    beep_id: `in.(${ids.join(",")})`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${COMMENTS}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "comment counts",
  );
  if (!res.ok) return counts;
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return counts;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { beep_id?: unknown }).beep_id;
    if (typeof id !== "string" || !id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export async function loadReadCounts(
  statusIds: string[],
): Promise<Map<string, number>> {
  const ids = [...new Set(statusIds.map((id) => id.trim()).filter(Boolean))];
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "beep_id",
    beep_id: `in.(${ids.join(",")})`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${READS}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "read counts",
  );
  if (!res.ok) return counts;
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return counts;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { beep_id?: unknown }).beep_id;
    if (typeof id !== "string" || !id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Returns true when this user is newly counted for the post. */
export async function recordBeepRead(statusId: string): Promise<boolean> {
  const id = statusId.trim();
  if (!id) return false;
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) return false;
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/${READS}?on_conflict=beep_id,user_id`,
      {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
          Prefer: "return=representation,resolution=ignore-duplicates",
        },
        body: JSON.stringify({ beep_id: id, user_id: me }),
      },
    ),
    15000,
    "record read",
  );
  if (!res.ok) return false;
  const rows: unknown = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

export type ThreadMark = {
  kind: "commented" | "replied";
  snippet: string;
};

function commentSnippet(text: string, max = 72): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (!one) return "";
  if (one.length <= max) return one;
  return `${one.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export function threadMarkFor(
  comments: {
    userId: string;
    parentId: string | null;
    content?: string;
    createdAt?: string;
  }[],
  userId: string,
): ThreadMark | null {
  const mine = comments.filter((row) => row.userId === userId);
  if (mine.length === 0) return null;
  const byTime = (a: (typeof mine)[number], b: (typeof mine)[number]) =>
    Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? "") || 0;
  const replies = mine.filter((row) => row.parentId).sort(byTime);
  const tops = mine.filter((row) => !row.parentId).sort(byTime);
  const pick = replies[0] ?? tops[0];
  if (!pick) return null;
  return {
    kind: pick.parentId ? "replied" : "commented",
    snippet: commentSnippet(pick.content ?? ""),
  };
}

export async function loadMyThreadMarks(
  statusIds: string[],
  userId: string,
): Promise<Map<string, ThreadMark>> {
  const ids = [...new Set(statusIds.map((id) => id.trim()).filter(Boolean))];
  const marks = new Map<string, ThreadMark>();
  const me = userId.trim();
  if (ids.length === 0 || !me) return marks;
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "beep_id,parent_id,content,created_at",
    beep_id: `in.(${ids.join(",")})`,
    user_id: `eq.${me}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${COMMENTS}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "my thread marks",
  );
  if (!res.ok) return marks;
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return marks;
  const byPost = new Map<
    string,
    { userId: string; parentId: string | null; content?: string; createdAt?: string }[]
  >();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as {
      beep_id?: unknown;
      parent_id?: unknown;
      content?: unknown;
      created_at?: unknown;
    };
    if (typeof r.beep_id !== "string" || !r.beep_id) continue;
    const list = byPost.get(r.beep_id) ?? [];
    list.push({
      userId: me,
      parentId: typeof r.parent_id === "string" ? r.parent_id : null,
      content: typeof r.content === "string" ? r.content : "",
      createdAt: typeof r.created_at === "string" ? r.created_at : "",
    });
    byPost.set(r.beep_id, list);
  }
  for (const [id, list] of byPost) {
    const mark = threadMarkFor(list, me);
    if (mark) marks.set(id, mark);
  }
  return marks;
}

export async function uploadChannelFile(file: File): Promise<CommentAttachment> {
  const blocked = channelFileAllowed(file);
  if (blocked) throw new Error(blocked);
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Not signed in.");
  const token = await accessToken();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  const path = `${uid}/${crypto.randomUUID()}.${fileExt(safe)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/storage/v1/object/channel-files/${path}`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false",
      },
      body: bytes,
    }),
    60000,
    "upload channel file",
  );
  if (!res.ok) {
    const text = (await res.text()).toLowerCase();
    if (
      text.includes("channel-files") ||
      text.includes("bucket") ||
      text.includes("not found")
    ) {
      throw new Error(
        "Channel files are not set up yet. Run supabase/phase81.sql in the Supabase SQL editor, then try again.",
      );
    }
    throw new Error((await res.text()) || `upload HTTP ${res.status}`);
  }
  return {
    url: `${baseUrl()}/storage/v1/object/public/channel-files/${path}`,
    name: file.name.trim() || "file",
    mime: file.type || "application/octet-stream",
    size: file.size,
  };
}

export async function createStatusComment(
  statusId: string,
  content: string,
  parentId?: string | null,
  attachments: CommentAttachment[] = [],
): Promise<StatusComment> {
  const text = content.trim();
  if (!text && attachments.length === 0) throw new Error("Write a reply.");
  if (text.length > COMMENT_MAX) {
    throw new Error(`Keep replies to ${COMMENT_MAX} characters.`);
  }
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) throw new Error("Not signed in.");
  const token = await accessToken();
  const body: Record<string, unknown> = {
    beep_id: statusId,
    user_id: me,
    content: text || " ",
  };
  if (parentId) body.parent_id = parentId;
  if (attachments.length > 0) body.attachments = attachments;
  let res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${COMMENTS}`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    }),
    15000,
    "post comment",
  );
  if (!res.ok) {
    const errText = await res.text();
    const lower = errText.toLowerCase();
    if (parentId && lower.includes("parent_id")) {
      delete body.parent_id;
      res = await withTimeout(
        supabaseFetch(`${baseUrl()}/rest/v1/${COMMENTS}`, {
          method: "POST",
          headers: {
            ...authHeaders(token),
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(body),
        }),
        15000,
        "post comment",
      );
    } else if (attachments.length > 0 && lower.includes("attachments")) {
      throw new Error(
        "Channel files are not set up yet. Run supabase/phase81.sql in the Supabase SQL editor, then try again.",
      );
    } else {
      throw new Error(errText || `post comment HTTP ${res.status}`);
    }
  }
  if (!res.ok) {
    throw new Error((await res.text()) || `post comment HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const row = Array.isArray(rows) ? asComment(rows[0]) : asComment(rows);
  if (!row) throw new Error("Reply did not save.");
  return row;
}

async function patchOwnRow(
  table: string,
  id: string,
  content: string,
  asRow: (raw: unknown) => StatusUpdate | StatusComment | null,
  label: string,
): Promise<StatusUpdate | StatusComment> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ content }),
    }),
    15000,
    label,
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `${label} HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const row = Array.isArray(rows) ? asRow(rows[0]) : asRow(rows);
  if (!row) throw new Error("Could not save.");
  return row;
}

export async function updateStatusUpdate(
  id: string,
  content: string,
): Promise<StatusUpdate> {
  const text = content.trim();
  if (!text) throw new Error("Write a post.");
  if (text.length > STATUS_MAX) {
    throw new Error(`Keep posts to ${STATUS_MAX} characters.`);
  }
  return (await patchOwnRow(UPDATES, id, text, asStatus, "edit beep")) as StatusUpdate;
}

export async function deleteStatusUpdate(id: string): Promise<void> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${UPDATES}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
    15000,
    "delete beep",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `delete beep HTTP ${res.status}`);
  }
}

export async function updateStatusComment(
  id: string,
  content: string,
): Promise<StatusComment> {
  const text = content.trim();
  if (!text) throw new Error("Write a reply.");
  if (text.length > COMMENT_MAX) {
    throw new Error(`Keep replies to ${COMMENT_MAX} characters.`);
  }
  return (await patchOwnRow(
    COMMENTS,
    id,
    text,
    asComment,
    "edit comment",
  )) as StatusComment;
}

export async function deleteStatusComment(id: string): Promise<void> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${COMMENTS}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
    15000,
    "delete comment",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `delete comment HTTP ${res.status}`);
  }
}
