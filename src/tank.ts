import { publicError, supabase, supabaseFetch, withTimeout } from "./supabase";
import { asListing, SELECT_COLS, type AppListing } from "./listings";
import {
  addDarkeCash,
  addShooterUnsynced,
  getDarkeCash,
  getShooterHighScore,
  getShooterUnsynced,
  setDarkeCash,
  setShooterHighScore,
} from "./welcomePrefs";

export const TANK_BACK_MIN = 10_000;
export const TANK_IN_PRESETS = [10_000, 50_000, 100_000] as const;

export type TankInvestment = {
  listing_id: string;
  amount: number;
};

const TANK_SELECT = `${SELECT_COLS},staff_curated,raised_total,backer_count`;

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

export function tankMoney(n: number): string {
  return `$${Math.max(0, Math.floor(n)).toLocaleString("en-US")}`;
}

export function tankInvestedAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}w ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

let displayedTankBalance: number | null = null;
const displayedTankBalanceListeners = new Set<(n: number | null) => void>();

export function getDisplayedTankBalance(): number | null {
  return displayedTankBalance;
}

export function setDisplayedTankBalance(n: number | null) {
  displayedTankBalance = n;
  for (const fn of displayedTankBalanceListeners) fn(n);
}

export function subscribeDisplayedTankBalance(
  fn: (n: number | null) => void,
): () => void {
  displayedTankBalanceListeners.add(fn);
  return () => {
    displayedTankBalanceListeners.delete(fn);
  };
}

export function listingIconOk(url: string): boolean {
  return url.startsWith("data:image/") || /^https?:\/\//i.test(url);
}

export function tankError(err: unknown): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (lower.includes("no tank balance")) {
    return "Your TANK balance has not been assigned yet. The founder can set it in Supabase (tank_balances).";
  }
  if (lower.includes("insufficient balance")) {
    return "Not enough TANK balance for that amount.";
  }
  if (lower.includes("invalid amount")) {
    return `Minimum backing is ${tankMoney(TANK_BACK_MIN)} DARKE CASH.`;
  }
  if (lower.includes("own listing")) {
    return "You cannot go IN or OUT on an app you listed.";
  }
  if (lower.includes("already out")) {
    return "You already went OUT on this app.";
  }
  if (lower.includes("already in")) {
    return "You already went IN on this app.";
  }
  if (lower.includes("listing not found")) {
    return "That TANK listing is not available.";
  }
  if (
    lower.includes("pgrst205") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the table") ||
    lower.includes("42p01") ||
    lower.includes("tank_balances") ||
    lower.includes("tank_investments") ||
    lower.includes("tank_outs") ||
    lower.includes("staff_curated")
  ) {
    return "TANK tables are missing. In the Supabase SQL editor, run supabase/tank_tables.sql until it says Success (not an error). Then confirm I'M IN again.";
  }
  return raw;
}

function missingTankRelation(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("pgrst205") ||
    lower.includes("could not find the table") ||
    (lower.includes("schema cache") &&
      (lower.includes("tank_balances") ||
        lower.includes("tank_investments") ||
        lower.includes("tank_outs") ||
        lower.includes("staff_curated") ||
        lower.includes("raised_total")))
  );
}

function parseMoney(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : null;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
  }
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return parseMoney(raw[0]);
  }
  if (typeof raw === "object") {
    const row = raw as Record<string, unknown>;
    if ("balance" in row) return parseMoney(row.balance);
    if ("tank_my_balance" in row) return parseMoney(row.tank_my_balance);
    const vals = Object.values(row);
    if (vals.length === 1) return parseMoney(vals[0]);
  }
  return null;
}

export async function loadTankBalance(): Promise<number | null> {
  const token = await accessToken();
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Not signed in.");

  try {
    const rpcJs = await supabase.rpc("tank_my_balance");
    if (!rpcJs.error) {
      const n = parseMoney(rpcJs.data);
      if (n != null) return n;
    }
  } catch {
    // Fall through to REST.
  }

  const rpc = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/tank_my_balance`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    15000,
    "tank balance",
  );
  if (rpc.ok) {
    const n = parseMoney(await rpc.json().catch(() => null));
    if (n != null) return n;
  } else {
    await rpc.text().catch(() => "");
  }

  const qs = new URLSearchParams({
    select: "balance",
    user_id: `eq.${uid}`,
    limit: "1",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/tank_balances?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "tank balance",
  );
  if (!res.ok) {
    const text = await res.text();
    if (missingTankRelation(text)) return null;
    throw new Error(text || `tank balance HTTP ${res.status}`);
  }
  return parseMoney(await res.json());
}

/** Credit shooter boulder points onto the signed-in DARKE / TANK balance. */
export async function creditShooterPoints(amount: number): Promise<number | null> {
  const n = Math.floor(amount);
  if (!Number.isFinite(n) || n < 1) return null;

  try {
    const rpcJs = await supabase.rpc("tank_credit_shooter", { p_amount: n });
    if (!rpcJs.error) {
      const parsed = parseMoney(rpcJs.data);
      if (parsed != null) return parsed;
    }
  } catch {
    // Fall through to REST.
  }

  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/tank_credit_shooter`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_amount: n }),
    }),
    15000,
    "shooter credit",
  );
  if (!res.ok) {
    await res.text().catch(() => "");
    return null;
  }
  const raw: unknown = await res.json().catch(() => null);
  return parseMoney(raw);
}

async function flushShooterUnsynced(): Promise<{ leftover: number; balance: number | null }> {
  let leftover = await getShooterUnsynced();
  let balance: number | null = null;
  while (leftover > 0) {
    const chunk = Math.min(leftover, 1_000_000);
    const next = await creditShooterPoints(chunk);
    if (next == null) break;
    balance = next;
    leftover = await addShooterUnsynced(-chunk);
  }
  return { leftover, balance };
}

/** Server TANK balance plus any shooter points that have not synced yet. */
export async function loadDisplayedTankBalance(): Promise<number | null> {
  const server = await loadTankBalance().catch(() => null);
  const flushed = await flushShooterUnsynced();
  const serverTotal =
    flushed.balance != null
      ? flushed.balance + flushed.leftover
      : server == null && flushed.leftover === 0
        ? null
        : (server ?? 0) + flushed.leftover;
  let cash = await getDarkeCash();
  if (serverTotal != null && serverTotal > cash) {
    cash = await setDarkeCash(serverTotal);
  }
  const next = Math.max(cash, serverTotal ?? 0);
  if (next !== cash) await setDarkeCash(next);
  setDisplayedTankBalance(next);
  return next;
}

/** Wallet credits are parked while TANK is off. Session score stays local. */
export function applyShooterCredit(_amount: number): Promise<number | null> {
  return Promise.resolve(null);
}

export async function loadShooterHighScore(): Promise<number> {
  const local = await getShooterHighScore();
  try {
    const rpcJs = await supabase.rpc("shooter_my_high_score");
    if (!rpcJs.error) {
      const n = parseMoney(rpcJs.data);
      if (n != null) {
        const best = Math.max(n, local);
        if (best > local) await setShooterHighScore(best);
        return best;
      }
    }
  } catch {
    // Fall through to REST.
  }
  try {
    const token = await accessToken();
    const res = await withTimeout(
      supabaseFetch(`${baseUrl()}/rest/v1/rpc/shooter_my_high_score`, {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      15000,
      "shooter high score",
    );
    if (res.ok) {
      const n = parseMoney(await res.json().catch(() => null));
      if (n != null) {
        const best = Math.max(n, local);
        if (best > local) await setShooterHighScore(best);
        return best;
      }
    }
  } catch {
    // Keep local.
  }
  return local;
}

export async function reportShooterHighScore(score: number): Promise<number> {
  const n = Math.max(0, Math.floor(score));
  const localBest = await setShooterHighScore(n);
  try {
    const rpcJs = await supabase.rpc("shooter_report_score", { p_score: localBest });
    if (!rpcJs.error) {
      const parsed = parseMoney(rpcJs.data);
      if (parsed != null) {
        const best = Math.max(parsed, localBest);
        if (best > localBest) await setShooterHighScore(best);
        return best;
      }
    }
  } catch {
    // Fall through to REST.
  }
  try {
    const token = await accessToken();
    const res = await withTimeout(
      supabaseFetch(`${baseUrl()}/rest/v1/rpc/shooter_report_score`, {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_score: localBest }),
      }),
      15000,
      "shooter high score",
    );
    if (res.ok) {
      const parsed = parseMoney(await res.json().catch(() => null));
      if (parsed != null) {
        const best = Math.max(parsed, localBest);
        if (best > localBest) await setShooterHighScore(best);
        return best;
      }
    }
  } catch {
    // Keep local.
  }
  return localBest;
}

export async function loadTankListings(): Promise<AppListing[]> {
  const token = await accessToken();
  const headers = authHeaders(token);
  const qs = new URLSearchParams({
    select: TANK_SELECT,
    archived: "eq.false",
    order: "name.asc",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/app_listings?${qs}`, {
      method: "GET",
      headers,
    }),
    25000,
    "tank listings",
  );
  if (res.ok) {
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    const out: AppListing[] = [];
    for (const row of data) {
      const listing = asListing(row);
      if (!listing || seen.has(listing.id)) continue;
      seen.add(listing.id);
      out.push(listing);
    }
    return out;
  }
  const errText = await res.text();
  const fallbackQs = new URLSearchParams({
    select: SELECT_COLS,
    archived: "eq.false",
    order: "name.asc",
  });
  const fallback = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/app_listings?${fallbackQs}`, {
      method: "GET",
      headers,
    }),
    25000,
    "tank listings",
  );
  if (!fallback.ok) {
    throw new Error(errText || (await fallback.text()) || `tank listings HTTP ${res.status}`);
  }
  const rows: unknown = await fallback.json();
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: AppListing[] = [];
  for (const row of rows) {
    const listing = asListing(row);
    if (!listing || seen.has(listing.id)) continue;
    seen.add(listing.id);
    out.push(listing);
  }
  return out;
}

export async function loadTankInvestments(
  userId: string,
): Promise<TankInvestment[]> {
  const uid = userId.trim();
  if (!uid) return [];
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "listing_id,amount",
    user_id: `eq.${uid}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/tank_investments?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "tank investments",
  );
  if (!res.ok) {
    const text = await res.text();
    if (missingTankRelation(text)) return [];
    throw new Error(text || `tank investments HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  const out: TankInvestment[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as { listing_id?: unknown; amount?: unknown };
    if (typeof r.listing_id !== "string") continue;
    const n = Number(r.amount);
    if (!Number.isFinite(n) || n < 1) continue;
    out.push({ listing_id: r.listing_id, amount: Math.floor(n) });
  }
  return out;
}

export async function loadMyTankInvestments(): Promise<TankInvestment[]> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Not signed in.");
  return loadTankInvestments(uid);
}

export async function loadMyTankOutIds(): Promise<Set<string>> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Not signed in.");
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "listing_id",
    user_id: `eq.${uid}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/tank_outs?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "tank outs",
  );
  if (!res.ok) {
    const text = await res.text();
    if (missingTankRelation(text)) return new Set();
    throw new Error(text || `tank outs HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const ids = new Set<string>();
  if (!Array.isArray(rows)) return ids;
  for (const row of rows) {
    if (row && typeof row === "object" && typeof (row as { listing_id?: unknown }).listing_id === "string") {
      ids.add((row as { listing_id: string }).listing_id);
    }
  }
  return ids;
}

export async function tankInvest(listingId: string, amount: number): Promise<void> {
  const n = Math.floor(amount);
  if (!Number.isFinite(n) || n < TANK_BACK_MIN) {
    throw new Error("invalid amount");
  }
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/tank_invest`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_listing_id: listingId, p_amount: n }),
    }),
    20000,
    "tank in",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `tank in HTTP ${res.status}`);
  }
}

/** Deduct sealed DARKE_CASH, then record the backing and bump the listing total. */
export async function backTankApp(
  listingId: string,
  amount: number,
): Promise<number> {
  const n = Math.floor(amount);
  if (!Number.isFinite(n) || n < TANK_BACK_MIN) {
    throw new Error("invalid amount");
  }
  const cash = await getDarkeCash();
  if (cash < n) throw new Error("insufficient balance");
  await flushShooterUnsynced();
  const next = await addDarkeCash(-n);
  setDisplayedTankBalance(next);
  try {
    await tankInvest(listingId, n);
  } catch (err) {
    const restored = await addDarkeCash(n);
    setDisplayedTankBalance(restored);
    throw err;
  }
  return next;
}

export async function tankOut(listingId: string): Promise<void> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/tank_out`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_listing_id: listingId }),
    }),
    20000,
    "tank out",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `tank out HTTP ${res.status}`);
  }
}

export type TankInvestor = {
  username: string;
  amount: number;
  avatar_url: string | null;
  invested_at: string | null;
};

export async function loadTankListingInvestors(
  listingId: string,
): Promise<TankInvestor[]> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/tank_listing_investors`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_listing_id: listingId }),
    }),
    15000,
    "tank investors",
  );
  if (!res.ok) return [];
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  const out: TankInvestor[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const u = (row as { username?: unknown }).username;
    const a = (row as { amount?: unknown }).amount;
    const photo = (row as { avatar_url?: unknown }).avatar_url;
    const when = (row as { invested_at?: unknown }).invested_at;
    const n = typeof a === "number" ? a : Number(a);
    if (typeof u === "string" && u.trim() && Number.isFinite(n) && n > 0) {
      out.push({
        username: u.trim(),
        amount: Math.floor(n),
        avatar_url:
          typeof photo === "string" && photo.trim() ? photo.trim() : null,
        invested_at: typeof when === "string" && when.trim() ? when.trim() : null,
      });
    }
  }
  const needPhoto = out.filter((r) => !r.avatar_url).map((r) => r.username);
  if (needPhoto.length === 0) return out;
  const names = needPhoto
    .filter((n) => /^[a-z0-9]+$/i.test(n))
    .slice(0, 100);
  if (names.length === 0) return out;
  const qs = new URLSearchParams({
    select: "username,avatar_url",
    username: `in.(${names.join(",")})`,
  });
  const avatars = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/profiles?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    12000,
    "tank investor photos",
  );
  if (!avatars.ok) return out;
  const photos: unknown = await avatars.json();
  if (!Array.isArray(photos)) return out;
  const byName = new Map<string, string>();
  for (const p of photos) {
    if (!p || typeof p !== "object") continue;
    const name = (p as { username?: unknown }).username;
    const url = (p as { avatar_url?: unknown }).avatar_url;
    if (typeof name === "string" && typeof url === "string" && url.trim()) {
      byName.set(name.toLowerCase(), url.trim());
    }
  }
  return out.map((row) => ({
    ...row,
    avatar_url: row.avatar_url ?? byName.get(row.username.toLowerCase()) ?? null,
  }));
}

export async function loadTankRecentBackers(listingId: string): Promise<string[]> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/tank_recent_backers`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_listing_id: listingId, lim: 8 }),
    }),
    15000,
    "tank backers",
  );
  if (!res.ok) return [];
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  const names: string[] = [];
  for (const row of rows) {
    if (row && typeof row === "object") {
      const u = (row as { username?: unknown }).username;
      if (typeof u === "string" && u.trim()) names.push(u.trim());
    } else if (typeof row === "string" && row.trim()) {
      names.push(row.trim());
    }
  }
  return names;
}

export type TankPortfolioRow = {
  listing: AppListing;
  amount: number;
};

export async function loadTankPortfolio(
  userId?: string,
): Promise<TankPortfolioRow[]> {
  const { data } = await supabase.auth.getSession();
  const uid = userId?.trim() || data.session?.user.id;
  if (!uid) return [];
  const [listings, invested] = await Promise.all([
    loadTankListings(),
    loadTankInvestments(uid),
  ]);
  const byId = new Map(listings.map((l) => [l.id, l]));
  const rows: TankPortfolioRow[] = [];
  for (const inv of invested) {
    const listing = byId.get(inv.listing_id);
    if (listing) rows.push({ listing, amount: inv.amount });
  }
  rows.sort((a, b) => a.listing.name.localeCompare(b.listing.name));
  return rows;
}
