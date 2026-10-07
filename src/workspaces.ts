import { generateAccessKey } from "./accessKeys";
import { supabaseAnonKey, supabaseUrl } from "./env";
import { publicError, supabase, supabaseFetch, withTimeout } from "./supabase";
import type { DarkeProfile } from "./profile";

export type WorkspaceStatus = "active";

export type DarkeWorkspace = {
  id: string;
  ownerId: string;
  name: string;
  status: WorkspaceStatus;
  createdAt: string;
  slug: string;
  avatarUrl: string | null;
  websiteUrl: string | null;
  description: string | null;
  myRole: "owner" | "member" | "guest";
};

export type ChannelVisibility = "public" | "private";

export type DarkeChannel = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  slugHash: string;
  description: string | null;
  createdAt: string;
  visibility: ChannelVisibility;
  onboardingComplete: boolean;
  createdBy: string | null;
};

const CHANNEL_SELECT =
  "id,workspace_id,name,slug,slug_hash,description,created_at,visibility,onboarding_complete,created_by";

export function channelSlugHashFromId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

export function isChannelUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

export type DarkeWorkspaceMember = {
  workspaceId: string;
  userId: string;
  role: "owner" | "member" | "guest";
  createdAt: string;
};

export type DarkeChannelMember = {
  channelId: string;
  userId: string;
  role: "owner" | "member" | "guest";
  createdAt: string;
};

export type DarkeWorkspaceInvite = {
  id: string;
  workspaceId: string;
  token: string;
  email: string | null;
  inviteeId: string | null;
  outOfNetwork: boolean;
};

export type DarkeAccessKey = {
  id: string;
  table: "workspace_invites" | "channel_invites";
  accessKey: string;
  workspaceId: string | null;
  channelId: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  isRoot: boolean;
  createdAt: string;
};

export type WorkspaceTier = "free" | "pro" | "elite";

export type WorkspaceModule = "channels" | "members" | "tasks";

export const WORKSPACE_MODULES: {
  id: WorkspaceModule;
  label: string;
  icon: string;
}[] = [
  { id: "channels", label: "Channels", icon: "💬" },
  { id: "members", label: "Team Members", icon: "👥" },
];

export const WORKSPACE_ACTIVE_LIMIT: Record<WorkspaceTier, number> = {
  free: 1,
  pro: Number.POSITIVE_INFINITY,
  elite: Number.POSITIVE_INFINITY,
};

export const WORKSPACE_CHANNEL_LIMIT: Record<WorkspaceTier, number> = {
  free: 1,
  pro: Number.POSITIVE_INFINITY,
  elite: Number.POSITIVE_INFINITY,
};

export const WORKSPACE_SEAT_LIMIT: Record<WorkspaceTier, number> = {
  free: 1,
  pro: Number.POSITIVE_INFINITY,
  elite: Number.POSITIVE_INFINITY,
};

export const PLAN_PRICE_LABEL: Record<"free" | "pro", string> = {
  free: "$0/mo",
  pro: "$99/mo",
};

export const PLAN_FEATURE_COPY: Record<"free" | "pro", string> = {
  free: "1 team · 1 channel",
  pro: "unlimited teams · unlimited channels · unlimited seats & invites",
};

export const DEFAULT_WORKSPACE_DESCRIPTION =
  'Name your DARKE team. Click "Edit" and rename it to something your people will recognize like your company, team or family name.';

export const WORKSPACE_SLUG_RESERVED = new Set([
  "admin",
  "api",
  "app",
  "apps",
  "www",
  "mail",
  "ftp",
  "smtp",
  "imap",
  "blog",
  "support",
  "help",
  "docs",
  "status",
  "news",
  "cdn",
  "static",
  "assets",
  "auth",
  "login",
  "logout",
  "signup",
  "signin",
  "register",
  "account",
  "accounts",
  "billing",
  "pay",
  "checkout",
  "stripe",
  "webhook",
  "webhooks",
  "graphql",
  "rest",
  "v1",
  "v2",
  "darke",
  "workspace",
  "workspaces",
  "channel",
  "channels",
  "me",
  "user",
  "users",
  "profile",
  "profiles",
  "people",
  "home",
  "about",
  "legal",
  "privacy",
  "terms",
  "settings",
  "movies",
  "games",
  "books",
  "tank",
  "invite",
  "invites",
  "join",
  "new",
  "create",
  "edit",
  "delete",
  "system",
  "root",
  "localhost",
  "null",
  "undefined",
  "test",
  "staging",
  "prod",
  "production",
  "beta",
  "alpha",
  "dashboard",
  "console",
  "staff",
  "owner",
  "guest",
  "members",
  "files",
  "schedule",
  "tasks",
  "notifications",
  "feed",
  "following",
  "bookmarks",
  "search",
  "www-darke",
  "darke-ai",
]);

export function workspaceSlugFromInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function workspaceSlugIssue(
  slug: string,
): "empty" | "invalid" | "reserved" | null {
  if (!slug) return "empty";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 40) {
    return "invalid";
  }
  if (WORKSPACE_SLUG_RESERVED.has(slug)) return "reserved";
  return null;
}

export function workspacePublicUrl(slug: string): string {
  return `${slug}.darke.ai`;
}

const TABLE = "workspaces";

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

export function profileWorkspaceTier(
  profile: DarkeProfile | null | undefined,
): WorkspaceTier {
  if (!profile) return "free";
  const status = (profile.subscription_status ?? "").trim().toLowerCase();
  if (status === "elite") return "elite";
  if (status === "pro" || profile.is_pro) return "pro";
  return "free";
}

export function workspaceActiveLimit(tier: WorkspaceTier): number {
  return WORKSPACE_ACTIVE_LIMIT[tier];
}

export function isProPlan(tier: WorkspaceTier): boolean {
  return tier === "pro" || tier === "elite";
}

export function canCreateWorkspace(
  userPlan: WorkspaceTier | string,
  currentWorkspaceCount: number,
): boolean {
  const t = normalizeTier(userPlan);
  if (isProPlan(t)) return true;
  return currentWorkspaceCount < WORKSPACE_ACTIVE_LIMIT.free;
}

export function canActivateWorkspace(
  activeCount: number,
  tier: WorkspaceTier,
): boolean {
  if (isProPlan(tier)) return true;
  return activeCount < WORKSPACE_ACTIVE_LIMIT.free;
}

export function canCreateChannel(
  workspacePlan: WorkspaceTier | string,
  currentChannelCount: number,
): boolean {
  const t = normalizeTier(workspacePlan);
  if (isProPlan(t)) return true;
  return currentChannelCount < WORKSPACE_CHANNEL_LIMIT.free;
}

export function canInviteWorkspaceSeats(
  tier: WorkspaceTier | string,
): boolean {
  return isProPlan(normalizeTier(tier));
}

export function isWorkspaceStaff(
  role: DarkeWorkspace["myRole"] | null | undefined,
): boolean {
  return role === "owner" || role === "member";
}

export function isWorkspaceAdmin(
  role: DarkeWorkspace["myRole"] | null | undefined,
): boolean {
  return role === "owner";
}

export function teamRoleLabel(
  role: DarkeWorkspace["myRole"] | string | null | undefined,
): string {
  if (role === "owner") return "Admin";
  if (role === "guest") return "Invited";
  if (role === "member") return "Member";
  return "Invited";
}

export function defaultTeamName(username: string): string {
  const raw = username.trim() || "My";
  const label = raw.charAt(0).toUpperCase() + raw.slice(1);
  return `${label}'s Team`;
}

export async function ensureGeneralChannel(
  workspaceId: string,
): Promise<void> {
  const channels = await loadWorkspaceChannels(workspaceId).catch(() => []);
  if (
    channels.some(
      (row) =>
        row.slug === "general" || row.name.trim().toLowerCase() === "general",
    )
  ) {
    return;
  }
  const seeded = channels.find(
    (row) =>
      row.slug === "channel-1" || /^channel\s*1$/i.test(row.name.trim()),
  );
  if (seeded) {
    await updateChannel(seeded.id, { name: "general" }).catch(() => null);
    return;
  }
  await createChannel(workspaceId, "general").catch(() => null);
}

export async function ensurePrimaryWorkspace(
  username: string,
): Promise<DarkeWorkspace | null> {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) return null;
  const rows = await loadMyWorkspaces().catch(() => []);
  const owned = rows.find((row) => row.ownerId === me);
  if (owned) {
    await ensureGeneralChannel(owned.id);
    return { ...owned, myRole: "owner" };
  }
  const rpc = await withTimeout(
    Promise.resolve(supabase.rpc("ensure_default_workspace")),
    8000,
    "ensure team",
  ).catch(() => ({ data: null, error: true }));
  if (!rpc.error && rpc.data) {
    const row = asWorkspace(rpc.data);
    if (row) {
      await ensureGeneralChannel(row.id);
      return { ...row, myRole: "owner" };
    }
  }
  const handle = workspaceSlugFromInput(username) || username.trim() || "my";
  const created = await createWorkspace(
    defaultTeamName(handle),
    workspaceSlugFromInput(`${handle}-team`),
  );
  await ensureGeneralChannel(created.id);
  return { ...created, myRole: "owner" };
}

function normalizeTier(value: WorkspaceTier | string): WorkspaceTier {
  const v = String(value).trim().toLowerCase();
  if (v === "elite") return "elite";
  if (v === "pro") return "pro";
  return "free";
}

export function channelSlugFromTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "channel";
}

export function faviconForWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const domain = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    ).hostname;
    if (!domain) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  } catch {
    return null;
  }
}

export function workspaceInviteUrl(token: string): string {
  return `https://darke.ai/?ws=${encodeURIComponent(token)}`;
}

export function nextWorkspaceName(existing: DarkeWorkspace[]): string {
  const used = new Set(existing.map((row) => row.name.trim().toLowerCase()));
  let i = 1;
  while (used.has(`workspace ${i}`)) i += 1;
  return `Workspace ${i}`;
}

export function nextChannelName(existing: DarkeChannel[]): string {
  const used = new Set(existing.map((row) => row.name.trim().toLowerCase()));
  let i = 1;
  while (used.has(`channel ${i}`)) i += 1;
  return `Channel ${i}`;
}

export function workspaceError(err: unknown): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (lower.includes("42501") || lower.includes("row-level security")) {
    return "Team setup on the server needs an update. Run supabase/phase95.sql in the Supabase SQL editor, then try again.";
  }
  if (
    lower.includes("pgrst205") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the table") ||
    lower.includes("workspaces")
  ) {
    return "Teams are not set up yet. Run supabase/phase95.sql in the Supabase SQL editor, then try again.";
  }
  if (lower.includes("no_workspace")) {
    return "Name your team to get started.";
  }
  if (lower.includes("workspace_active_limit")) {
    return `FREE includes 1 team. Upgrade to PRO (${PLAN_PRICE_LABEL.pro}) for unlimited teams.`;
  }
  if (lower.includes("workspace_invite_forbidden")) {
    return `Team seats are full. Upgrade to PRO (${PLAN_PRICE_LABEL.pro}) to add people to My Team.`;
  }
  if (lower.includes("workspace_seat_limit")) {
    return `Team seats are full. Upgrade to PRO (${PLAN_PRICE_LABEL.pro}) to add members. Chat guests do not use seats.`;
  }
  if (lower.includes("workspace_channel_limit")) {
    return `FREE includes 1 workspace and 1 channel. Upgrade to PRO (${PLAN_PRICE_LABEL.pro}) for unlimited channels.`;
  }
  if (
    lower.includes("workspace_channels_ws_slug") ||
    lower.includes("workspace_channels_solo_slug") ||
    lower.includes("workspace_channels_slug_unique")
  ) {
    return "Channel names are not unique yet on the server. Run supabase/phase85.sql in the Supabase SQL editor, then try again.";
  }
  if (lower.includes("slug_hash") || lower.includes("42703")) {
    return "Channel setup is incomplete. Run supabase/phase87.sql in the Supabase SQL editor, then try again. You do not need to rebuild.";
  }
  if (lower.includes("workspace_slug_reserved")) {
    return "That workspace URL is reserved. Pick another slug.";
  }
  if (lower.includes("workspace_slug_taken")) {
    return "That team URL is already taken.";
  }
  if (lower.includes("workspace_slug")) {
    return "Use lowercase letters, numbers, and hyphens for the team URL.";
  }
  if (lower.includes("workspace_active_limit")) {
    return `Teams require PRO (${PLAN_PRICE_LABEL.pro}).`;
  }
  if (lower.includes("invite_blocked")) {
    return "That person has blocked invites from you.";
  }
  if (lower.includes("invite_self")) {
    return "You cannot invite yourself.";
  }
  if (lower.includes("invite_invalid")) {
    return "That invite code is not valid.";
  }
  if (lower.includes("invite_revoked")) {
    return "That access key has been revoked.";
  }
  if (lower.includes("invite_expired")) {
    return "That access key has expired.";
  }
  if (lower.includes("invite_exhausted")) {
    return "That access key has no seats left.";
  }
  if (
    lower.includes("create_workspace_access_key") ||
    lower.includes("create_channel_access_key") ||
    lower.includes("redeem_access_key") ||
    lower.includes("channel_invites") ||
    lower.includes("access_key")
  ) {
    return "Access keys are not set up yet. Run supabase/phase92.sql in the Supabase SQL editor, then try again.";
  }
  if (
    lower.includes("workspace_channels") ||
    lower.includes("workspace_members") ||
    lower.includes("workspace_invites")
  ) {
    return "Channels are not set up yet. Run supabase/phase75.sql in the Supabase SQL editor, then try again.";
  }
  return raw;
}

function asWorkspace(row: unknown): DarkeWorkspace | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.owner_id !== "string") return null;
  if (typeof r.name !== "string") return null;
  const name = r.name.trim() || "Workspace";
  const slug =
    typeof r.slug === "string" && r.slug.trim()
      ? r.slug.trim().toLowerCase()
      : workspaceSlugFromInput(name) || "workspace";
  return {
    id: r.id,
    ownerId: r.owner_id,
    name,
    status: "active" as const,
    slug,
    createdAt: typeof r.created_at === "string" ? r.created_at : "",
    avatarUrl:
      typeof r.avatar_url === "string" && r.avatar_url.trim()
        ? r.avatar_url.trim()
        : null,
    websiteUrl:
      typeof r.website_url === "string" && r.website_url.trim()
        ? r.website_url.trim()
        : null,
    description:
      typeof r.description === "string" && r.description.trim()
        ? r.description.trim()
        : null,
    myRole: "member",
  };
}

function asChannel(row: unknown): DarkeChannel | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  if (typeof r.workspace_id !== "string" || !r.workspace_id.trim()) return null;
  if (typeof r.name !== "string" || typeof r.slug !== "string") return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name.trim() || r.slug,
    slug: r.slug,
    slugHash:
      typeof r.slug_hash === "string" && r.slug_hash.trim()
        ? r.slug_hash.trim().toLowerCase()
        : channelSlugHashFromId(r.id),
    description:
      typeof r.description === "string" && r.description.trim()
        ? r.description.trim()
        : null,
    createdAt: typeof r.created_at === "string" ? r.created_at : "",
    visibility: r.visibility === "private" ? "private" : "public",
    onboardingComplete: r.onboarding_complete !== false,
    createdBy: typeof r.created_by === "string" ? r.created_by : null,
  };
}

function asMember(row: unknown): DarkeWorkspaceMember | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.workspace_id !== "string" || typeof r.user_id !== "string") {
    return null;
  }
  return {
    workspaceId: r.workspace_id,
    userId: r.user_id,
    role: r.role === "owner" ? "owner" : r.role === "guest" ? "guest" : "member",
    createdAt: typeof r.created_at === "string" ? r.created_at : "",
  };
}

function asChannelMember(row: unknown): DarkeChannelMember | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.channel_id !== "string" || typeof r.user_id !== "string") {
    return null;
  }
  return {
    channelId: r.channel_id,
    userId: r.user_id,
    role: r.role === "owner" ? "owner" : r.role === "guest" ? "guest" : "member",
    createdAt: typeof r.created_at === "string" ? r.created_at : "",
  };
}

function asInvite(row: unknown): DarkeWorkspaceInvite | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  if (typeof r.token !== "string") return null;
  return {
    id: r.id,
    workspaceId: typeof r.workspace_id === "string" ? r.workspace_id : "",
    token: r.token,
    email:
      typeof r.email === "string" && r.email.trim() ? r.email.trim() : null,
    inviteeId: typeof r.invitee_id === "string" ? r.invitee_id : null,
    outOfNetwork: r.out_of_network !== false,
  };
}

export async function loadMyWorkspaces(): Promise<DarkeWorkspace[]> {
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "id,owner_id,name,status,slug,created_at,avatar_url,website_url,description",
    order: "created_at.asc",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load workspaces",
  );
  if (!res.ok) {
    const text = await res.text();
    if (
      text.toLowerCase().includes("avatar_url") ||
      text.toLowerCase().includes("website_url") ||
      text.toLowerCase().includes("description") ||
      text.toLowerCase().includes("slug")
    ) {
      const retryQs = new URLSearchParams({
        select: "id,owner_id,name,status,created_at",
        order: "created_at.asc",
      });
      const retry = await withTimeout(
        supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${retryQs}`, {
          method: "GET",
          headers: authHeaders(token),
        }),
        15000,
        "load workspaces",
      );
      if (!retry.ok) {
        throw new Error((await retry.text()) || text);
      }
      const retryRows: unknown = await retry.json();
      if (!Array.isArray(retryRows)) return [];
      return retryRows
        .map(asWorkspace)
        .filter((row): row is DarkeWorkspace => row != null);
    }
    throw new Error(text || `load workspaces HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows.map(asWorkspace).filter((row): row is DarkeWorkspace => row != null);
}

export async function createWorkspace(
  name: string,
  slug?: string,
): Promise<DarkeWorkspace> {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) throw new Error("Not signed in.");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a workspace name.");
  const token = await accessToken();
  const body: Record<string, string> = {
    owner_id: me,
    name: trimmed,
    status: "active",
  };
  const slugValue = slug ? workspaceSlugFromInput(slug) : "";
  if (slugValue) body.slug = slugValue;
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    }),
    15000,
    "create workspace",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `create workspace HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const row = Array.isArray(rows) ? asWorkspace(rows[0]) : asWorkspace(rows);
  if (!row) throw new Error("Workspace did not save.");
  await createWorkspaceAccessKey(row.id, {
    accessKey: generateAccessKey("workspace"),
    maxUses: null,
    ttlSeconds: null,
    isRoot: true,
  }).catch(() => null);
  return row;
}

export async function renameWorkspace(
  id: string,
  name: string,
): Promise<DarkeWorkspace> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a workspace name.");
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ name: trimmed }),
      },
    ),
    15000,
    "rename workspace",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `rename workspace HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const row = Array.isArray(rows) ? asWorkspace(rows[0]) : asWorkspace(rows);
  if (!row) throw new Error("Rename did not save.");
  return row;
}

export type WorkspaceSlugCheck = {
  ok: boolean;
  reason: "invalid" | "reserved" | "taken" | null;
  slug: string | null;
};

export async function checkWorkspaceSlug(
  raw: string,
  workspaceId?: string | null,
): Promise<WorkspaceSlugCheck> {
  const local = workspaceSlugFromInput(raw);
  const localIssue = workspaceSlugIssue(local);
  if (localIssue === "empty" || localIssue === "invalid") {
    return { ok: false, reason: "invalid", slug: local || null };
  }
  if (localIssue === "reserved") {
    return { ok: false, reason: "reserved", slug: local };
  }
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/workspace_slug_check`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_slug: local,
        p_workspace_id: workspaceId ?? null,
      }),
    }),
    10000,
    "check workspace slug",
  );
  if (!res.ok) {
    const text = (await res.text()).toLowerCase();
    if (
      text.includes("workspace_slug_check") ||
      text.includes("pgrst202") ||
      text.includes("schema cache")
    ) {
      return { ok: true, reason: null, slug: local };
    }
    return { ok: false, reason: "invalid", slug: local };
  }
  const rawJson: unknown = await res.json();
  const row =
    rawJson && typeof rawJson === "object"
      ? (rawJson as Record<string, unknown>)
      : {};
  const reason =
    row.reason === "reserved" || row.reason === "taken" || row.reason === "invalid"
      ? row.reason
      : null;
  const slug = typeof row.slug === "string" ? row.slug : local;
  return { ok: row.ok === true, reason, slug };
}

export async function patchWorkspace(
  id: string,
  patch: {
    name?: string;
    slug?: string;
    avatarUrl?: string | null;
    websiteUrl?: string | null;
    description?: string | null;
  },
): Promise<DarkeWorkspace> {
  const body: Record<string, unknown> = {};
  if (patch.name != null) body.name = patch.name;
  if (patch.slug != null) body.slug = workspaceSlugFromInput(patch.slug);
  if (patch.avatarUrl !== undefined) body.avatar_url = patch.avatarUrl;
  if (patch.websiteUrl !== undefined) body.website_url = patch.websiteUrl;
  if (patch.description !== undefined) {
    const d = patch.description?.trim() ?? "";
    body.description = d || null;
  }
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(body),
      },
    ),
    15000,
    "patch workspace",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `patch workspace HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const row = Array.isArray(rows) ? asWorkspace(rows[0]) : asWorkspace(rows);
  if (!row) throw new Error("Workspace did not update.");
  return row;
}

export async function loadWorkspaceChannels(
  workspaceId: string,
): Promise<DarkeChannel[]> {
  return loadChannelsQuery({
    workspace_id: `eq.${workspaceId}`,
    order: "created_at.asc",
  });
}

export async function loadChannelByRef(ref: string): Promise<DarkeChannel | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  if (isChannelUuid(trimmed)) {
    const rows = await loadChannelsQuery({ id: `eq.${trimmed}`, limit: "1" });
    return rows[0] ?? null;
  }
  const hash = channelSlugHashFromId(trimmed);
  try {
    const rows = await loadChannelsQuery({
      slug_hash: `eq.${hash}`,
      limit: "1",
    });
    return rows[0] ?? null;
  } catch {
    if (hash.length === 32) {
      const uuid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
      if (isChannelUuid(uuid)) {
        const rows = await loadChannelsQuery({ id: `eq.${uuid}`, limit: "1" });
        return rows[0] ?? null;
      }
    }
    return null;
  }
}

async function loadChannelsQuery(
  filters: Record<string, string>,
): Promise<DarkeChannel[]> {
  const token = await accessToken();
  const selects = [
    CHANNEL_SELECT,
    "id,workspace_id,name,slug,description,created_at,visibility,onboarding_complete,created_by",
    "id,workspace_id,name,slug,description,created_at",
  ];
  let last = "";
  for (const select of selects) {
    const qs = new URLSearchParams({ select, ...filters });
    const res = await withTimeout(
      supabaseFetch(`${baseUrl()}/rest/v1/workspace_channels?${qs}`, {
        method: "GET",
        headers: authHeaders(token),
      }),
      15000,
      "load channels",
    );
    if (res.ok) {
      const rows: unknown = await res.json();
      if (!Array.isArray(rows)) return [];
      return rows.map(asChannel).filter((row): row is DarkeChannel => row != null);
    }
    last = await res.text();
    const lower = last.toLowerCase();
    if (
      !lower.includes("slug_hash") &&
      !lower.includes("visibility") &&
      !lower.includes("onboarding_complete")
    ) {
      throw new Error(last || "load channels failed");
    }
  }
  throw new Error(last || "load channels failed");
}

export async function createChannel(
  workspaceId: string,
  title: string,
  description?: string,
  visibility: ChannelVisibility = "private",
): Promise<DarkeChannel> {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) throw new Error("Not signed in.");
  if (!workspaceId) throw new Error("workspace_missing");
  const name = title.replace(/^#+/, "").trim();
  if (!name) throw new Error("Enter a channel title.");
  const slug = channelSlugFromTitle(name);
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/workspace_channels`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        name,
        slug,
        description: description?.trim() || null,
        created_by: me,
        visibility,
        onboarding_complete: false,
      }),
    }),
    15000,
    "create channel",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `create channel HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const row = Array.isArray(rows) ? asChannel(rows[0]) : asChannel(rows);
  if (!row) throw new Error("Channel did not save.");
  await createChannelAccessKey(row.id, {
    accessKey: generateAccessKey("channel"),
    maxUses: null,
    ttlSeconds: null,
    isRoot: true,
  }).catch(() => null);
  return row;
}

export async function updateChannel(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    visibility?: ChannelVisibility;
    onboardingComplete?: boolean;
  },
): Promise<DarkeChannel> {
  const body: Record<string, unknown> = {};
  if (patch.name != null) {
    const name = patch.name.replace(/^#+/, "").trim();
    if (!name) throw new Error("Enter a channel title.");
    body.name = name;
    body.slug = channelSlugFromTitle(name);
  }
  if (patch.description !== undefined) {
    const d = patch.description?.trim() ?? "";
    body.description = d || null;
  }
  if (patch.visibility) body.visibility = patch.visibility;
  if (patch.onboardingComplete !== undefined) {
    body.onboarding_complete = patch.onboardingComplete;
  }
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/workspace_channels?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(body),
      },
    ),
    15000,
    "update channel",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `update channel HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const row = Array.isArray(rows) ? asChannel(rows[0]) : asChannel(rows);
  if (!row) throw new Error("Channel did not update.");
  return row;
}

export async function deleteChannel(id: string): Promise<void> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/workspace_channels?id=eq.${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: authHeaders(token),
      },
    ),
    15000,
    "delete channel",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `delete channel HTTP ${res.status}`);
  }
}

export async function loadWorkspaceMembers(
  workspaceId: string,
): Promise<DarkeWorkspaceMember[]> {
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "workspace_id,user_id,role,created_at",
    workspace_id: `eq.${workspaceId}`,
    order: "created_at.asc",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/workspace_members?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load members",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `load members HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows.map(asMember).filter((row): row is DarkeWorkspaceMember => row != null);
}

export async function loadMyMemberships(): Promise<DarkeWorkspaceMember[]> {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) return [];
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "workspace_id,user_id,role,created_at",
    user_id: `eq.${me}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/workspace_members?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load my memberships",
  );
  if (!res.ok) return [];
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows.map(asMember).filter((row): row is DarkeWorkspaceMember => row != null);
}

export async function createChannelInvite(
  channelId: string,
  email?: string,
  inviteeId?: string,
): Promise<DarkeWorkspaceInvite> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/create_channel_invite`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_channel_id: channelId,
        p_email: email?.trim() || null,
        p_invitee_id: inviteeId ?? null,
      }),
    }),
    15000,
    "create channel invite",
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `create channel invite HTTP ${res.status}`);
  }
  let raw: unknown = null;
  try {
    raw = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Invite did not save.");
  }
  const row = asInvite(raw);
  if (!row) throw new Error("Invite did not save.");
  return row;
}

export async function addChannelMember(
  channelId: string,
  userId: string,
  role: "member" | "guest" = "member",
): Promise<void> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/channel_members`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Prefer: "return=minimal,resolution=ignore-duplicates",
      },
      body: JSON.stringify({
        channel_id: channelId,
        user_id: userId,
        role,
      }),
    }),
    15000,
    "add channel member",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `add channel member HTTP ${res.status}`);
  }
}

export async function loadChannelMembers(
  channelId: string,
): Promise<DarkeChannelMember[]> {
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "channel_id,user_id,role,created_at",
    channel_id: `eq.${channelId}`,
    order: "created_at.asc",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/channel_members?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load channel members",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `load channel members HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .map(asChannelMember)
    .filter((row): row is DarkeChannelMember => row != null);
}

export async function listChannelPeople(
  channel: DarkeChannel,
  workspace: DarkeWorkspace | null,
): Promise<{ userId: string; role: "owner" | "member" | "guest" }[]> {
  const rank = { owner: 3, member: 2, guest: 1 };
  const byUser = new Map<string, "owner" | "member" | "guest">();
  function bump(userId: string, role: "owner" | "member" | "guest") {
    const prev = byUser.get(userId);
    if (!prev || rank[role] > rank[prev]) byUser.set(userId, role);
  }
  if (workspace) {
    bump(workspace.ownerId, "owner");
    const members = await loadWorkspaceMembers(workspace.id).catch(() => []);
    for (const row of members) bump(row.userId, row.role);
  } else if (channel.createdBy) {
    bump(channel.createdBy, "owner");
  }
  const channelRows = await loadChannelMembers(channel.id).catch(() => []);
  for (const row of channelRows) bump(row.userId, row.role);
  return [...byUser.entries()].map(([userId, role]) => ({ userId, role }));
}

export async function removeChannelMember(
  channelId: string,
  userId: string,
): Promise<void> {
  const token = await accessToken();
  const rpc = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/remove_channel_member`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_channel_id: channelId,
        p_user_id: userId,
      }),
    }),
    15000,
    "remove channel member",
  );
  if (rpc.ok) return;
  const qs = new URLSearchParams({
    channel_id: `eq.${channelId}`,
    user_id: `eq.${userId}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/channel_members?${qs}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
    15000,
    "remove channel member",
  );
  if (!res.ok) {
    const fallback = await res.text();
    throw new Error(fallback || "Could not remove member.");
  }
}

export async function addWorkspaceMember(
  workspaceId: string,
  userId: string,
  role: "member" | "guest" = "member",
): Promise<void> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/workspace_members`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Prefer: "return=minimal,resolution=ignore-duplicates",
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        user_id: userId,
        role,
      }),
    }),
    15000,
    "add workspace member",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `add workspace member HTTP ${res.status}`);
  }
}

export async function createWorkspaceInvite(
  workspaceId: string,
  email?: string,
  inviteeId?: string,
): Promise<DarkeWorkspaceInvite> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/create_workspace_invite`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_workspace_id: workspaceId,
        p_email: email?.trim() || null,
        p_invitee_id: inviteeId ?? null,
      }),
    }),
    15000,
    "create invite",
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `create invite HTTP ${res.status}`);
  }
  let raw: unknown = null;
  try {
    raw = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Invite did not save.");
  }
  const row = asInvite(raw);
  if (!row) throw new Error("Invite did not save.");
  return row;
}

export async function acceptWorkspaceInvite(inviteToken: string): Promise<void> {
  const token = await accessToken();
  const key = inviteToken.trim();
  const redeem = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/redeem_access_key`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_key: key }),
    }),
    15000,
    "redeem access key",
  );
  if (redeem.ok) return;
  const redeemText = await redeem.text();
  const missing =
    redeemText.toLowerCase().includes("pgrst202") ||
    redeemText.toLowerCase().includes("schema cache") ||
    redeemText.toLowerCase().includes("redeem_access_key");
  if (!missing) {
    throw new Error(redeemText || `accept invite HTTP ${redeem.status}`);
  }
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/accept_workspace_invite`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_token: key }),
    }),
    15000,
    "accept invite",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `accept invite HTTP ${res.status}`);
  }
}

function asAccessKey(
  row: unknown,
  table: DarkeAccessKey["table"],
): DarkeAccessKey | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  const accessKey =
    typeof r.access_key === "string" && r.access_key
      ? r.access_key
      : typeof r.token === "string"
        ? r.token
        : "";
  if (!accessKey) return null;
  return {
    id: r.id,
    table,
    accessKey,
    workspaceId: typeof r.workspace_id === "string" ? r.workspace_id : null,
    channelId: typeof r.channel_id === "string" ? r.channel_id : null,
    maxUses: typeof r.max_uses === "number" ? r.max_uses : null,
    useCount: typeof r.use_count === "number" ? r.use_count : 0,
    expiresAt: typeof r.expires_at === "string" ? r.expires_at : null,
    revokedAt: typeof r.revoked_at === "string" ? r.revoked_at : null,
    isRoot: r.is_root === true,
    createdAt: typeof r.created_at === "string" ? r.created_at : "",
  };
}

async function rpcJson(name: string, body: Record<string, unknown>): Promise<unknown> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    15000,
    name,
  );
  const text = await res.text();
  if (!res.ok) throw new Error(text || `${name} HTTP ${res.status}`);
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function createWorkspaceAccessKey(
  workspaceId: string,
  opts: {
    accessKey: string;
    maxUses: number | null;
    ttlSeconds: number | null;
    isRoot?: boolean;
  },
): Promise<DarkeAccessKey> {
  const raw = await rpcJson("create_workspace_access_key", {
    p_workspace_id: workspaceId,
    p_access_key: opts.accessKey,
    p_max_uses: opts.maxUses,
    p_ttl_seconds: opts.ttlSeconds,
    p_is_root: opts.isRoot === true,
  });
  const row = asAccessKey(raw, "workspace_invites");
  if (!row) throw new Error("Access key did not save.");
  return row;
}

export async function createChannelAccessKey(
  channelId: string,
  opts: {
    accessKey: string;
    maxUses: number | null;
    ttlSeconds: number | null;
    isRoot?: boolean;
  },
): Promise<DarkeAccessKey> {
  const raw = await rpcJson("create_channel_access_key", {
    p_channel_id: channelId,
    p_access_key: opts.accessKey,
    p_max_uses: opts.maxUses,
    p_ttl_seconds: opts.ttlSeconds,
    p_is_root: opts.isRoot === true,
  });
  const row = asAccessKey(raw, "channel_invites");
  if (!row) throw new Error("Access key did not save.");
  return row;
}

export async function listWorkspaceAccessKeys(
  workspaceId: string,
): Promise<DarkeAccessKey[]> {
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "id,workspace_id,channel_id,token,access_key,max_uses,use_count,expires_at,revoked_at,is_root,created_at",
    workspace_id: `eq.${workspaceId}`,
    access_key: "not.is.null",
    order: "created_at.desc",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/workspace_invites?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "list workspace keys",
  );
  if (!res.ok) return [];
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => asAccessKey(row, "workspace_invites"))
    .filter((row): row is DarkeAccessKey => row != null);
}

export async function listChannelAccessKeys(
  channelId: string,
): Promise<DarkeAccessKey[]> {
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "id,workspace_id,channel_id,token,access_key,max_uses,use_count,expires_at,revoked_at,is_root,created_at",
    channel_id: `eq.${channelId}`,
    order: "created_at.desc",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/channel_invites?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "list channel keys",
  );
  if (!res.ok) return [];
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => asAccessKey(row, "channel_invites"))
    .filter((row): row is DarkeAccessKey => row != null);
}

export async function revokeAccessKey(
  id: string,
  table: DarkeAccessKey["table"],
): Promise<void> {
  const name =
    table === "channel_invites"
      ? "revoke_channel_access_key"
      : "revoke_workspace_access_key";
  await rpcJson(name, { p_id: id });
}

export async function acceptPendingInvite(inviteId: string): Promise<void> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/accept_pending_invite`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_invite_id: inviteId }),
    }),
    15000,
    "accept pending invite",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `accept invite HTTP ${res.status}`);
  }
}

export async function declinePendingInvite(inviteId: string): Promise<void> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/decline_pending_invite`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_invite_id: inviteId }),
    }),
    15000,
    "decline invite",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `decline invite HTTP ${res.status}`);
  }
}

export async function blockInviter(actorId: string): Promise<void> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/block_inviter`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_actor_id: actorId }),
    }),
    15000,
    "block inviter",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `block HTTP ${res.status}`);
  }
}
