# DARKE

The after-work browser. Founder: Mike O’Dea.

Phase 1–3: local encrypted profile, one Auth user, unlock / create / sign-in, one public **hello** room. No listings, invites, thumbs, or notifications.

Stack: Tauri 2 + React + TypeScript + Vite. Windows first. Supabase JS in the UI. Crypto only in Rust.

## Prerequisites (Windows)

- Node.js 20+
- Rust (stable) via rustup (`rustup default stable`)
- **Microsoft C++ Build Tools** with the “Desktop development with C++” workload (`link.exe`). Without this, `npm run tauri dev` cannot compile. Example:

  ```
  winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  ```

  Then open a **new** terminal so `link.exe` is on PATH.
- WebView2 (included on current Windows 10/11)
- A Supabase project

## Setup

1. Copy env and fill in the anon (public) keys only:

   ```
   copy .env.example .env
   ```

2. Run this SQL in the Supabase SQL editor (also saved as `supabase/phase1.sql`):

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique,
  created_at timestamptz default now(),
  constraint profiles_username_slug check (
    username = lower(username)
    and username ~ '^[a-z0-9]+$'
  )
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles for select using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete using (auth.uid() = id);

create or replace function public.username_available(name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  slug text;
begin
  slug := lower(regexp_replace(coalesce(name, ''), '[^a-zA-Z0-9]', '', 'g'));
  if slug = '' then
    return false;
  end if;
  return not exists (select 1 from public.profiles p where p.username = slug);
end;
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant insert, update, delete on table public.profiles to authenticated;
```

3. Auth (required for first-run sign-up to unlock immediately):

   - [ ] Authentication → Providers → Email: **enabled**
   - [ ] **Confirm email**: **disabled** (auto-confirm). Sign-up must return a session with no mail.
   - [ ] Do **not** enable outbound mail
   - [ ] No OAuth providers
   - [ ] No forgot-password flow (the app does not expose one)

   There is no reset. The passphrase is the Supabase password and the local vault key.

4. Install and run:

   ```
   npm install
   npm run tauri dev
   ```

   Production (Windows NSIS):

   ```
   npm run tauri build
   ```

## Identity

- One Supabase Auth user. The same `user.id` will later own room, profile, one Apps listing, and invite.
- No local accounts table. Disk holds encrypted browsing webview profile + vault metadata only.
- The user never sees an email. The app uses `{slug}@users.darke.local` only on the wire. That string and domain are never rendered.
- Username is case-insensitive. Canonical store is the **slug**: lowercase `[a-z0-9]` only. `Oak` and `oak` collide. Empty after strip is invalid. Profile UI shows the slug.

## Test steps

### Oak vs oak collide

1. Create account with username `Oak` and a passphrase.
2. Confirm Profile and Settings show `oak`.
3. Quit (this locks).
4. On a clean Supabase project you cannot create a second local vault on the same PC. To test collision: Create with a username that already exists in `public.profiles` — the card must show **already taken — sign in** and switch to Sign-in. Do not create a second Auth user.

   Quick SQL check after creating `Oak`:

   ```sql
   select username from public.profiles;
   -- one row: oak
   select public.username_available('Oak');  -- false
   select public.username_available('oak');  -- false
   select public.username_available('OAK');  -- false
   ```

### Sign up → session → quit → unlock

1. First launch (no vault): Create account is the default, plus **Already have an account?**
2. After create: shell. Quit (lock). Next launch is **Unlock only** (no Create). No remember-me.
3. Wrong passphrase: error on the Unlock card. No shell. No webview.
4. Correct passphrase: vault unlocks, then the shell.

### Existing Auth user, fresh PC (no vault)

1. Launch → Create, then **Already have an account?**
2. Sign in with username + passphrase (`signInWithPassword`, not signUp).
3. On success: `create_vault` for this PC, then shell.
4. Quit. Next launch: Unlock only.

The Tauri/Rust log prints `DARKE vault path: … exists=…` (typically `%APPDATA%\ai.darke.browser`). WebView console also logs `vault_path`.

Local vault files: `vault.meta.json` (salt, wrapped key, slug) and `vault.bin`. The passphrase is never stored. Plaintext session is never stored outside the vault.

## Commands (Rust)

- `create_vault(passphrase, slug)` — Argon2id + AES-GCM; leaves the vault unlocked
- `unlock_vault(passphrase)` — returns slug
- `lock_vault()` — encrypts the work directory, wipes plaintext, called on quit
- `vault_exists()` — whether this PC has a vault
- `vault_path()` — app data directory (logged on launch)

React only collects fields and `invoke()`s. No JS Argon2.

## Phase 3 — hello room

Run `supabase/phase3.sql` after phase 1. Then in the dashboard: **Database → Replication** (or Realtime → Tables) and confirm `public.messages` is enabled.

```sql
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room text not null default 'hello' check (room = 'hello'),
  user_id uuid not null references auth.users on delete cascade,
  username text not null,
  body text not null check (char_length(body) > 0 and char_length(body) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists messages_room_created_at
  on public.messages (room, created_at);

alter table public.messages enable row level security;

drop policy if exists "messages_select_hello" on public.messages;
create policy "messages_select_hello"
  on public.messages for select using (room = 'hello');

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert
  with check (user_id = auth.uid() and room = 'hello');

-- BEFORE INSERT: username is copied from public.profiles for auth.uid(). Client cannot spoof.
-- No UPDATE or DELETE policies this phase.

grant select, insert on table public.messages to authenticated;
```

**Realtime:** the client subscribes to `INSERT` on `public.messages` for `room=hello`. If that channel does not become `SUBSCRIBED` within 4s (Realtime not enabled), it **polls every 5 seconds**. Messages live on the server, not in the vault. Last-read is a local timestamp inside the vault (`hello-last-read.txt`); there is no unread badge.

### Room test

1. Two signed-in profiles (two PCs or two app data dirs). Both open Room.
2. A sends. B sees it via Realtime, or within one 5s poll.
3. Quit and unlock: Room still shows server history.
4. Body empty or over 500: error on the room pane, no insert.
