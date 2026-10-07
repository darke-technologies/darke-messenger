-- DARKE v1 Phase 63 — Signal profile URL + WhatsApp and Telegram
-- Run in the Supabase SQL editor after phase62.sql.

alter table public.profiles
  drop constraint if exists profiles_signal_len;
alter table public.profiles
  add constraint profiles_signal_len
  check (signal is null or char_length(signal) <= 500);

alter table public.profiles
  add column if not exists whatsapp_url text,
  add column if not exists telegram_url text;

alter table public.profiles
  drop constraint if exists profiles_whatsapp_url_len;
alter table public.profiles
  add constraint profiles_whatsapp_url_len
  check (whatsapp_url is null or char_length(whatsapp_url) between 8 and 300);

alter table public.profiles
  drop constraint if exists profiles_telegram_url_len;
alter table public.profiles
  add constraint profiles_telegram_url_len
  check (telegram_url is null or char_length(telegram_url) between 8 and 300);

notify pgrst, 'reload schema';
