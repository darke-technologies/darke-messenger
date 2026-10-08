export const THEME_CHANGE = "darke-theme";
const STORAGE_KEY = "darke.theme";

export const THEME_OPTIONS = [
  { id: "gray", label: "Black / Gray", hex: "#c4c4c4" },
  { id: "cyan", label: "Cyan", hex: "#00c8d6" },
  { id: "ice", label: "Ice", hex: "#7a9eb0" },
  { id: "blue", label: "Blue", hex: "#5d7ea8" },
  { id: "indigo", label: "Indigo", hex: "#6a70a3" },
  { id: "purple", label: "Purple", hex: "#7e6ea8" },
  { id: "violet", label: "Violet", hex: "#8f6fa0" },
  { id: "pink", label: "Pink", hex: "#b07a8c" },
  { id: "red", label: "Red", hex: "#b85c5c" },
  { id: "orange", label: "Orange", hex: "#c07a4c" },
  { id: "amber", label: "Amber", hex: "#c49a52" },
  { id: "green", label: "Green", hex: "#4e9a68" },
  { id: "teal", label: "Teal", hex: "#3d9a8c" },
] as const;

export type ThemeId = (typeof THEME_OPTIONS)[number]["id"];

export const DEFAULT_THEME: ThemeId = "gray";

const LEGACY: Record<string, ThemeId> = {
  hud: "cyan",
  stealth: "cyan",
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = hex.replace("#", "");
  return {
    r: Number.parseInt(n.slice(0, 2), 16),
    g: Number.parseInt(n.slice(2, 4), 16),
    b: Number.parseInt(n.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b]
    .map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function themeOption(id: ThemeId) {
  return THEME_OPTIONS.find((opt) => opt.id === id) ?? THEME_OPTIONS[0];
}

export function isThemeId(value: unknown): value is ThemeId {
  return THEME_OPTIONS.some((opt) => opt.id === value);
}

export function parseThemeId(value: unknown): ThemeId {
  if (isThemeId(value)) return value;
  if (typeof value === "string" && value in LEGACY) return LEGACY[value];
  return DEFAULT_THEME;
}

export function applyAccentVars(id: ThemeId, root: HTMLElement = document.documentElement): void {
  const { hex } = themeOption(id);
  const { r, g, b } = hexToRgb(hex);
  const rgb = `${r}, ${g}, ${b}`;
  root.setAttribute("data-theme", "hud");
  root.setAttribute("data-accent", id);
  root.style.setProperty("--hud", hex);
  root.style.setProperty("--hover-blue", hex);
  root.style.setProperty("--hud-rgb", rgb);
  root.style.setProperty("--hud-dim", `rgba(${rgb}, 0.42)`);
  root.style.setProperty("--hud-faint", `rgba(${rgb}, 0.16)`);
  root.style.setProperty("--hud-glow", `0 0 14px rgba(${rgb}, 0.35)`);
  root.style.setProperty(
    "--hud-deep",
    toHex({
      r: Math.round(r * 0.07),
      g: Math.round(g * 0.07),
      b: Math.round(b * 0.1),
    }),
  );
}

export function readStoredTheme(): ThemeId {
  try {
    return parseThemeId(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: ThemeId): void {
  applyAccentVars(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(THEME_CHANGE, { detail: theme }));
}

export function initTheme(): ThemeId {
  const theme = readStoredTheme();
  applyAccentVars(theme);
  return theme;
}
