-- DARKE v1 Phase 54 — Company page fields
-- Run in the Supabase SQL editor after phase53.sql.

alter table public.app_listings
  add column if not exists industry text,
  add column if not exists organization_size text,
  add column if not exists organization_type text,
  add column if not exists company_rep_attested boolean not null default false;

alter table public.app_listings
  drop constraint if exists app_listings_industry_len;
alter table public.app_listings
  add constraint app_listings_industry_len check (
    industry is null or char_length(btrim(industry)) between 1 and 80
  );

alter table public.app_listings
  drop constraint if exists app_listings_organization_size_len;
alter table public.app_listings
  add constraint app_listings_organization_size_len check (
    organization_size is null
    or char_length(btrim(organization_size)) between 1 and 40
  );

alter table public.app_listings
  drop constraint if exists app_listings_organization_type_len;
alter table public.app_listings
  add constraint app_listings_organization_type_len check (
    organization_type is null
    or char_length(btrim(organization_type)) between 1 and 40
  );

alter table public.app_listings
  drop constraint if exists app_listings_tagline_len;
alter table public.app_listings
  add constraint app_listings_tagline_len
  check (char_length(tagline) <= 120);

alter table public.app_listings
  drop constraint if exists app_listings_desc_len;
alter table public.app_listings
  add constraint app_listings_desc_len
  check (char_length(description) <= 500);

notify pgrst, 'reload schema';
