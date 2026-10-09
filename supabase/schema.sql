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

-- 16. Time clock (v0.18). A staff member is clocked in the first time they
-- open the console on a registered tablet (scanning their card, or the
-- password fallback) and clocked out with "ออกงาน". Locking the tablet or
-- switching person mid-shift does not touch the entry. Admins can correct
-- an entry or add a missing one; every change keeps the old times and a
-- reason in time_entry_edits.
--
-- Server (service-role) only, like sections 9, 14 and 15.
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users(id) on delete cascade,
  clock_in timestamptz not null,
  clock_out timestamptz,
  device_id uuid references public.devices(id) on delete set null,
  in_method text not null default 'card' check (in_method in ('card', 'password', 'admin')),
  out_method text check (out_method in ('button', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_out_after_in check (clock_out is null or clock_out > clock_in)
);

-- At most one open entry per person.
create unique index if not exists time_entries_one_open_idx
  on public.time_entries (staff_id) where clock_out is null;
create index if not exists time_entries_in_idx on public.time_entries (clock_in desc);

alter table public.time_entries enable row level security;
revoke all on public.time_entries from anon, authenticated;

create table if not exists public.time_entry_edits (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.time_entries(id) on delete cascade,
  editor_id uuid references auth.users(id) on delete set null,
  old_clock_in timestamptz,
  old_clock_out timestamptz,
  new_clock_in timestamptz not null,
  new_clock_out timestamptz,
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  created_at timestamptz not null default now()
);

create index if not exists time_entry_edits_entry_idx on public.time_entry_edits (entry_id, created_at desc);

alter table public.time_entry_edits enable row level security;
revoke all on public.time_entry_edits from anon, authenticated;

-- 17. Shifts (v0.19). Admins define shift templates (start, end, unpaid
-- break), put people on them per day (the weekly roster), and set the
-- late / overtime rules. Clock entries (§16) are matched to the person's
-- shift for that day to work out late minutes, leaving early and OT.
--
-- Server (service-role) only, like §16.
create table if not exists public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  start_time time not null,
  end_time time not null,               -- earlier than start = ends next day
  break_minutes integer not null default 0 check (break_minutes between 0 and 240),
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  constraint shift_templates_not_zero check (start_time <> end_time)
);

alter table public.shift_templates enable row level security;
revoke all on public.shift_templates from anon, authenticated;

create table if not exists public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  template_id uuid references public.shift_templates(id) on delete restrict,
  day_off boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint shift_assignments_one_per_day unique (staff_id, work_date),
  constraint shift_assignments_shift_or_off check ((template_id is not null) <> day_off)
);

create index if not exists shift_assignments_date_idx on public.shift_assignments (work_date);

alter table public.shift_assignments enable row level security;
revoke all on public.shift_assignments from anon, authenticated;

-- One row of rules.
create table if not exists public.time_settings (
  id integer primary key default 1 check (id = 1),
  late_grace_minutes integer not null default 5 check (late_grace_minutes between 0 and 120),
  ot_min_minutes integer not null default 30 check (ot_min_minutes between 0 and 240),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.time_settings (id) values (1) on conflict (id) do nothing;

alter table public.time_settings enable row level security;
revoke all on public.time_settings from anon, authenticated;

-- 18. Catalog, prices, promotions and the multi-item bill (v0.20).
--
-- products        what the counter sells: the Day Pass (exactly one row),
--                 add-ons, merchandise, souvenirs. Prices per day type:
--                 weekday / weekend / public holiday (null = falls back).
-- product_variants size / colour, each with its own SKU and stock.
-- holidays        public-holiday dates → holiday price, no free pass.
-- promotions      % or THB off everything, the Day Pass, or one product;
--                 automatic (no code) or with a code; optional date range.
-- sales/sale_lines one bill = one sale with a continuous receipt number.
--                 A Day Pass line creates the visit (check-in) in the same
--                 transaction; visits.sale_id links them.
--
-- Staff read the catalog; admins change it from the server (service role).
-- Selling goes through pos_quote / pos_checkout / pos_void_sale, called
-- with the staff member's own session — like §13, the database decides.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('day_pass', 'addon', 'merch', 'souvenir')),
  name_th text not null check (char_length(btrim(name_th)) between 1 and 60),
  name_en text not null default '' check (char_length(name_en) <= 60),
  price_weekday integer not null check (price_weekday between 0 and 1000000),
  price_weekend integer check (price_weekend between 0 and 1000000),   -- null = weekday price
  price_holiday integer check (price_holiday between 0 and 1000000),   -- null = weekend price
  track_stock boolean not null default false,
  stock integer not null default 0 check (stock >= 0),                 -- used when there are no variants
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_one_day_pass on public.products ((true)) where kind = 'day_pass';

insert into public.products (kind, name_th, name_en, price_weekday, price_weekend, price_holiday, sort)
select 'day_pass', 'Day Pass', 'Day Pass', 590, 790, 790, 0
where not exists (select 1 from public.products where kind = 'day_pass');

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  sku text unique check (sku is null or char_length(sku) between 1 and 40),
  stock integer not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_variants_product_idx on public.product_variants (product_id);

create table if not exists public.holidays (
  day date primary key,
  name text not null check (char_length(btrim(name)) between 1 and 60)
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind text not null check (kind in ('pct', 'thb')),
  value integer not null check (value > 0),
  scope text not null default 'all' check (scope in ('all', 'day_pass', 'product')),
  product_id uuid references public.products(id) on delete cascade,
  code text check (code is null or code ~ '^[A-Z0-9]{3,20}$'),
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint promotions_pct_max check (kind <> 'pct' or value <= 100),
  constraint promotions_product_scope check ((scope = 'product') = (product_id is not null)),
  constraint promotions_dates check (starts_on is null or ends_on is null or starts_on <= ends_on)
);

create unique index if not exists promotions_code_idx on public.promotions (code) where code is not null;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  receipt_no bigint generated always as identity unique,
  sale_date date not null default public.bkk_today(),
  member_id uuid references auth.users(id) on delete set null,
  member_no text,
  subtotal integer not null check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  total integer not null check (total >= 0),
  payment_method text check (payment_method in ('cash', 'transfer', 'card')),
  promotion_id uuid references public.promotions(id) on delete set null,
  promo_name text,
  staff_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text,
  constraint sales_total check (total = subtotal - discount),
  constraint sales_method check (total = 0 or payment_method is not null)
);

create index if not exists sales_date_idx on public.sales (sale_date);

create table if not exists public.sale_lines (
  id bigint generated always as identity primary key,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,
  kind text not null,
  name text not null,
  qty integer not null check (qty between 1 and 99),
  unit_price integer not null check (unit_price >= 0),
  line_total integer not null check (line_total = qty * unit_price),
  visit_id uuid references public.visits(id) on delete set null
);

create index if not exists sale_lines_sale_idx on public.sale_lines (sale_id);

alter table public.visits add column if not exists sale_id uuid references public.sales(id) on delete set null;

-- Staff read everything here (the desk needs it); nobody writes from the app.
do $$
declare t text;
begin
  foreach t in array array['products', 'product_variants', 'holidays', 'promotions', 'sales', 'sale_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('drop policy if exists "Staff read" on public.%I', t);
    execute format('create policy "Staff read" on public.%I for select to authenticated using (public.is_staff())', t);
  end loop;
end $$;

-- weekday / weekend / holiday for a Bangkok date.
create or replace function public.day_type(p_date date)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    when exists (select 1 from public.holidays where day = p_date) then 'holiday'
    when extract(isodow from p_date) in (6, 7) then 'weekend'
    else 'weekday'
  end;
$$;

create or replace function public.product_price(p public.products, p_date date)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select case public.day_type(p_date)
    when 'holiday' then coalesce(p.price_holiday, p.price_weekend, p.price_weekday)
    when 'weekend' then coalesce(p.price_weekend, p.price_weekday)
    else p.price_weekday
  end;
$$;

-- Same name and arguments as §13, now read from the catalog (falls back to
-- 590 / 790 if the Day Pass row is missing).
create or replace function public.day_pass_price(p_date date)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select public.product_price(p, p_date) from public.products p where p.kind = 'day_pass'),
    case when extract(isodow from p_date) in (6, 7) then 790 else 590 end
  );
$$;

-- Discount one promotion gives a set of priced lines.
create or replace function public.promo_discount(pr public.promotions, p_lines jsonb)
returns integer
language sql
immutable
as $$
  with eligible as (
    select coalesce(sum((l->>'line_total')::int), 0) as amount
    from jsonb_array_elements(p_lines) l
    where pr.scope = 'all'
       or (pr.scope = 'day_pass' and l->>'kind' = 'day_pass')
       or (pr.scope = 'product' and (l->>'product_id')::uuid = pr.product_id)
  )
  select case pr.kind
    when 'pct' then (amount * pr.value) / 100
    else least(pr.value, amount)
  end::int
  from eligible;
$$;

-- Price a bill without writing anything. p_day_pass: 'none' | 'paid' |
-- 'reward'. p_items: [{"product_id": "…", "variant_id": "…"|null, "qty": n}].
-- With a code, that promotion (or an error); without, the best automatic one.
create or replace function public.pos_quote(
  p_member_id uuid,
  p_day_pass text,
  p_items jsonb,
  p_promo_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_today date := public.bkk_today();
  v_type text := public.day_type(v_today);
  v_lines jsonb := '[]'::jsonb;
  v_sub integer := 0;
  v_price integer;
  v_available integer;
  v_dp public.products;
  v_p public.products;
  v_v public.product_variants;
  v_item jsonb;
  v_qty integer;
  v_vid uuid;
  v_stock integer;
  v_name text;
  v_code text := upper(btrim(coalesce(p_promo_code, '')));
  v_promo public.promotions;
  v_best public.promotions;
  v_disc integer := 0;
  v_d integer;
  v_pkg uuid;
begin
  if not public.is_staff() then
    raise exception 'not_staff';
  end if;
  if p_member_id is not null and p_member_id = auth.uid() then
    raise exception 'self_service';
  end if;
  if coalesce(p_day_pass, 'none') not in ('none', 'paid', 'reward', 'package') then
    raise exception 'bad_entry_type';
  end if;

  if coalesce(p_day_pass, 'none') <> 'none' then
    if p_member_id is null then
      raise exception 'member_required';
    end if;
    if not exists (select 1 from public.profiles where id = p_member_id) then
      raise exception 'member_not_found';
    end if;
    if exists (
      select 1 from public.visits
      where member_id = p_member_id and visit_date = v_today and cancelled_at is null
    ) then
      raise exception 'already_checked_in';
    end if;
    select * into v_dp from public.products where kind = 'day_pass';
    if not found or not v_dp.is_active then
      raise exception 'day_pass_off';
    end if;
    if p_day_pass = 'reward' then
      if v_type <> 'weekday' then
        raise exception 'reward_weekday_only';
      end if;
      select rewards_available into v_available from public.member_stamp_status(p_member_id);
      if coalesce(v_available, 0) < 1 then
        raise exception 'no_reward';
      end if;
      v_price := 0;
    elsif p_day_pass = 'package' then
      -- §21: the member's usable package that runs out soonest.
      v_pkg := public.usable_package(p_member_id, v_today);
      if v_pkg is null then
        raise exception 'no_package';
      end if;
      v_price := 0;
    else
      v_price := public.product_price(v_dp, v_today);
    end if;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_dp.id, 'variant_id', null, 'kind', 'day_pass',
      'name', v_dp.name_th, 'name_en', v_dp.name_en, 'qty', 1,
      'unit_price', v_price, 'line_total', v_price, 'reward', p_day_pass = 'reward',
      'package_id', v_pkg
    );
    v_sub := v_sub + v_price;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_qty := nullif(v_item->>'qty', '')::int;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'bad_qty';
    end if;
    select * into v_p from public.products
    where id = nullif(v_item->>'product_id', '')::uuid and is_active and kind <> 'day_pass';
    if not found then
      raise exception 'product_unavailable';
    end if;
    -- A package (§21) belongs to someone: no walk-up sales.
    if v_p.kind = 'package' and p_member_id is null then
      raise exception 'package_needs_member';
    end if;
    v_vid := nullif(v_item->>'variant_id', '')::uuid;
    v_name := v_p.name_th;
    if exists (select 1 from public.product_variants where product_id = v_p.id and is_active) then
      if v_vid is null then
        raise exception 'variant_required';
      end if;
      select * into v_v from public.product_variants where id = v_vid and product_id = v_p.id and is_active;
      if not found then
        raise exception 'product_unavailable';
      end if;
      v_stock := v_v.stock;
      v_name := v_p.name_th || ' · ' || v_v.label;
    else
      v_vid := null;
      v_stock := v_p.stock;
    end if;
    if v_p.track_stock and v_stock < v_qty then
      raise exception 'out_of_stock';
    end if;
    v_price := public.product_price(v_p, v_today);
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_p.id, 'variant_id', v_vid, 'kind', v_p.kind,
      'name', v_name, 'name_en', v_p.name_en, 'qty', v_qty,
      'unit_price', v_price, 'line_total', v_price * v_qty, 'reward', false
    );
    v_sub := v_sub + v_price * v_qty;
  end loop;

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'empty_bill';
  end if;

  if v_code <> '' then
    select * into v_promo from public.promotions
    where code = v_code and is_active
      and (starts_on is null or starts_on <= v_today)
      and (ends_on is null or ends_on >= v_today);
    if not found then
      raise exception 'promo_invalid';
    end if;
    v_disc := public.promo_discount(v_promo, v_lines);
    if v_disc <= 0 then
      raise exception 'promo_not_applicable';
    end if;
    v_best := v_promo;
  else
    for v_promo in
      select * from public.promotions
      where code is null and is_active
        and (starts_on is null or starts_on <= v_today)
        and (ends_on is null or ends_on >= v_today)
    loop
      v_d := public.promo_discount(v_promo, v_lines);
      if v_d > v_disc then
        v_disc := v_d;
        v_best := v_promo;
      end if;
    end loop;
  end if;
  v_disc := least(v_disc, v_sub);

  return jsonb_build_object(
    'lines', v_lines,
    'subtotal', v_sub,
    'discount', v_disc,
    'total', v_sub - v_disc,
    'promotion_id', v_best.id,
    'promo_name', v_best.name,
    'day_type', v_type
  );
end;
$$;

create or replace function public.pos_checkout(
  p_member_id uuid,
  p_day_pass text,
  p_items jsonb,
  p_payment_method text default null,
  p_promo_code text default null,
  p_wristband text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q jsonb := public.pos_quote(p_member_id, p_day_pass, p_items, p_promo_code);
  v_total integer := (v_q->>'total')::int;
  v_member_no text;
  v_sale public.sales;
  v_line jsonb;
  v_line_id bigint;
  v_visit uuid;
  v_track boolean;
  v_entry text;
  v_pkg_id uuid;
  v_pkg_stamp boolean;
  v_prod public.products;
  v_today date := public.bkk_today();
begin
  if v_total > 0 or p_day_pass = 'paid' then
    if p_payment_method is null or p_payment_method not in ('cash', 'transfer', 'card') then
      raise exception 'payment_method_required';
    end if;
  else
    p_payment_method := null;
  end if;
  if p_member_id is not null then
    select member_no into v_member_no from public.profiles where id = p_member_id;
  end if;

  insert into public.sales (member_id, member_no, subtotal, discount, total, payment_method, promotion_id, promo_name, staff_id)
  values (
    p_member_id, v_member_no, (v_q->>'subtotal')::int, (v_q->>'discount')::int, v_total,
    p_payment_method, nullif(v_q->>'promotion_id', '')::uuid, v_q->>'promo_name', auth.uid()
  )
  returning * into v_sale;

  for v_line in select * from jsonb_array_elements(v_q->'lines') loop
    insert into public.sale_lines (sale_id, product_id, variant_id, kind, name, qty, unit_price, line_total)
    values (
      v_sale.id, (v_line->>'product_id')::uuid, nullif(v_line->>'variant_id', '')::uuid, v_line->>'kind',
      v_line->>'name', (v_line->>'qty')::int, (v_line->>'unit_price')::int, (v_line->>'line_total')::int
    )
    returning id into v_line_id;

    if v_line->>'kind' = 'day_pass' then
      v_entry := case
        when (v_line->>'reward')::boolean then 'reward'
        when v_line->>'package_id' is not null then 'package'
        else 'paid' end;
      if v_entry = 'package' then
        -- Use one visit; a "starts on first use" package starts today.
        update public.member_packages
        set visits_used = visits_used + 1,
            starts_on = coalesce(starts_on, v_today),
            expires_on = coalesce(expires_on, v_today + valid_days - 1)
        where id = (v_line->>'package_id')::uuid
        -- Shared visits (§23) never earn a stamp — only the owner's own.
        returning id, earns_stamp and member_id = p_member_id into v_pkg_id, v_pkg_stamp;
      end if;
      insert into public.visits (
        member_id, member_no, entry_type, price, payment_method, earns_stamp, wristband, checked_in_by, sale_id, package_id
      ) values (
        p_member_id, v_member_no, v_entry,
        (v_line->>'unit_price')::int,
        case when v_entry = 'paid' then p_payment_method end,
        case v_entry when 'paid' then true when 'package' then coalesce(v_pkg_stamp, false) else false end,
        nullif(btrim(coalesce(p_wristband, '')), ''), auth.uid(), v_sale.id,
        case when v_entry = 'package' then v_pkg_id end
      )
      returning id into v_visit;
      update public.sale_lines set visit_id = v_visit where id = v_line_id;
      insert into public.staff_actions (actor_id, member_id, visit_id, action, detail)
      values (auth.uid(), p_member_id, v_visit, 'check_in',
        jsonb_build_object('entry_type', v_entry, 'package_id', v_pkg_id,
          'price', (v_line->>'unit_price')::int, 'payment_method', p_payment_method, 'receipt_no', v_sale.receipt_no));
    elsif v_line->>'kind' = 'package' then
      -- Sold a package (§21): one per unit, with the product's rules copied
      -- so later edits to the product don't change what was bought.
      select * into v_prod from public.products where id = (v_line->>'product_id')::uuid;
      for i in 1..(v_line->>'qty')::int loop
        insert into public.member_packages (
          member_id, product_id, sale_id, sale_line_id, name, visits_total, valid_days,
          weekday_only, earns_stamp, shareable, share_whole, starts_on, expires_on, activate_by
        ) values (
          p_member_id, v_prod.id, v_sale.id, v_line_id, v_prod.name_th, v_prod.pkg_visits, v_prod.pkg_days,
          v_prod.pkg_weekday_only, v_prod.pkg_earns_stamp,
          v_prod.pkg_shareable and (v_prod.pkg_visits is not null or v_prod.pkg_share_whole),
          v_prod.pkg_shareable and v_prod.pkg_share_whole,
          case when v_prod.pkg_start = 'purchase' then v_today end,
          case when v_prod.pkg_start = 'purchase' then v_today + v_prod.pkg_days - 1 end,
          case when v_prod.pkg_start = 'first_use' then v_today + v_prod.pkg_activate_days - 1 end
        );
      end loop;
    else
      select track_stock into v_track from public.products where id = (v_line->>'product_id')::uuid;
      if v_track then
        begin
          if v_line->>'variant_id' is not null then
            update public.product_variants set stock = stock - (v_line->>'qty')::int where id = (v_line->>'variant_id')::uuid;
          else
            update public.products set stock = stock - (v_line->>'qty')::int where id = (v_line->>'product_id')::uuid;
          end if;
        exception when check_violation then
          raise exception 'out_of_stock';
        end;
      end if;
    end if;
  end loop;

  insert into public.staff_actions (actor_id, member_id, visit_id, action, detail)
  values (auth.uid(), p_member_id, v_visit, 'sale', jsonb_build_object(
    'sale_id', v_sale.id, 'receipt_no', v_sale.receipt_no, 'total', v_total,
    'discount', v_sale.discount, 'payment_method', p_payment_method, 'promo', v_sale.promo_name));

  return jsonb_build_object('sale_id', v_sale.id, 'receipt_no', v_sale.receipt_no, 'total', v_total, 'visit_id', v_visit);
end;
$$;

-- Void a whole bill: staff within 30 minutes, admins any time. Puts stock
-- back and cancels the check-in it made (which returns the stamp / reward).
create or replace function public.pos_void_sale(p_sale_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.sales;
  l record;
begin
  if not public.is_staff() then
    raise exception 'not_staff';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'reason_required';
  end if;
  select * into v from public.sales where id = p_sale_id for update;
  if not found or v.voided_at is not null then
    raise exception 'sale_not_found';
  end if;
  if v.member_id = auth.uid() then
    raise exception 'self_service';
  end if;
  if not public.is_admin() and v.created_at < now() - interval '30 minutes' then
    raise exception 'cancel_window_passed';
  end if;

  -- Packages bought on this bill (§21). Once used, only an admin may void.
  -- A visit handed to a friend (§23) counts as used.
  if exists (select 1 from public.member_packages where sale_id = p_sale_id and visits_used + visits_given > 0 and cancelled_at is null)
     and not public.is_admin() then
    raise exception 'package_used';
  end if;

  update public.sales set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason) where id = p_sale_id;

  -- Visits handed to friends from a package on this bill go too (§23).
  insert into public.package_share_events (package_id, piece_id, owner_id, friend_id, action, visits, actor)
  select o.id, f.id, o.member_id, f.member_id, 'cancelled', f.visits_total - f.visits_used, auth.uid()
  from public.member_packages f join public.member_packages o on o.id = f.shared_from
  where o.sale_id = p_sale_id and f.cancelled_at is null;

  update public.member_packages
  set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
  where (sale_id = p_sale_id
         or shared_from in (select id from public.member_packages where sale_id = p_sale_id))
    and cancelled_at is null;

  -- A check-in made with a package gives that visit back.
  update public.member_packages mp
  set visits_used = greatest(mp.visits_used - 1, 0)
  from public.visits vi
  where vi.sale_id = p_sale_id and vi.cancelled_at is null and vi.package_id = mp.id;

  for l in
    select sl.qty, sl.product_id, sl.variant_id from public.sale_lines sl
    join public.products p on p.id = sl.product_id
    where sl.sale_id = p_sale_id and sl.kind <> 'day_pass' and p.track_stock
  loop
    if l.variant_id is not null then
      update public.product_variants set stock = stock + l.qty where id = l.variant_id;
    else
      update public.products set stock = stock + l.qty where id = l.product_id;
    end if;
  end loop;

  update public.visits
  set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
  where sale_id = p_sale_id and cancelled_at is null;

  insert into public.staff_actions (actor_id, member_id, action, detail)
  values (auth.uid(), v.member_id, 'void_sale',
    jsonb_build_object('sale_id', v.id, 'receipt_no', v.receipt_no, 'total', v.total, 'reason', btrim(p_reason)));
end;
$$;

-- A check-in that came from a bill is undone by voiding the bill (so the
-- money and stock go back too).
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
  if v.sale_id is not null then
    raise exception 'void_bill_instead';
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

revoke execute on function public.pos_quote(uuid, text, jsonb, text) from public, anon;
revoke execute on function public.pos_checkout(uuid, text, jsonb, text, text, text) from public, anon;
revoke execute on function public.pos_void_sale(uuid, text) from public, anon;
grant execute on function public.pos_quote(uuid, text, jsonb, text) to authenticated;
grant execute on function public.pos_checkout(uuid, text, jsonb, text, text, text) to authenticated;
grant execute on function public.pos_void_sale(uuid, text) to authenticated;
grant execute on function public.day_type(date) to authenticated;

-- 19. Back Office settings + staff access (v0.20.3).
--
-- One row of switches an admin changes in Back Office › Settings, plus a
-- list of staff allowed to use the front desk from their own phone (e.g. a
-- shift lead when the tablet is down). Server (service-role) only.
create table if not exists public.app_settings (
  id integer primary key default 1 check (id = 1),
  staff_desk_on_phone boolean not null default false,   -- all staff may sell from their own phone
  staff_members_on_tablet boolean not null default true, -- staff see the member list (read-only) on a tablet
  staff_idle_minutes integer not null default 10 check (staff_idle_minutes between 1 and 60),
  admin_idle_minutes integer not null default 5 check (admin_idle_minutes between 1 and 60),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

create table if not exists public.staff_phone_access (
  staff_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);

alter table public.staff_phone_access enable row level security;
revoke all on public.staff_phone_access from anon, authenticated;

-- Takings are admin business: staff sell through pos_* (security definer)
-- and never need to read bills directly.
drop policy if exists "Staff read" on public.sales;
drop policy if exists "Admins read" on public.sales;
create policy "Admins read" on public.sales for select to authenticated using (public.is_admin());
drop policy if exists "Staff read" on public.sale_lines;
drop policy if exists "Admins read" on public.sale_lines;
create policy "Admins read" on public.sale_lines for select to authenticated using (public.is_admin());

-- 20. Clock out by card on the tablet lock screen (v0.21).
alter table public.time_entries drop constraint if exists time_entries_out_method_check;
alter table public.time_entries add constraint time_entries_out_method_check check (out_method in ('button', 'admin', 'card'));

-- 21. Packages (v0.22). A product of kind 'package' sells a bundle of visits
-- (e.g. 10 visits in 90 days) or unlimited visits for a number of days
-- (1 month = 30 days). Every rule is set per package by an admin in
-- Products & prices. Each sale copies the rules into member_packages, so a
-- later edit never changes what someone already bought. Checking in with a
-- package is a Day Pass at 0 THB that uses one visit.
alter table public.products drop constraint if exists products_kind_check;
alter table public.products add constraint products_kind_check
  check (kind in ('day_pass', 'addon', 'merch', 'souvenir', 'package'));
alter table public.products add column if not exists pkg_visits integer check (pkg_visits between 1 and 1000); -- null = unlimited
alter table public.products add column if not exists pkg_days integer check (pkg_days between 1 and 3650);
alter table public.products add column if not exists pkg_start text not null default 'purchase' check (pkg_start in ('purchase', 'first_use'));
alter table public.products add column if not exists pkg_activate_days integer not null default 90 check (pkg_activate_days between 1 and 3650);
alter table public.products add column if not exists pkg_weekday_only boolean not null default false;
alter table public.products add column if not exists pkg_earns_stamp boolean not null default false;
alter table public.products drop constraint if exists products_package_days;
alter table public.products add constraint products_package_days check (kind <> 'package' or pkg_days is not null);

create table if not exists public.member_packages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  sale_line_id bigint references public.sale_lines(id) on delete set null,
  name text not null,
  visits_total integer check (visits_total >= 1),        -- null = unlimited
  visits_used integer not null default 0 check (visits_used >= 0),
  valid_days integer not null check (valid_days >= 1),
  weekday_only boolean not null default false,
  earns_stamp boolean not null default false,
  starts_on date,                                         -- null until first use ("first_use" packages)
  expires_on date,
  activate_by date,                                       -- first_use: must start by this day
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancel_reason text
);
create index if not exists member_packages_member_idx on public.member_packages (member_id);

-- Sharing (§23) — declared here because usable_package below reads them.
alter table public.products add column if not exists pkg_shareable boolean not null default false;
alter table public.member_packages add column if not exists shareable boolean not null default false;
-- v0.22.3: two ways to share, set per product:
--  · one visit at a time (default) — the friend's visits are their own small
--    package (shared_from = the owner's); the owner's visits_given counts
--    what they've handed out (left = total - used - given).
--  · the whole package (share_whole; family, couples) — friends join the
--    package and everyone uses the same count (package_shares). Works for
--    unlimited passes too.
alter table public.products add column if not exists pkg_share_whole boolean not null default false;
alter table public.member_packages add column if not exists share_whole boolean not null default false;
alter table public.member_packages add column if not exists visits_given integer not null default 0 check (visits_given >= 0);
alter table public.member_packages add column if not exists shared_from uuid references public.member_packages(id) on delete set null;
create index if not exists member_packages_shared_from_idx on public.member_packages (shared_from) where shared_from is not null;
create table if not exists public.package_shares (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.member_packages(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,  -- the friend
  invite_id uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists package_shares_one_active on public.package_shares (package_id, member_id) where revoked_at is null;
create index if not exists package_shares_member_idx on public.package_shares (member_id) where revoked_at is null;

alter table public.member_packages enable row level security;
revoke insert, update, delete on public.member_packages from anon, authenticated;
drop policy if exists "Packages: own or staff" on public.member_packages;
create policy "Packages: own or staff" on public.member_packages for select to authenticated
  using (member_id = auth.uid() or public.is_staff());

alter table public.visits drop constraint if exists visits_entry_type_check;
alter table public.visits add constraint visits_entry_type_check check (entry_type in ('paid', 'reward', 'package'));
alter table public.visits add column if not exists package_id uuid references public.member_packages(id) on delete set null;

-- The package a check-in on p_date would use: still has visits, in date,
-- allowed on that kind of day. One already running before one that would
-- start now; then the one that runs out soonest.
create or replace function public.usable_package(p_member_id uuid, p_date date)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.member_packages
  where (member_id = p_member_id
         or (shareable and share_whole and id in (select package_id from public.package_shares
                                                  where member_id = p_member_id and revoked_at is null)))
    and cancelled_at is null
    and (visits_total is null or visits_used + visits_given < visits_total)
    and (starts_on is null or starts_on <= p_date)
    and (expires_on is null or expires_on >= p_date)
    and (activate_by is null or starts_on is not null or activate_by >= p_date)
    and (not weekday_only or public.day_type(p_date) = 'weekday')
  order by member_id <> p_member_id, starts_on is null, coalesce(expires_on, activate_by), created_at
  limit 1;
$$;
revoke execute on function public.usable_package(uuid, date) from public, anon;
grant execute on function public.usable_package(uuid, date) to authenticated;


-- 22. Back in the same day (v0.22.1). A Day Pass covers the whole day: a
-- member who checked out (lunch, an errand) can come back in at no charge,
-- no extra package visit and no extra stamp. The same visit is reopened;
-- the earlier check-out time is kept in staff_actions.
create or replace function public.staff_reenter_visit(p_visit_id uuid)
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
  if v.checked_out_at is null then
    raise exception 'still_inside';
  end if;
  if v.visit_date <> public.bkk_today() then
    raise exception 'not_today';
  end if;
  update public.visits set checked_out_at = null, checked_out_by = null where id = p_visit_id;
  insert into public.staff_actions (actor_id, member_id, visit_id, action, detail)
  values (auth.uid(), v.member_id, p_visit_id, 're_enter', jsonb_build_object('was_out_at', v.checked_out_at));
end;
$$;
revoke execute on function public.staff_reenter_visit(uuid) from public, anon;
grant execute on function public.staff_reenter_visit(uuid) to authenticated;

-- 23. Sharing a package with friends (v0.22.2; two ways since v0.22.3).
-- If the product allows it (Products › package › sharing), the owner sends
-- a link by email or shows it as a QR; a friend opens it while signed in.
--  · One visit at a time: each link hands ONE visit to the friend. It leaves
--    the owner's count straight away and becomes the friend's own (a small
--    package with shared_from set, same end date, no stamps). The owner can
--    take back visits the friend hasn't used yet. Set numbers of visits only.
--  · Whole package (family, couples): the friend joins the package and
--    everyone uses the same count/pass; the owner can remove them any time.
-- Only the owner earns stamps. Shares made with v0.22.2 on a package set to
-- one-visit sharing become one visit each at the end of this section.
-- Invites and shares are written by the server (service role) only.
alter table public.package_shares enable row level security;
revoke all on public.package_shares from anon, authenticated;

create table if not exists public.package_share_invites (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.member_packages(id) on delete cascade,
  token_hash text not null unique,
  email text,
  expires_at timestamptz not null,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.package_share_invites enable row level security;
revoke all on public.package_share_invites from anon, authenticated;

-- Every share, in order (v0.22.4) — "where did my visit go?". Given /
-- taken back (one-visit sharing), joined / removed (whole package), and
-- given visits cancelled with the bill. Admins read it on Members › one
-- member; written by the functions below and the server only.
create table if not exists public.package_share_events (
  id bigint generated always as identity primary key,
  package_id uuid references public.member_packages(id) on delete cascade, -- the owner's package
  piece_id uuid references public.member_packages(id) on delete set null,  -- the friend's visits (one-visit sharing)
  owner_id uuid references auth.users(id) on delete set null,
  friend_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('give', 'take_back', 'join', 'remove', 'cancelled')),
  visits integer,
  via text check (via in ('qr', 'email')),
  actor uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists package_share_events_owner_idx on public.package_share_events (owner_id, created_at desc);
create index if not exists package_share_events_friend_idx on public.package_share_events (friend_id, created_at desc);
alter table public.package_share_events enable row level security;
revoke all on public.package_share_events from anon, authenticated;
grant select on public.package_share_events to authenticated;
drop policy if exists "Share events: admins" on public.package_share_events;
create policy "Share events: admins" on public.package_share_events for select to authenticated
  using (public.is_admin());

-- Hand one visit of p_package_id to p_friend (called by the server after
-- it has checked the invite). Returns the friend's package.
drop function if exists public.package_share_split(uuid, uuid);
create or replace function public.package_share_split(p_package_id uuid, p_friend uuid, p_via text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_product uuid;
  v_name text;
  v_total int;
  v_used int;
  v_given int;
  v_days int;
  v_weekday boolean;
  v_shareable boolean;
  v_whole boolean;
  v_cancelled timestamptz;
  v_starts date;
  v_expires date;
  v_activate date;
  v_from uuid;
  v_today date := public.bkk_today();
  v_piece uuid;
begin
  select member_id, product_id, name, visits_total, visits_used, visits_given, valid_days, weekday_only,
         shareable, share_whole, cancelled_at, starts_on, expires_on, activate_by, shared_from
    into v_owner, v_product, v_name, v_total, v_used, v_given, v_days, v_weekday,
         v_shareable, v_whole, v_cancelled, v_starts, v_expires, v_activate, v_from
  from public.member_packages where id = p_package_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_owner = p_friend then
    raise exception 'own_package';
  end if;
  if not v_shareable or v_whole or v_from is not null or v_cancelled is not null or v_total is null
     or v_used + v_given >= v_total
     or (v_expires is not null and v_expires < v_today)
     or (v_starts is null and v_activate is not null and v_activate < v_today) then
    raise exception 'not_shareable';
  end if;
  -- The friend's visit lasts no longer than the package itself could.
  v_expires := coalesce(v_expires, greatest(coalesce(v_activate, v_today), v_today) + v_days - 1);

  select id into v_piece from public.member_packages
  where shared_from = p_package_id and member_id = p_friend and cancelled_at is null and expires_on >= v_today
  order by created_at desc limit 1
  for update;
  if found then
    update public.member_packages set visits_total = visits_total + 1, expires_on = v_expires where id = v_piece;
  else
    insert into public.member_packages (
      member_id, product_id, name, visits_total, visits_used, valid_days, weekday_only, earns_stamp,
      starts_on, expires_on, shareable, shared_from
    ) values (
      p_friend, v_product, v_name, 1, 0, greatest(v_expires - v_today + 1, 1), v_weekday, false,
      v_today, v_expires, false, p_package_id
    ) returning id into v_piece;
  end if;
  update public.member_packages set visits_given = visits_given + 1 where id = p_package_id;
  insert into public.package_share_events (package_id, piece_id, owner_id, friend_id, action, visits, via, actor)
  values (p_package_id, v_piece, v_owner, p_friend, 'give', 1, p_via, p_friend);
  return v_piece;
end;
$$;
revoke execute on function public.package_share_split(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.package_share_split(uuid, uuid, text) to service_role;

-- The owner takes back the visits a friend hasn't used. Returns how many.
drop function if exists public.package_share_revoke(uuid);
create or replace function public.package_share_revoke(p_piece_id uuid, p_actor uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from uuid;
  v_friend uuid;
  v_total int;
  v_used int;
  v_back int;
begin
  select shared_from, member_id, visits_total, visits_used into v_from, v_friend, v_total, v_used
  from public.member_packages where id = p_piece_id and cancelled_at is null for update;
  if not found or v_from is null then
    raise exception 'not_found';
  end if;
  v_back := v_total - v_used;
  if v_back <= 0 then
    raise exception 'nothing_left';
  end if;
  update public.member_packages set visits_given = greatest(visits_given - v_back, 0) where id = v_from;
  if v_used = 0 then
    update public.member_packages
    set cancelled_at = now(), cancel_reason = 'returned to owner'
    where id = p_piece_id;
  else
    update public.member_packages set visits_total = v_used where id = p_piece_id;
  end if;
  insert into public.package_share_events (package_id, piece_id, owner_id, friend_id, action, visits, actor)
  select v_from, p_piece_id, member_id, v_friend, 'take_back', v_back, p_actor
  from public.member_packages where id = v_from;
  return v_back;
end;
$$;
revoke execute on function public.package_share_revoke(uuid, uuid) from public, anon, authenticated;
grant execute on function public.package_share_revoke(uuid, uuid) to service_role;

-- One member's packages for display: their own (including visits a friend
-- handed them) and whole packages shared with them, with the owner's first
-- name; for the owner, who they share with — kind 'piece' (visits handed
-- over: total/used) or 'member' (on the whole package).
drop function if exists public.member_package_list(uuid);
create or replace function public.member_package_list(p_member_id uuid)
returns table (
  id uuid, name text, visits_total int, visits_used int, visits_given int, starts_on date, expires_on date,
  activate_by date, weekday_only boolean, cancelled boolean, created_at timestamptz,
  shareable boolean, share_whole boolean, is_owner boolean, owner_name text, shared_with jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    mp.id, mp.name, mp.visits_total, mp.visits_used, mp.visits_given, mp.starts_on, mp.expires_on,
    mp.activate_by, mp.weekday_only, mp.cancelled_at is not null, mp.created_at,
    mp.shareable, mp.share_whole, mp.member_id = p_member_id and mp.shared_from is null,
    case
      when mp.member_id <> p_member_id then (select first_name from public.profiles where id = mp.member_id)
      when mp.shared_from is not null then (
        select pr.first_name from public.member_packages o join public.profiles pr on pr.id = o.member_id
        where o.id = mp.shared_from)
    end,
    case when mp.member_id = p_member_id then coalesce((
      select jsonb_agg(x.j order by x.at) from (
        select f.created_at as at, jsonb_build_object(
          'id', f.id, 'kind', 'piece',
          'name', coalesce(nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''), pr.member_no),
          'total', f.visits_total, 'used', f.visits_used, 'expiresOn', f.expires_on) as j
        from public.member_packages f join public.profiles pr on pr.id = f.member_id
        where f.shared_from = mp.id and f.cancelled_at is null
        union all
        select ps.created_at, jsonb_build_object(
          'id', ps.id, 'kind', 'member',
          'name', coalesce(nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''), pr.member_no))
        from public.package_shares ps join public.profiles pr on pr.id = ps.member_id
        where ps.package_id = mp.id and ps.revoked_at is null and mp.share_whole
      ) x
    ), '[]'::jsonb) else '[]'::jsonb end
  from public.member_packages mp
  where (p_member_id = auth.uid() or public.is_staff())
    and (mp.member_id = p_member_id
         or (mp.share_whole and mp.id in (select package_id from public.package_shares
                                          where member_id = p_member_id and revoked_at is null)))
  order by mp.created_at desc;
$$;
revoke execute on function public.member_package_list(uuid) from public, anon;
grant execute on function public.member_package_list(uuid) to authenticated;

-- v0.22.2 shares on packages set to one-visit sharing → one visit each,
-- while visits are left.
do $$
declare
  r record;
begin
  for r in
    select ps.id, ps.package_id, ps.member_id from public.package_shares ps
    join public.member_packages mp on mp.id = ps.package_id
    where ps.revoked_at is null and not mp.share_whole
    order by ps.created_at
  loop
    begin
      perform public.package_share_split(r.package_id, r.member_id);
    exception when others then
      null; -- nothing left to hand over
    end;
    update public.package_shares set revoked_at = now() where id = r.id;
  end loop;
end;
$$;



-- 24. Sales report (v0.23). Back Office › Reports reads the bills, visits
-- and packages already stored here (service role, admins only). The only
-- new setting: whether the business is VAT registered — prices include 7%
-- VAT and the report splits it out (amount × 7/107).
alter table public.app_settings add column if not exists vat_registered boolean not null default false;


-- 25. Leave requests (v0.24). Staff ask for days off from their phone
-- (My account › My shifts); an admin approves or declines in Back Office ›
-- Time › Leave. Approving marks those days "day off" on the roster.
-- Full days only. Rules (notice, which kinds, yearly quotas) live in
-- app_settings; a quota of 0 means no limit. Written by the server only.
alter table public.app_settings add column if not exists leave_notice_days integer not null default 3 check (leave_notice_days between 0 and 60);
alter table public.app_settings add column if not exists leave_vacation boolean not null default true;
alter table public.app_settings add column if not exists leave_sick boolean not null default true;
alter table public.app_settings add column if not exists leave_personal boolean not null default true;
alter table public.app_settings add column if not exists leave_quota_vacation integer not null default 0 check (leave_quota_vacation between 0 and 366);
alter table public.app_settings add column if not exists leave_quota_sick integer not null default 0 check (leave_quota_sick between 0 and 366);
alter table public.app_settings add column if not exists leave_quota_personal integer not null default 0 check (leave_quota_personal between 0 and 366);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  days integer not null check (days between 1 and 60),
  kind text not null check (kind in ('vacation', 'sick', 'personal')),
  reason text check (char_length(reason) <= 300),
  doc_path text,                                   -- e.g. a doctor's note (bucket leave-docs)
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  constraint leave_requests_dates check (end_date >= start_date)
);
create index if not exists leave_requests_staff_idx on public.leave_requests (staff_id, start_date);
create index if not exists leave_requests_status_idx on public.leave_requests (status, start_date);

alter table public.leave_requests enable row level security;
revoke insert, update, delete on public.leave_requests from anon, authenticated;
drop policy if exists "Leave: own or admin" on public.leave_requests;
create policy "Leave: own or admin" on public.leave_requests for select to authenticated
  using (staff_id = auth.uid() or public.is_admin());

-- Attachments: private, read through short-lived links made by the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leave-docs', 'leave-docs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- 26. Monthly roster (v0.25). Back Office › Time › Roster shows a whole
-- month: each shift as a short code on its own colour, and a warning on days
-- with fewer people working than the minimum below (0 = no warning).
alter table public.shift_templates add column if not exists short_code text check (short_code is null or char_length(btrim(short_code)) between 1 and 3);
alter table public.shift_templates add column if not exists color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.time_settings add column if not exists min_staff_per_day integer not null default 0 check (min_staff_per_day between 0 and 50);


-- 27. Several shifts a day (v0.26). A person may be on more than one shift
-- on the same day (e.g. morning and evening); still one row per shift, and
-- a day off is a single row of its own (the server keeps the two apart).
-- Clock-ins are matched to the shift that starts nearest to them.
alter table public.shift_assignments drop constraint if exists shift_assignments_one_per_day;
create unique index if not exists shift_assignments_one_per_shift
  on public.shift_assignments (staff_id, work_date, coalesce(template_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists shift_assignments_staff_date_idx on public.shift_assignments (staff_id, work_date);


-- 28. Pay type and pay periods (v0.28). Each team member is paid by the day
-- or by the month (the time report splits them, since the two are counted
-- differently). Only the type is kept here — no rates or salaries.
-- Server (service-role) only.
create table if not exists public.staff_pay (
  staff_id uuid primary key references auth.users(id) on delete cascade,
  pay_type text not null check (pay_type in ('daily', 'monthly')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.staff_pay enable row level security;
revoke all on public.staff_pay from anon, authenticated;

-- Where each pay period ends (Settings › Work time & leave):
--   monthly_cutoff_day  0 = last day of the month, 1–28 = that day
--                       (e.g. 25 → the 26th of last month to the 25th)
--   daily_cycle         'weekly' (ends on daily_week_end, 0 = Sunday … 6),
--                       'half' (1–15 and 16–end), or 'monthly' (as above)
alter table public.app_settings add column if not exists monthly_cutoff_day integer not null default 0 check (monthly_cutoff_day between 0 and 28);
alter table public.app_settings add column if not exists daily_cycle text not null default 'half' check (daily_cycle in ('weekly', 'half', 'monthly'));
alter table public.app_settings add column if not exists daily_week_end integer not null default 0 check (daily_week_end between 0 and 6);


-- 29. Staff checklists by QR (v0.29). Admins set up check points (a QR
-- sticker at each place, with the things to tick or note there) and rounds
-- (which points, when). Staff scan the points with their own phone; every
-- scan is kept as a log that is never edited. A round is done when each of
-- its points was scanned inside the round's time window, by anyone.
-- Server (service-role) only.
create table if not exists public.checklist_points (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  place text check (char_length(place) <= 120),          -- where the sticker is
  items jsonb not null default '[]'::jsonb,               -- [{id, label, kind: check|number|text, unit, min, max}]
  code_version integer not null default 1,                -- reprint = +1, old stickers stop working
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.checklist_points enable row level security;
revoke all on public.checklist_points from anon, authenticated;

create table if not exists public.checklist_rounds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  point_ids uuid[] not null default '{}',
  kind text not null default 'daily' check (kind in ('daily', 'every', 'anytime')),
  start_time time,                                        -- daily: window start · every: first slot
  end_time time,                                          -- daily: window end · every: last slot ends by
  every_minutes integer check (every_minutes is null or every_minutes between 30 and 720),
  days smallint[] not null default '{0,1,2,3,4,5,6}',     -- 0 = Sunday
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.checklist_rounds enable row level security;
revoke all on public.checklist_rounds from anon, authenticated;

create table if not exists public.checklist_scans (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references public.checklist_points(id) on delete restrict,
  staff_id uuid not null references auth.users(id) on delete restrict,
  scanned_at timestamptz not null default now(),
  results jsonb not null default '[]'::jsonb,             -- [{id, label, value}] as answered
  note text check (char_length(note) <= 500),
  issue boolean not null default false,                   -- "something's wrong here"
  flags text[] not null default '{}',                     -- fast, out_of_range, missed_items
  user_agent text check (char_length(user_agent) <= 300)
);
create index if not exists checklist_scans_at_idx on public.checklist_scans (scanned_at desc);
create index if not exists checklist_scans_point_idx on public.checklist_scans (point_id, scanned_at desc);
create index if not exists checklist_scans_staff_idx on public.checklist_scans (staff_id, scanned_at desc);
alter table public.checklist_scans enable row level security;
revoke all on public.checklist_scans from anon, authenticated;
