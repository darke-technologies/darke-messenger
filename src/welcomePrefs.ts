import { applyTheme, parseThemeId, type ThemeId } from "./theme";
import { LOCAL_PREFS, readLocalText, writeLocalText } from "./localStore";

export const IDLE_TIMEOUT_CHANGE = "darke-idle-timeout";
export const STARS_BACKGROUND_CHANGE = "darke-stars-background";
export const SIDEBAR_ENTERTAINMENT_CHANGE = "darke-sidebar-entertainment";
export const SIDEBAR_SECTIONS_CHANGE = "darke-sidebar-sections";
export const FEED_FONT_CHANGE = "darke-feed-font";
export const TYPING_PREF_CHANGE = "darke-broadcast-typing";

export type SidebarSections = {
  darkenet: boolean;
  workspaces: boolean;
  entertainment: boolean;
};

export const FEED_FONT_MIN = 12;
export const FEED_FONT_MAX = 22;
export const FEED_FONT_DEFAULT = 15;

export const IDLE_TIMEOUT_OPTIONS: { min: number; label: string }[] = [
  { min: 0, label: "Off" },
  { min: 1, label: "1 min" },
  { min: 2, label: "2 min" },
  { min: 5, label: "5 min" },
  { min: 10, label: "10 min" },
  { min: 15, label: "15 min" },
  { min: 30, label: "30 min" },
];

function parseIdleTimeoutMin(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const n = Math.max(0, Math.floor(value));
  return IDLE_TIMEOUT_OPTIONS.some((opt) => opt.min === n) ? n : 0;
}

function parseFeedFontSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return FEED_FONT_DEFAULT;
  return Math.min(FEED_FONT_MAX, Math.max(FEED_FONT_MIN, Math.round(value)));
}

export function applyFeedFontSize(
  px: number,
  root: HTMLElement = document.documentElement,
): number {
  const n = parseFeedFontSize(px);
  root.style.setProperty("--feed-font", `${n}px`);
  return n;
}

type PrefsFile = {
  version: 1;
  showWelcome: boolean;
  showLikesHint: boolean;
  theme: ThemeId;
  /** Shooter points not yet written to tank_balances. */
  shooterUnsynced: number;
  /** Best shooter payout remembered on this PC. */
  shooterHighScore: number;
  /** Minutes of inactivity before the lock overlay. 0 = Off. */
  idleTimeoutMin: number;
  /** Twinkling starfield + shooting stars behind app pages. */
  starsBackground: boolean;
  /** DARKENET (Feed, People, Notifications, Profile) in the sidebar. */
  showDarkenetSidebar: boolean;
  /** Workspaces and nested channels in the sidebar. */
  showWorkspacesSidebar: boolean;
  /** Movies, Games, and Books in the sidebar. */
  showEntertainmentSidebar: boolean;
  /** Newsfeed post body size in pixels. */
  feedFontSize: number;
  /** Emit ephemeral P2P TYPING_START events while composing. */
  broadcastTyping: boolean;
  /** Local DARKE CASH cache on this PC. */
  DARKE_CASH: number;
};

const DEFAULTS: PrefsFile = {
  version: 1,
  showWelcome: true,
  showLikesHint: true,
  theme: "gray",
  shooterUnsynced: 0,
  shooterHighScore: 0,
  idleTimeoutMin: 0,
  starsBackground: true,
  showDarkenetSidebar: true,
  showWorkspacesSidebar: true,
  showEntertainmentSidebar: true,
  feedFontSize: FEED_FONT_DEFAULT,
  broadcastTyping: true,
  DARKE_CASH: 0,
};

let cache: PrefsFile | null = null;

function parseCash(data: Partial<PrefsFile> & { darkeCash?: unknown }): number {
  const raw = data.DARKE_CASH ?? data.darkeCash;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  return 0;
}

function parse(raw: string | null): PrefsFile {
  if (!raw) return { ...DEFAULTS };
  try {
    const data = JSON.parse(raw) as Partial<PrefsFile>;
    return {
      version: 1,
      showWelcome:
        typeof data.showWelcome === "boolean"
          ? data.showWelcome
          : DEFAULTS.showWelcome,
      showLikesHint:
        typeof data.showLikesHint === "boolean"
          ? data.showLikesHint
          : DEFAULTS.showLikesHint,
      theme: parseThemeId(data.theme),
      shooterUnsynced:
        typeof data.shooterUnsynced === "number" &&
        Number.isFinite(data.shooterUnsynced)
          ? Math.max(0, Math.floor(data.shooterUnsynced))
          : 0,
      shooterHighScore:
        typeof data.shooterHighScore === "number" &&
        Number.isFinite(data.shooterHighScore)
          ? Math.max(0, Math.floor(data.shooterHighScore))
          : 0,
      idleTimeoutMin: parseIdleTimeoutMin(data.idleTimeoutMin),
      starsBackground:
        typeof data.starsBackground === "boolean"
          ? data.starsBackground
          : DEFAULTS.starsBackground,
      showDarkenetSidebar:
        typeof data.showDarkenetSidebar === "boolean"
          ? data.showDarkenetSidebar
          : DEFAULTS.showDarkenetSidebar,
      showWorkspacesSidebar:
        typeof data.showWorkspacesSidebar === "boolean"
          ? data.showWorkspacesSidebar
          : DEFAULTS.showWorkspacesSidebar,
      showEntertainmentSidebar:
        typeof data.showEntertainmentSidebar === "boolean"
          ? data.showEntertainmentSidebar
          : DEFAULTS.showEntertainmentSidebar,
      feedFontSize: parseFeedFontSize(data.feedFontSize),
      broadcastTyping:
        typeof data.broadcastTyping === "boolean"
          ? data.broadcastTyping
          : DEFAULTS.broadcastTyping,
      DARKE_CASH: parseCash(data),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

async function readPrefs(): Promise<PrefsFile> {
  if (cache) return cache;
  cache = parse(readLocalText(LOCAL_PREFS));
  return cache;
}

async function writePrefs(next: PrefsFile): Promise<void> {
  cache = next;
  writeLocalText(LOCAL_PREFS, JSON.stringify(next));
}

export async function getShowWelcome(): Promise<boolean> {
  return (await readPrefs()).showWelcome;
}

export async function setShowWelcome(show: boolean): Promise<void> {
  const current = await readPrefs();
  if (current.showWelcome === show) return;
  await writePrefs({ ...current, showWelcome: show });
}

export async function getShowLikesHint(): Promise<boolean> {
  return (await readPrefs()).showLikesHint;
}

export async function setShowLikesHint(show: boolean): Promise<void> {
  const current = await readPrefs();
  if (current.showLikesHint === show) return;
  await writePrefs({ ...current, showLikesHint: show });
}

export async function getIdleTimeoutMin(): Promise<number> {
  return (await readPrefs()).idleTimeoutMin;
}

export async function setIdleTimeoutMin(min: number): Promise<void> {
  const next = parseIdleTimeoutMin(min);
  const current = await readPrefs();
  if (current.idleTimeoutMin === next) return;
  await writePrefs({ ...current, idleTimeoutMin: next });
  window.dispatchEvent(new CustomEvent(IDLE_TIMEOUT_CHANGE, { detail: next }));
}

export async function getStarsBackground(): Promise<boolean> {
  return (await readPrefs()).starsBackground;
}

export async function setStarsBackground(on: boolean): Promise<void> {
  const current = await readPrefs();
  if (current.starsBackground === on) return;
  await writePrefs({ ...current, starsBackground: on });
  window.dispatchEvent(new CustomEvent(STARS_BACKGROUND_CHANGE, { detail: on }));
}

export function sidebarSectionsFromPrefs(prefs: {
  showDarkenetSidebar: boolean;
  showWorkspacesSidebar: boolean;
  showEntertainmentSidebar: boolean;
}): SidebarSections {
  return {
    darkenet: prefs.showDarkenetSidebar,
    workspaces: prefs.showWorkspacesSidebar,
    entertainment: prefs.showEntertainmentSidebar,
  };
}

function emitSidebarSections(sections: SidebarSections): void {
  window.dispatchEvent(
    new CustomEvent(SIDEBAR_SECTIONS_CHANGE, { detail: sections }),
  );
  window.dispatchEvent(
    new CustomEvent(SIDEBAR_ENTERTAINMENT_CHANGE, {
      detail: sections.entertainment,
    }),
  );
}

export async function getSidebarSections(): Promise<SidebarSections> {
  return sidebarSectionsFromPrefs(await readPrefs());
}

export async function setSidebarSection(
  key: keyof SidebarSections,
  on: boolean,
): Promise<SidebarSections> {
  const current = await readPrefs();
  const patch =
    key === "darkenet"
      ? { showDarkenetSidebar: on }
      : key === "workspaces"
        ? { showWorkspacesSidebar: on }
        : { showEntertainmentSidebar: on };
  const next = { ...current, ...patch };
  const sections = sidebarSectionsFromPrefs(next);
  if (
    current.showDarkenetSidebar === next.showDarkenetSidebar &&
    current.showWorkspacesSidebar === next.showWorkspacesSidebar &&
    current.showEntertainmentSidebar === next.showEntertainmentSidebar
  ) {
    return sections;
  }
  await writePrefs(next);
  emitSidebarSections(sections);
  return sections;
}

export async function getShowEntertainmentSidebar(): Promise<boolean> {
  return (await getSidebarSections()).entertainment;
}

export async function setShowEntertainmentSidebar(on: boolean): Promise<void> {
  await setSidebarSection("entertainment", on);
}

export async function getShowDarkenetSidebar(): Promise<boolean> {
  return (await getSidebarSections()).darkenet;
}

export async function setShowDarkenetSidebar(on: boolean): Promise<void> {
  await setSidebarSection("darkenet", on);
}

export async function getShowWorkspacesSidebar(): Promise<boolean> {
  return (await getSidebarSections()).workspaces;
}

export async function setShowWorkspacesSidebar(on: boolean): Promise<void> {
  await setSidebarSection("workspaces", on);
}

export async function getThemePref(): Promise<ThemeId> {
  return (await readPrefs()).theme;
}

export async function setThemePref(theme: ThemeId): Promise<void> {
  applyTheme(theme);
  const current = await readPrefs();
  if (current.theme === theme) return;
  await writePrefs({ ...current, theme });
}

export async function getFeedFontSize(): Promise<number> {
  return (await readPrefs()).feedFontSize;
}

export async function setFeedFontSize(px: number): Promise<number> {
  const next = applyFeedFontSize(px);
  const current = await readPrefs();
  if (current.feedFontSize === next) return next;
  await writePrefs({ ...current, feedFontSize: next });
  window.dispatchEvent(new CustomEvent(FEED_FONT_CHANGE, { detail: next }));
  return next;
}

export async function getBroadcastTyping(): Promise<boolean> {
  return (await readPrefs()).broadcastTyping;
}

export async function setBroadcastTyping(on: boolean): Promise<void> {
  const current = await readPrefs();
  if (current.broadcastTyping === on) return;
  await writePrefs({ ...current, broadcastTyping: on });
  window.dispatchEvent(new CustomEvent(TYPING_PREF_CHANGE, { detail: on }));
}

export async function hydrateThemeFromVault(): Promise<ThemeId> {
  const prefs = await readPrefs();
  applyTheme(prefs.theme);
  applyFeedFontSize(prefs.feedFontSize);
  return prefs.theme;
}

export function resetWelcomePrefsCache(): void {
  cache = null;
}

export async function getShooterUnsynced(): Promise<number> {
  return (await readPrefs()).shooterUnsynced;
}

export async function setShooterUnsynced(amount: number): Promise<number> {
  const n = Math.max(0, Math.floor(amount));
  const current = await readPrefs();
  if (current.shooterUnsynced === n) return n;
  await writePrefs({ ...current, shooterUnsynced: n });
  return n;
}

export async function addShooterUnsynced(delta: number): Promise<number> {
  const current = await readPrefs();
  const n = Math.max(0, Math.floor(current.shooterUnsynced + delta));
  await writePrefs({ ...current, shooterUnsynced: n });
  return n;
}

export async function getShooterHighScore(): Promise<number> {
  return (await readPrefs()).shooterHighScore;
}

export async function setShooterHighScore(score: number): Promise<number> {
  const n = Math.max(0, Math.floor(score));
  const current = await readPrefs();
  if (n <= current.shooterHighScore) return current.shooterHighScore;
  await writePrefs({ ...current, shooterHighScore: n });
  return n;
}

export async function getDarkeCash(): Promise<number> {
  return (await readPrefs()).DARKE_CASH;
}

export async function setDarkeCash(amount: number): Promise<number> {
  const n = Math.max(0, Math.floor(amount));
  const current = await readPrefs();
  if (current.DARKE_CASH === n) return n;
  await writePrefs({ ...current, DARKE_CASH: n });
  return n;
}

export async function addDarkeCash(delta: number): Promise<number> {
  const current = await readPrefs();
  const n = Math.max(0, Math.floor(current.DARKE_CASH + delta));
  await writePrefs({ ...current, DARKE_CASH: n });
  return n;
}
