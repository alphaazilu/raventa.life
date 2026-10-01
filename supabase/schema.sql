-- RAVENTA — Supabase auth schema
-- Run this once in the Supabase Dashboard → SQL Editor → New query → Run.

-- 1. One profile row per authenticated user, holding their role and the
--    details collected on the signup form.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  first_name text,
  last_name text,
  phone text,
  province text,
  nationality text,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now()
);

-- Safe to re-run: adds these columns to an install that ran an earlier
-- version of this file without them.
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists province text;
-- Added later, same reasoning as phone/province: not NOT NULL at the
-- database level (existing rows would break), enforced as required instead
-- in the app layer (see lib/supabase/profile.ts's isProfileComplete, which
-- routes any account missing it — old or new, any signup method — through
-- /complete-profile).
alter table public.profiles add column if not exists nationality text;

-- Running 10-digit membership number (e.g. "0000000001"). The column
-- DEFAULT does the actual number-generation, so every future insert gets
-- one automatically — the trigger below, and the upsert in
-- app/complete-profile/actions.ts, both insert without mentioning this
-- column on purpose, so the default applies and an ON CONFLICT UPDATE
-- never overwrites an already-assigned number.
create sequence if not exists public.member_no_seq;

alter table public.profiles add column if not exists member_no text;

-- Collision-safe membership number generator. Some members ask for an
-- auspicious ("mongkol") number, which an admin then hand-picks directly in
-- the database — ahead of wherever the running sequence currently is. So
-- rather than trusting nextval() blindly, this loops until it lands on a
-- value nothing has already claimed. The sequence itself never repeats a
-- value, so the loop only ever runs more than once when a manually-assigned
-- number happens to fall in its path — at that point it's simply skipped
-- and the next one is tried.
--
-- SECURITY DEFINER is what makes that skip actually work. Without it, the
-- "is this number taken?" check runs under the caller's row-level security:
-- when a member's own request creates their profile (the upsert in
-- app/complete-profile/actions.ts, e.g. after the row was deleted), they
-- can only see their own row, so every other member's number looks free
-- and a hand-picked number in the sequence's path causes a
-- duplicate-key error instead of being skipped.
create or replace function public.next_member_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := lpad(nextval('public.member_no_seq')::text, 10, '0');
    exit when not exists (select 1 from public.profiles where member_no = candidate);
  end loop;
  return candidate;
end;
$$;

alter table public.profiles
  alter column member_no set default public.next_member_no();

-- Backfill anyone who signed up before this column existed, oldest first,
-- so membership numbers still read as "when you joined". Safe to re-run:
-- only rows still missing a number are touched.
do $$
declare
  r record;
begin
  for r in
    select id from public.profiles where member_no is null order by created_at asc, id asc
  loop
    update public.profiles
    set member_no = public.next_member_no()
    where id = r.id;
  end loop;
end $$;

-- ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS in Postgres, so this
-- checks first to keep the whole file safe to re-run.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_member_no_key') then
    alter table public.profiles add constraint profiles_member_no_key unique (member_no);
  end if;
end $$;

alter table public.profiles enable row level security;

-- 2. Auto-create a profile row whenever someone signs up (email/password or
--    Google both funnel through auth.users the same way).
--    Email/password signups send first_name/last_name/phone/province/
--    nationality via supabase.auth.signUp({ options: { data: { ... } } }).
--    Google sometimes provides given_name/family_name too, so that's used
--    as a fallback — but phone/province/nationality are never provided by
--    either OAuth provider, so those accounts land here with an incomplete
--    profile on purpose: the /complete-profile gate (see proxy.ts +
--    app/complete-profile) catches that and makes the user fill in what's
--    missing before using /account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, phone, province, nationality)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'given_name'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data ->> 'family_name'),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'province',
    new.raw_user_meta_data ->> 'nationality'
  )
  on conflict (id) do update set
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    province = coalesce(excluded.province, public.profiles.province),
    nationality = coalesce(excluded.nationality, public.profiles.nationality);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Helper function to check admin status without a recursive RLS lookup.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 4. RLS policies: everyone can see/update their own row; admins can see all.
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Lets the /admin member-edit page (app/admin/actions.ts) update anyone's
-- name/phone/province/nationality — deliberately never member_no; see
-- protect_member_no() below, which blocks that regardless of this policy.
drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- Lets /complete-profile recover with an upsert if a profile row is ever
-- missing when it shouldn't be (e.g. manually deleted in the table editor)
-- instead of the update silently affecting 0 rows and looping forever.
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 5. Guardrail: member_no can never be changed by a request that carries a
-- Supabase Auth session — i.e. anything going through the app itself,
-- whether a member's own account page or the /admin edit form. Neither of
-- those UIs ever sends this field, but this closes the door on someone
-- crafting a raw update call from the browser console too. auth.uid() is
-- null for a direct Postgres connection (the Supabase Studio Table/SQL
-- Editor), which is the only place member_no should ever be hand-edited —
-- see next_member_no() above for why members sometimes need a specific
-- ("mongkol") number reserved there directly.
create or replace function public.protect_member_no()
returns trigger
language plpgsql
as $$
begin
  if new.member_no is distinct from old.member_no and auth.uid() is not null then
    raise exception 'member_no cannot be changed through the app — edit it directly in the database.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_member_no on public.profiles;
create trigger protect_member_no
  before update on public.profiles
  for each row execute function public.protect_member_no();

-- 6. One account per phone number. Email is already unique (Supabase Auth
-- enforces that on auth.users); this does the same for phone.
--
-- Phones are compared digits-only so "081-234-5678" and "0812345678" count
-- as the same number, even for rows saved before the app enforced the
-- digits-only format.
--
-- phone_is_taken() lets the app ask "is this number already used?" before
-- signing someone up. It's SECURITY DEFINER because a person on the signup
-- form isn't logged in yet, so RLS wouldn't let them see anyone else's
-- row — this only ever answers true/false and never returns the row itself.
-- p_exclude_id skips the caller's own row, so saving your own unchanged
-- number never counts as a clash.
create or replace function public.phone_is_taken(p_phone text, p_exclude_id uuid default null)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') <> ''
      and regexp_replace(coalesce(phone, ''), '\D', '', 'g')
          = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
      and (p_exclude_id is null or id <> p_exclude_id)
  );
$$;

grant execute on function public.phone_is_taken(text, uuid) to anon, authenticated;

-- The unique index is the real guarantee: the phone_is_taken() check in the
-- app can race (two signups with the same number at the same moment), and
-- this index is what makes the second one fail. It can only be created once
-- no duplicates exist, so if some are already in the table this skips it
-- and prints a notice instead of failing the whole file. Find them with:
--
--   select regexp_replace(phone, '\D', '', 'g') as phone_digits,
--          array_agg(member_no || ' ' || coalesce(email, '')) as members
--   from public.profiles
--   where coalesce(phone, '') <> ''
--   group by 1 having count(*) > 1;
--
-- Fix those rows (edit or clear the phone), then re-run this file.
do $$
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'profiles_phone_digits_key') then
    return;
  end if;
  if exists (
    select 1 from public.profiles
    where coalesce(phone, '') <> ''
    group by regexp_replace(phone, '\D', '', 'g')
    having count(*) > 1
  ) then
    raise notice 'profiles_phone_digits_key NOT created: duplicate phone numbers exist. See the query in the comment in section 6.';
  else
    create unique index profiles_phone_digits_key
      on public.profiles ((regexp_replace(phone, '\D', '', 'g')))
      where coalesce(phone, '') <> '';
  end if;
end $$;

-- 7. Email for accounts that signed in without one (LINE, usually). They
-- type it on /complete-profile, and it's stored in profiles.email only —
-- their login stays LINE. email_is_taken() stops that typed email from
-- matching someone who already has an account (their login email, or an
-- email another LINE member already gave), so the same person can't end
-- up with a second membership just by signing in a different way.
--
-- Deliberately NOT a unique index: a typed email isn't verified, so a
-- typo (or someone else's address) mustn't be able to lock the real owner
-- out of signing up with it later. The check only guards the typed entry.
create or replace function public.email_is_taken(p_email text, p_exclude_id uuid default null)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select trim(coalesce(p_email, '')) <> '' and (
    exists (
      select 1 from public.profiles
      where lower(trim(email)) = lower(trim(p_email))
        and (p_exclude_id is null or id <> p_exclude_id)
    )
    or exists (
      select 1 from auth.users
      where lower(email) = lower(trim(p_email))
        and (p_exclude_id is null or id <> p_exclude_id)
    )
  );
$$;

revoke execute on function public.email_is_taken(text, uuid) from public, anon;
grant execute on function public.email_is_taken(text, uuid) to authenticated;

-- 8. LINE user ID ("U…"), for messaging a member through the LINE Official
-- Account later (welcome/booking messages, per-member rich menus). It's the
-- same ID LINE gives the OA only if the OA's Messaging API channel sits
-- under the same LINE Developers provider as the LINE Login channel.
--
-- Filled in by the app (app/auth/callback and app/complete-profile) from
-- the account's own LINE identity. One LINE account → one member.
alter table public.profiles add column if not exists line_user_id text;

create unique index if not exists profiles_line_user_id_key
  on public.profiles (line_user_id)
  where line_user_id is not null;

-- Guardrail, same idea as protect_member_no(): a request made through the
-- app can only set line_user_id to the LINE ID actually linked to that
-- account in Supabase Auth. Otherwise anyone could write someone else's
-- LINE ID onto their own profile (from the browser console) and have
-- member messages meant for them delivered to that person. Direct database
-- edits (auth.uid() is null — SQL editor, the backfill below) are allowed.
create or replace function public.protect_line_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.line_user_id is not distinct from old.line_user_id then
    return new;
  end if;
  if tg_op = 'INSERT' and new.line_user_id is null then
    return new;
  end if;
  if new.line_user_id is null or not exists (
    select 1 from auth.identities
    where user_id = new.id
      and provider = 'custom:line'
      and provider_id = new.line_user_id
  ) then
    raise exception 'line_user_id must match the LINE account linked to this member.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_line_user_id on public.profiles;
create trigger protect_line_user_id
  before insert or update on public.profiles
  for each row execute function public.protect_line_user_id();

-- Backfill members who already signed in with LINE. Safe to re-run.
update public.profiles p
set line_user_id = i.provider_id
from auth.identities i
where i.user_id = p.id
  and i.provider = 'custom:line'
  and p.line_user_id is null;

-- 9. Joining a LINE sign-in onto an existing membership. Someone who joined
-- with Google/email and later taps the LINE OA rich menu gets a brand-new,
-- empty LINE account. When the email they type on /complete-profile is
-- already a member's, they can prove it's theirs with a 6-digit code sent
-- there, and app/complete-profile/merge-actions.ts moves them onto the
-- existing membership (see that file for the exact steps).
--
-- Both objects below are only for the server's service-role key: no
-- policies and no grants for anon/authenticated, so the browser can never
-- read codes or look accounts up by email.
create table if not exists public.account_merge_codes (
  -- the new, empty LINE account asking to merge
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- the existing membership it wants to join
  target_user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.account_merge_codes enable row level security;
revoke all on public.account_merge_codes from anon, authenticated;

create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;
$$;

revoke execute on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

-- Same lookup by phone (digits only), for when the phone a LINE sign-in types
-- belongs to an existing member even though the email they typed doesn't.
create or replace function public.find_user_id_by_phone(p_phone text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.profiles
  where regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') <> ''
    and regexp_replace(coalesce(phone, ''), '\D', '', 'g')
        = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
  limit 1;
$$;

revoke execute on function public.find_user_id_by_phone(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_phone(text) to service_role;

-- Per-membership limits on merge codes. Without these, someone could keep
-- asking for a fresh code every minute (each allowing 5 guesses) and slowly
-- guess their way into another member's account while flooding that
-- member's inbox. Every code sent and every wrong guess is logged against
-- the membership being joined; merge-actions.ts refuses once a day's limit
-- is reached. Old rows are just history — they stop counting after 24h.
create table if not exists public.account_merge_events (
  id bigint generated always as identity primary key,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('code_sent', 'wrong_code')),
  created_at timestamptz not null default now()
);

create index if not exists account_merge_events_target_idx
  on public.account_merge_events (target_user_id, created_at);

alter table public.account_merge_events enable row level security;
revoke all on public.account_merge_events from anon, authenticated;

-- 10. Profile photos. Members can upload their own photo; it's stored in a
-- PRIVATE Storage bucket (a face is personal data under PDPA), so no one can
-- open it by URL alone — the site hands out short-lived signed links only to
-- the member themself and to admins.
--
-- avatar_path          = uploaded photo, "<user id>/<file>" in bucket avatars
-- provider_avatar_url  = picture from LINE/Google, refreshed on each sign-in
-- Shown in that order; with neither, the site shows the name's first letter.
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists provider_avatar_url text;

-- Backfill LINE/Google pictures for members who signed up before this
-- existed (otherwise they'd only appear after each member's next sign-in).
-- LINE first, like the app. Safe to re-run: only fills empty ones.
update public.profiles p
set provider_avatar_url = pic.url
from (
  select distinct on (i.user_id)
    i.user_id,
    coalesce(i.identity_data->>'picture', i.identity_data->>'avatar_url') as url
  from auth.identities i
  where i.provider in ('custom:line', 'google')
    and coalesce(i.identity_data->>'picture', i.identity_data->>'avatar_url') like 'https://%'
  order by i.user_id, (i.provider = 'custom:line') desc
) pic
where pic.user_id = p.id
  and p.provider_avatar_url is null;

-- A member can only ever point avatar_path at a file in their own folder.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_path_own_folder') then
    alter table public.profiles
      add constraint profiles_avatar_path_own_folder
      check (avatar_path is null or avatar_path like (id::text || '/%'));
  end if;
end $$;

-- Private bucket: 1 MB per file, images only. The browser shrinks photos to
-- ~512px JPEG before upload, so real files are far smaller than the limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Each member reads/writes only their own folder (<user id>/...); admins can
-- read everyone's (for the member list) and delete (to remove an
-- inappropriate photo).
drop policy if exists "Avatars: read own or admin" on storage.objects;
create policy "Avatars: read own or admin"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "Avatars: upload own" on storage.objects;
create policy "Avatars: upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Avatars: update own" on storage.objects;
create policy "Avatars: update own"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Avatars: delete own or admin" on storage.objects;
create policy "Avatars: delete own or admin"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- 11. Promote an account to admin (run manually, once, per admin user):
-- update public.profiles set role = 'admin' where email = 'owner@raventa.com';

-- 12. Roles are only ever changed in the database itself. The "update own
-- profile" policy above covers every column, so without this a member
-- could promote themself to admin from the browser console with their own
-- session. A request made through the app (auth.uid() is set) can neither
-- change role nor create a profile with anything but 'customer'. Promote
-- people in the SQL editor (see section 11), where auth.uid() is null.
create or replace function public.protect_role()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.role := 'customer';
  elsif new.role is distinct from old.role then
    raise exception 'role cannot be changed through the app — edit it directly in the database.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_role on public.profiles;
create trigger protect_role
  before insert or update on public.profiles
  for each row execute function public.protect_role();

-- 13. Staff role + front-desk check-in (v0.11).
--
-- Three roles, each a member first (own card, own visits, own stamps):
--   customer  member
--   staff     + /admin/check-in: scan, check in/out, take counter payment,
--             use a free reward
--   admin     + everything else in /admin
--
-- Every write goes through the SECURITY DEFINER functions below, called
-- with the staff member's own session, so the database itself knows who
-- did it (auth.uid()), writes the audit log, and refuses anyone serving
-- themself. Nothing here can be updated or deleted from the app; a mistake
-- is "cancelled" (with who and why), never erased.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('customer', 'staff', 'admin'));

create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('staff', 'admin')
  );
$$;

-- Staff look members up (scan / phone search), so they can read profiles.
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_staff());

-- Staff see photos at the desk to confirm the face matches the card.
drop policy if exists "Avatars: read own or admin" on storage.objects;
create policy "Avatars: read own or admin"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));

-- Bangkok calendar day — a visit at 00:30 belongs to that day, not UTC's.
create or replace function public.bkk_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Bangkok')::date;
$$;

-- Day Pass price for a date: Mon–Fri 590, Sat–Sun 790 (THB). The one place
-- the price lives; the check-in screen asks for it rather than hard-coding.
-- Public holidays aren't handled yet (see R1 decisions).
create or replace function public.day_pass_price(p_date date)
returns int
language sql
immutable
as $$
  select case when extract(isodow from p_date) in (6, 7) then 790 else 590 end;
$$;

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  -- set null (not cascade) so deleting a member never erases takings;
  -- member_no is kept as a snapshot for the same reason.
  member_id uuid references auth.users(id) on delete set null,
  member_no text,
  visit_date date not null default public.bkk_today(),
  entry_type text not null check (entry_type in ('paid', 'reward')),
  price int not null default 0,
  payment_method text check (payment_method in ('cash', 'transfer', 'card')),
  earns_stamp boolean not null default false,
  wristband text,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references auth.users(id) on delete set null,
  checked_out_at timestamptz,
  checked_out_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancel_reason text,
  check ((entry_type = 'paid') = (payment_method is not null))
);

-- One (uncancelled) visit per member per day — which also caps stamps at
-- one a day.
create unique index if not exists visits_one_per_day
  on public.visits (member_id, visit_date)
  where cancelled_at is null;

create index if not exists visits_date_idx on public.visits (visit_date);

alter table public.visits enable row level security;
revoke insert, update, delete on public.visits from anon, authenticated;

drop policy if exists "Visits: own or staff" on public.visits;
create policy "Visits: own or staff"
  on public.visits for select to authenticated
  using (member_id = auth.uid() or public.is_staff());

-- Audit log: who did what, to whom, when. Append-only; admins read it.
create table if not exists public.staff_actions (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  member_id uuid references auth.users(id) on delete set null,
  visit_id uuid references public.visits(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists staff_actions_created_idx on public.staff_actions (created_at desc);

alter table public.staff_actions enable row level security;
revoke insert, update, delete on public.staff_actions from anon, authenticated;

drop policy if exists "Staff actions: admins read" on public.staff_actions;
create policy "Staff actions: admins read"
  on public.staff_actions for select to authenticated
  using (public.is_admin());

-- Stamp card: 1 stamp per paid visit, 10 stamps = 1 free weekday Day Pass.
-- A reward visit earns no stamp. Readable by the member themself or staff.
create or replace function public.member_stamp_status(p_member_id uuid)
returns table (stamps int, rewards_used int, rewards_available int, progress int)
language sql
security definer
set search_path = public
stable
as $$
  with s as (
    select
      count(*) filter (where earns_stamp)::int as stamps,
      count(*) filter (where entry_type = 'reward')::int as used
    from public.visits
    where member_id = p_member_id and cancelled_at is null
  )
  select
    s.stamps,
    s.used,
    greatest(s.stamps / 10 - s.used, 0),
    -- stamps toward the next reward; shows 10 while a reward is waiting
    case when s.stamps / 10 - s.used > 0 then 10 else s.stamps % 10 end
  from s
  where p_member_id = auth.uid() or public.is_staff();
$$;

grant execute on function public.member_stamp_status(uuid) to authenticated;

create or replace function public.staff_check_in(
  p_member_id uuid,
  p_entry_type text,
  p_payment_method text default null,
  p_wristband text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.bkk_today();
  v_member_no text;
  v_price int := 0;
  v_available int;
  v_id uuid;
begin
  if not public.is_staff() then
    raise exception 'not_staff';
  end if;
  if p_member_id = auth.uid() then
    raise exception 'self_service';
  end if;
  select member_no into v_member_no from public.profiles where id = p_member_id;
  if not found then
    raise exception 'member_not_found';
  end if;
  if exists (
    select 1 from public.visits
    where member_id = p_member_id and visit_date = v_today and cancelled_at is null
  ) then
    raise exception 'already_checked_in';
  end if;

  if p_entry_type = 'paid' then
    if p_payment_method is null or p_payment_method not in ('cash', 'transfer', 'card') then
      raise exception 'payment_method_required';
    end if;
    v_price := public.day_pass_price(v_today);
  elsif p_entry_type = 'reward' then
    -- the free pass is a weekday Day Pass
    if extract(isodow from v_today) in (6, 7) then
      raise exception 'reward_weekday_only';
    end if;
    select rewards_available into v_available
    from public.member_stamp_status(p_member_id);
    if coalesce(v_available, 0) < 1 then
      raise exception 'no_reward';
    end if;
    p_payment_method := null;
  else
    raise exception 'bad_entry_type';
  end if;

  insert into public.visits (
    member_id, member_no, visit_date, entry_type, price, payment_method,
    earns_stamp, wristband, checked_in_by
  ) values (
    p_member_id, v_member_no, v_today, p_entry_type, v_price, p_payment_method,
    p_entry_type = 'paid', nullif(trim(coalesce(p_wristband, '')), ''), auth.uid()
  )
  returning id into v_id;

  insert into public.staff_actions (actor_id, member_id, visit_id, action, detail)
  values (
    auth.uid(), p_member_id, v_id, 'check_in',
    jsonb_build_object('entry_type', p_entry_type, 'price', v_price, 'payment_method', p_payment_method, 'wristband', p_wristband)
  );
  return v_id;
end;
$$;

create or replace function public.staff_check_out(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.visits;
begin
  if not public.is_staff() then
    raise exception 'not_staff';
  end if;
  select * into v from public.visits where id = p_visit_id for update;
  if not found or v.cancelled_at is not null then
    raise exception 'visit_not_found';
  end if;
  if v.member_id = auth.uid() then
    raise exception 'self_service';
  end if;
  if v.checked_out_at is not null then
    raise exception 'already_checked_out';
  end if;
  update public.visits set checked_out_at = now(), checked_out_by = auth.uid() where id = p_visit_id;
  insert into public.staff_actions (actor_id, member_id, visit_id, action)
  values (auth.uid(), v.member_id, p_visit_id, 'check_out');
end;
$$;

-- Undo a mistaken check-in: staff within 30 minutes, admins any time.
-- Hands back the stamp (or the free reward) automatically, since both are
-- counted from uncancelled visits.
create or replace function public.staff_cancel_visit(p_visit_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.visits;
begin
  if not public.is_staff() then
    raise exception 'not_staff';
  end if;
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'reason_required';
  end if;
  select * into v from public.visits where id = p_visit_id for update;
  if not found or v.cancelled_at is not null then
    raise exception 'visit_not_found';
  end if;
  if v.member_id = auth.uid() then
    raise exception 'self_service';
  end if;
  if not public.is_admin() and v.checked_in_at < now() - interval '30 minutes' then
    raise exception 'cancel_window_passed';
  end if;
  update public.visits
  set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason)
  where id = p_visit_id;
  insert into public.staff_actions (actor_id, member_id, visit_id, action, detail)
  values (auth.uid(), v.member_id, p_visit_id, 'cancel_visit', jsonb_build_object('reason', trim(p_reason)));
end;
$$;

revoke execute on function public.staff_check_in(uuid, text, text, text) from public, anon;
revoke execute on function public.staff_check_out(uuid) from public, anon;
revoke execute on function public.staff_cancel_visit(uuid, text) from public, anon;
grant execute on function public.staff_check_in(uuid, text, text, text) to authenticated;
grant execute on function public.staff_check_out(uuid) to authenticated;
grant execute on function public.staff_cancel_visit(uuid, text) to authenticated;

-- Give someone the front-desk role (run manually, like section 11):
-- update public.profiles set role = 'staff' where email = 'desk@example.com';

-- 14. Verified emails for LINE members + email/password on any account
-- (v0.12). LINE gives no email, so a LINE member types one. The site now
-- emails a 6-digit code to it and, once the code is entered, makes it the
-- account's real login email (auth.users, marked confirmed) — so it's
-- proven to be theirs, and they can add a password and sign in with it.
--
-- Same shape as the merge codes in section 9: server (service-role) only,
-- no policies, nothing the browser can read.
create table if not exists public.email_verification_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.email_verification_codes enable row level security;
revoke all on public.email_verification_codes from anon, authenticated;

-- Every code sent and every wrong guess, for the daily limits (per member
-- and per email address — so nobody can flood someone else's inbox).
create table if not exists public.email_verification_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  kind text not null check (kind in ('code_sent', 'wrong_code')),
  created_at timestamptz not null default now()
);

create index if not exists email_verification_events_user_idx
  on public.email_verification_events (user_id, created_at);
create index if not exists email_verification_events_email_idx
  on public.email_verification_events (email, created_at);

alter table public.email_verification_events enable row level security;
revoke all on public.email_verification_events from anon, authenticated;

-- Whether the member has set a password (Supabase never exposes that). Set
-- by the app after a password is saved; email/password signups count too
-- (the settings page also checks their email identity).
alter table public.profiles add column if not exists has_password boolean not null default false;

-- 15. Counter tablets (v0.14). A tablet is paired once by an admin: the
-- tablet shows a 6-digit code (and a QR of it) at /tablet, the admin enters
-- it under Back Office → Devices, and the tablet then receives its own long
-- random key as an httpOnly cookie. Only a hash of that key is stored here.
-- A device key alone can open nothing but the console's lock screen.
--
-- Server (service-role) only, like sections 9 and 14: no policies, nothing
-- the browser can read or write directly.
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  token_hash text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null
);

alter table public.devices enable row level security;
revoke all on public.devices from anon, authenticated;

create table if not exists public.device_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[0-9]{6}$'),
  -- hash of the secret in the waiting tablet's own cookie, so only that
  -- tablet can collect the key once an admin approves the code
  poll_hash text not null unique,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  device_id uuid references public.devices(id) on delete cascade,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists device_pairing_codes_code_idx
  on public.device_pairing_codes (code, expires_at);

alter table public.device_pairing_codes enable row level security;
revoke all on public.device_pairing_codes from anon, authenticated;
