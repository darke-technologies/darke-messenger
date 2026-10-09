export const THEME_CHANGE = "darke-theme";
const STORAGE_KEY = "darke.theme";

export const THEME_OPTIONS = [
  { id: "gray", label: "Black / Gray", hex: "#8e8e93" },
  { id: "cyan", label: "Cyan", hex: "#00d4ff" },
  { id: "ice", label: "Ice", hex: "#64d2ff" },
  { id: "blue", label: "Blue", hex: "#0a84ff" },
  { id: "indigo", label: "Indigo", hex: "#5e5ce6" },
  { id: "purple", label: "Purple", hex: "#bf5af2" },
  { id: "violet", label: "Violet", hex: "#da8fff" },
  { id: "pink", label: "Pink", hex: "#ff375f" },
  { id: "red", label: "Red", hex: "#ff453a" },
  { id: "orange", label: "Orange", hex: "#ff6b00" },
  { id: "amber", label: "Amber", hex: "#ff9f0a" },
  { id: "green", label: "Green", hex: "#30d158" },
  { id: "teal", label: "Teal", hex: "#00c7be" },
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

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = [r, g, b].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function scaleToLuminance(
  r: number,
  g: number,
  b: number,
  target: number,
): { r: number; g: number; b: number } {
  let t = 1;
  let next = { r, g, b };
  for (let i = 0; i < 28; i += 1) {
    const L = relativeLuminance(next.r, next.g, next.b);
    if (Math.abs(L - target) < 0.012) break;
    t *= L > target ? 0.9 : 1.08;
    next = {
      r: Math.max(0, Math.min(255, Math.round(r * t))),
      g: Math.max(0, Math.min(255, Math.round(g * t))),
      b: Math.max(0, Math.min(255, Math.round(b * t))),
    };
  }
  return next;
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
  const bubbleFrom = scaleToLuminance(r, g, b, 0.175);
  const bubbleMid = scaleToLuminance(r, g, b, 0.1);
  const bubbleTo = scaleToLuminance(r, g, b, 0.048);
  root.style.setProperty("--hud-bubble-from", toHex(bubbleFrom));
  root.style.setProperty("--hud-bubble-mid", toHex(bubbleMid));
  root.style.setProperty("--hud-bubble-to", toHex(bubbleTo));
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
