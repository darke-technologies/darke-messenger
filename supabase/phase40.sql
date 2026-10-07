-- DARKE v1 Phase 40 — Unlimited movies, books, and games on a public profile
-- Run in the Supabase SQL editor after phase39.sql (and phase35.sql for TMDB).

drop trigger if exists tmdb_profile_features_cap on public.tmdb_profile_features;
drop function if exists public.tmdb_profile_features_cap();

drop trigger if exists profile_books_cap on public.profile_books;
drop function if exists public.profile_books_cap();

drop trigger if exists profile_games_cap on public.profile_games;
drop function if exists public.profile_games_cap();

notify pgrst, 'reload schema';
