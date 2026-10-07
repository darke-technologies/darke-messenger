import { publicError, supabase, supabaseFetch, withTimeout } from "./supabase";

export type ChannelTask = {
  id: string;
  channelId: string;
  title: string;
  done: boolean;
  sort: number;
  createdAt: string;
};

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

function asTask(row: unknown): ChannelTask | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.channel_id !== "string") return null;
  if (typeof r.title !== "string") return null;
  return {
    id: r.id,
    channelId: r.channel_id,
    title: r.title.trim(),
    done: r.done === true,
    sort: typeof r.sort === "number" ? r.sort : 0,
    createdAt: typeof r.created_at === "string" ? r.created_at : "",
  };
}

export function taskError(err: unknown): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (lower.includes("channel_tasks") || lower.includes("schema cache")) {
    return "Tasks are not set up yet. Run supabase/phase83.sql, then try again.";
  }
  return raw;
}

export async function loadChannelTasks(channelId: string): Promise<ChannelTask[]> {
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "id,channel_id,title,done,sort,created_at",
    channel_id: `eq.${channelId}`,
    order: "sort.asc,created_at.asc",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/channel_tasks?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load tasks",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `load tasks HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows.map(asTask).filter((row): row is ChannelTask => row != null);
}

export async function createChannelTask(
  channelId: string,
  title: string,
  sort: number,
): Promise<ChannelTask> {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) throw new Error("Not signed in.");
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Enter a task.");
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/channel_tasks`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        channel_id: channelId,
        title: trimmed,
        done: false,
        sort,
        created_by: me,
      }),
    }),
    15000,
    "create task",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `create task HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const row = Array.isArray(rows) ? asTask(rows[0]) : asTask(rows);
  if (!row) throw new Error("Task did not save.");
  return row;
}

export async function setChannelTaskDone(
  id: string,
  done: boolean,
): Promise<void> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/channel_tasks?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ done }),
      },
    ),
    15000,
    "update task",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `update task HTTP ${res.status}`);
  }
}

export async function deleteChannelTask(id: string): Promise<void> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/channel_tasks?id=eq.${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: authHeaders(token),
      },
    ),
    15000,
    "delete task",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `delete task HTTP ${res.status}`);
  }
}
