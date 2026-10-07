import { publicError, supabase, supabaseFetch, withTimeout } from "./supabase";
import { getInstallId } from "./vault";
import { formatPlace } from "./profile";

export type ListingStatus = "live" | "in_development";

export type ListingFundingStatus =
  | "bootstrapped"
  | "seeking"
  | "funded"
  | "revenue_funded"
  | "open_source";

export const LISTING_FUNDING_STATUSES: {
  id: ListingFundingStatus;
  label: string;
}[] = [
  { id: "bootstrapped", label: "Bootstrapped" },
  { id: "seeking", label: "Seeking funding" },
  { id: "funded", label: "Funded" },
  { id: "revenue_funded", label: "Revenue-funded" },
  { id: "open_source", label: "Open source / nonprofit" },
];

export type ListingPlatform = "web" | "windows" | "mac";

export const LISTING_PLATFORMS: { id: ListingPlatform; label: string }[] = [
  { id: "web", label: "Web" },
  { id: "windows", label: "Windows" },
  { id: "mac", label: "Mac" },
];

export const TAGLINE_MAX = 120;
export const OVERVIEW_MAX = 2000;

export const COMPANY_ORG_SIZES = [
  { id: "1", label: "Myself only" },
  { id: "2-10", label: "2-10 employees" },
  { id: "11-50", label: "11-50 employees" },
  { id: "51-200", label: "51-200 employees" },
  { id: "201-500", label: "201-500 employees" },
  { id: "501-1000", label: "501-1,000 employees" },
  { id: "1001-5000", label: "1,001-5,000 employees" },
  { id: "5001-10000", label: "5,001-10,000 employees" },
  { id: "10001+", label: "10,001+ employees" },
] as const;

export const COMPANY_ORG_TYPES = [
  { id: "public_company", label: "Public company" },
  { id: "privately_held", label: "Privately held" },
  { id: "self_employed", label: "Self-employed" },
  { id: "self_owned", label: "Self-owned" },
  { id: "partnership", label: "Partnership" },
  { id: "llc", label: "Limited liability company (LLC)" },
  { id: "nonprofit", label: "Nonprofit" },
  { id: "government_agency", label: "Government agency" },
  { id: "educational", label: "Educational" },
  { id: "sole_proprietorship", label: "Sole proprietorship" },
] as const;

export const COMPANY_INDUSTRIES = [
  "Technology",
  "Computer Software",
  "Information Technology and Services",
  "Internet",
  "Computer Hardware",
  "Telecommunications",
  "Financial Services",
  "Banking",
  "Insurance",
  "Investment Management",
  "Venture Capital and Private Equity",
  "Accounting",
  "Management Consulting",
  "Marketing and Advertising",
  "Public Relations",
  "Media Production",
  "Online Media",
  "Entertainment",
  "Music",
  "Broadcast Media",
  "Publishing",
  "Graphic Design",
  "Design",
  "Architecture and Planning",
  "Construction",
  "Real Estate",
  "Retail",
  "Consumer Goods",
  "Apparel and Fashion",
  "Luxury Goods and Jewelry",
  "Food and Beverages",
  "Restaurants",
  "Hospitality",
  "Travel and Tourism",
  "Airlines/Aviation",
  "Automotive",
  "Transportation/Trucking/Railroad",
  "Logistics and Supply Chain",
  "Oil and Energy",
  "Utilities",
  "Renewables and Environment",
  "Mining and Metals",
  "Chemicals",
  "Pharmaceuticals",
  "Biotechnology",
  "Medical Devices",
  "Hospital and Health Care",
  "Mental Health Care",
  "Higher Education",
  "Primary/Secondary Education",
  "E-Learning",
  "Research",
  "Legal Services",
  "Law Practice",
  "Government Administration",
  "Military",
  "Civic and Social Organization",
  "Non-Profit Organization Management",
  "Religious Institutions",
  "Sports",
  "Health, Wellness and Fitness",
  "Consumer Services",
  "Human Resources",
  "Staffing and Recruiting",
  "Security and Investigations",
  "Law Enforcement",
  "Farming",
  "Agriculture",
  "Machinery",
  "Industrial Automation",
  "Electrical/Electronic Manufacturing",
  "Semiconductors",
  "Nanotechnology",
  "Defense and Space",
  "Maritime",
] as const;

export type CompanyOrgSize = (typeof COMPANY_ORG_SIZES)[number]["id"];
export type CompanyOrgType = (typeof COMPANY_ORG_TYPES)[number]["id"];

export function orgSizeLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return COMPANY_ORG_SIZES.find((row) => row.id === id)?.label ?? null;
}

export function orgTypeLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return COMPANY_ORG_TYPES.find((row) => row.id === id)?.label ?? null;
}

export type AppListing = {
  id: string;
  owner_id: string;
  username: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  status: ListingStatus;
  funding_status: ListingFundingStatus | null;
  platforms: ListingPlatform[];
  icon_data_url: string;
  hero_image_url: string | null;
  hero_image_urls: string[];
  hero_youtube_url: string | null;
  install_id: string;
  thumbs_up: number;
  thumbs_down: number;
  archived: boolean;
  created_at: string;
  staff_curated: boolean;
  raised_total: number;
  backer_count: number;
  show_on_profile: boolean;
  is_paid_listing: boolean;
  paid_until: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  industry: string | null;
  organization_size: string | null;
  organization_type: string | null;
  company_rep_attested: boolean;
  /** True when phase44.sql columns are not in the API response yet. */
  placementUnknown: boolean;
};

export type CreateListingInput = {
  name: string;
  tagline: string;
  description: string;
  url: string;
  status: ListingStatus;
  funding_status: ListingFundingStatus | null;
  platforms: ListingPlatform[];
  icon_data_url: string;
  hero_image_url: string | null;
  hero_image_urls: string[];
  hero_youtube_url: string | null;
  show_on_profile: boolean;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  industry?: string | null;
  organization_size?: string | null;
  organization_type?: string | null;
  company_rep_attested?: boolean;
};

export type UpdateListingInput = {
  tagline: string;
  description: string;
  url: string;
  status: ListingStatus;
  funding_status: ListingFundingStatus | null;
  platforms: ListingPlatform[];
  icon_data_url: string;
  hero_image_url: string | null;
  hero_image_urls: string[];
  hero_youtube_url: string | null;
  show_on_profile: boolean;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  industry?: string | null;
  organization_size?: string | null;
  organization_type?: string | null;
  company_rep_attested?: boolean;
};

const SELECT_COLS_BASE =
  "id,owner_id,username,name,tagline,description,url,status,platforms,icon_data_url,hero_image_url,hero_image_urls,hero_youtube_url,install_id,thumbs_up,thumbs_down,archived,created_at";

export const SELECT_COLS = `${SELECT_COLS_BASE},funding_status,show_on_profile,is_paid_listing,paid_until,country,region,city,industry,organization_size,organization_type,company_rep_attested`;

export const MAX_HERO_PHOTOS = 5;

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

function looksLikeMissingStaffColumn(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("staff_curated") ||
    (lower.includes("schema cache") && lower.includes("staff"))
  );
}

function looksLikeMissingFundingColumn(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("funding_status") ||
    (lower.includes("schema cache") && lower.includes("funding"))
  );
}

function looksLikeMissingPlacementColumn(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("show_on_profile") ||
    lower.includes("is_paid_listing") ||
    lower.includes("paid_until")
  );
}

function qsWithoutFundingSelect(qs: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(qs);
  const select = next.get("select");
  if (select) next.set("select", select.replace(/,funding_status/g, ""));
  return next;
}

function looksLikeMissingCompanyColumn(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("organization_size") ||
    lower.includes("organization_type") ||
    lower.includes("company_rep_attested") ||
    (lower.includes("column") && lower.includes("industry"))
  );
}

function qsWithoutCompanySelect(qs: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(qs);
  const select = next.get("select");
  if (select) {
    next.set(
      "select",
      select
        .replace(/,industry/g, "")
        .replace(/,organization_size/g, "")
        .replace(/,organization_type/g, "")
        .replace(/,company_rep_attested/g, ""),
    );
  }
  return next;
}

function looksLikeMissingContactPlaceColumn(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("contact_email") ||
    (lower.includes("app_listings") &&
      (lower.includes("country") ||
        lower.includes("region") ||
        lower.includes("city")))
  );
}

function qsWithoutContactPlaceSelect(qs: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(qs);
  const select = next.get("select");
  if (select) {
    next.set(
      "select",
      select
        .replace(/,contact_email/g, "")
        .replace(/,country/g, "")
        .replace(/,region/g, "")
        .replace(/,city/g, ""),
    );
  }
  return next;
}

function qsWithoutPlacementSelect(qs: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(qs);
  const select = next.get("select");
  if (select) {
    next.set(
      "select",
      select
        .replace(/,show_on_profile/g, "")
        .replace(/,is_paid_listing/g, "")
        .replace(/,paid_until/g, ""),
    );
  }
  next.delete("show_on_profile");
  next.delete("is_paid_listing");
  next.delete("paid_until");
  return next;
}

async function fetchAppListingsJson(
  qs: URLSearchParams,
  label: string,
): Promise<unknown> {
  const token = await accessToken();
  const headers = authHeaders(token);
  async function get(params: URLSearchParams): Promise<Response> {
    return withTimeout(
      supabaseFetch(`${baseUrl()}/rest/v1/app_listings?${params}`, {
        method: "GET",
        headers,
      }),
      25000,
      label,
    );
  }

  const withStaff = new URLSearchParams(qs);
  withStaff.set("staff_curated", "eq.false");
  let res = await get(withStaff);
  if (res.ok) return res.json();
  let text = await res.text();
  if (looksLikeMissingFundingColumn(text)) {
    res = await get(qsWithoutFundingSelect(withStaff));
    if (res.ok) return res.json();
    text = await res.text();
  }
  if (looksLikeMissingPlacementColumn(text)) {
    res = await get(qsWithoutPlacementSelect(withStaff));
    if (res.ok) return res.json();
    text = await res.text();
  }
  if (looksLikeMissingContactPlaceColumn(text)) {
    res = await get(qsWithoutContactPlaceSelect(withStaff));
    if (res.ok) return res.json();
    text = await res.text();
  }
  if (looksLikeMissingCompanyColumn(text)) {
    res = await get(qsWithoutCompanySelect(withStaff));
    if (res.ok) return res.json();
    text = await res.text();
  }
  if (!looksLikeMissingStaffColumn(text)) {
    throw new Error(text || `${label} HTTP ${res.status}`);
  }
  let fallback = await get(qs);
  if (fallback.ok) return fallback.json();
  const fallbackText = await fallback.text();
  if (looksLikeMissingFundingColumn(fallbackText)) {
    fallback = await get(qsWithoutFundingSelect(qs));
    if (fallback.ok) return fallback.json();
    throw new Error((await fallback.text()) || `${label} HTTP ${fallback.status}`);
  }
  if (looksLikeMissingPlacementColumn(fallbackText)) {
    fallback = await get(qsWithoutPlacementSelect(qs));
    if (fallback.ok) return fallback.json();
    throw new Error((await fallback.text()) || `${label} HTTP ${fallback.status}`);
  }
  if (looksLikeMissingContactPlaceColumn(fallbackText)) {
    fallback = await get(qsWithoutContactPlaceSelect(qs));
    if (fallback.ok) return fallback.json();
    throw new Error((await fallback.text()) || `${label} HTTP ${fallback.status}`);
  }
  if (looksLikeMissingCompanyColumn(fallbackText)) {
    fallback = await get(qsWithoutCompanySelect(qs));
    if (fallback.ok) return fallback.json();
    throw new Error((await fallback.text()) || `${label} HTTP ${fallback.status}`);
  }
  throw new Error(fallbackText || `${label} HTTP ${fallback.status}`);
}

function parseHeroUrls(value: unknown, fallback: string | null): string[] {
  const out: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim() && !out.includes(item.trim())) {
        out.push(item.trim());
      }
    }
  }
  if (out.length === 0 && fallback) out.push(fallback);
  return out.slice(0, MAX_HERO_PHOTOS);
}

export function listingPhotos(listing: AppListing): string[] {
  if (listing.hero_image_urls.length > 0) return listing.hero_image_urls;
  return listing.hero_image_url ? [listing.hero_image_url] : [];
}

function parsePlatforms(value: unknown): ListingPlatform[] {
  if (!Array.isArray(value)) return [];
  const out: ListingPlatform[] = [];
  for (const p of value) {
    if (p === "web" || p === "windows" || p === "mac") {
      if (!out.includes(p)) out.push(p);
    }
  }
  return out;
}

function parseFundingStatus(value: unknown): ListingFundingStatus | null {
  if (
    value === "bootstrapped" ||
    value === "seeking" ||
    value === "funded" ||
    value === "revenue_funded" ||
    value === "open_source"
  ) {
    return value;
  }
  return null;
}

export function asListing(row: unknown): AppListing | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    typeof r.owner_id !== "string" ||
    typeof r.username !== "string" ||
    typeof r.name !== "string" ||
    typeof r.description !== "string" ||
    typeof r.url !== "string" ||
    typeof r.status !== "string" ||
    typeof r.created_at !== "string"
  ) {
    return null;
  }
  const icon = typeof r.icon_data_url === "string" ? r.icon_data_url : "";
  if (r.status !== "live" && r.status !== "in_development") return null;
  const hero =
    typeof r.hero_image_url === "string" && r.hero_image_url.trim()
      ? r.hero_image_url.trim()
      : null;
  const youtube =
    typeof r.hero_youtube_url === "string" && r.hero_youtube_url.trim()
      ? r.hero_youtube_url.trim()
      : null;
  const hasPlacement = "show_on_profile" in r || "is_paid_listing" in r;
  const textOrNull = (key: string) => {
    const v = r[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  return {
    id: r.id,
    owner_id: r.owner_id,
    username: r.username.trim(),
    name: r.name.trim(),
    tagline: typeof r.tagline === "string" ? r.tagline.trim() : "",
    description: r.description.trim(),
    url: r.url.trim(),
    status: r.status,
    funding_status: parseFundingStatus(r.funding_status),
    platforms: parsePlatforms(r.platforms),
    icon_data_url: icon,
    hero_image_url: hero,
    hero_image_urls: parseHeroUrls(r.hero_image_urls, hero),
    hero_youtube_url: youtube,
    install_id: typeof r.install_id === "string" ? r.install_id : "",
    thumbs_up: typeof r.thumbs_up === "number" ? Math.max(0, r.thumbs_up) : 0,
    thumbs_down: typeof r.thumbs_down === "number" ? Math.max(0, r.thumbs_down) : 0,
    archived: r.archived === true,
    created_at: r.created_at,
    staff_curated: r.staff_curated === true,
    raised_total:
      typeof r.raised_total === "number" ? Math.max(0, r.raised_total) : 0,
    backer_count:
      typeof r.backer_count === "number" ? Math.max(0, r.backer_count) : 0,
    show_on_profile: hasPlacement ? r.show_on_profile === true : true,
    is_paid_listing: hasPlacement ? r.is_paid_listing === true : true,
    paid_until:
      typeof r.paid_until === "string" && r.paid_until.trim()
        ? r.paid_until.trim()
        : null,
    country: textOrNull("country"),
    region: textOrNull("region"),
    city: textOrNull("city"),
    industry: textOrNull("industry"),
    organization_size: textOrNull("organization_size"),
    organization_type: textOrNull("organization_type"),
    company_rep_attested: r.company_rep_attested === true,
    placementUnknown: !hasPlacement,
  };
}

export function listingsError(err: unknown): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes("pgrst205") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the table") ||
    lower.includes("app_listings") ||
    lower.includes("app_listing_favorites") ||
    lower.includes("listing-heroes") ||
    lower.includes("hero_image_urls") ||
    lower.includes("hero_youtube_url") ||
    lower.includes("show_on_profile") ||
    lower.includes("is_paid_listing") ||
    lower.includes("paid_until") ||
    lower.includes("app_listing_team") ||
    lower.includes("contact_email")
  ) {
    return "Apps tables missing. Run supabase/phase5.sql through phase27.sql, phase44.sql through phase47.sql, phase51.sql, phase54.sql, phase56.sql, and phase57.sql in the Supabase SQL editor, then try again.";
  }
  if (lower.includes("is_admin") || lower.includes("app_listings_desc_len")) {
    return "Company admins and Overview need supabase/phase56.sql in the Supabase SQL editor.";
  }
  if (lower.includes("start year required") || lower.includes("started_year") || lower.includes("ended_year")) {
    return "Experience years need supabase/phase57.sql in the Supabase SQL editor.";
  }
  if (
    lower.includes("organization_size") ||
    lower.includes("organization_type") ||
    lower.includes("company_rep_attested")
  ) {
    return "Company page fields need supabase/phase54.sql in the Supabase SQL editor.";
  }
  if (
    lower.includes("app_listings_one_per_owner") ||
    lower.includes("app_listings_one_per_install")
  ) {
    return "Multiple companies are blocked until supabase/phase48.sql is run in the Supabase SQL editor.";
  }
  if (lower.includes("install_id required")) {
    return "Install id missing. Restart DARKE, then try again.";
  }
  if (lower.includes("no profile") || lower.includes("p0001")) {
    return "Profile missing. Unlock again, then retry.";
  }
  if (lower.includes("payload too large") || lower.includes("maximum allowed size")) {
    return "Hero image must be 2MB or smaller.";
  }
  return raw;
}

export function listingLocationLabel(listing: AppListing): string | null {
  return formatPlace({
    country: listing.country,
    region: listing.region,
    city: listing.city,
  });
}

function listingPlacePayload(input: {
  country?: string | null;
  region?: string | null;
  city?: string | null;
}) {
  return {
    country: input.country?.trim() || null,
    region: input.region?.trim() || null,
    city: input.city?.trim() || null,
  };
}

function listingCompanyPayload(input: {
  industry?: string | null;
  organization_size?: string | null;
  organization_type?: string | null;
  company_rep_attested?: boolean;
}) {
  return {
    industry: input.industry?.trim() || null,
    organization_size: input.organization_size?.trim() || null,
    organization_type: input.organization_type?.trim() || null,
    company_rep_attested: input.company_rep_attested === true,
  };
}

export function platformLabel(p: ListingPlatform): string {
  if (p === "web") return "Web";
  if (p === "windows") return "Windows";
  return "Mac";
}

export function statusLabel(status: ListingStatus): string {
  return status === "live" ? "Live" : "In development";
}

export function fundingStatusLabel(
  status: ListingFundingStatus | null | undefined,
): string | null {
  if (!status) return null;
  return LISTING_FUNDING_STATUSES.find((item) => item.id === status)?.label ?? null;
}

export function listingPaidUntilMs(paidUntil: string | null | undefined): number | null {
  if (!paidUntil) return null;
  const n = Date.parse(paidUntil);
  return Number.isFinite(n) ? n : null;
}

/** Published company in the public directory (not archived / TANK staff seeds). */
export function listingInDirectory(listing: AppListing): boolean {
  return !listing.archived && !listing.staff_curated;
}

/** Paid public STARTUPS directory listing (not expired). */
export function listingIsPaidActive(listing: AppListing): boolean {
  return listingInDirectory(listing);
}

export function listingPaidUntilLabel(listing: AppListing): string | null {
  if (!listingIsPaidActive(listing) || !listing.paid_until) return null;
  const d = new Date(listing.paid_until);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Active founder listing for a profile STARTUPS canvas (not archived / TANK). */
export function listingOnProfile(listing: AppListing): boolean {
  if (listing.archived || listing.staff_curated) return false;
  if (listing.placementUnknown) return true;
  return listing.show_on_profile;
}

async function loadProfileIdByUsername(username: string): Promise<string | null> {
  const name = username.trim().toLowerCase();
  if (!name) return null;
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "id",
    username: `eq.${name}`,
    limit: "1",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/profiles?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "profile id for listings",
  );
  if (!res.ok) return null;
  const rows: unknown = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const id = (rows[0] as { id?: unknown }).id;
  return typeof id === "string" && id ? id : null;
}

/** Founder listings: app_listings.owner_id === profiles.id. */
export async function loadAppListingsByOwnerId(
  ownerId: string,
): Promise<AppListing[]> {
  const id = ownerId.trim();
  if (!id) return [];
  const qs = new URLSearchParams({
    select: SELECT_COLS,
    owner_id: `eq.${id}`,
    archived: "eq.false",
    order: "created_at.desc",
  });
  const data = await fetchAppListingsJson(qs, "load founder listings");
  if (!Array.isArray(data)) return [];
  return data
    .map(asListing)
    .filter((m): m is AppListing => m != null && listingOnProfile(m));
}

/** Public company listings (not archived or TANK staff seeds). */
export async function loadAppListings(): Promise<AppListing[]> {
  const qs = new URLSearchParams({
    select: SELECT_COLS,
    archived: "eq.false",
    order: "created_at.desc",
  });
  const data = await fetchAppListingsJson(qs, "load apps");
  if (!Array.isArray(data)) return [];
  return data
    .map(asListing)
    .filter((m): m is AppListing => m != null && listingInDirectory(m));
}

export async function findAppListingByName(name: string): Promise<AppListing | null> {
  const needle = name.trim().replace(/\s+/g, " ");
  if (!needle) return null;
  const escaped = needle.replace(/,/g, " ");
  const qs = new URLSearchParams({
    select: SELECT_COLS,
    name: `ilike.${escaped}`,
    archived: "eq.false",
    order: "created_at.asc",
    limit: "8",
  });
  const data = await fetchAppListingsJson(qs, "find company by name");
  if (!Array.isArray(data)) return null;
  const rows = data
    .map(asListing)
    .filter((m): m is AppListing => m != null && listingInDirectory(m));
  const lower = needle.toLowerCase();
  return rows.find((row) => row.name.trim().toLowerCase() === lower) ?? null;
}

export async function searchAppListingsByName(query: string): Promise<AppListing[]> {
  const needle = query.trim().replace(/\s+/g, " ");
  if (!needle) return [];
  const escaped = needle.replace(/[,()]/g, " ");
  const qs = new URLSearchParams({
    select: SELECT_COLS,
    name: `ilike.*${escaped}*`,
    archived: "eq.false",
    order: "name.asc",
    limit: "8",
  });
  const data = await fetchAppListingsJson(qs, "search companies");
  if (!Array.isArray(data)) return [];
  return data
    .map(asListing)
    .filter((m): m is AppListing => m != null && listingInDirectory(m));
}

/** Owner’s published companies (not limited to show-on-profile). */
export async function loadCompaniesOwnedByUsername(
  username: string,
): Promise<AppListing[]> {
  const ownerId = await loadProfileIdByUsername(username);
  if (!ownerId) return [];
  const qs = new URLSearchParams({
    select: SELECT_COLS,
    owner_id: `eq.${ownerId}`,
    archived: "eq.false",
    order: "created_at.desc",
  });
  const data = await fetchAppListingsJson(qs, "load owned companies");
  if (!Array.isArray(data)) return [];
  return data
    .map(asListing)
    .filter((m): m is AppListing => m != null && !m.staff_curated);
}

/** Public listing for a builder username, if they have a live (non-archived) app. */
export async function loadAppListingByUsername(
  username: string,
): Promise<AppListing | null> {
  const rows = await loadAppListingsByUsername(username);
  return rows[0] ?? null;
}

/** Live profile STARTUPS: founder rows where owner_id matches this username’s profile. */
export async function loadAppListingsByUsername(
  username: string,
): Promise<AppListing[]> {
  const ownerId = await loadProfileIdByUsername(username);
  if (!ownerId) return [];
  return loadAppListingsByOwnerId(ownerId);
}

export async function loadAppListingsByIds(
  ids: string[],
  opts?: { includeStaff?: boolean },
): Promise<AppListing[]> {
  const listingIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (listingIds.length === 0) return [];
  const qs = new URLSearchParams({
    select: SELECT_COLS,
    id: `in.(${listingIds.join(",")})`,
    archived: "eq.false",
    order: "created_at.desc",
  });
  const data = await fetchAppListingsJson(qs, "load team profile listings");
  if (!Array.isArray(data)) return [];
  return data
    .map(asListing)
    .filter((m): m is AppListing => {
      if (!m) return false;
      if (m.staff_curated && !opts?.includeStaff) return false;
      return true;
    });
}

/** Public Apps directory listing by id (not TANK staff seeds). */
export async function loadAppListingById(
  id: string,
): Promise<AppListing | null> {
  const listingId = id.trim();
  if (!listingId) return null;
  const qs = new URLSearchParams({
    select: SELECT_COLS,
    id: `eq.${listingId}`,
    archived: "eq.false",
    limit: "1",
  });
  const rows = await fetchAppListingsJson(qs, "load app listing");
  if (!Array.isArray(rows) || !rows[0]) return null;
  const found = asListing(rows[0]);
  if (!found || found.staff_curated) return null;
  return found;
}

/** Owner’s listings, including archived (not TANK staff seeds). */
export async function loadMyAppListings(): Promise<AppListing[]> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return [];
  const qs = new URLSearchParams({
    select: SELECT_COLS,
    owner_id: `eq.${uid}`,
    order: "created_at.desc",
  });
  const rows = await fetchAppListingsJson(qs, "load my listings");
  if (!Array.isArray(rows)) return [];
  return rows
    .map(asListing)
    .filter((row): row is AppListing => row != null && !row.staff_curated);
}

/** Owner’s newest listing including archived. */
export async function loadMyAppListing(): Promise<AppListing | null> {
  const rows = await loadMyAppListings();
  return rows[0] ?? null;
}

/** True if this DARKE install already published a listing (any account). */
export async function installHasAppListing(): Promise<boolean> {
  const installId = await getInstallId();
  const qs = new URLSearchParams({
    select: "id",
    install_id: `eq.${installId}`,
    limit: "1",
  });
  const data = await fetchAppListingsJson(qs, "check install listing");
  return Array.isArray(data) && data.length > 0;
}

/** Upload hero JPEG/PNG bytes to listing-heroes/{uid}/{uuid}.jpg; returns public URL. */
export async function uploadListingHero(
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Not signed in.");
  if (bytes.byteLength > 2 * 1024 * 1024) {
    throw new Error("Hero image must be 2MB or smaller.");
  }
  const token = await accessToken();
  const path = `${uid}/${crypto.randomUUID()}.jpg`;
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/storage/v1/object/listing-heroes/${path}`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": contentType || "image/jpeg",
        "x-upsert": "false",
      },
      body: bytes,
    }),
    60000,
    "upload hero",
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `upload hero HTTP ${res.status}`);
  }
  return `${baseUrl()}/storage/v1/object/public/listing-heroes/${path}`;
}

/** Path inside listing-heroes bucket, or null if URL is not ours. */
export function listingHeroObjectPath(publicUrl: string): string | null {
  const marker = "/storage/v1/object/public/listing-heroes/";
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

/** Best-effort delete of a previous hero object (ignore failures). */
export async function deleteListingHero(publicUrl: string): Promise<void> {
  const path = listingHeroObjectPath(publicUrl);
  if (!path) return;
  try {
    const token = await accessToken();
    await withTimeout(
      supabaseFetch(
        `${baseUrl()}/storage/v1/object/listing-heroes/${encodeURI(path)}`,
        {
          method: "DELETE",
          headers: authHeaders(token),
        },
      ),
      20000,
      "delete hero",
    );
  } catch {
    // Ignore — listing update already succeeded or replace is more important.
  }
}

export async function createAppListing(input: CreateListingInput): Promise<AppListing> {
  const name = input.name.trim();
  const tagline = input.tagline.trim();
  const description = input.description.trim() || tagline;
  const url = input.url.trim();
  const platforms = parsePlatforms(input.platforms);
  if (!name) throw new Error("Enter a company name.");
  if (!tagline) throw new Error("Enter a tagline.");
  if (tagline.length > TAGLINE_MAX) {
    throw new Error(`Keep the tagline under ${TAGLINE_MAX} characters.`);
  }
  if (description.length > OVERVIEW_MAX) {
    throw new Error(`Keep the overview under ${OVERVIEW_MAX} characters.`);
  }
  if (!url) throw new Error("Enter a website URL.");
  const company = listingCompanyPayload(input);
  if (!company.industry) throw new Error("Please select an industry.");
  if (!company.organization_size) throw new Error("Please select an organization size.");
  if (!company.organization_type) throw new Error("Please select an organization type.");
  if (platforms.length === 0) throw new Error("Pick at least one platform.");
  if (!input.icon_data_url.startsWith("data:image/")) {
    throw new Error("Choose an icon image.");
  }
  const photos = parseHeroUrls(input.hero_image_urls, input.hero_image_url);
  const youtube = input.hero_youtube_url?.trim() || null;
  if (photos.length === 0 && !youtube) {
    throw new Error("Add photos or a YouTube video.");
  }

  const installId = await getInstallId();

  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/app_listings`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        name,
        tagline,
        description,
        url,
        status: input.status,
        funding_status: parseFundingStatus(input.funding_status),
        platforms,
        icon_data_url: input.icon_data_url,
        hero_image_url: photos[0] ?? null,
        hero_image_urls: youtube ? [] : photos,
        hero_youtube_url: youtube,
        install_id: installId,
        show_on_profile: input.show_on_profile === true,
        ...listingPlacePayload(input),
        ...company,
      }),
    }),
    30000,
    "publish app",
  );
  const text = await res.text();
  if (!res.ok) throw new Error(text || `publish HTTP ${res.status}`);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Publish failed.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  const listing = asListing(row);
  if (!listing) throw new Error("Publish failed.");
  return listing;
}

export async function createMinimalAppListing(input: {
  name: string;
  url?: string | null;
  icon_data_url?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
}): Promise<AppListing> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Enter a company name.");
  if (name.length > 80) throw new Error("Keep the company name under 80 characters.");
  const site = (input.url ?? "").trim();
  const rawIcon = input.icon_data_url?.trim() ?? "";
  const icon =
    rawIcon.startsWith("data:image/") || /^https?:\/\//i.test(rawIcon)
      ? rawIcon
      : "";
  const installId = await getInstallId();
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/app_listings`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        name,
        tagline: "",
        description: name,
        url: site,
        status: "live",
        funding_status: null,
        platforms: ["web"],
        icon_data_url: icon,
        hero_image_url: null,
        hero_image_urls: [],
        hero_youtube_url: null,
        install_id: installId,
        show_on_profile: false,
        ...listingPlacePayload({
          country: input.country,
          region: input.region,
          city: input.city,
        }),
        industry: null,
        organization_size: null,
        organization_type: null,
        company_rep_attested: false,
      }),
    }),
    30000,
    "create company",
  );
  const text = await res.text();
  if (!res.ok) throw new Error(text || `publish HTTP ${res.status}`);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Could not create the company.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  const listing = asListing(row);
  if (!listing) throw new Error("Could not create the company.");
  return listing;
}

export async function updateAppListing(
  listingId: string,
  input: UpdateListingInput,
): Promise<AppListing> {
  const tagline = input.tagline.trim();
  const description = input.description.trim() || tagline || input.tagline || " ";
  const url = input.url.trim();
  const platforms = parsePlatforms(input.platforms);
  if (tagline.length > TAGLINE_MAX) {
    throw new Error(`Keep the tagline under ${TAGLINE_MAX} characters.`);
  }
  if (description.length > OVERVIEW_MAX) {
    throw new Error(`Keep the overview under ${OVERVIEW_MAX} characters.`);
  }
  const company = listingCompanyPayload(input);
  if (platforms.length === 0) throw new Error("Pick at least one platform.");
  const icon = input.icon_data_url.trim();
  if (
    icon &&
    !icon.startsWith("data:image/") &&
    !/^https?:\/\//i.test(icon)
  ) {
    throw new Error("Choose an icon image.");
  }
  const photos = parseHeroUrls(input.hero_image_urls, input.hero_image_url);
  const youtube = input.hero_youtube_url?.trim() || null;

  const token = await accessToken();
  const qs = new URLSearchParams({ id: `eq.${listingId}` });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/app_listings?${qs}`, {
      method: "PATCH",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        tagline,
        description,
        url,
        status: input.status,
        funding_status: parseFundingStatus(input.funding_status),
        platforms,
        icon_data_url: icon,
        hero_image_url: photos[0] ?? null,
        hero_image_urls: youtube ? [] : photos,
        hero_youtube_url: youtube,
        show_on_profile: input.show_on_profile === true,
        ...listingPlacePayload(input),
        ...company,
      }),
    }),
    30000,
    "update app",
  );
  const text = await res.text();
  if (!res.ok) throw new Error(text || `update HTTP ${res.status}`);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Save failed.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  const listing = asListing(row);
  if (!listing) throw new Error("Save failed.");
  return listing;
}

export async function setListingArchived(
  listingId: string,
  archived: boolean,
): Promise<AppListing> {
  const token = await accessToken();
  const qs = new URLSearchParams({ id: `eq.${listingId}` });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/app_listings?${qs}`, {
      method: "PATCH",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ archived }),
    }),
    20000,
    archived ? "archive app" : "unarchive app",
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `${archived ? "archive" : "unarchive"} HTTP ${res.status}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(archived ? "Archive failed." : "Unarchive failed.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  const listing = asListing(row);
  if (!listing) throw new Error(archived ? "Archive failed." : "Unarchive failed.");
  return listing;
}

export async function voteAppListing(
  listingId: string,
  vote: 1 | -1,
): Promise<AppListing> {
  const token = await accessToken();
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/rpc/vote_app_listing`, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_listing_id: listingId, p_vote: vote }),
    }),
    20000,
    "vote",
  );
  const text = await res.text();
  if (!res.ok) throw new Error(text || `vote HTTP ${res.status}`);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Vote failed.");
  }
  const listing = asListing(data);
  if (!listing) throw new Error("Vote failed.");
  return listing;
}

export async function loadMyVote(listingId: string): Promise<1 | -1 | null> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return null;
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "vote",
    listing_id: `eq.${listingId}`,
    user_id: `eq.${uid}`,
    limit: "1",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/app_listing_votes?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load vote",
  );
  if (!res.ok) return null;
  const rows: unknown = await res.json();
  if (!Array.isArray(rows) || !rows[0] || typeof rows[0] !== "object") return null;
  const vote = (rows[0] as { vote?: unknown }).vote;
  if (vote === 1 || vote === -1) return vote;
  return null;
}

export async function loadMyFavoriteIds(): Promise<Set<string>> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return new Set();
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "listing_id",
    user_id: `eq.${uid}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/app_listing_favorites?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load favorites",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `load favorites HTTP ${res.status}`);
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

export async function setListingFavorite(
  listingId: string,
  favorite: boolean,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Not signed in.");
  const token = await accessToken();
  if (favorite) {
    const res = await withTimeout(
      supabaseFetch(`${baseUrl()}/rest/v1/app_listing_favorites`, {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
          Prefer: "resolution=ignore-duplicates",
        },
        body: JSON.stringify({ listing_id: listingId, user_id: uid }),
      }),
      15000,
      "favorite",
    );
    if (!res.ok) {
      throw new Error((await res.text()) || `favorite HTTP ${res.status}`);
    }
    return;
  }
  const qs = new URLSearchParams({
    listing_id: `eq.${listingId}`,
    user_id: `eq.${uid}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/app_listing_favorites?${qs}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
    15000,
    "unfavorite",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `unfavorite HTTP ${res.status}`);
  }
}
