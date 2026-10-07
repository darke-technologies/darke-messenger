import type { DmThread } from "./dmSessions";
import { listChatMemberHandles, standaloneJoinBlocked, isGroupChat } from "./chatService";
import {
  FREE_TEAM_SEATS,
  addTeamMember,
  findTeam,
  teamSeatCap,
  teamSeatsUsed,
  type DarkeTeam,
} from "./teamContainer";
import {
  WORKSPACE_SEAT_LIMIT,
  createWorkspaceInvite,
  loadMyWorkspaces,
  loadWorkspaceMembers,
  type DarkeWorkspaceInvite,
  type WorkspaceTier,
} from "./workspaces";

/** Paid roster row. Distinct from ChatGuest. */
export type OrganizationMember = {
  userId: string;
  role: "owner" | "member";
  createdAt: string;
};

export type OrganizationSeats = {
  seatsUsed: number;
  maxSeats: number;
};

export function isPaidSeatRole(
  role: string | null | undefined,
): role is "owner" | "member" {
  return role === "owner" || role === "member";
}

export function organizationSeats(
  members: { role: string }[],
  tier: string,
): OrganizationSeats {
  const seatsUsed = members.filter((row) => isPaidSeatRole(row.role)).length;
  const cap = WORKSPACE_SEAT_LIMIT[tier as WorkspaceTier];
  const maxSeats = Number.isFinite(cap) ? cap : Number.POSITIVE_INFINITY;
  return { seatsUsed, maxSeats };
}

export function atSeatCap(seats: OrganizationSeats): boolean {
  return Number.isFinite(seats.maxSeats) && seats.seatsUsed >= seats.maxSeats;
}

/** Standalone chats/groups use node caps, not billing seats. */
export function chatNodeMaxSeats(seats: OrganizationSeats): number {
  if (!Number.isFinite(seats.maxSeats)) return Number.POSITIVE_INFINITY;
  return Number.POSITIVE_INFINITY;
}

export function chatNodeAtCapacity(
  _memberCount: number,
  _seats: OrganizationSeats,
): boolean {
  return false;
}

export function groupChatNeedsUpgrade(
  _memberCount: number,
  _seats: OrganizationSeats,
): boolean {
  return false;
}

export const TEAM_SEAT_BLOCKED =
  "This TEAM node is at the free 2-seat limit. Upgrade to Premium to add more TEAM members.";

export type TeamMovePreview = {
  team: DarkeTeam;
  teamName: string;
  isGroup: boolean;
  newHandles: string[];
  newMemberCount: number;
  projectedSeats: number;
  planSeats: number;
  blocked: boolean;
};

export function evaluateMoveToTeam(
  viewer: string,
  thread: DmThread | null,
  teamId: string | null | undefined,
  pro: boolean,
): TeamMovePreview | null {
  if (!thread) return null;
  const team = findTeam(viewer, teamId);
  if (!team) return null;
  const teamHandles = new Set(team.members.map((row) => row.handle));
  const incoming = listChatMemberHandles(thread, viewer).filter(Boolean);
  const newHandles = incoming.filter((handle) => !teamHandles.has(handle));
  const projectedSeats = teamHandles.size + newHandles.length;
  const planSeats = teamSeatCap(pro);
  return {
    team,
    teamName: team.name,
    isGroup: isGroupChat(thread),
    newHandles,
    newMemberCount: newHandles.length,
    projectedSeats,
    planSeats: Number.isFinite(planSeats) ? planSeats : projectedSeats,
    blocked: Number.isFinite(planSeats) && projectedSeats > planSeats,
  };
}

export function applyMoveMembersToTeam(
  viewer: string,
  preview: TeamMovePreview,
): void {
  for (const handle of preview.newHandles) {
    addTeamMember(viewer, handle, "member", preview.team.id);
  }
}

export function joinLinkSeatError(
  target: DmThread | null,
  _seats: OrganizationSeats,
  viewerSlug = "",
  pro = false,
): string | null {
  const standalone = standaloneJoinBlocked(target, viewerSlug);
  if (standalone) return standalone;
  if (!target?.teamId) return null;
  if (pro) return null;
  const slug = viewerSlug || target.handle || "";
  const self = slug.replace(/^@/, "").trim().toLowerCase();
  const alreadyInChat = listChatMemberHandles(target, slug).includes(self);
  if (alreadyInChat) return null;
  const team = findTeam(slug, target.teamId);
  if (team && team.members.some((row) => row.handle === self)) return null;
  if (team && teamSeatsUsed(team) >= FREE_TEAM_SEATS) return TEAM_SEAT_BLOCKED;
  return null;
}

export async function loadJoinOrganizationSeats(
  workspaceId?: string | null,
  tier: string = "free",
): Promise<OrganizationSeats> {
  try {
    let id = workspaceId?.trim() || "";
    let plan = tier;
    if (!id) {
      const spaces = await loadMyWorkspaces();
      const ws = spaces[0];
      if (!ws) {
        const cap = WORKSPACE_SEAT_LIMIT.free;
        return { seatsUsed: cap, maxSeats: cap };
      }
      id = ws.id;
    }
    const members = await loadWorkspaceMembers(id);
    return organizationSeats(members, plan);
  } catch {
    const cap = WORKSPACE_SEAT_LIMIT[tier as WorkspaceTier] ?? WORKSPACE_SEAT_LIMIT.free;
    const maxSeats = Number.isFinite(cap) ? cap : Number.POSITIVE_INFINITY;
    return {
      seatsUsed: Number.isFinite(maxSeats) ? maxSeats : 0,
      maxSeats,
    };
  }
}

export function seatLimitError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("workspace_seat_limit") ||
    msg.includes("seat") ||
    msg.includes("invite_forbidden")
  );
}

export async function loadOrganizationMembers(
  workspaceId: string,
): Promise<OrganizationMember[]> {
  const rows = await loadWorkspaceMembers(workspaceId);
  return rows.filter((row) => isPaidSeatRole(row.role)).map((row) => ({
    userId: row.userId,
    role: row.role === "owner" ? "owner" : "member",
    createdAt: row.createdAt,
  }));
}

/**
 * MY TEAM invite. Creates an OrganizationMember (paid seat).
 * Chat / join-link guests must not call this.
 */
export async function inviteOrganizationMember(
  workspaceId: string,
  seats: OrganizationSeats,
  email?: string,
  inviteeId?: string,
  alreadyPaid = false,
): Promise<DarkeWorkspaceInvite> {
  if (!alreadyPaid && atSeatCap(seats)) {
    throw new Error("workspace_seat_limit");
  }
  return createWorkspaceInvite(workspaceId, email, inviteeId);
}
