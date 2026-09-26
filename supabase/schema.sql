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
create or replace function public.next_member_no()
returns text
language plpgsql
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

-- 7. Promote an account to admin (run manually, once, per admin user):
-- update public.profiles set role = 'admin' where email = 'owner@raventa.com';
