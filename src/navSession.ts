import { readLocalText, writeLocalText } from "./localStore";
import type { WorkspaceModule } from "./workspaces";

export type Section =
  | "home"
  | "feed"
  | "people"
  | "notifications"
  | "games"
  | "movies"
  | "books"
  | "profile"
  | "settings"
  | "manual"
  | "workspace"
  | "compose"
  | "search"
  | "downloads"
  | "teams";

export type NavSelection = {
  id: string;
  module: WorkspaceModule;
  channelId?: string | null;
};

export type NavSnapshot = {
  section: Section;
  bunkerCollapsed: boolean;
  selection: NavSelection | null;
};

function storageKey(slug: string): string {
  return `darke.nav.${slug.trim().toLowerCase() || "session"}`;
}

const SECTIONS: Section[] = [
  "home",
  "feed",
  "people",
  "notifications",
  "games",
  "movies",
  "books",
  "profile",
  "settings",
  "manual",
  "workspace",
  "compose",
  "search",
  "downloads",
  "teams",
];

function parseSection(value: unknown): Section | null {
  return typeof value === "string" && SECTIONS.includes(value as Section)
    ? (value as Section)
    : null;
}

function parseSelection(value: unknown): NavSelection | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<NavSelection>;
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  const module: WorkspaceModule =
    row.module === "members" || row.module === "tasks" ? row.module : "channels";
  const channelId =
    typeof row.channelId === "string" && row.channelId.trim()
      ? row.channelId
      : null;
  return { id: row.id, module, channelId };
}

export function readNavSnapshot(slug: string): NavSnapshot | null {
  const raw = readLocalText(storageKey(slug));
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<NavSnapshot>;
    const section = parseSection(data.section);
    if (!section) return null;
    return {
      section:
        section === "home" || section === "workspace" ? "compose" : section,
      bunkerCollapsed: data.bunkerCollapsed === true,
      selection: parseSelection(data.selection),
    };
  } catch {
    return null;
  }
}

export function writeNavSnapshot(slug: string, snap: NavSnapshot): void {
  writeLocalText(
    storageKey(slug),
    JSON.stringify({
      section: snap.section,
      bunkerCollapsed: snap.bunkerCollapsed,
      selection: snap.selection
        ? {
            id: snap.selection.id,
            module: snap.selection.module,
            channelId: snap.selection.channelId ?? null,
          }
        : null,
    }),
  );
}

export function initialSection(slug: string): Section {
  if (typeof window !== "undefined") {
    const path = window.location.pathname;
    if (path.startsWith("/teams") || /^\/join\/[^/]+/.test(path)) return "teams";
    if (path.startsWith("/manual")) return "manual";
    if (path.startsWith("/app/feed")) return "feed";
    if (path.startsWith("/app/search")) return "search";
    if (path.startsWith("/app/downloads")) return "downloads";
    if (
      path === "/" ||
      path.startsWith("/app") ||
      path.startsWith("/messages") ||
      path === "/join" ||
      path === "/join/"
    ) {
      return "compose";
    }
  }
  return readNavSnapshot(slug)?.section ?? "compose";
}

export function initialBunkerCollapsed(slug: string): boolean {
  return readNavSnapshot(slug)?.bunkerCollapsed === true;
}
