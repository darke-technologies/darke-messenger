import { isUnitedStates, US_STATES } from "./places";
import { isValidSlug, toSlug } from "./slug";
import {
  publicError,
  supabase,
  supabaseFetch,
  usernameAvailable,
  withTimeout,
} from "./supabase";

export type DarkeProfile = {
  id: string;
  username: string;
  display_name: string | null;
  headline: string | null;
  avatar_url: string | null;
  created_at: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  website_url: string | null;
  email: string | null;
  signal: string | null;
  youtube_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  instagram_url: string | null;
    tiktok_url: string | null;
    linkedin_url: string | null;
    whatsapp_url: string | null;
    telegram_url: string | null;
    bio: string | null;
  top_8_users: string[];
  is_pro: boolean;
  subscription_status: string | null;
  darke_id?: string | null;
  public_key?: string | null;
  is_private?: boolean;
  is_discoverable?: boolean;
};

export type ProfileDetails = {
  avatar_url?: string | null;
  display_name?: string | null;
  headline?: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  website_url: string | null;
  email: string | null;
  signal: string | null;
  youtube_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  instagram_url: string | null;
    tiktok_url: string | null;
    linkedin_url: string | null;
    whatsapp_url: string | null;
  telegram_url: string | null;
  bio?: string | null;
  is_discoverable?: boolean;
};

export type ProfileSocialId =
  | "signal"
  | "whatsapp"
  | "telegram"
  | "youtube"
  | "facebook"
  | "twitter"
  | "instagram"
  | "tiktok"
  | "linkedin";

export const PROFILE_SOCIALS: {
  id: ProfileSocialId;
  label: string;
  icon: string;
  hosts: string[];
  placeholder: string;
  handleUrl: (handle: string) => string;
  maxLen?: number;
}[] = [
  {
    id: "signal",
    label: "Signal",
    icon: "/signal.png",
    hosts: ["signal.me", "signal.org", "signal.group"],
    placeholder: "https://signal.me/#eu/…",
    handleUrl: (handle) => `https://signal.me/#p/${handle}`,
    maxLen: 500,
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: "/whatsapp.png",
    hosts: [
      "whatsapp.com",
      "wa.me",
      "wa.link",
      "whatsapp.net",
      "api.whatsapp.com",
    ],
    placeholder: "https://wa.me/15551234567",
    handleUrl: (handle) => `https://wa.me/${handle.replace(/\D/g, "") || handle}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: "/telegram.png",
    hosts: ["t.me", "telegram.me", "telegram.org", "telegram.dog", "tx.me"],
    placeholder: "https://t.me/you",
    handleUrl: (handle) => `https://t.me/${handle}`,
  },
  {
    id: "youtube",
    label: "YouTube",
    icon: "/youtube.png",
    hosts: ["youtube.com", "youtu.be", "m.youtube.com", "music.youtube.com"],
    placeholder: "youtube.com/@you",
    handleUrl: (handle) => `https://www.youtube.com/@${handle}`,
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: "/facebook.png",
    hosts: ["facebook.com", "fb.com", "fb.me", "m.facebook.com"],
    placeholder: "facebook.com/you",
    handleUrl: (handle) => `https://www.facebook.com/${handle}`,
  },
  {
    id: "twitter",
    label: "Twitter",
    icon: "/twitter.png",
    hosts: ["twitter.com", "x.com", "mobile.twitter.com"],
    placeholder: "x.com/you",
    handleUrl: (handle) => `https://x.com/${handle}`,
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: "/instagram.png",
    hosts: ["instagram.com"],
    placeholder: "instagram.com/you",
    handleUrl: (handle) => `https://www.instagram.com/${handle}`,
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: "/tiktok.png",
    hosts: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "m.tiktok.com"],
    placeholder: "tiktok.com/@you",
    handleUrl: (handle) => `https://www.tiktok.com/@${handle}`,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: "/linkedin.png",
    hosts: ["linkedin.com"],
    placeholder: "linkedin.com/in/you",
    handleUrl: (handle) => `https://www.linkedin.com/in/${handle}`,
  },
];

const SELECT_COLS_CORE =
  "id,username,display_name,headline,avatar_url,created_at,country,region,city,website_url,email,signal,youtube_url,facebook_url,twitter_url,instagram_url,tiktok_url,linkedin_url,whatsapp_url,telegram_url,bio,top_8_users,darke_id,public_key,is_private,is_discoverable";
const SELECT_COLS = `${SELECT_COLS_CORE},is_pro,subscription_status`;
const SELECT_COLS_BASIC = "id,username,display_name,avatar_url,created_at";

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

function parseProfile(raw: unknown): DarkeProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.username !== "string") return null;
  const avatar =
    typeof r.avatar_url === "string" && r.avatar_url.trim()
      ? r.avatar_url.trim()
      : null;
  const created =
    typeof r.created_at === "string" && r.created_at.trim()
      ? r.created_at
      : null;
  const textOrNull = (key: string) => {
    const v = r[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  return {
    id: r.id,
    username: r.username,
    display_name: textOrNull("display_name"),
    headline: textOrNull("headline"),
    avatar_url: avatar,
    created_at: created,
    country: textOrNull("country"),
    region: textOrNull("region"),
    city: textOrNull("city"),
    website_url: textOrNull("website_url"),
    email: textOrNull("email"),
    signal: textOrNull("signal"),
    youtube_url: textOrNull("youtube_url"),
    facebook_url: textOrNull("facebook_url"),
    twitter_url: textOrNull("twitter_url"),
    instagram_url: textOrNull("instagram_url"),
    tiktok_url: textOrNull("tiktok_url"),
    linkedin_url: textOrNull("linkedin_url"),
    whatsapp_url: textOrNull("whatsapp_url"),
    telegram_url: textOrNull("telegram_url"),
    bio: textOrNull("bio"),
    top_8_users: parseHandleList(r.top_8_users, 5),
    is_pro: r.is_pro === true,
    subscription_status: textOrNull("subscription_status"),
    darke_id: textOrNull("darke_id"),
    public_key: textOrNull("public_key"),
    is_private: r.is_private === true,
    is_discoverable: r.is_discoverable === true,
  };
}

export function profileIsPro(profile: DarkeProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.is_pro) return true;
  const status = (profile.subscription_status ?? "").trim().toLowerCase();
  return status === "pro";
}

function parseHandleList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const slug = toSlug(item);
    if (!isValidSlug(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= max) break;
  }
  return out;
}

export function profileError(err: unknown): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes("pgrst") &&
    (lower.includes("bio") || lower.includes("profiles_bio"))
  ) {
    return "Profile bio is not set up yet. Run supabase/phase32.sql in the Supabase SQL editor, then try again.";
  }
  if (lower.includes("pgrst") && (lower.includes("top_8_users") || lower.includes("top_8"))) {
    return "Recommended builders are not set up yet. Run supabase/phase42.sql in the Supabase SQL editor, then try again.";
  }
  if (lower.includes("pgrst") && lower.includes("signal")) {
    return "Signal is not set up yet. Run supabase/phase28.sql in the Supabase SQL editor, then try again.";
  }
  if (
    lower.includes("pgrst") &&
    (lower.includes("youtube_url") ||
      lower.includes("facebook_url") ||
      lower.includes("twitter_url") ||
      lower.includes("instagram_url") ||
      lower.includes("tiktok_url") ||
      lower.includes("linkedin_url") ||
      lower.includes("whatsapp_url") ||
      lower.includes("telegram_url"))
  ) {
    return "Social links are not set up yet. Run supabase/phase61.sql through supabase/phase63.sql in the Supabase SQL editor, then try again.";
  }
  if (
    lower.includes("pgrst") &&
    (lower.includes("is_pro") || lower.includes("subscription_status"))
  ) {
    return "Enterprise tier is not set up yet. Run supabase/phase64.sql in the Supabase SQL editor, then try again.";
  }
  if (lower.includes("pgrst") && lower.includes("email") && lower.includes("profile")) {
    return "Contact email is not set up yet. Run supabase/phase26.sql in the Supabase SQL editor, then try again.";
  }
  if (
    lower.includes("pgrst") &&
    (lower.includes("country") ||
      lower.includes("region") ||
      lower.includes("city") ||
      lower.includes("website_url"))
  ) {
    return "Profile location is not set up yet. Run supabase/phase19.sql in the Supabase SQL editor, then try again.";
  }
  if (
    lower.includes("pgrst205") ||
    lower.includes("schema cache") ||
    lower.includes("avatar_url") ||
    lower.includes("profile-avatars")
  ) {
    return "Profile photo is not set up yet. Run supabase/phase15.sql in the Supabase SQL editor, then try again.";
  }
  if (lower.includes("duplicate key") || lower.includes("profiles_username")) {
    return "That username is taken.";
  }
  if (lower.includes("payload too large") || lower.includes("maximum allowed size")) {
    return "Photo must be 512KB or smaller after resize.";
  }
  return raw;
}

export function formatJoinedDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatJoinedMonthYear(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function formatPlace(place: {
  country: string | null;
  region: string | null;
  city: string | null;
}): string | null {
  const city = place.city;
  const region = place.region;
  const country = place.country;
  if (isUnitedStates(country)) {
    if (city && region) return `${city}, ${region}`;
    if (city) return city;
    if (region) {
      const st = US_STATES.find((s) => s.code === region);
      return st?.name ?? region;
    }
    return country;
  }
  if (city && country) return `${city}, ${country}`;
  return city || country;
}

export function formatProfileLocation(profile: DarkeProfile): string | null {
  return formatPlace(profile);
}

export function normalizeWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProto);
  } catch {
    throw new Error("Enter a valid website.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Website must start with http or https.");
  }
  if (parsed.href.length > 300) {
    throw new Error("Website is too long.");
  }
  return parsed.href;
}

function hostAllowed(host: string, allowed: string[]): boolean {
  const h = host.replace(/^www\./i, "").toLowerCase();
  return allowed.some((item) => {
    const a = item.replace(/^www\./i, "").toLowerCase();
    return h === a || h.endsWith(`.${a}`);
  });
}

function socialIdForHost(hostname: string): ProfileSocialId | null {
  for (const row of PROFILE_SOCIALS) {
    if (hostAllowed(hostname, row.hosts)) return row.id;
  }
  return null;
}

function looksLikeHostPrefix(raw: string, hosts: string[]): boolean {
  const t = raw.toLowerCase();
  return hosts.some((host) => {
    const h = host.toLowerCase();
    return (
      t === h ||
      t.startsWith(`${h}/`) ||
      t.startsWith(`www.${h}/`) ||
      t.startsWith(`${h}?`) ||
      t.startsWith(`www.${h}?`)
    );
  });
}

function tryParseHttpUrl(raw: string): URL | null {
  const withProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)
    ? raw
    : `https://${raw}`;
  try {
    const parsed = new URL(withProto);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function normalizeSocialUrl(
  raw: string,
  id: ProfileSocialId,
): string | null {
  const spec = PROFILE_SOCIALS.find((row) => row.id === id);
  if (!spec) return null;
  let trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("@")) trimmed = trimmed.slice(1).trim();
  if (!trimmed) return null;
  const hadScheme = /^https?:\/\//i.test(trimmed);
  const parsed =
    hadScheme || looksLikeHostPrefix(trimmed, spec.hosts)
      ? tryParseHttpUrl(trimmed)
      : null;
  if (parsed) {
    const matched = socialIdForHost(parsed.hostname);
    if (matched && matched !== id) {
      const other = PROFILE_SOCIALS.find((row) => row.id === matched);
      throw new Error(
        `That looks like a ${other?.label ?? matched} link. Paste it under ${other?.label ?? matched}.`,
      );
    }
    if (matched === id || hadScheme) {
      if (parsed.href.length > (spec.maxLen ?? 300)) {
        throw new Error(`${spec.label} URL is too long.`);
      }
      return parsed.href;
    }
  }
  if (/\s/.test(trimmed) || trimmed.length > 80) {
    throw new Error(`Enter a valid ${spec.label} URL.`);
  }
  const href = spec.handleUrl(trimmed);
  if (href.length > (spec.maxLen ?? 300)) {
    throw new Error(`${spec.label} URL is too long.`);
  }
  return href;
}

export function socialHrefFor(
  profile: DarkeProfile,
  id: ProfileSocialId,
): string | null {
  if (id === "signal") return profile.signal;
  if (id === "whatsapp") return profile.whatsapp_url;
  if (id === "telegram") return profile.telegram_url;
  if (id === "youtube") return profile.youtube_url;
  if (id === "facebook") return profile.facebook_url;
  if (id === "twitter") return profile.twitter_url;
  if (id === "instagram") return profile.instagram_url;
  if (id === "tiktok") return profile.tiktok_url;
  return profile.linkedin_url;
}

export const PROFILE_HEADLINE_MAX = 40;

export function normalizeHeadline(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > PROFILE_HEADLINE_MAX) {
    throw new Error(`Headline must be ${PROFILE_HEADLINE_MAX} characters or less.`);
  }
  return trimmed;
}

export function normalizeDisplayName(raw: string): string {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    throw new Error("Display name is required.");
  }
  if (trimmed.length > 50) {
    throw new Error("Display name must be 50 characters or less.");
  }
  return trimmed;
}

export function normalizeContactEmail(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 254) {
    throw new Error("Contact email is too long.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error("Enter a valid contact email.");
  }
  return trimmed;
}

export const PROFILE_BIO_MAX = 200;

export function normalizeBio(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > PROFILE_BIO_MAX) {
    throw new Error(`Keep your about under ${PROFILE_BIO_MAX} characters.`);
  }
  return trimmed;
}

export function normalizeSignal(raw: string): string | null {
  let trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("@")) trimmed = trimmed.slice(1).trim();
  if (!trimmed) return null;
  if (trimmed.length > 80) {
    throw new Error("Signal is too long.");
  }
  if (/\s/.test(trimmed)) {
    throw new Error("Signal cannot contain spaces.");
  }
  if (trimmed.includes("@")) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new Error("Enter a valid Signal email or username.");
    }
    return trimmed;
  }
  if (trimmed.length < 2 || !/^[A-Za-z0-9._+-]+$/.test(trimmed)) {
    throw new Error("Enter a valid Signal email or username.");
  }
  return trimmed;
}

async function fetchProfiles(
  query: string,
  cols: string,
): Promise<DarkeProfile | null> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/profiles?select=${cols}&${query}`,
      { method: "GET", headers: authHeaders(token) },
    ),
    15000,
    "load profile",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `load profile HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return parseProfile(rows[0]);
}

async function loadProfileQuery(query: string): Promise<DarkeProfile | null> {
  try {
    return await fetchProfiles(query, SELECT_COLS);
  } catch (err) {
    const raw = String(err).toLowerCase();
    if (
      raw.includes("is_pro") ||
      raw.includes("subscription_status") ||
      raw.includes("pgrst204")
    ) {
      try {
        return await fetchProfiles(query, SELECT_COLS_CORE);
      } catch (inner) {
        return loadProfileWithoutOptionalCols(query, inner);
      }
    }
    return loadProfileWithoutOptionalCols(query, err);
  }
}

async function loadProfileWithoutOptionalCols(
  query: string,
  err: unknown,
): Promise<DarkeProfile | null> {
  const raw = String(err).toLowerCase();
  if (raw.includes("headline")) {
    return fetchProfiles(query, SELECT_COLS_CORE.replace("headline,", ""));
  }
  if (
    raw.includes("age") ||
    raw.includes("show_age") ||
    raw.includes("country") ||
    raw.includes("region") ||
    raw.includes("website_url") ||
    raw.includes("email") ||
    raw.includes("signal") ||
    raw.includes("youtube_url") ||
    raw.includes("facebook_url") ||
    raw.includes("twitter_url") ||
    raw.includes("instagram_url") ||
    raw.includes("tiktok_url") ||
    raw.includes("linkedin_url") ||
    raw.includes("whatsapp_url") ||
    raw.includes("telegram_url") ||
    raw.includes("bio") ||
    raw.includes("top_8") ||
    raw.includes("display_name") ||
    raw.includes("pgrst204")
  ) {
    return fetchProfiles(query, SELECT_COLS_BASIC);
  }
  if (raw.includes("avatar_url") || raw.includes("schema cache")) {
    return fetchProfiles(query, "id,username,created_at");
  }
  if (raw.includes("display_name")) {
    return fetchProfiles(query, SELECT_COLS_CORE.replace("display_name,", ""));
  }
  throw err;
}

export async function loadMyProfile(): Promise<DarkeProfile | null> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Not signed in.");
  return loadProfileQuery(`id=eq.${encodeURIComponent(userId)}`);
}

export async function loadProfileByUsername(
  username: string,
): Promise<DarkeProfile | null> {
  const slug = username.trim().toLowerCase().replace(/^@/, "");
  if (!slug) return null;
  const encoded = encodeURIComponent(slug);
  const byUsername = await loadProfileQuery(`username=eq.${encoded}`);
  if (byUsername) return byUsername;
  return loadProfileQuery(`auth_slug=eq.${encoded}`);
}

export async function loadProfileByEmail(
  email: string,
): Promise<DarkeProfile | null> {
  const mail = email.trim().toLowerCase();
  if (!mail || !mail.includes("@")) return null;
  try {
    return await loadProfileQuery(`email=eq.${encodeURIComponent(mail)}`);
  } catch {
    return null;
  }
}

export async function searchProfilesByHandle(
  raw: string,
): Promise<DarkeProfile[]> {
  const slug = raw.trim().toLowerCase().replace(/^@/, "");
  if (slug.length < 2) return [];
  const pattern = encodeURIComponent(`${slug}*`);
  const prefixQuery = `username=ilike.${pattern}&order=username.asc&limit=8`;
  try {
    const rows = await fetchProfileRows(prefixQuery, SELECT_COLS_BASIC);
    const exact = rows.find((row) => row.username.toLowerCase() === slug);
    if (exact) {
      return [exact, ...rows.filter((row) => row.id !== exact.id)];
    }
    if (rows.length > 0) return rows;
  } catch {
    // Fall through to exact / public list.
  }
  const one = await loadProfileByUsername(slug);
  if (one) return [one];
  try {
    const listed = await loadPublicProfiles();
    return listed
      .filter((row) => {
        const user = row.username.toLowerCase();
        const display = (row.display_name ?? "").toLowerCase();
        return user.startsWith(slug) || display.startsWith(slug);
      })
      .slice(0, 8);
  } catch {
    return [];
  }
}

export async function loadProfilesByIds(ids: string[]): Promise<DarkeProfile[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const query = `id=in.(${unique.join(",")})`;
  try {
    return await fetchProfileRows(query, SELECT_COLS);
  } catch (err) {
    const raw = String(err).toLowerCase();
    if (
      raw.includes("is_pro") ||
      raw.includes("subscription_status") ||
      raw.includes("pgrst204")
    ) {
      return fetchProfileRows(query, SELECT_COLS_CORE);
    }
    throw err;
  }
}

async function fetchProfileRows(
  query: string,
  cols: string,
): Promise<DarkeProfile[]> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/profiles?select=${cols}&${query}`,
      { method: "GET", headers: authHeaders(token) },
    ),
    20000,
    "load profiles",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `load profiles HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => parseProfile(row))
    .filter((row): row is DarkeProfile => row != null);
}

export async function loadPublicProfiles(): Promise<DarkeProfile[]> {
  const query = "order=username.asc&limit=1000";
  try {
    const rows = await fetchProfileRows(query, SELECT_COLS);
    return rows.filter((row) => !row.is_private);
  } catch (err) {
    const raw = String(err).toLowerCase();
    if (
      raw.includes("is_pro") ||
      raw.includes("subscription_status") ||
      raw.includes("is_private") ||
      raw.includes("is_discoverable") ||
      raw.includes("pgrst204")
    ) {
      try {
        const rows = await fetchProfileRows(
          query,
          SELECT_COLS_CORE.replace(",is_private", "").replace(
            ",is_discoverable",
            "",
          ),
        );
        return rows.filter((row) => !row.is_private);
      } catch (inner) {
        return loadPublicWithoutOptionalCols(query, inner);
      }
    }
    return loadPublicWithoutOptionalCols(query, err);
  }
}

export async function loadDiscoverableProfiles(): Promise<DarkeProfile[]> {
  const rows = await loadPublicProfiles();
  return rows.filter((row) => row.is_discoverable === true);
}

async function loadPublicWithoutOptionalCols(
  query: string,
  err: unknown,
): Promise<DarkeProfile[]> {
  const raw = String(err).toLowerCase();
  if (raw.includes("headline")) {
    return fetchProfileRows(query, SELECT_COLS_CORE.replace("headline,", ""));
  }
  if (
    raw.includes("age") ||
    raw.includes("show_age") ||
    raw.includes("country") ||
    raw.includes("region") ||
    raw.includes("website_url") ||
    raw.includes("email") ||
    raw.includes("signal") ||
    raw.includes("youtube_url") ||
    raw.includes("facebook_url") ||
    raw.includes("twitter_url") ||
    raw.includes("instagram_url") ||
    raw.includes("tiktok_url") ||
    raw.includes("linkedin_url") ||
    raw.includes("whatsapp_url") ||
    raw.includes("telegram_url") ||
    raw.includes("bio") ||
    raw.includes("top_8") ||
    raw.includes("display_name") ||
    raw.includes("pgrst204")
  ) {
    return fetchProfileRows(query, SELECT_COLS_BASIC);
  }
  if (raw.includes("avatar_url") || raw.includes("schema cache")) {
    return fetchProfileRows(query, "id,username,created_at");
  }
  throw err;
}

export async function uploadProfileAvatar(
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Not signed in.");
  if (bytes.byteLength > 512 * 1024) {
    throw new Error("Photo must be 512KB or smaller.");
  }
  const token = await accessToken();
  const path = `${uid}/${crypto.randomUUID()}.jpg`;
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/storage/v1/object/profile-avatars/${path}`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": contentType || "image/jpeg",
        "x-upsert": "false",
      },
      body: bytes,
    }),
    60000,
    "upload avatar",
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `upload avatar HTTP ${res.status}`);
  }
  return `${baseUrl()}/storage/v1/object/public/profile-avatars/${path}`;
}

export async function saveMyAvatarUrl(avatarUrl: string | null): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Not signed in.");
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ avatar_url: avatarUrl }),
      },
    ),
    15000,
    "save avatar",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `save avatar HTTP ${res.status}`);
  }
}

function avatarObjectPath(publicUrl: string): string | null {
  const marker = "/storage/v1/object/public/profile-avatars/";
  const i = publicUrl.indexOf(marker);
  if (i < 0) return null;
  const path = publicUrl.slice(i + marker.length).split("?")[0];
  if (!path) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export async function deleteProfileAvatar(publicUrl: string): Promise<void> {
  const path = avatarObjectPath(publicUrl);
  if (!path) return;
  try {
    const token = await accessToken();
    await withTimeout(
      supabaseFetch(
        `${baseUrl()}/storage/v1/object/profile-avatars/${encodeURI(path)}`,
        {
          method: "DELETE",
          headers: authHeaders(token),
        },
      ),
      20000,
      "delete avatar",
    );
  } catch {
    // Replace/remove is more important than cleaning the old object.
  }
}

export async function saveMyProfile(
  details: ProfileDetails,
): Promise<DarkeProfile> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Not signed in.");
  const token = await accessToken();
  const body: Record<string, string | number | boolean | null> = {
    country: details.country,
    region: details.region,
    city: details.city,
    website_url: details.website_url,
    email: details.email,
    signal: details.signal,
    youtube_url: details.youtube_url,
    facebook_url: details.facebook_url,
    twitter_url: details.twitter_url,
    instagram_url: details.instagram_url,
    tiktok_url: details.tiktok_url,
    linkedin_url: details.linkedin_url,
    whatsapp_url: details.whatsapp_url,
    telegram_url: details.telegram_url,
  };
  if (details.bio !== undefined) {
    body.bio = details.bio;
  }
  if ("avatar_url" in details) {
    body.avatar_url = details.avatar_url ?? null;
  }
  if ("display_name" in details) {
    body.display_name = details.display_name ?? null;
  }
  if ("headline" in details) {
    body.headline = details.headline ?? null;
  }
  if (details.is_discoverable != null) {
    body.is_discoverable = details.is_discoverable;
  }
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
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
    "save profile",
  );
  if (!res.ok) {
    const text = await res.text();
    if (
      details.is_discoverable != null &&
      text.toLowerCase().includes("is_discoverable")
    ) {
      const { is_discoverable: _skip, ...rest } = body;
      const retry = await withTimeout(
        supabaseFetch(
          `${baseUrl()}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
          {
            method: "PATCH",
            headers: {
              ...authHeaders(token),
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify(rest),
          },
        ),
        15000,
        "save profile",
      );
      if (!retry.ok) {
        throw new Error(
          (await retry.text()) || `save profile HTTP ${retry.status}`,
        );
      }
      const retryRows: unknown = await retry.json();
      const retryNext = Array.isArray(retryRows)
        ? parseProfile(retryRows[0])
        : null;
      if (!retryNext) throw new Error("Could not save profile.");
      return overlayProfileDetails(retryNext, details);
    }
    throw new Error(text || `save profile HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const next = Array.isArray(rows) ? parseProfile(rows[0]) : null;
  if (!next) throw new Error("Could not save profile.");
  return overlayProfileDetails(next, details);
}

/** Keep the just-saved form values when a later GET is stale or incomplete. */
export function overlaySavedProfile(
  server: DarkeProfile | null,
  saved: DarkeProfile | null,
): DarkeProfile | null {
  if (!saved) return server;
  if (!server) return saved;
  if (saved.id !== server.id) return server;
  return {
    ...server,
    ...saved,
    is_pro: Boolean(saved.is_pro || server.is_pro),
    subscription_status: saved.subscription_status ?? server.subscription_status,
  };
}

function overlayProfileDetails(
  row: DarkeProfile,
  details: ProfileDetails,
): DarkeProfile {
  return {
    ...row,
    country: details.country,
    region: details.region,
    city: details.city,
    website_url: details.website_url,
    email: details.email,
    signal: details.signal,
    youtube_url: details.youtube_url,
    facebook_url: details.facebook_url,
    twitter_url: details.twitter_url,
    instagram_url: details.instagram_url,
    tiktok_url: details.tiktok_url,
    linkedin_url: details.linkedin_url,
    whatsapp_url: details.whatsapp_url,
    telegram_url: details.telegram_url,
    bio: details.bio !== undefined ? details.bio : row.bio,
    avatar_url:
      details.avatar_url !== undefined ? details.avatar_url ?? null : row.avatar_url,
    display_name:
      details.display_name !== undefined
        ? details.display_name ?? null
        : row.display_name,
    headline:
      details.headline !== undefined ? details.headline ?? null : row.headline,
    is_discoverable:
      details.is_discoverable !== undefined
        ? details.is_discoverable
        : row.is_discoverable,
  };
}

export async function saveMyBio(raw: string): Promise<DarkeProfile> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Not signed in.");
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ bio: normalizeBio(raw) }),
      },
    ),
    15000,
    "save bio",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `save bio HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const next = Array.isArray(rows) ? parseProfile(rows[0]) : null;
  if (!next) throw new Error("Could not save bio.");
  return next;
}

export const PROFILE_RECOMMENDED_MAX = 5;

export function normalizeTop8Users(raw: string[], self: string): string[] {
  return parseHandleList(
    raw.filter((name) => toSlug(name) !== toSlug(self)),
    PROFILE_RECOMMENDED_MAX,
  );
}

export async function saveMyTop8(handles: string[]): Promise<DarkeProfile> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  const username = data.session?.user.user_metadata?.username;
  if (!userId) throw new Error("Not signed in.");
  const token = await accessToken();
  const top_8_users = normalizeTop8Users(
    handles,
    typeof username === "string" ? username : "",
  );
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ top_8_users }),
      },
    ),
    15000,
    "save recommended",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `save recommended HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const next = Array.isArray(rows) ? parseProfile(rows[0]) : null;
  if (!next) throw new Error("Could not save recommended builders.");
  return next;
}

async function patchMyUsername(userId: string, token: string, username: string): Promise<void> {
  const res = await withTimeout(
    supabaseFetch(
      `${baseUrl()}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ username }),
      },
    ),
    15000,
    "save username",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `save username HTTP ${res.status}`);
  }
}

/** Change the public handle. Login email stays put. */
export async function changeMyUsername(
  currentSlug: string,
  nextRaw: string,
): Promise<string> {
  const current = toSlug(currentSlug);
  const next = toSlug(nextRaw);
  if (!isValidSlug(next)) {
    throw new Error("Username must include a letter or number.");
  }
  if (next === current) return current;

  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  const token = data.session?.access_token;
  if (!userId || !token) throw new Error("Not signed in.");

  if (!(await usernameAvailable(next, userId))) {
    throw new Error("That username is taken.");
  }

  await patchMyUsername(userId, token, next);
  return next;
}
