import { readLocalText, writeLocalText } from "./localStore";

export const FREE_TEAM_SEATS = 2;

export type TeamMemberRole = "owner" | "admin" | "member";

export type DarkeTeamMember = {
  handle: string;
  role: TeamMemberRole;
  joinedAt: number;
};

export type DarkeTeamInvite = {
  token: string;
  enabled: boolean;
  expiresAt: number | null;
  maxUses: number | null;
  useCount: number;
};

export type DarkeTeamActivity = {
  at: number;
  text: string;
  actor?: string;
};

export type TeamPlan = "free" | "premium";

export type DarkeTeamSection = {
  id: string;
  name: string;
  chatIds: string[];
};

export type DarkeTeam = {
  id: string;
  ownerHandle: string;
  name: string;
  slug: string;
  slugAliases: string[];
  createdAt: number;
  members: DarkeTeamMember[];
  chatIds: string[];
  avatarUrl?: string | null;
  invite?: DarkeTeamInvite;
  activity?: DarkeTeamActivity[];
  plan?: TeamPlan;
  sections?: DarkeTeamSection[];
};

export const TEAM_CHANGE_EVENT = "darke-team-change";
export const TEAM_CENTER_EVENT = "darke-open-team-center";
export const TEAM_HUB_EVENT = "darke-open-teams-hub";
export const TEAM_PUBLIC_HOST = "darke.app";
export const PERSONAL_WORKSPACE_ID = "personal";
export const LAST_WORKSPACE_KEY = "last_active_workspace_id";

const RESERVED_TEAM_SLUGS = new Set([
  "join",
  "app",
  "login",
  "signup",
  "pricing",
  "manual",
  "messages",
  "teams",
]);

export function slugifyTeamName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "team";
}

export function isValidTeamSlug(value: string): boolean {
  return (
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
    value.length >= 2 &&
    value.length <= 48 &&
    !RESERVED_TEAM_SLUGS.has(value)
  );
}

export function teamsHubPath(): string {
  return "/teams";
}

export function teamCenterPath(slug: string): string {
  return `/teams/${encodeURIComponent(slug)}`;
}

export function teamJoinPath(slug: string): string {
  return `/join/${encodeURIComponent(slug)}`;
}

export function isTeamHandlePath(path = ""): boolean {
  return /^\/(?:teams|join)\/[^/]+/.test(path);
}

export function isP2pJoinPath(path = ""): boolean {
  return path === "/join" || path === "/join/";
}

export function parseTeamRouteParam(path = ""): string | null {
  const hit = path.match(/\/(?:teams|join)\/([^/]+)/);
  if (!hit) return null;
  const id = decodeURIComponent(hit[1] || "").trim().toLowerCase();
  return id && id !== "join" ? id : null;
}

/** @deprecated Use parseTeamRouteParam */
export function parseTeamIdFromPath(path = ""): string | null {
  return parseTeamRouteParam(path);
}

export function openTeamCenter(team: Pick<DarkeTeam, "id" | "slug">): void {
  if (typeof window === "undefined") return;
  const handle = team.slug || team.id;
  window.history.pushState(null, "", teamCenterPath(handle));
  window.dispatchEvent(
    new CustomEvent(TEAM_CENTER_EVENT, {
      detail: { teamId: team.id, slug: handle },
    }),
  );
}

export function openTeamsHub(): void {
  if (typeof window === "undefined") return;
  window.history.pushState(null, "", teamsHubPath());
  window.dispatchEvent(new Event(TEAM_HUB_EVENT));
}

export function loadLastWorkspaceId(slug: string): string {
  const raw = readLocalText(workspaceStateKey(slug));
  const trimmed = (raw || "").trim();
  return trimmed || PERSONAL_WORKSPACE_ID;
}

export function saveLastWorkspaceId(slug: string, id: string): void {
  const next = (id || PERSONAL_WORKSPACE_ID).trim() || PERSONAL_WORKSPACE_ID;
  writeLocalText(workspaceStateKey(slug), next);
  writeLocalText(LAST_WORKSPACE_KEY, next);
}

type TeamRoster = {
  teams: DarkeTeam[];
};

function norm(handle: string): string {
  return handle.replace(/^@/, "").trim().toLowerCase();
}

function rosterKey(slug: string): string {
  return `darke.teams.${norm(slug) || "session"}`;
}

function legacyKey(slug: string): string {
  return `darke.team.${norm(slug) || "session"}`;
}

function collapsedKey(slug: string): string {
  return `darke.teams.collapsed.${norm(slug) || "session"}`;
}

function workspaceStateKey(slug: string): string {
  return `darke.last_active_workspace_id.${norm(slug) || "session"}`;
}

function catalogKey(): string {
  return "darke.team-catalog.v1";
}

function slugIndexKey(): string {
  return "darke.team-slug-index.v1";
}

type SlugIndex = {
  primary: Record<string, string>;
  aliases: Record<string, string>;
};

function loadSlugIndex(): SlugIndex {
  const raw = readLocalText(slugIndexKey());
  if (!raw) return { primary: {}, aliases: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<SlugIndex>;
    return {
      primary:
        parsed.primary && typeof parsed.primary === "object" ? parsed.primary : {},
      aliases:
        parsed.aliases && typeof parsed.aliases === "object" ? parsed.aliases : {},
    };
  } catch {
    return { primary: {}, aliases: {} };
  }
}

function saveSlugIndex(index: SlugIndex): void {
  writeLocalText(slugIndexKey(), JSON.stringify(index));
}

function loadCatalog(): Record<string, DarkeTeam> {
  const raw = readLocalText(catalogKey());
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Record<string, DarkeTeam> = {};
    for (const [id, row] of Object.entries(parsed || {})) {
      const team = parseTeam(row);
      if (team) next[id] = team;
    }
    return next;
  } catch {
    return {};
  }
}

function saveCatalogTeam(team: DarkeTeam): void {
  const catalog = loadCatalog();
  catalog[team.id] = team;
  writeLocalText(catalogKey(), JSON.stringify(catalog));
}

export function catalogTeamById(id: string): DarkeTeam | null {
  return loadCatalog()[id] ?? null;
}

export function catalogTeamByHandle(handle: string): DarkeTeam | null {
  const key = handle.trim().toLowerCase();
  if (!key) return null;
  return (
    Object.values(loadCatalog()).find(
      (team) =>
        team.slug === key ||
        team.slugAliases.includes(key) ||
        team.id.toLowerCase() === key,
    ) ?? null
  );
}

export function teamSlugTaken(handle: string, exceptTeamId?: string): boolean {
  const key = handle.trim().toLowerCase();
  if (!key) return false;
  const idx = loadSlugIndex();
  const owner = idx.primary[key] || idx.aliases[key];
  return Boolean(owner && owner !== exceptTeamId);
}

export function allocateTeamSlug(seed: string, exceptTeamId?: string): string {
  const base = slugifyTeamName(seed);
  let candidate = isValidTeamSlug(base) ? base : "team";
  let n = 2;
  while (
    RESERVED_TEAM_SLUGS.has(candidate) ||
    teamSlugTaken(candidate, exceptTeamId)
  ) {
    const suffix = `-${n}`;
    candidate = `${base.slice(0, Math.max(2, 48 - suffix.length))}${suffix}`;
    n += 1;
  }
  return candidate;
}

function registerTeamHandles(team: DarkeTeam): void {
  const idx = loadSlugIndex();
  for (const map of [idx.primary, idx.aliases]) {
    for (const [key, owner] of Object.entries(map)) {
      if (owner === team.id) delete map[key];
    }
  }
  idx.primary[team.slug] = team.id;
  for (const alias of team.slugAliases) {
    if (alias && alias !== team.slug) idx.aliases[alias] = team.id;
  }
  saveSlugIndex(idx);
}

function newTeamId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `team-${newInviteToken()}`;
}

function parseTeam(raw: unknown): DarkeTeam | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as DarkeTeam & { aliases?: string[] };
  if (typeof row.id !== "string" || !row.id) return null;
  const name = (row.name || "TEAM").trim() || "TEAM";
  const rawSlug =
    typeof row.slug === "string" && row.slug.trim()
      ? slugifyTeamName(row.slug)
      : slugifyTeamName(name);
  const slug = isValidTeamSlug(rawSlug) ? rawSlug : slugifyTeamName(name) || "team";
  const aliasSource = Array.isArray(row.slugAliases)
    ? row.slugAliases
    : Array.isArray(row.aliases)
      ? row.aliases
      : [];
  const slugAliases = [
    ...new Set(
      aliasSource
        .map((value) => slugifyTeamName(String(value || "")))
        .filter((value) => value && value !== slug),
    ),
  ];
  return {
    id: row.id,
    ownerHandle: norm(row.ownerHandle || ""),
    name,
    slug,
    slugAliases,
    createdAt: Number(row.createdAt) || Date.now(),
    members: Array.isArray(row.members)
      ? row.members
          .map((member): DarkeTeamMember | null => {
            const handle = norm(member.handle || "");
            if (!handle) return null;
            const role: TeamMemberRole =
              member.role === "admin"
                ? "admin"
                : member.role === "owner"
                  ? "owner"
                  : "member";
            return {
              handle,
              role,
              joinedAt: Number(member.joinedAt) || Date.now(),
            };
          })
          .filter((member): member is DarkeTeamMember => Boolean(member))
      : [],
    chatIds: Array.isArray(row.chatIds)
      ? row.chatIds.filter((id) => typeof id === "string" && id)
      : [],
    avatarUrl:
      typeof row.avatarUrl === "string" && row.avatarUrl.startsWith("data:image/")
        ? row.avatarUrl
        : null,
    invite: parseInvite(row.invite),
    plan: row.plan === "premium" ? "premium" : "free",
    sections: parseSections(row.sections),
    activity: Array.isArray(row.activity)
      ? row.activity
          .filter((item) => item && typeof item.text === "string")
          .map((item) => ({
            at: Number(item.at) || Date.now(),
            text: String(item.text),
            actor:
              typeof item.actor === "string" && item.actor.trim()
                ? norm(item.actor)
                : undefined,
          }))
          .slice(0, 80)
      : [],
  };
}

function parseSections(raw: unknown): DarkeTeamSection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as DarkeTeamSection;
      if (typeof item.id !== "string" || !item.id) return null;
      const name = String(item.name || "").trim() || "Section";
      const chatIds = Array.isArray(item.chatIds)
        ? item.chatIds.filter((id) => typeof id === "string" && id)
        : [];
      return { id: item.id, name, chatIds };
    })
    .filter((row): row is DarkeTeamSection => Boolean(row));
}

function parseInvite(raw: unknown): DarkeTeamInvite {
  const row = raw && typeof raw === "object" ? (raw as DarkeTeamInvite) : null;
  return {
    token:
      typeof row?.token === "string" && row.token
        ? row.token
        : newInviteToken(),
    enabled: row?.enabled !== false,
    expiresAt:
      typeof row?.expiresAt === "number" && Number.isFinite(row.expiresAt)
        ? row.expiresAt
        : null,
    maxUses:
      typeof row?.maxUses === "number" && Number.isFinite(row.maxUses)
        ? row.maxUses
        : null,
    useCount: Math.max(0, Number(row?.useCount) || 0),
  };
}

function newInviteToken(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function emitTeamChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TEAM_CHANGE_EVENT));
}

function parseRoster(raw: string | null): TeamRoster {
  if (!raw) return { teams: [] };
  try {
    const parsed = JSON.parse(raw) as TeamRoster | DarkeTeam;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as TeamRoster).teams)) {
      return {
        teams: (parsed as TeamRoster).teams
          .map((row) => parseTeam(row))
          .filter((row): row is DarkeTeam => Boolean(row)),
      };
    }
    const single = parseTeam(parsed);
    return { teams: single ? [single] : [] };
  } catch {
    return { teams: [] };
  }
}

function sortTeams(slug: string, teams: DarkeTeam[]): DarkeTeam[] {
  const owner = norm(slug);
  return teams.slice().sort((a, b) => {
    const aOwn = a.ownerHandle === owner ? 0 : 1;
    const bOwn = b.ownerHandle === owner ? 0 : 1;
    if (aOwn !== bOwn) return aOwn - bOwn;
    return a.createdAt - b.createdAt;
  });
}

function dedupe(teams: DarkeTeam[]): DarkeTeam[] {
  const map = new Map<string, DarkeTeam>();
  for (const team of teams) map.set(team.id, team);
  return [...map.values()];
}

export function loadRoster(slug: string): DarkeTeam[] {
  const owner = norm(slug);
  const fromNew = parseRoster(readLocalText(rosterKey(slug))).teams;
  const legacy = parseTeam(
    (() => {
      const raw = readLocalText(legacyKey(slug));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    })(),
  );
  const teams = dedupe([
    ...fromNew,
    ...(legacy ? [legacy] : []),
  ]).map((team) => {
    if (team.ownerHandle !== owner) return team;
    if (team.members.some((row) => row.handle === owner && row.role === "owner")) {
      return team;
    }
    return {
      ...team,
      members: [
        { handle: owner, role: "owner" as const, joinedAt: team.createdAt },
        ...team.members.filter((row) => row.handle !== owner),
      ],
    };
  });
  return sortTeams(slug, teams);
}

function writeRoster(slug: string, teams: DarkeTeam[]): DarkeTeam[] {
  const next: DarkeTeam[] = [];
  for (const team of sortTeams(slug, dedupe(teams))) {
    const handle =
      team.slug &&
      isValidTeamSlug(team.slug) &&
      !teamSlugTaken(team.slug, team.id)
        ? team.slug
        : allocateTeamSlug(team.name || team.id, team.id);
    const row = {
      ...team,
      slug: handle,
      slugAliases: team.slugAliases ?? [],
    };
    next.push(row);
    registerTeamHandles(row);
    saveCatalogTeam(row);
  }
  writeLocalText(rosterKey(slug), JSON.stringify({ teams: next }));
  const owned = next.find((team) => team.ownerHandle === norm(slug));
  if (owned) writeLocalText(legacyKey(slug), JSON.stringify(owned));
  emitTeamChange();
  return next;
}

function note(team: DarkeTeam, text: string, actor?: string): DarkeTeam {
  return {
    ...team,
    activity: [
      {
        at: Date.now(),
        text,
        actor: actor ? norm(actor) : undefined,
      },
      ...(team.activity ?? []),
    ].slice(0, 80),
  };
}

function persistTeam(slug: string, team: DarkeTeam): DarkeTeam {
  upsertLocal(slug, team);
  if (isTeamOwner(team, slug) || team.ownerHandle === norm(slug)) {
    mirrorToMembers(team);
  }
  return findTeam(slug, team.id) ?? team;
}

function upsertLocal(slug: string, team: DarkeTeam): DarkeTeam[] {
  const teams = loadRoster(slug).filter((row) => row.id !== team.id);
  teams.push(team);
  return writeRoster(slug, teams);
}

function mirrorToMembers(team: DarkeTeam): void {
  for (const member of team.members) {
    if (member.handle === team.ownerHandle) continue;
    upsertLocal(member.handle, team);
  }
}

export function loadTeam(slug: string): DarkeTeam | null {
  return ownedTeam(slug);
}

export function ownedTeam(slug: string): DarkeTeam | null {
  const owner = norm(slug);
  return loadRoster(slug).find((team) => team.ownerHandle === owner) ?? null;
}

export function findTeam(slug: string, teamId?: string | null): DarkeTeam | null {
  if (!teamId) return ownedTeam(slug);
  const key = teamId.trim().toLowerCase();
  return (
    loadRoster(slug).find(
      (team) =>
        team.id === teamId ||
        team.id.toLowerCase() === key ||
        team.slug === key ||
        team.slugAliases.includes(key),
    ) ?? null
  );
}

export function resolveTeamRoute(
  viewer: string,
  requested?: string | null,
): { team: DarkeTeam | null; redirectTo: string | null } {
  const key = (requested || "").trim().toLowerCase();
  if (!key) {
    const owned = ownedTeam(viewer);
    return { team: owned, redirectTo: owned?.slug ?? null };
  }
  const roster = loadRoster(viewer);
  const bySlug = roster.find((team) => team.slug === key);
  if (bySlug) return { team: bySlug, redirectTo: null };
  const byAlias = roster.find(
    (team) => team.slugAliases.includes(key) || team.id.toLowerCase() === key,
  );
  if (byAlias) return { team: byAlias, redirectTo: byAlias.slug };
  const idx = loadSlugIndex();
  const id = idx.primary[key] || idx.aliases[key];
  if (id) {
    const team = roster.find((row) => row.id === id) ?? null;
    if (team) {
      return { team, redirectTo: team.slug === key ? null : team.slug };
    }
  }
  return { team: null, redirectTo: null };
}

export function listTeams(slug: string): DarkeTeam[] {
  return loadRoster(slug);
}

export function isTeamOwner(team: DarkeTeam, slug: string): boolean {
  return team.ownerHandle === norm(slug);
}

export function createOwnedTeam(
  slug: string,
  name = "TEAM",
  plan: TeamPlan = "free",
): { team: DarkeTeam | null; ok: boolean } {
  const existing = ownedTeam(slug);
  if (existing) return { team: existing, ok: false };
  const owner = norm(slug);
  const label = name.trim() || "TEAM";
  const team: DarkeTeam = {
    id: newTeamId(),
    ownerHandle: owner,
    name: label,
    slug: allocateTeamSlug(label),
    slugAliases: [],
    createdAt: Date.now(),
    members: [{ handle: owner, role: "owner", joinedAt: Date.now() }],
    chatIds: [],
    avatarUrl: null,
    plan,
    sections: [],
    invite: parseInvite(null),
    activity: [
      {
        at: Date.now(),
        text:
          plan === "premium"
            ? "Team created on premium seats."
            : "Team created. 14-day free trial started.",
        actor: owner,
      },
    ],
  };
  writeRoster(slug, [...loadRoster(slug), team]);
  return { team, ok: true };
}

/** One owned team per account. Never creates a second. */
export function ensureTeam(slug: string, name = "TEAM"): DarkeTeam {
  return ownedTeam(slug) ?? createOwnedTeam(slug, name).team!;
}

export function teamSeatCap(pro: boolean): number {
  return pro ? Number.POSITIVE_INFINITY : FREE_TEAM_SEATS;
}

export function teamSeatsUsed(team: DarkeTeam): number {
  return Math.max(1, team.members.length);
}

export function canAddTeamMember(team: DarkeTeam, pro: boolean): boolean {
  return teamSeatsUsed(team) < teamSeatCap(pro);
}

export function addTeamMember(
  slug: string,
  handle: string,
  role: TeamMemberRole = "member",
  teamId?: string | null,
): DarkeTeam {
  const team = findTeam(slug, teamId) ?? ensureTeam(slug);
  const id = norm(handle);
  if (!id) return team;
  if (team.members.some((row) => row.handle === id)) return team;
  const next = note(
    {
      ...team,
      members: [...team.members, { handle: id, role, joinedAt: Date.now() }],
    },
    `@${id} joined as ${role}.`,
    slug,
  );
  return persistTeam(slug, next);
}

export function tryAddTeamMember(
  slug: string,
  handle: string,
  pro: boolean,
  teamId?: string | null,
  role: TeamMemberRole = "member",
): { team: DarkeTeam; added: boolean; blocked: boolean } {
  const team = findTeam(slug, teamId) ?? ensureTeam(slug);
  const id = norm(handle);
  if (!id) return { team, added: false, blocked: false };
  if (team.members.some((row) => row.handle === id)) {
    return { team, added: false, blocked: false };
  }
  if (!canAddTeamMember(team, pro)) {
    return { team, added: false, blocked: true };
  }
  return {
    team: addTeamMember(slug, handle, role, team.id),
    added: true,
    blocked: false,
  };
}

export function addTeamChat(
  slug: string,
  chatId: string,
  teamId?: string | null,
): DarkeTeam {
  const team = findTeam(slug, teamId) ?? ensureTeam(slug);
  if (team.chatIds.includes(chatId)) return team;
  const next = { ...team, chatIds: [...team.chatIds, chatId] };
  upsertLocal(slug, next);
  mirrorToMembers(next);
  return next;
}

export function removeTeamChat(slug: string, chatId: string): void {
  for (const team of loadRoster(slug)) {
    if (!team.chatIds.includes(chatId)) continue;
    const next = {
      ...team,
      chatIds: team.chatIds.filter((id) => id !== chatId),
    };
    upsertLocal(slug, next);
    if (isTeamOwner(next, slug)) mirrorToMembers(next);
  }
}

export function teamHasChat(team: DarkeTeam | null, chatId: string): boolean {
  return Boolean(team?.chatIds.includes(chatId));
}

export function loadCollapsedTeams(slug: string): Set<string> {
  const raw = readLocalText(collapsedKey(slug));
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function saveCollapsedTeams(slug: string, ids: Set<string>): void {
  writeLocalText(collapsedKey(slug), JSON.stringify([...ids]));
}

export function patchTeam(
  slug: string,
  teamId: string,
  patch: Partial<Pick<DarkeTeam, "name" | "avatarUrl" | "invite">>,
): DarkeTeam | null {
  const team = findTeam(slug, teamId);
  if (!team) return null;
  let event = "Updated team settings.";
  if (patch.name && patch.name.trim() !== team.name) {
    event = `Renamed team to ${patch.name.trim()}.`;
  } else if (patch.avatarUrl !== undefined) {
    event = "Updated team avatar.";
  } else if (patch.invite) {
    const nextInvite = { ...parseInvite(team.invite), ...patch.invite };
    if (nextInvite.enabled !== team.invite?.enabled) {
      event = nextInvite.enabled ? "Enabled invite link." : "Disabled invite link.";
    } else {
      event = "Updated invite link rules.";
    }
  }
  const next = note(
    {
      ...team,
      name: patch.name?.trim() || team.name,
      avatarUrl: patch.avatarUrl === undefined ? team.avatarUrl : patch.avatarUrl,
      invite: patch.invite ? { ...parseInvite(team.invite), ...patch.invite } : team.invite,
    },
    event,
    slug,
  );
  return persistTeam(slug, next);
}

export function changeTeamSlug(
  viewer: string,
  teamId: string,
  nextSlug: string,
): { team: DarkeTeam | null; ok: boolean; error?: string } {
  const team = findTeam(viewer, teamId);
  if (!team) return { team: null, ok: false, error: "Team not found." };
  const desired = slugifyTeamName(nextSlug);
  if (!isValidTeamSlug(desired)) {
    return {
      team,
      ok: false,
      error: "Use 2–48 lowercase letters, numbers, and hyphens.",
    };
  }
  if (desired === team.slug) return { team, ok: true };
  if (teamSlugTaken(desired, team.id)) {
    return { team, ok: false, error: "That team URL is already taken." };
  }
  const slugAliases = [
    ...new Set(
      [...team.slugAliases, team.slug].filter((value) => value && value !== desired),
    ),
  ];
  const next = note(
    { ...team, slug: desired, slugAliases },
    `Team URL updated to /teams/${desired}.`,
    viewer,
  );
  return { team: persistTeam(viewer, next), ok: true };
}

export function setTeamMemberRole(
  slug: string,
  teamId: string,
  handle: string,
  role: Exclude<TeamMemberRole, "owner">,
): DarkeTeam | null {
  const team = findTeam(slug, teamId);
  if (!team) return null;
  const id = norm(handle);
  if (!id || id === team.ownerHandle) return team;
  const next = note(
    {
      ...team,
      members: team.members.map((row) =>
        row.handle === id ? { ...row, role } : row,
      ),
    },
    `@${id} is now ${role}.`,
    slug,
  );
  return persistTeam(slug, next);
}

export function revokeTeamMember(
  slug: string,
  teamId: string,
  handle: string,
): { team: DarkeTeam | null; chatIds: string[] } {
  const team = findTeam(slug, teamId);
  if (!team) return { team: null, chatIds: [] };
  const id = norm(handle);
  if (!id || id === team.ownerHandle) return { team, chatIds: [] };
  const next = note(
    {
      ...team,
      members: team.members.filter((row) => row.handle !== id),
    },
    `Revoked access for @${id}.`,
    slug,
  );
  persistTeam(slug, next);
  const memberRoster = loadRoster(id).filter((row) => row.id !== team.id);
  writeRoster(id, memberRoster);
  return { team: next, chatIds: team.chatIds };
}

export function rotateTeamInvite(slug: string, teamId: string): DarkeTeam | null {
  const team = findTeam(slug, teamId);
  if (!team) return null;
  const invite: DarkeTeamInvite = {
    ...parseInvite(team.invite),
    token: newInviteToken(),
    useCount: 0,
    enabled: true,
  };
  return persistTeam(slug, note({ ...team, invite }, "Rotated team invite link.", slug));
}

export function teamInviteUrl(team: DarkeTeam): string {
  const token = team.invite?.token || "";
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://darke-messenger-q2d1.vercel.app";
  return `${origin}${teamCenterPath(team.slug || team.id)}?join=${encodeURIComponent(token)}`;
}

export function inviteIsLive(team: DarkeTeam): boolean {
  const invite = team.invite;
  if (!invite?.enabled || !invite.token) return false;
  if (invite.expiresAt && invite.expiresAt <= Date.now()) return false;
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) return false;
  return true;
}

export function teamRoleLabel(role: TeamMemberRole): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

export function canManageTeam(team: DarkeTeam, slug: string): boolean {
  if (isTeamOwner(team, slug)) return true;
  const me = team.members.find((row) => row.handle === norm(slug));
  return me?.role === "admin";
}

export function logTeamEvent(
  viewer: string,
  teamId: string,
  text: string,
): DarkeTeam | null {
  const team = findTeam(viewer, teamId);
  if (!team) return null;
  return persistTeam(viewer, note(team, text, viewer));
}

function parseJoinInput(raw: string): { slug: string | null; token: string | null } {
  const text = raw.trim();
  if (!text) return { slug: null, token: null };
  try {
    const url = new URL(text, typeof window !== "undefined" ? window.location.origin : "https://darke.app");
    return {
      slug: parseTeamRouteParam(url.pathname),
      token: url.searchParams.get("join") || url.searchParams.get("token") || null,
    };
  } catch {
    return { slug: null, token: text };
  }
}

export function joinTeamWithKey(
  viewer: string,
  raw: string,
  pro = false,
): { ok: boolean; team: DarkeTeam | null; error: string | null } {
  const parsed = parseJoinInput(raw);
  let team: DarkeTeam | null = parsed.slug ? catalogTeamByHandle(parsed.slug) : null;
  if (!team && parsed.token) {
    team =
      Object.values(loadCatalog()).find((row) => row.invite?.token === parsed.token) ??
      null;
  }
  if (!team) {
    return { ok: false, team: null, error: "Invite not found. Check the key and try again." };
  }
  const me = norm(viewer);
  if (team.members.some((row) => row.handle === me)) {
    upsertLocal(me, team);
    return { ok: true, team, error: null };
  }
  if (!inviteIsLive(team)) {
    return { ok: false, team: null, error: "This invite is expired or disabled." };
  }
  if (parsed.token && team.invite?.token && parsed.token !== team.invite.token) {
    return { ok: false, team: null, error: "That invite key does not match this team." };
  }
  const result = tryAddTeamMember(team.ownerHandle, me, pro, team.id);
  if (result.blocked) {
    return {
      ok: false,
      team: result.team,
      error: "This team is out of seats. Ask an admin to add capacity.",
    };
  }
  const joined = findTeam(me, team.id) ?? result.team;
  if (joined.invite) {
    persistTeam(team.ownerHandle, {
      ...joined,
      invite: { ...joined.invite, useCount: joined.invite.useCount + 1 },
    });
  }
  return { ok: true, team: findTeam(me, team.id) ?? joined, error: null };
}

export function addTeamSection(
  viewer: string,
  teamId: string,
  name: string,
): DarkeTeam | null {
  const team = findTeam(viewer, teamId);
  if (!team || !canManageTeam(team, viewer)) return null;
  const label = name.trim() || "Section";
  const section: DarkeTeamSection = {
    id: `sec-${newInviteToken()}`,
    name: label,
    chatIds: [],
  };
  return persistTeam(
    viewer,
    note(
      { ...team, sections: [...(team.sections ?? []), section] },
      `Created section ${label}.`,
      viewer,
    ),
  );
}

export function teamPlanLabel(team: DarkeTeam): string {
  return team.plan === "premium" ? "Active · $10/seat" : "Free · 2 seats";
}

