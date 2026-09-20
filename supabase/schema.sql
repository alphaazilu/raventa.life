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
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now()
);

-- Safe to re-run: adds these columns to an install that ran an earlier
-- version of this file without them.
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists province text;

alter table public.profiles enable row level security;

-- 2. Auto-create a profile row whenever someone signs up (email/password,
--    Google, or Facebook all funnel through auth.users the same way).
--    Email/password signups send first_name/last_name/phone/province via
--    supabase.auth.signUp({ options: { data: { ... } } }). Google sometimes
--    provides given_name/family_name too, so that's used as a fallback —
--    but phone/province are never provided by either OAuth provider, so
--    those accounts land here with an incomplete profile on purpose: the
--    /complete-profile gate (see proxy.ts + app/complete-profile) catches
--    that and makes the user fill in what's missing before using /account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, phone, province)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'given_name'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data ->> 'family_name'),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'province'
  )
  on conflict (id) do update set
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    province = coalesce(excluded.province, public.profiles.province);
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

-- 5. Promote an account to admin (run manually, once, per admin user):
-- update public.profiles set role = 'admin' where email = 'owner@raventa.com';
