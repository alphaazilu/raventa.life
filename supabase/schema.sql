-- =============================================================================
-- RAVENTA Wellness Back Office — database schema (Supabase / Postgres)
-- =============================================================================
-- One file, safe to run again and again (idempotent): run it whole in the
-- Supabase SQL Editor after every change.
--
-- v0.40 (squash): this file is the CURRENT state. Every table is created with
-- all of its columns; only the last version of each function, policy, index
-- and trigger is kept; one-off data migrations from older versions are gone.
-- The step-by-step history (sections §1–§53 with their ALTERs and data fixes)
-- is in supabase/archive/schema-v0.39.sql — a database still on an older
-- version runs that file first, then this one.
--
-- "§n" in comments points to that history (the code and the vault use the
-- same numbers).
--
-- Layout
--   1. Helpers used by column defaults
--   2. Tables + indexes (in foreign-key order)
--   3. Functions (+ who may execute them)
--   4. Triggers
--   5. Row level security, grants and policies
--   6. Storage buckets and their policies
--   7. Seed rows
--
-- Adding something new: append it in the right part below (a new table goes
-- at the end of part 2 with ALL its columns; a later column on an existing
-- table needs BOTH the column in its CREATE TABLE and an
-- "alter table … add column if not exists" line at the end of part 2, so
-- existing databases get it too).
-- =============================================================================

-- =============================================================================
-- 1. Helpers used by column defaults
-- =============================================================================

-- Running 10-digit membership number (e.g. "0000000001"). The column
-- DEFAULT does the actual number-generation, so every future insert gets
-- one automatically — the trigger below, and the upsert in
-- app/complete-profile/actions.ts, both insert without mentioning this
-- column on purpose, so the default applies and an ON CONFLICT UPDATE
-- never overwrites an already-assigned number.
create sequence if not exists public.member_no_seq;

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

-- Bangkok calendar day — a visit at 00:30 belongs to that day, not UTC's.
create or replace function public.bkk_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Bangkok')::date;
$$;

-- =============================================================================
-- 2. Tables + indexes (foreign-key order)
-- =============================================================================

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
  role text not null default 'customer' check (role in ('customer', 'staff', 'admin', 'accountant')),
  created_at timestamptz not null default now(),
  member_no text unique default public.next_member_no(),
  -- 8. LINE user ID ("U…"), for messaging a member through the LINE Official
  -- Account later (welcome/booking messages, per-member rich menus). It's the
  -- same ID LINE gives the OA only if the OA's Messaging API channel sits
  -- under the same LINE Developers provider as the LINE Login channel.
  --
  -- Filled in by the app (app/auth/callback and app/complete-profile) from
  -- the account's own LINE identity. One LINE account → one member.
  line_user_id text,
  -- 10. Profile photos. Members can upload their own photo; it's stored in a
  -- PRIVATE Storage bucket (a face is personal data under PDPA), so no one can
  -- open it by URL alone — the site hands out short-lived signed links only to
  -- the member themself and to admins.
  --
  -- avatar_path          = uploaded photo, "<user id>/<file>" in bucket avatars
  -- provider_avatar_url  = picture from LINE/Google, refreshed on each sign-in
  -- Shown in that order; with neither, the site shows the name's first letter.
  avatar_path text,
  provider_avatar_url text,
  -- Whether the member has set a password (Supabase never exposes that). Set
  -- by the app after a password is saved; email/password signups count too
  -- (the settings page also checks their email identity).
  has_password boolean not null default false,
  constraint profiles_avatar_path_own_folder check (avatar_path is null or avatar_path like (id::text || '/%'))
);
create unique index if not exists profiles_line_user_id_key
  on public.profiles (line_user_id)
  where line_user_id is not null;

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

-- 37. Product categories and sale types (v0.37). Categories are admin-named
-- groups — all of them can be renamed, reordered or removed; they only group
-- products (product list, counter, reports) and can carry a commission rate
-- for everything in them. What happens when a product is sold is its *sale
-- type*, set on the product: an item / service (the bill is all), an entry
-- (checks the guest in — the Day Pass), or a package (visits kept on the
-- member's account). In the database the sale type is still products.kind
-- (day_pass / package / the others = item). The admin can rename the three
-- sale types and hide ones a business doesn't use (app_settings.sale_types).
-- The old kinds become starting categories and products move in (once).
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  legacy_kind text unique check (legacy_kind in ('day_pass', 'package', 'addon', 'merch', 'souvenir')),  -- made from an old kind
  name_th text not null check (char_length(btrim(name_th)) between 1 and 40),
  name_en text not null default '' check (char_length(name_en) <= 40),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

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
  kind text not null check (kind in ('day_pass', 'addon', 'merch', 'souvenir', 'package')),
  name_th text not null check (char_length(btrim(name_th)) between 1 and 60),
  name_en text not null default '' check (char_length(name_en) <= 60),
  price_weekday integer not null check (price_weekday between 0 and 1000000),
  price_weekend integer check (price_weekend between 0 and 1000000),  -- null = weekday price
  price_holiday integer check (price_holiday between 0 and 1000000),  -- null = weekend price
  track_stock boolean not null default false,
  stock integer not null default 0 check (stock >= 0),  -- used when there are no variants
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 21. Packages (v0.22). A product of kind 'package' sells a bundle of visits
  -- (e.g. 10 visits in 90 days) or unlimited visits for a number of days
  -- (1 month = 30 days). Every rule is set per package by an admin in
  -- Products & prices. Each sale copies the rules into member_packages, so a
  -- later edit never changes what someone already bought. Checking in with a
  -- package is a Day Pass at 0 THB that uses one visit.
  pkg_visits integer check (pkg_visits between 1 and 1000),
  -- null = unlimited
  pkg_days integer check (pkg_days between 1 and 3650),
  pkg_start text not null default 'purchase' check (pkg_start in ('purchase', 'first_use')),
  pkg_activate_days integer not null default 90 check (pkg_activate_days between 1 and 3650),
  pkg_weekday_only boolean not null default false,
  pkg_earns_stamp boolean not null default false,
  -- Sharing (§23) — declared here because usable_package below reads them.
  pkg_shareable boolean not null default false,
  -- v0.22.3: two ways to share, set per product:
  --  · one visit at a time (default) — the friend's visits are their own small
  --    package (shared_from = the owner's); the owner's visits_given counts
  --    what they've handed out (left = total - used - given).
  --  · the whole package (share_whole; family, couples) — friends join the
  --    package and everyone uses the same count (package_shares). Works for
  --    unlimited passes too.
  pkg_share_whole boolean not null default false,
  category_id uuid references public.product_categories(id) on delete set null,
  -- 43. Hide / delete a product (v0.37.6). A product that was never sold (no
  -- bill line, not inside a package, not an entry a package covers) can be
  -- deleted outright. One that has history is hidden instead (hidden = true):
  -- gone from the product list and the counter, but its old bills and reports
  -- still read the name stored on each sale line. Nothing here is destructive
  -- to past sales.
  hidden boolean not null default false,
  -- 51. Lendable items (v0.38.11). An item can be marked "lendable" so staff can
  -- hand it to a customer on the spot (a towel, a lock, a yoga mat) — a loan not
  -- tied to a product's includes. It comes back at check-out like any other loan.
  lendable boolean not null default false,
  constraint products_package_days check (kind <> 'package' or pkg_days is not null)
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind text not null check (kind in ('pct', 'thb')),
  value integer not null check (value > 0),
  scope text not null default 'all',
  product_id uuid references public.products(id) on delete cascade,
  code text check (code is null or code ~ '^[A-Z0-9]{3,20}$'),
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint promotions_pct_max check (kind <> 'pct' or value <= 100),
  constraint promotions_dates check (starts_on is null or ends_on is null or starts_on <= ends_on),
  constraint promotions_scope_allowed check (scope in ('all', 'day_pass', 'product', 'custom'))
);
create unique index if not exists promotions_code_idx on public.promotions (code) where code is not null;

-- 46. Branches (v0.38, step 1). The shop can have more than one branch. This
-- step only introduces the list; nothing is scoped to a branch yet (that
-- comes next). One "main" branch is seeded so existing data has a home.
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  -- 50. Branch hierarchy (v0.38.8). A branch can sit under a group (a region or
  -- province) and groups can nest, so the org reads company → region/province →
  -- branch. The company itself is the fixed root in the UI, not a row here.
  -- 'group' nodes are organisational only (no sales, stock, price or tablets);
  -- 'branch' nodes are the real ones everything else already points at.
  parent_id uuid references public.branches(id) on delete set null,
  kind text not null default 'branch' check (kind in ('group', 'branch')),
  constraint branches_parent_not_self check (parent_id is null or parent_id <> id)
);
create index if not exists branches_parent_idx on public.branches (parent_id);

-- 47. Branch scoping (v0.38, step 2). Every sale, visit and cash drawer is now
-- tagged with the branch it happened at. An admin assigns each tablet to a
-- branch (devices.branch_id); the counter stamps that branch onto what it
-- rings up (done in the server action, right after the row is created, so the
-- big checkout/check-in functions keep their signatures). Existing rows and
-- single-branch shops fall back to the main branch, so nothing breaks. The
-- "one open cash drawer" rule becomes one open drawer per branch.

-- The "home" branch: the lowest-sort active branch (any branch if none is
-- active). Used as the column default so a shop that never touches branches
-- keeps working, and as the fallback when a tablet has no branch set.

-- Only real branches (not groups) take part in sales — tighten main_branch so a
-- group is never picked as the default.
create or replace function public.main_branch()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.branches
  where kind = 'branch'
  order by (not is_active), sort, created_at
  limit 1
$$;
revoke execute on function public.main_branch() from public, anon;
grant execute on function public.main_branch() to authenticated;

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
  branch_id uuid default public.main_branch() references public.branches(id) on delete set null,
  constraint sales_total check (total = subtotal - discount),
  constraint sales_method check (total = 0 or payment_method is not null)
);
create index if not exists sales_date_idx on public.sales (sale_date);
create index if not exists sales_created_idx on public.sales (created_at);
create index if not exists sales_voided_idx on public.sales (voided_at) where voided_at is not null;
-- New rows get the main branch unless the caller sets one.

-- Give every existing row a home.
create index if not exists sales_branch_idx  on public.sales (branch_id);

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
  visit_id uuid
);
create index if not exists sale_lines_sale_idx on public.sale_lines (sale_id);

create table if not exists public.member_packages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  sale_line_id bigint references public.sale_lines(id) on delete set null,
  name text not null,
  visits_total integer check (visits_total >= 1),  -- null = unlimited
  visits_used integer not null default 0 check (visits_used >= 0),
  valid_days integer not null check (valid_days >= 1),
  weekday_only boolean not null default false,
  earns_stamp boolean not null default false,
  starts_on date,  -- null until first use ("first_use" packages)
  expires_on date,
  activate_by date,  -- first_use: must start by this day
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancel_reason text,
  shareable boolean not null default false,
  share_whole boolean not null default false,
  visits_given integer not null default 0 check (visits_given >= 0),
  shared_from uuid references public.member_packages(id) on delete set null,
  -- 41. Entries of several kinds, and packages without entry (v0.37.4).
  -- · More than one entry product (adult / child / half day …): the counter
  --   picks which one; the first (by order) is the default and its price is
  --   day_pass_price(). A package covers the entry it lists (package_items).
  -- · A package may hold no entry at all (10 massages): it never checks
  --   anyone in (no_entry), only its other items are used.
  no_entry boolean not null default false,
  entry_id uuid references public.products(id) on delete set null
);
create index if not exists member_packages_member_idx on public.member_packages (member_id);
create index if not exists member_packages_shared_from_idx on public.member_packages (shared_from) where shared_from is not null;

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  -- set null (not cascade) so deleting a member never erases takings;
  -- member_no is kept as a snapshot for the same reason.
  member_id uuid references auth.users(id) on delete set null,
  member_no text,
  visit_date date not null default public.bkk_today(),
  entry_type text not null check (entry_type in ('paid', 'reward', 'package')),
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
  sale_id uuid references public.sales(id) on delete set null,
  package_id uuid references public.member_packages(id) on delete set null,
  -- 44. Locker number + checking lent items back at check-out (v0.37.8+). The
  -- counter writes a locker number at check-in (like the wristband). At
  -- check-out the staff tick which lent items came back; the rest stay
  -- outstanding, or are charged on a small sale (the item's price today).
  -- pos_checkout above now also takes p_locker; the 7-arg version is dropped.
  locker text,
  branch_id uuid default public.main_branch() references public.branches(id) on delete set null,
  check ((entry_type = 'paid') = (payment_method is not null))
);
-- One (uncancelled) visit per member per day — which also caps stamps at
-- one a day.
create unique index if not exists visits_one_per_day
  on public.visits (member_id, visit_date)
  where cancelled_at is null;
create index if not exists visits_date_idx on public.visits (visit_date);
create index if not exists visits_branch_idx on public.visits (branch_id);

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
  revoked_by uuid references auth.users(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null
);

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
  out_method text check (out_method in ('button', 'admin', 'card')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_out_after_in check (clock_out is null or clock_out > clock_in)
);
-- At most one open entry per person.
create unique index if not exists time_entries_one_open_idx
  on public.time_entries (staff_id) where clock_out is null;
create index if not exists time_entries_in_idx on public.time_entries (clock_in desc);

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
  end_time time not null,  -- earlier than start = ends next day
  break_minutes integer not null default 0 check (break_minutes between 0 and 240),
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  -- 26. Monthly roster (v0.25). Back Office › Time › Roster shows a whole
  -- month: each shift as a short code on its own colour, and a warning on days
  -- with fewer people working than the minimum below (0 = no warning).
  short_code text check (short_code is null or char_length(btrim(short_code)) between 1 and 3),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint shift_templates_not_zero check (start_time <> end_time)
);

create table if not exists public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  template_id uuid references public.shift_templates(id) on delete restrict,
  day_off boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint shift_assignments_shift_or_off check ((template_id is not null) <> day_off)
);
create index if not exists shift_assignments_date_idx on public.shift_assignments (work_date);
-- 27. Several shifts a day (v0.26). A person may be on more than one shift
-- on the same day (e.g. morning and evening); still one row per shift, and
-- a day off is a single row of its own (the server keeps the two apart).
-- Clock-ins are matched to the shift that starts nearest to them.
create unique index if not exists shift_assignments_one_per_shift
  on public.shift_assignments (staff_id, work_date, coalesce(template_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists shift_assignments_staff_date_idx on public.shift_assignments (staff_id, work_date);

-- One row of rules.
create table if not exists public.time_settings (
  id integer primary key default 1 check (id = 1),
  late_grace_minutes integer not null default 5 check (late_grace_minutes between 0 and 120),
  ot_min_minutes integer not null default 30 check (ot_min_minutes between 0 and 240),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  min_staff_per_day integer not null default 0 check (min_staff_per_day between 0 and 50)
);

create table if not exists public.holidays (
  day date primary key,
  name text not null check (char_length(btrim(name)) between 1 and 60)
);

-- 19. Back Office settings + staff access (v0.20.3).
--
-- One row of switches an admin changes in Back Office › Settings, plus a
-- list of staff allowed to use the front desk from their own phone (e.g. a
-- shift lead when the tablet is down). Server (service-role) only.
create table if not exists public.app_settings (
  id integer primary key default 1 check (id = 1),
  staff_desk_on_phone boolean not null default false,  -- all staff may sell from their own phone
  staff_members_on_tablet boolean not null default true,  -- staff see the member list (read-only) on a tablet
  staff_idle_minutes integer not null default 10 check (staff_idle_minutes between 1 and 60),
  admin_idle_minutes integer not null default 5 check (admin_idle_minutes between 1 and 60),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  -- 24. Sales report (v0.23). Back Office › Reports reads the bills, visits
  -- and packages already stored here (service role, admins only). The only
  -- new setting: whether the business is VAT registered — prices include 7%
  -- VAT and the report splits it out (amount × 7/107).
  vat_registered boolean not null default false,
  -- 25. Leave requests (v0.24). Staff ask for days off from their phone
  -- (My account › My shifts); an admin approves or declines in Back Office ›
  -- Time › Leave. Approving marks those days "day off" on the roster.
  -- Full days only. Rules (notice, which kinds, yearly quotas) live in
  -- app_settings; a quota of 0 means no limit. Written by the server only.
  leave_notice_days integer not null default 3 check (leave_notice_days between 0 and 60),
  leave_vacation boolean not null default true,
  leave_sick boolean not null default true,
  leave_personal boolean not null default true,
  leave_quota_vacation integer not null default 0 check (leave_quota_vacation between 0 and 366),
  leave_quota_sick integer not null default 0 check (leave_quota_sick between 0 and 366),
  leave_quota_personal integer not null default 0 check (leave_quota_personal between 0 and 366),
  -- Where each pay period ends (Settings › Work time & leave):
  --   monthly_cutoff_day  0 = last day of the month, 1–28 = that day
  --                       (e.g. 25 → the 26th of last month to the 25th)
  --   daily_cycle         'weekly' (ends on daily_week_end, 0 = Sunday … 6),
  --                       'half' (1–15 and 16–end), or 'monthly' (as above)
  monthly_cutoff_day integer not null default 0 check (monthly_cutoff_day between 0 and 28),
  daily_cycle text not null default 'half' check (daily_cycle in ('weekly', 'half', 'monthly')),
  daily_week_end integer not null default 0 check (daily_week_end between 0 and 6),
  -- Settings › Shop & accounts: the float put in the drawer each time, and how
  -- big a difference shows up in the admin's To do box.
  cash_float integer not null default 2000 check (cash_float between 0 and 100000),
  cash_alert integer not null default 100 check (cash_alert between 0 and 100000),
  -- Settings › Shop & accounts: where 5-star members are invited to review.
  google_review_url text check (google_review_url is null or google_review_url ~ '^https://'),
  -- No-show rules (Settings › Bookings).
  booking_late_min integer not null default 15 check (booking_late_min between 0 and 240),
  noshow_window_days integer not null default 60 check (noshow_window_days between 7 and 365),
  noshow_warn numeric(4, 1) not null default 2 check (noshow_warn between 0 and 20),
  noshow_block numeric(4, 1) not null default 3 check (noshow_block between 0 and 20),
  noshow_block_days integer not null default 30 check (noshow_block_days between 1 and 365),
  late_cancel_weight numeric(3, 2) not null default 0.5 check (late_cancel_weight between 0 and 1),
  default_referrer_id uuid references auth.users(id) on delete set null,
  -- Sale type names and which are offered: {"item":{"th":"…","en":"…","on":true}, "entry":…, "package":…}
  sale_types jsonb not null default '{}'::jsonb,
  -- 45. Floor capacity is configurable (v0.37.11). The "in store now X / 40"
  -- cap used by the desk and dashboard is an admin setting, not a fixed 40.
  floor_capacity integer not null default 40 check (floor_capacity between 1 and 10000)
);

create table if not exists public.staff_phone_access (
  staff_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);

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

-- Every share, in order (v0.22.4) — "where did my visit go?". Given /
-- taken back (one-visit sharing), joined / removed (whole package), and
-- given visits cancelled with the bill. Admins read it on Members › one
-- member; written by the functions below and the server only.
create table if not exists public.package_share_events (
  id bigint generated always as identity primary key,
  package_id uuid references public.member_packages(id) on delete cascade,  -- the owner's package
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

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  days integer not null check (days between 1 and 60),
  kind text not null check (kind in ('vacation', 'sick', 'personal')),
  reason text check (char_length(reason) <= 300),
  doc_path text,  -- e.g. a doctor's note (bucket leave-docs)
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  constraint leave_requests_dates check (end_date >= start_date)
);
create index if not exists leave_requests_staff_idx on public.leave_requests (staff_id, start_date);
create index if not exists leave_requests_status_idx on public.leave_requests (status, start_date);

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

-- 29. Staff checklists by QR (v0.29). Admins set up check points (a QR
-- sticker at each place, with the things to tick or note there) and rounds
-- (which points, when). Staff scan the points with their own phone; every
-- scan is kept as a log that is never edited. A round is done when each of
-- its points was scanned inside the round's time window, by anyone.
-- Server (service-role) only.
create table if not exists public.checklist_points (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  place text check (char_length(place) <= 120),  -- where the sticker is
  items jsonb not null default '[]'::jsonb,  -- [{id, label, kind: check|number|text, unit, min, max}]
  code_version integer not null default 1,  -- reprint = +1, old stickers stop working
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checklist_rounds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  point_ids uuid[] not null default '{}',
  kind text not null default 'daily' check (kind in ('daily', 'every', 'anytime')),
  start_time time,  -- daily: window start · every: first slot
  end_time time,  -- daily: window end · every: last slot ends by
  every_minutes integer check (every_minutes is null or every_minutes between 30 and 720),
  days smallint[] not null default '{0,1,2,3,4,5,6}',  -- 0 = Sunday
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checklist_scans (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references public.checklist_points(id) on delete restrict,
  staff_id uuid not null references auth.users(id) on delete restrict,
  scanned_at timestamptz not null default now(),
  results jsonb not null default '[]'::jsonb,  -- [{id, label, value}] as answered
  note text check (char_length(note) <= 500),
  issue boolean not null default false,  -- "something's wrong here"
  flags text[] not null default '{}',  -- fast, out_of_range, missed_items
  user_agent text check (char_length(user_agent) <= 300)
);
create index if not exists checklist_scans_at_idx on public.checklist_scans (scanned_at desc);
create index if not exists checklist_scans_point_idx on public.checklist_scans (point_id, scanned_at desc);
create index if not exists checklist_scans_staff_idx on public.checklist_scans (staff_id, scanned_at desc);

-- 30. Cash drawer and shift close (v0.31). Someone at the counter opens the
-- drawer with the float, then closes it by counting the notes and coins
-- without seeing what should be there (blind count). The server works out
-- what should be there — float + cash bills taken − cash bills voided while
-- the drawer was open — and keeps the difference. A shortfall or surplus
-- needs a reason; a closed count is never changed (an admin adds a review
-- note instead). One drawer open at a time. Server (service-role) only.
--   status  open      drawer in use
--           counted   count sent, waiting for the reason / confirm
--           closed    done
create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'open' check (status in ('open', 'counted', 'closed')),
  opened_at timestamptz not null default now(),
  opened_by uuid references auth.users(id) on delete set null,
  float_amount integer not null check (float_amount between 0 and 1000000),
  counted_at timestamptz,
  counted_by uuid references auth.users(id) on delete set null,
  counted jsonb,  -- {"1000": 3, "500": 4, …} notes and coins
  counted_total integer check (counted_total >= 0),
  expected_cash integer,  -- float + cash in − cash voided, at count time
  cash_in integer,
  cash_out integer,
  transfer_total integer,  -- for the admin to compare with the bank app
  card_total integer,  -- … and with the card machine's slip
  diff integer,  -- counted − expected (minus = short)
  reason text check (char_length(reason) <= 500),
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  device_id uuid,  -- the tablet it was opened on, if any
  reviewed_at timestamptz,  -- admin looked at it
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text check (char_length(review_note) <= 500),
  branch_id uuid default public.main_branch() references public.branches(id) on delete set null
);
create index if not exists cash_sessions_opened_idx on public.cash_sessions (opened_at desc);
-- One open drawer per branch (was one open drawer for the whole shop).
create unique index if not exists cash_sessions_one_open_per_branch
  on public.cash_sessions (branch_id) where status <> 'closed';

-- 31. Calendar (v0.32). Events, campaigns, important notes and closed days,
-- each with who may see it:
--   admins   admins only
--   team     all staff + admins
--   staff    the staff in staff_ids + admins
--   members  everyone signed in (shown in My account) + the team
--   public   everyone, also on the website
-- title/body are what members and the public read (Thai + optional English);
-- internal_note is for the team only. Dates are Bangkok days, end inclusive;
-- no times = all day. repeat: none / weekly / monthly / yearly (until
-- repeat_until, if set). Staff may add team notes; admins anything.
-- Holidays, promotions, leave and the roster are shown from their own tables.
-- Server (service-role) only.
create table if not exists public.calendar_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'note' check (kind in ('event', 'campaign', 'note', 'closed')),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  title_en text check (char_length(title_en) <= 100),
  body text check (char_length(body) <= 1000),
  body_en text check (char_length(body_en) <= 1000),
  internal_note text check (char_length(internal_note) <= 1000),
  place text check (char_length(place) <= 120),
  starts_on date not null,
  ends_on date not null,
  start_time time,
  end_time time,
  visibility text not null default 'team' check (visibility in ('admins', 'team', 'staff', 'members', 'public')),
  staff_ids uuid[] not null default '{}',
  repeat text not null default 'none' check (repeat in ('none', 'weekly', 'monthly', 'yearly')),
  repeat_until date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint calendar_items_dates check (ends_on >= starts_on and ends_on <= starts_on + 92),
  constraint calendar_items_times check (start_time is null or end_time is null or end_time > start_time or ends_on > starts_on)
);
create index if not exists calendar_items_dates_idx on public.calendar_items (starts_on, ends_on);

-- 32. Member feedback (v0.33). After a visit a member can rate it once
-- (within 7 days): overall stars, optional stars per topic, a comment, and
-- "please contact me". Admins see the name (to follow up), mark low scores /
-- contact requests as handled, and edit the topics. Staff don't see answers.
-- Server (service-role) only.
create table if not exists public.feedback_topics (
  key text primary key check (key ~ '^[a-z0-9_]{2,30}$'),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  label_en text check (char_length(label_en) <= 40),
  sort integer not null default 0,
  is_active boolean not null default true
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references auth.users(id) on delete set null,
  visit_id uuid unique references public.visits(id) on delete set null,
  visit_date date not null,
  overall smallint not null check (overall between 1 and 5),
  scores jsonb not null default '{}'::jsonb,  -- {"clean": 4, …} topic key → 1..5
  comment text check (char_length(comment) <= 1000),
  contact_me boolean not null default false,
  created_at timestamptz not null default now(),
  handled_at timestamptz,  -- admin followed up / closed it
  handled_by uuid references auth.users(id) on delete set null,
  handled_note text check (char_length(handled_note) <= 500)
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);

-- 33. Staff commission (v0.34). An admin turns commission on per person and
-- sets a rate per product (or a default per kind): a percentage of the line
-- after discounts, or baht per unit. Who earns a line: the person who took
-- the payment, unless a referrer was scanned for the bill (their member
-- card QR) or another person was picked for that line. The amount is worked
-- out and kept when the bill is paid, so later rate changes don't touch old
-- bills; a voided bill's commission doesn't count. Server (service-role) only.
create table if not exists public.staff_commission (
  staff_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,  -- one product …
  kind text check (kind in ('day_pass', 'addon', 'merch', 'souvenir', 'package')),  -- … or a default for a kind
  mode text not null check (mode in ('pct', 'thb', 'none')),
  value numeric(10, 2) not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  category_id uuid references public.product_categories(id) on delete cascade,
  constraint commission_rules_one_target check (num_nonnulls(product_id, kind, category_id) = 1),
  constraint commission_rules_value_check check ((mode = 'none' and value = 0) or (mode <> 'none' and value > 0 and (mode <> 'pct' or value <= 100)))
);
create unique index if not exists commission_rules_product on public.commission_rules (product_id) where product_id is not null;
create unique index if not exists commission_rules_kind on public.commission_rules (kind) where kind is not null;
create unique index if not exists commission_rules_category on public.commission_rules (category_id) where category_id is not null;

create table if not exists public.sale_commissions (
  id bigint generated always as identity primary key,
  sale_id uuid not null references public.sales(id) on delete cascade,
  sale_line_id bigint not null unique references public.sale_lines(id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete restrict,
  source text not null check (source in ('cashier', 'referrer', 'line', 'signup')),
  base integer not null,  -- the line after its share of the bill discount
  mode text not null check (mode in ('pct', 'thb')),
  rate numeric(10, 2) not null,
  amount numeric(10, 2) not null check (amount >= 0),
  set_by uuid references auth.users(id) on delete set null,  -- who took the payment
  created_at timestamptz not null default now()
);
create index if not exists sale_commissions_staff_idx on public.sale_commissions (staff_id, created_at);
create index if not exists sale_commissions_created_idx on public.sale_commissions (created_at);

-- 35. Booking categories (v0.35.1). Admin-named groups for what can be
-- booked (e.g. "Massage", "Classes", "Private"), in their own order, with a
-- picture and a line of text — members see them when choosing what to book.
create table if not exists public.booking_categories (
  id uuid primary key default gen_random_uuid(),
  name_th text not null check (char_length(btrim(name_th)) between 1 and 40),
  name_en text not null default '' check (char_length(name_en) <= 40),
  description text check (char_length(description) <= 300),
  image_path text check (image_path is null or char_length(image_path) <= 200),
  sort integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 34. Bookings (v0.35). Things that can be booked (a service with a person
-- or room, a class, a Day Pass entry window, a private room), when they
-- open each week, and the bookings. Members book from My account; staff
-- book for anyone (members or walk-in guests). Nothing is paid when
-- booking — the bill is paid at the counter. No-shows are counted for the
-- rules in app_settings. Server (service-role) only; book_slot() takes a
-- lock so two people can't take the last place at the same moment.
create table if not exists public.booking_types (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'service' check (kind in ('service', 'class', 'entry', 'room')),
  name_th text not null check (char_length(btrim(name_th)) between 1 and 60),
  name_en text not null default '' check (char_length(name_en) <= 60),
  description text check (char_length(description) <= 500),
  duration_min integer not null default 60 check (duration_min between 10 and 720),
  buffer_min integer not null default 0 check (buffer_min between 0 and 120),  -- clean-up time after each booking
  capacity integer not null default 1 check (capacity between 1 and 500),  -- people per time (per person/room when there are any)
  step_min integer not null default 30 check (step_min in (10, 15, 20, 30, 45, 60, 90, 120, 180, 240)),
  product_id uuid references public.products(id) on delete set null,  -- what the counter adds to the bill
  member_booking boolean not null default true,  -- members can book it themselves
  advance_days integer not null default 14 check (advance_days between 0 and 180),
  min_hours numeric(4, 1) not null default 2 check (min_hours between 0 and 72),
  cancel_hours numeric(4, 1) not null default 3 check (cancel_hours between 0 and 168),
  max_party integer not null default 1 check (max_party between 1 and 20),
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  category_id uuid references public.booking_categories(id) on delete set null,
  -- No fixed "kinds" any more (v0.35.2): what used to come with a kind is set
  -- per item. null = not set yet → worked out from the old kind.
  member_pick boolean,
  -- members choose the person/room
  arrive_on_checkin boolean,
  -- Booked for a whole day, no time to pick (v0.35.4) — e.g. a Day Pass:
  -- "places per time" becomes places per day.
  whole_day boolean not null default false,
  -- Whole-day items can ask what time the guest will come (v0.35.6) — just
  -- for the shop to know; places stay per day.
  pick_arrival boolean not null default false
);

-- Who or what gives the service (a therapist, a room). None = the type's capacity is shared.
create table if not exists public.booking_resources (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references public.booking_types(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  staff_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  sort integer not null default 0
);
create index if not exists booking_resources_type_idx on public.booking_resources (type_id);

-- Open hours per weekday (0 = Sunday); several windows a day are fine.
create table if not exists public.booking_hours (
  id bigint generated always as identity primary key,
  type_id uuid not null references public.booking_types(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  constraint booking_hours_order check (end_time > start_time)
);
create index if not exists booking_hours_type_idx on public.booking_hours (type_id);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references public.booking_types(id) on delete restrict,
  resource_id uuid references public.booking_resources(id) on delete set null,
  day date not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  member_id uuid references auth.users(id) on delete set null,
  guest_name text check (guest_name is null or char_length(btrim(guest_name)) between 1 and 80),
  guest_phone text check (guest_phone is null or char_length(guest_phone) <= 20),
  party integer not null default 1 check (party between 1 and 20),
  status text not null default 'booked' check (status in ('booked', 'arrived', 'cancelled', 'no_show')),
  source text not null default 'staff' check (source in ('member', 'staff')),
  note text check (char_length(note) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  late_cancel boolean not null default false,  -- cancelled inside the cancel window
  arrived_at timestamptz,
  sale_id uuid references public.sales(id) on delete set null,
  no_show_at timestamptz,
  no_show_by uuid references auth.users(id) on delete set null,  -- null = marked at the end of the day
  -- Moved to another time: the old booking is kept, cancelled, pointing at the new one.
  moved_to uuid references public.bookings(id) on delete set null,
  arrive_time time,
  constraint bookings_who check (member_id is not null or guest_name is not null),
  constraint bookings_time check (end_at > start_at)
);
create index if not exists bookings_day_idx on public.bookings (day);
create index if not exists bookings_member_idx on public.bookings (member_id, start_at);
create index if not exists bookings_type_idx on public.bookings (type_id, start_at);

-- An admin "forgives" a member: no-shows before this time stop counting.
create table if not exists public.booking_pardons (
  member_id uuid primary key references auth.users(id) on delete cascade,
  pardoned_at timestamptz not null default now(),
  pardoned_by uuid references auth.users(id) on delete set null
);

-- a Day Pass check-in marks it "arrived"

-- Templates for new bookable items, saved by an admin (v0.35.3): the
-- settings of an item (length, places, hours, rules …) under a name.
create table if not exists public.booking_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 20000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 36. Member referrals (v0.36). A new member can type (or scan) a team
-- member's referral code when signing up — optional. Codes are only for
-- staff/admins. Members who give none are credited to the default referrer
-- an admin sets (app_settings.default_referrer_id), if any. The referrer
-- earns commission once, on the member's first paid bill (a voided first
-- bill doesn't count — the next one does), at the rates already set per
-- product; lines picked for someone else at the counter stay theirs.
-- The per-bill "scan referrer" at the counter is gone (old bills keep
-- source 'referrer'). Server (service-role) only.
create table if not exists public.staff_ref_codes (
  staff_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.member_referrals (
  member_id uuid primary key references auth.users(id) on delete cascade,
  referrer_id uuid references auth.users(id) on delete set null,
  via text not null check (via in ('code', 'qr', 'admin', 'default')),
  paid_sale_id uuid references public.sales(id) on delete set null,  -- the first bill commission was worked out on
  set_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists member_referrals_referrer_idx on public.member_referrals (referrer_id);

-- 38. What a package holds (v0.37.1). A package lists products from the
-- catalog with how many times each (null = unlimited). For now it holds
-- one entry product (the Day Pass) — its count is products.pkg_visits,
-- which selling a package still copies; other items come in a later step
-- (redeeming them at the counter). Existing packages are filled in with the
-- Day Pass and their visit count (once per package).
create table if not exists public.package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.products(id) on delete cascade,
  item_id uuid not null references public.products(id) on delete restrict,
  qty integer check (qty between 1 and 1000),  -- null = unlimited
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  constraint package_items_not_self check (package_id <> item_id),
  constraint package_items_once unique (package_id, item_id)
);

-- 39. What comes with a product (v0.37.2). Any product can bring other
-- products along when it's sold — a Day Pass with a towel, a wristband and a
-- locker key. Each is either given (on the bill at 0, out of stock; skipped
-- when there's none left) or lent (not on the bill or stock; listed on the
-- visit and taken back at check-out). Included items are ordinary items
-- without size/colour variants. pos_quote / pos_checkout below are the §18
-- ones with this added.
create table if not exists public.product_includes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  item_id uuid not null references public.products(id) on delete cascade,
  qty integer not null default 1 check (qty between 1 and 20),
  lend boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  constraint product_includes_not_self check (product_id <> item_id),
  constraint product_includes_once unique (product_id, item_id)
);

create table if not exists public.visit_loans (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete set null,
  member_id uuid references auth.users(id) on delete set null,
  item_id uuid references public.products(id) on delete set null,
  name text not null,
  qty integer not null check (qty between 1 and 999),
  created_at timestamptz not null default now(),
  returned_at timestamptz,
  returned_by uuid references auth.users(id) on delete set null,
  charged_sale_id uuid references public.sales(id) on delete set null
);
create index if not exists visit_loans_visit_idx on public.visit_loans (visit_id) where returned_at is null;

-- 40. Other things in a package (v0.37.3). Besides the entry (Day Pass ×
-- visits), a package can hold other items — 5 massages, 10 drinks — with a
-- count or unlimited. Each package bought gets its own balance per item
-- (copied when it's created, so editing the product later doesn't change
-- what was bought); the counter hands them out one by one ("use") and can
-- take back a mistake the same day. Handing out takes it out of stock.
create table if not exists public.member_package_items (
  id uuid primary key default gen_random_uuid(),
  member_package_id uuid not null references public.member_packages(id) on delete cascade,
  item_id uuid references public.products(id) on delete set null,
  name text not null,
  name_en text,
  qty_total integer check (qty_total between 1 and 1000),  -- null = unlimited
  qty_used integer not null default 0 check (qty_used >= 0),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  constraint member_package_items_within check (qty_total is null or qty_used <= qty_total)
);
create index if not exists member_package_items_pkg_idx on public.member_package_items (member_package_id);

create table if not exists public.package_item_uses (
  id uuid primary key default gen_random_uuid(),
  item_row_id uuid not null references public.member_package_items(id) on delete cascade,
  member_id uuid references auth.users(id) on delete set null,
  qty integer not null check (qty between 1 and 99),
  used_at timestamptz not null default now(),
  used_by uuid references auth.users(id) on delete set null,
  undone_at timestamptz,
  undone_by uuid references auth.users(id) on delete set null
);
create index if not exists package_item_uses_row_idx on public.package_item_uses (item_row_id);

-- 42. Promotions target categories and several products (v0.37.5). Besides
-- "whole bill" and "all entries", a promotion can now apply to any mix of
-- categories and specific products (an entry kind among them, so "เด็ก only"
-- works). The picks live in promotion_targets; scope 'custom' uses them.
-- A line is eligible if its product is picked, or its category is picked.
-- Old single-product promos (scope 'product') are moved in and become 'custom'.
create table if not exists public.promotion_targets (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint promotion_targets_one check (num_nonnulls(product_id, category_id) = 1),
  constraint promotion_targets_product_once unique (promotion_id, product_id),
  constraint promotion_targets_category_once unique (promotion_id, category_id)
);
create index if not exists promotion_targets_promo_idx on public.promotion_targets (promotion_id);

-- 48. Per-branch prices (v0.38, step 3a). A branch can override a product's
-- price; where it doesn't, the product's own price stands. pos_quote sets
-- app.branch before pricing a bill, and product_price reads it. Nothing set
-- (reports, other callers, a single-branch shop) = the base price, unchanged.
create table if not exists public.product_branch_prices (
  product_id uuid not null references public.products(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  price_weekday integer check (price_weekday is null or price_weekday >= 0),
  price_weekend integer check (price_weekend is null or price_weekend >= 0),
  price_holiday integer check (price_holiday is null or price_holiday >= 0),
  updated_at timestamptz not null default now(),
  primary key (product_id, branch_id)
);

-- 49. Per-branch stock (v0.38, step 3b). A branch can keep its own stock for a
-- product (or a variant); where it doesn't, the product's shared stock is used,
-- exactly like §48 does for price. pos_quote reads the branch's stock through
-- app.branch; checkout takes from it, and a void gives it back. A single-branch
-- shop, and any product no branch overrides, behave exactly as before.
create table if not exists public.product_branch_stock (
  product_id uuid not null references public.products(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  stock integer not null default 0 check (stock >= 0),
  updated_at timestamptz not null default now(),
  primary key (product_id, branch_id)
);

create table if not exists public.variant_branch_stock (
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  stock integer not null default 0 check (stock >= 0),
  updated_at timestamptz not null default now(),
  primary key (variant_id, branch_id)
);

-- 52. Quiz leads (v0.38.19). The public "Find My Journey" quiz can offer an
-- optional "contact me" form. Anonymous visitors submit through a
-- security-definer RPC (they hold only the anon key); staff read the leads in
-- the Back Office. A logged-in guest's lead is tagged with their member id.
create table if not exists public.quiz_leads (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references auth.users(id) on delete set null,
  name text,
  contact text not null,
  contact_type text check (contact_type in ('phone', 'email', 'line', 'other')),
  goals text[],
  journey_id text,
  journey_summary text,
  total_minutes integer,
  adjustments text[],
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users(id) on delete set null
);
create index if not exists quiz_leads_open_idx on public.quiz_leads (created_at desc) where handled_at is null;

-- 53. Brand settings (v0.39.0). The shop's name, colour, logo and contact
-- details move from code (lib/brand/config.ts) into the database so an admin
-- can change them in Back Office › Settings › Brand without a deploy. The
-- seed row is exactly the values in lib/brand/config.ts, so nothing on the
-- site changes when this runs; the app falls back to that file if the row
-- can't be read.
--
-- Designed with multi-tenant in mind: today it's a singleton (one row,
-- id = 1). Later add org_id, make it the key (one row per org), and scope
-- the read policy and update_brand_settings() by org.
--
-- Everyone may read it (the public site needs the name, colour and logo);
-- no one writes it directly — only update_brand_settings(), which checks
-- for an admin itself.
create table if not exists public.brand_settings (
  id smallint primary key default 1 check (id = 1),
  brand_name text not null check (char_length(btrim(brand_name)) between 1 and 80),  -- Thai name: ราเวนต้า
  brand_name_en text not null check (char_length(btrim(brand_name_en)) between 1 and 80),  -- RAVENTA
  brand_color text not null check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url text check (logo_url is null or logo_url ~ '^(/|https://)'),
  phone text check (phone is null or char_length(phone) <= 40),
  line_url text check (line_url is null or line_url ~ '^https://'),
  address text check (address is null or char_length(address) <= 300),
  address_en text check (address_en is null or char_length(address_en) <= 300),
  contact_email text check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  -- v0.41: the rest of the look (null = the default in lib/brand/config.ts)
  logo_emblem_url text check (logo_emblem_url is null or logo_emblem_url ~ '^(/|https://)'),
  logo_wordmark_url text check (logo_wordmark_url is null or logo_wordmark_url ~ '^(/|https://)'),
  -- favicon / home-screen icon
  icon_url text check (icon_url is null or icon_url ~ '^(/|https://)'),
  -- text on brand-coloured buttons
  brand_fg_color text check (brand_fg_color is null or brand_fg_color ~ '^#[0-9A-Fa-f]{6}$'),
  -- the dark band colour (footer, info boxes) — FOREST
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  -- tiles and chips — SAGE
  soft_color text check (soft_color is null or soft_color ~ '^#[0-9A-Fa-f]{6}$'),
  -- v0.41: where the shop is, when it's open, socials, tagline, SEO
  city text check (city is null or char_length(city) <= 60),
  city_en text check (city_en is null or char_length(city_en) <= 60),
  map_lat double precision check (map_lat is null or map_lat between -90 and 90),
  map_lng double precision check (map_lng is null or map_lng between -180 and 180),
  map_url text check (map_url is null or map_url ~ '^https://'),
  hours text check (hours is null or char_length(hours) <= 120),
  hours_en text check (hours_en is null or char_length(hours_en) <= 120),
  visit_note text check (visit_note is null or char_length(visit_note) <= 160),
  visit_note_en text check (visit_note_en is null or char_length(visit_note_en) <= 160),
  facebook_url text check (facebook_url is null or facebook_url ~ '^https://'),
  instagram_url text check (instagram_url is null or instagram_url ~ '^https://'),
  tiktok_url text check (tiktok_url is null or tiktok_url ~ '^https://'),
  tagline text check (tagline is null or char_length(tagline) <= 80),
  tagline_en text check (tagline_en is null or char_length(tagline_en) <= 80),
  seo_title text check (seo_title is null or char_length(seo_title) <= 120),
  seo_description text check (seo_description is null or char_length(seo_description) <= 300),
  -- the picture shown when a link is shared
  og_image_url text check (og_image_url is null or og_image_url ~ '^https://')
);

-- Columns added after a table's first release. Each is also in that table's
-- CREATE TABLE above; these lines give them to databases created earlier.
-- brand_settings (v0.41.0)
alter table public.brand_settings add column if not exists logo_emblem_url text check (logo_emblem_url is null or logo_emblem_url ~ '^(/|https://)');
alter table public.brand_settings add column if not exists logo_wordmark_url text check (logo_wordmark_url is null or logo_wordmark_url ~ '^(/|https://)');
alter table public.brand_settings add column if not exists icon_url text check (icon_url is null or icon_url ~ '^(/|https://)');
alter table public.brand_settings add column if not exists brand_fg_color text check (brand_fg_color is null or brand_fg_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.brand_settings add column if not exists accent_color text check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.brand_settings add column if not exists soft_color text check (soft_color is null or soft_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.brand_settings add column if not exists city text check (city is null or char_length(city) <= 60);
alter table public.brand_settings add column if not exists city_en text check (city_en is null or char_length(city_en) <= 60);
alter table public.brand_settings add column if not exists map_lat double precision check (map_lat is null or map_lat between -90 and 90);
alter table public.brand_settings add column if not exists map_lng double precision check (map_lng is null or map_lng between -180 and 180);
alter table public.brand_settings add column if not exists map_url text check (map_url is null or map_url ~ '^https://');
alter table public.brand_settings add column if not exists hours text check (hours is null or char_length(hours) <= 120);
alter table public.brand_settings add column if not exists hours_en text check (hours_en is null or char_length(hours_en) <= 120);
alter table public.brand_settings add column if not exists visit_note text check (visit_note is null or char_length(visit_note) <= 160);
alter table public.brand_settings add column if not exists visit_note_en text check (visit_note_en is null or char_length(visit_note_en) <= 160);
alter table public.brand_settings add column if not exists facebook_url text check (facebook_url is null or facebook_url ~ '^https://');
alter table public.brand_settings add column if not exists instagram_url text check (instagram_url is null or instagram_url ~ '^https://');
alter table public.brand_settings add column if not exists tiktok_url text check (tiktok_url is null or tiktok_url ~ '^https://');
alter table public.brand_settings add column if not exists tagline text check (tagline is null or char_length(tagline) <= 80);
alter table public.brand_settings add column if not exists tagline_en text check (tagline_en is null or char_length(tagline_en) <= 80);
alter table public.brand_settings add column if not exists seo_title text check (seo_title is null or char_length(seo_title) <= 120);
alter table public.brand_settings add column if not exists seo_description text check (seo_description is null or char_length(seo_description) <= 300);
alter table public.brand_settings add column if not exists og_image_url text check (og_image_url is null or og_image_url ~ '^https://');

-- sale_lines ↔ visits point at each other: this link is added once both exist.
do $$
begin
  alter table public.sale_lines add constraint sale_lines_visit_id_fkey foreign key (visit_id) references public.visits(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- 3. Functions
-- =============================================================================

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

-- 'accountant' (v0.38.22): a back-office role that reaches the Reports page
-- only; is_staff() stays false for it (no front-desk / RLS staff access).
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
grant execute on function public.day_type(date) to authenticated;

-- Same name and arguments as §18, now aware of a per-branch override. The
-- branch is passed in app.branch (a transaction-local GUC set by pos_quote);
-- when it is unset the override lookup finds nothing and the base price stands.
create or replace function public.product_price(p public.products, p_date date)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  with b as (
    select bp.price_weekday, bp.price_weekend, bp.price_holiday
    from public.product_branch_prices bp
    where bp.product_id = p.id
      and bp.branch_id = nullif(current_setting('app.branch', true), '')::uuid
  )
  select case public.day_type(p_date)
    when 'holiday' then coalesce((select price_holiday from b), p.price_holiday, p.price_weekend, p.price_weekday)
    when 'weekend' then coalesce((select price_weekend from b), p.price_weekend, p.price_weekday)
    else coalesce((select price_weekday from b), p.price_weekday)
  end;
$$;

-- Day Pass price for a date: Mon–Fri 590, Sat–Sun 790 (THB). The one place
-- the price lives; the check-in screen asks for it rather than hard-coding.
-- Public holidays aren't handled yet (see R1 decisions).

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
    (select public.product_price(p, p_date) from public.products p where p.kind = 'day_pass'
     order by not p.is_active, p.sort, p.created_at limit 1),
    case when extract(isodow from p_date) in (6, 7) then 790 else 590 end
  );
$$;

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
revoke execute on function public.staff_check_in(uuid, text, text, text) from public, anon;
grant execute on function public.staff_check_in(uuid, text, text, text) to authenticated;

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
revoke execute on function public.staff_check_out(uuid) from public, anon;
grant execute on function public.staff_check_out(uuid) to authenticated;

-- Undo a mistaken check-in: staff within 30 minutes, admins any time.
-- Hands back the stamp (or the free reward) automatically, since both are
-- counted from uncancelled visits.

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
revoke execute on function public.staff_cancel_visit(uuid, text) from public, anon;
grant execute on function public.staff_cancel_visit(uuid, text) to authenticated;

-- Move each old single-product promo into a target and flip it to 'custom'.

-- Discount one promotion gives a set of priced lines.

-- Discount one promotion gives a set of priced lines (now category-aware,
-- so it reads products/targets — stable, not immutable).
create or replace function public.promo_discount(pr public.promotions, p_lines jsonb)
returns integer
language sql
stable
as $$
  with eligible as (
    select coalesce(sum((l->>'line_total')::int), 0) as amount
    from jsonb_array_elements(p_lines) l
    where pr.scope = 'all'
       or (pr.scope = 'day_pass' and l->>'kind' = 'day_pass')
       or (pr.scope = 'product' and (l->>'product_id')::uuid = pr.product_id)
       or (pr.scope = 'custom' and exists (
            select 1 from public.promotion_targets t
            left join public.products p on p.id = (l->>'product_id')::uuid
            where t.promotion_id = pr.id
              and (t.product_id = (l->>'product_id')::uuid or t.category_id = p.category_id)
          ))
  )
  select case pr.kind
    when 'pct' then (amount * pr.value) / 100
    else least(pr.value, amount)
  end::int
  from eligible;
$$;

-- The package a check-in on p_date would use: still has visits, in date,
-- allowed on that kind of day. One already running before one that would
-- start now; then the one that runs out soonest.

-- As §21, leaving out packages without entry.
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
    and not no_entry
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

-- What p_qty of a product brings along: {"lines": [given, at 0], "loans": [lent]}.
create or replace function public.pos_includes(p_product uuid, p_qty integer)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $fn$
declare
  r record;
  v_lines jsonb := '[]'::jsonb;
  v_loans jsonb := '[]'::jsonb;
  v_n integer;
begin
  for r in
    select i.qty, i.lend, p.id, p.name_th, p.name_en, p.kind, p.track_stock, p.stock
    from public.product_includes i join public.products p on p.id = i.item_id
    where i.product_id = p_product and p.is_active and p.kind not in ('day_pass', 'package')
      and not exists (select 1 from public.product_variants v where v.product_id = p.id and v.is_active)
    order by i.sort, i.created_at
  loop
    v_n := r.qty * greatest(coalesce(p_qty, 1), 1);
    if r.lend then
      v_loans := v_loans || jsonb_build_object('item_id', r.id, 'name', r.name_th, 'name_en', r.name_en, 'qty', v_n);
    elsif not r.track_stock or r.stock >= v_n then
      v_lines := v_lines || jsonb_build_object(
        'product_id', r.id, 'variant_id', null, 'kind', r.kind,
        'name', r.name_th || ' · รวมมาด้วย', 'name_en', coalesce(nullif(r.name_en, ''), r.name_th) || ' · included', 'qty', v_n,
        'unit_price', 0, 'line_total', 0, 'reward', false, 'included', true
      );
    end if;
  end loop;
  return jsonb_build_object('lines', v_lines, 'loans', v_loans);
end;
$fn$;
revoke execute on function public.pos_includes(uuid, integer) from public, anon;
grant execute on function public.pos_includes(uuid, integer) to authenticated;

-- The stock that counts for the branch in app.branch: the branch's own row if
-- it has one, else the product's / variant's shared stock. Unset branch = shared.
create or replace function public.effective_stock(p_product uuid, p_variant uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p_variant is not null then coalesce(
      (select s.stock from public.variant_branch_stock s
         where s.variant_id = p_variant and s.branch_id = nullif(current_setting('app.branch', true), '')::uuid),
      (select v.stock from public.product_variants v where v.id = p_variant))
    else coalesce(
      (select s.stock from public.product_branch_stock s
         where s.product_id = p_product and s.branch_id = nullif(current_setting('app.branch', true), '')::uuid),
      (select p.stock from public.products p where p.id = p_product))
  end;
$$;
revoke execute on function public.effective_stock(uuid, uuid) from public, anon;
grant execute on function public.effective_stock(uuid, uuid) to authenticated;

-- Price a bill without writing anything. p_day_pass: 'none' | 'paid' |
-- 'reward'. p_items: [{"product_id": "…", "variant_id": "…"|null, "qty": n}].
-- With a code, that promotion (or an error); without, the best automatic one.
create or replace function public.pos_quote(
  p_member_id uuid,
  p_day_pass text,
  p_items jsonb,
  p_promo_code text default null,
  p_entry uuid default null,
  p_branch uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
-- not stable: it sets app.branch so product_price can read a per-branch price (§48).
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
  v_inc jsonb;
  v_loans jsonb := '[]'::jsonb;
begin
  if not public.is_staff() then
    raise exception 'not_staff';
  end if;
  if p_member_id is not null and p_member_id = auth.uid() then
    raise exception 'self_service';
  end if;
  -- Price this quote for the given branch when one is passed (§48). product_price
  -- reads app.branch; set it only when a branch is named, so other callers and
  -- the internal call from pos_checkout are untouched.
  if p_branch is not null then
    perform set_config('app.branch', p_branch::text, true);
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
    -- Which entry (§41): a package's own, else the one picked, else the first.
    if p_day_pass = 'package' then
      v_pkg := public.usable_package(p_member_id, v_today);
      if v_pkg is null then
        raise exception 'no_package';
      end if;
      select p.* into v_dp from public.member_packages k join public.products p on p.id = k.entry_id
      where k.id = v_pkg and p.kind = 'day_pass';
    elsif p_entry is not null then
      select * into v_dp from public.products where id = p_entry and kind = 'day_pass';
    end if;
    if v_dp.id is null then
      select * into v_dp from public.products where kind = 'day_pass'
      order by not is_active, sort, created_at limit 1;
    end if;
    if v_dp.id is null or not v_dp.is_active then
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
    -- What comes with it (§39): given items at 0 on the bill, lent ones listed.
    v_inc := public.pos_includes(v_dp.id, 1);
    v_lines := v_lines || (v_inc->'lines');
    v_loans := v_loans || (v_inc->'loans');
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
      v_stock := public.effective_stock(v_p.id, v_v.id);
      v_name := v_p.name_th || ' · ' || v_v.label;
    else
      v_vid := null;
      v_stock := public.effective_stock(v_p.id, null);
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
    v_inc := public.pos_includes(v_p.id, v_qty);
    v_lines := v_lines || (v_inc->'lines');
    v_loans := v_loans || (v_inc->'loans');
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
    'day_type', v_type,
    'loans', v_loans,
    'entry_id', v_dp.id
  );
end;
$$;
revoke execute on function public.pos_quote(uuid, text, jsonb, text, uuid, uuid) from public, anon;
grant execute on function public.pos_quote(uuid, text, jsonb, text, uuid, uuid) to authenticated;

-- Take stock for a sale at a branch: from the branch's own row when it has one,
-- otherwise the shared stock. Going below zero raises out_of_stock, the same as
-- the shared-stock guard it replaces.
create or replace function public.staff_take_stock(p_product uuid, p_variant uuid, p_branch uuid, p_qty integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if p_variant is not null then
      if exists (select 1 from public.variant_branch_stock where variant_id = p_variant and branch_id = p_branch) then
        update public.variant_branch_stock set stock = stock - p_qty, updated_at = now() where variant_id = p_variant and branch_id = p_branch;
      else
        update public.product_variants set stock = stock - p_qty where id = p_variant;
      end if;
    else
      if p_branch is not null and exists (select 1 from public.product_branch_stock where product_id = p_product and branch_id = p_branch) then
        update public.product_branch_stock set stock = stock - p_qty, updated_at = now() where product_id = p_product and branch_id = p_branch;
      else
        update public.products set stock = stock - p_qty where id = p_product;
      end if;
    end if;
  exception when check_violation then
    raise exception 'out_of_stock';
  end;
end;
$$;
revoke execute on function public.staff_take_stock(uuid, uuid, uuid, integer) from public, anon;

-- Ring up a bill: price it with pos_quote(), then write the sale and its
-- lines and what they bring — the check-in, packages bought, lent items —
-- taking stock from the selling branch (§19, §48–§49).
create or replace function public.pos_checkout(
  p_member_id uuid,
  p_day_pass text,
  p_items jsonb,
  p_payment_method text default null,
  p_promo_code text default null,
  p_wristband text default null,
  p_entry uuid default null,
  p_locker text default null,
  p_branch uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q jsonb := public.pos_quote(p_member_id, p_day_pass, p_items, p_promo_code, p_entry, p_branch);
  v_branch uuid := coalesce(p_branch, public.main_branch());
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

  insert into public.sales (member_id, member_no, subtotal, discount, total, payment_method, promotion_id, promo_name, staff_id, branch_id)
  values (
    p_member_id, v_member_no, (v_q->>'subtotal')::int, (v_q->>'discount')::int, v_total,
    p_payment_method, nullif(v_q->>'promotion_id', '')::uuid, v_q->>'promo_name', auth.uid(), v_branch
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
        member_id, member_no, entry_type, price, payment_method, earns_stamp, wristband, locker, checked_in_by, sale_id, package_id, branch_id
      ) values (
        p_member_id, v_member_no, v_entry,
        (v_line->>'unit_price')::int,
        case when v_entry = 'paid' then p_payment_method end,
        case v_entry when 'paid' then true when 'package' then coalesce(v_pkg_stamp, false) else false end,
        nullif(btrim(coalesce(p_wristband, '')), ''), nullif(btrim(coalesce(p_locker, '')), ''), auth.uid(), v_sale.id,
        case when v_entry = 'package' then v_pkg_id end, v_branch
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
        -- Take it from the selling branch's stock (§49); a branch with no stock
        -- row of its own falls back to the shared pool.
        perform public.staff_take_stock(
          (v_line->>'product_id')::uuid, nullif(v_line->>'variant_id', '')::uuid, v_branch, (v_line->>'qty')::int);
      end if;
    end if;
  end loop;

  -- Lent with what was sold (§39): to come back at check-out.
  insert into public.visit_loans (sale_id, visit_id, member_id, item_id, name, qty)
  select v_sale.id, v_visit, p_member_id, (x->>'item_id')::uuid, x->>'name', (x->>'qty')::int
  from jsonb_array_elements(coalesce(v_q->'loans', '[]'::jsonb)) x;

  insert into public.staff_actions (actor_id, member_id, visit_id, action, detail)
  values (auth.uid(), p_member_id, v_visit, 'sale', jsonb_build_object(
    'sale_id', v_sale.id, 'receipt_no', v_sale.receipt_no, 'total', v_total,
    'discount', v_sale.discount, 'payment_method', p_payment_method, 'promo', v_sale.promo_name));

  return jsonb_build_object('sale_id', v_sale.id, 'receipt_no', v_sale.receipt_no, 'total', v_total, 'visit_id', v_visit);
end;
$$;
revoke execute on function public.pos_checkout(uuid, text, jsonb, text, text, text, uuid, text, uuid) from public, anon;
grant execute on function public.pos_checkout(uuid, text, jsonb, text, text, text, uuid, text, uuid) to authenticated;
revoke execute on function public.pos_checkout(uuid, text, jsonb, text, text, text, uuid, text, uuid) from public, anon;
grant execute on function public.pos_checkout(uuid, text, jsonb, text, text, text, uuid, text, uuid) to authenticated;

-- Give stock back (a void): to the same place staff_take_stock took it from.
create or replace function public.staff_give_stock(p_product uuid, p_variant uuid, p_branch uuid, p_qty integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_variant is not null then
    if exists (select 1 from public.variant_branch_stock where variant_id = p_variant and branch_id = p_branch) then
      update public.variant_branch_stock set stock = stock + p_qty, updated_at = now() where variant_id = p_variant and branch_id = p_branch;
    else
      update public.product_variants set stock = stock + p_qty where id = p_variant;
    end if;
  else
    if p_branch is not null and exists (select 1 from public.product_branch_stock where product_id = p_product and branch_id = p_branch) then
      update public.product_branch_stock set stock = stock + p_qty, updated_at = now() where product_id = p_product and branch_id = p_branch;
    else
      update public.products set stock = stock + p_qty where id = p_product;
    end if;
  end if;
end;
$$;
revoke execute on function public.staff_give_stock(uuid, uuid, uuid, integer) from public, anon;

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
    -- Give it back to wherever it was taken from (§49): the sale's branch stock,
    -- or the shared pool if that branch keeps none of its own.
    perform public.staff_give_stock(l.product_id, l.variant_id, v.branch_id, l.qty);
  end loop;

  update public.visits
  set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
  where sale_id = p_sale_id and cancelled_at is null;

  insert into public.staff_actions (actor_id, member_id, action, detail)
  values (auth.uid(), v.member_id, 'void_sale',
    jsonb_build_object('sale_id', v.id, 'receipt_no', v.receipt_no, 'total', v.total, 'reason', btrim(p_reason)));
end;
$$;
revoke execute on function public.pos_void_sale(uuid, text) from public, anon;
grant execute on function public.pos_void_sale(uuid, text) to authenticated;

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

-- Hand one visit of p_package_id to p_friend (called by the server after
-- it has checked the invite). Returns the friend's package.
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

-- Book one place, safely: locks the type for the day, checks the room
-- left (per person/room, counting clean-up time), picks a free person/room
-- when none was chosen, and inserts. Raises 'slot_full' / 'bad_booking'.
create or replace function public.book_slot(
  p_type_id uuid,
  p_resource_id uuid,
  p_start timestamptz,
  p_party integer,
  p_member_id uuid,
  p_guest_name text,
  p_guest_phone text,
  p_note text,
  p_source text,
  p_created_by uuid,
  p_ignore uuid default null          -- moving a booking: don't count itself
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.booking_types;
  v_end timestamptz;
  v_day date;
  v_res uuid;
  v_used integer;
  v_id uuid;
  v_has_res boolean;
begin
  select * into v_t from public.booking_types where id = p_type_id and is_active;
  if not found or p_party is null or p_party < 1 or p_party > v_t.max_party then
    raise exception 'bad_booking';
  end if;
  v_day := (p_start at time zone 'Asia/Bangkok')::date;
  if v_t.whole_day then
    -- The whole Bangkok day; every booking that day shares the places.
    p_start := (v_day::timestamp at time zone 'Asia/Bangkok');
    v_end := p_start + interval '1 day';
    v_t.buffer_min := 0;
  else
    v_end := p_start + make_interval(mins => v_t.duration_min);
  end if;
  perform pg_advisory_xact_lock(hashtext(p_type_id::text || v_day::text));

  select exists (select 1 from public.booking_resources where type_id = p_type_id and is_active) into v_has_res;
  if v_has_res then
    for v_res in
      select r.id from public.booking_resources r
      where r.type_id = p_type_id and r.is_active and (p_resource_id is null or r.id = p_resource_id)
      order by r.sort, r.label
    loop
      select coalesce(sum(b.party), 0) into v_used from public.bookings b
      where b.resource_id = v_res and b.status in ('booked', 'arrived') and b.id is distinct from p_ignore
        and b.start_at < v_end + make_interval(mins => v_t.buffer_min)
        and b.end_at + make_interval(mins => v_t.buffer_min) > p_start;
      if v_used + p_party <= v_t.capacity then
        insert into public.bookings (type_id, resource_id, day, start_at, end_at, member_id, guest_name, guest_phone, party, source, note, created_by)
        values (p_type_id, v_res, v_day, p_start, v_end, p_member_id, nullif(btrim(p_guest_name), ''), nullif(btrim(p_guest_phone), ''), p_party, p_source, nullif(btrim(p_note), ''), p_created_by)
        returning id into v_id;
        return v_id;
      end if;
    end loop;
    raise exception 'slot_full';
  end if;

  select coalesce(sum(b.party), 0) into v_used from public.bookings b
  where b.type_id = p_type_id and b.status in ('booked', 'arrived') and b.id is distinct from p_ignore
    and b.start_at < v_end + make_interval(mins => v_t.buffer_min)
    and b.end_at + make_interval(mins => v_t.buffer_min) > p_start;
  if v_used + p_party > v_t.capacity then
    raise exception 'slot_full';
  end if;
  insert into public.bookings (type_id, resource_id, day, start_at, end_at, member_id, guest_name, guest_phone, party, source, note, created_by)
  values (p_type_id, null, v_day, p_start, v_end, p_member_id, nullif(btrim(p_guest_name), ''), nullif(btrim(p_guest_phone), ''), p_party, p_source, nullif(btrim(p_note), ''), p_created_by)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.book_slot(uuid, uuid, timestamptz, integer, uuid, text, text, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.book_slot(uuid, uuid, timestamptz, integer, uuid, text, text, text, text, uuid, uuid) to service_role;

-- Lent items handed back (at check-out). Returns how many rows came back.
create or replace function public.staff_return_loans(p_visit_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_n integer;
begin
  if not public.is_staff() then
    raise exception 'not_staff';
  end if;
  update public.visit_loans set returned_at = now(), returned_by = auth.uid()
  where visit_id = p_visit_id and returned_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;
revoke execute on function public.staff_return_loans(uuid) from public, anon;
grant execute on function public.staff_return_loans(uuid) to authenticated;

-- A package bought (not a friend's handed-over visit) gets its items.
create or replace function public.member_package_items_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.product_id is null or new.shared_from is not null then
    return new;
  end if;
  insert into public.member_package_items (member_package_id, item_id, name, name_en, qty_total, sort)
  select new.id, p.id, p.name_th, nullif(p.name_en, ''), i.qty, i.sort
  from public.package_items i join public.products p on p.id = i.item_id
  where i.package_id = new.product_id and p.kind <> 'day_pass';
  return new;
end;
$fn$;

-- Hand out p_qty of one item from a member's package. Returns {use_id, left}.
create or replace function public.staff_use_package_item(p_row uuid, p_qty integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r public.member_package_items;
  k public.member_packages;
  v_today date := public.bkk_today();
  v_track boolean;
  v_use uuid;
begin
  if not public.is_staff() then
    raise exception 'not_staff';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 99 then
    raise exception 'bad_qty';
  end if;
  select * into r from public.member_package_items where id = p_row for update;
  if not found then
    raise exception 'not_found';
  end if;
  select * into k from public.member_packages where id = r.member_package_id for update;
  if k.cancelled_at is not null then
    raise exception 'package_cancelled';
  end if;
  if k.member_id = auth.uid() then
    raise exception 'self_service';
  end if;
  if (k.expires_on is not null and k.expires_on < v_today)
     or (k.starts_on is null and k.activate_by is not null and k.activate_by < v_today) then
    raise exception 'package_expired';
  end if;
  if r.qty_total is not null and r.qty_used + p_qty > r.qty_total then
    raise exception 'not_enough';
  end if;
  if r.item_id is not null then
    select track_stock into v_track from public.products where id = r.item_id;
    if v_track then
      begin
        update public.products set stock = stock - p_qty where id = r.item_id;
      exception when check_violation then
        raise exception 'out_of_stock';
      end;
    end if;
  end if;
  -- A "starts on first use" package starts with whatever is used first.
  update public.member_packages
  set starts_on = coalesce(starts_on, v_today), expires_on = coalesce(expires_on, v_today + valid_days - 1)
  where id = k.id and starts_on is null;
  update public.member_package_items set qty_used = qty_used + p_qty where id = r.id;
  insert into public.package_item_uses (item_row_id, member_id, qty, used_by)
  values (r.id, k.member_id, p_qty, auth.uid()) returning id into v_use;
  insert into public.staff_actions (actor_id, member_id, action, detail)
  values (auth.uid(), k.member_id, 'package_item', jsonb_build_object(
    'package_id', k.id, 'item', r.name, 'qty', p_qty, 'use_id', v_use));
  return jsonb_build_object('use_id', v_use,
    'left', case when r.qty_total is null then null else r.qty_total - r.qty_used - p_qty end);
end;
$fn$;
revoke execute on function public.staff_use_package_item(uuid, integer) from public, anon;
grant execute on function public.staff_use_package_item(uuid, integer) to authenticated;

-- Take a hand-out back (a mistake): same day, or an admin any time.
create or replace function public.staff_undo_package_item(p_use uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  u public.package_item_uses;
  r public.member_package_items;
  v_track boolean;
begin
  if not public.is_staff() then
    raise exception 'not_staff';
  end if;
  select * into u from public.package_item_uses where id = p_use for update;
  if not found or u.undone_at is not null then
    raise exception 'not_found';
  end if;
  if not public.is_admin() and (u.used_at at time zone 'Asia/Bangkok')::date <> public.bkk_today() then
    raise exception 'cancel_window_passed';
  end if;
  select * into r from public.member_package_items where id = u.item_row_id for update;
  update public.member_package_items set qty_used = greatest(qty_used - u.qty, 0) where id = r.id;
  if r.item_id is not null then
    select track_stock into v_track from public.products where id = r.item_id;
    if v_track then
      update public.products set stock = stock + u.qty where id = r.item_id;
    end if;
  end if;
  update public.package_item_uses set undone_at = now(), undone_by = auth.uid() where id = u.id;
  insert into public.staff_actions (actor_id, member_id, action, detail)
  values (auth.uid(), u.member_id, 'package_item_undo', jsonb_build_object('item', r.name, 'qty', u.qty, 'use_id', u.id));
end;
$fn$;
revoke execute on function public.staff_undo_package_item(uuid) from public, anon;
grant execute on function public.staff_undo_package_item(uuid) to authenticated;

-- A bill whose package has handed items out is "used": only an admin voids it.
create or replace function public.sales_void_guard_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.voided_at is not null and old.voided_at is null and not public.is_admin()
     and exists (
       select 1 from public.member_package_items r join public.member_packages k on k.id = r.member_package_id
       where k.sale_id = new.id and r.qty_used > 0
     ) then
    raise exception 'package_used';
  end if;
  return new;
end;
$fn$;

-- A package bought: which entry it covers, or none. A visit handed to a
-- friend (§23) covers the same entry as the package it came from.
create or replace function public.member_packages_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.shared_from is not null then
    select entry_id into new.entry_id from public.member_packages where id = new.shared_from;
  elsif new.product_id is not null then
    select i.item_id into new.entry_id
    from public.package_items i join public.products p on p.id = i.item_id
    where i.package_id = new.product_id and p.kind = 'day_pass'
    order by i.sort limit 1;
    new.no_entry := new.entry_id is null
      and exists (select 1 from public.package_items where package_id = new.product_id);
  end if;
  return new;
end;
$fn$;

-- Check out a visit, settling its lent items (§39/§44).
--   p_returned : loan ids handed back        → returned_at = now
--   p_charge   : loan ids to bill as lost    → a sale at today's price, then returned
--   anything else stays outstanding (returned_at null, not charged).
-- Returns { charged_total, receipt_no, outstanding }.
create or replace function public.staff_checkout_with_loans(
  p_visit uuid,
  p_returned uuid[] default '{}',
  p_charge uuid[] default '{}',
  p_payment_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v public.visits;
  v_prod public.products;
  r record;
  x jsonb;
  v_sale public.sales;
  v_lines jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_price integer;
  v_outstanding integer;
begin
  if not public.is_staff() then
    raise exception 'not_staff';
  end if;
  select * into v from public.visits where id = p_visit for update;
  if not found or v.cancelled_at is not null then
    raise exception 'visit_not_found';
  end if;
  if v.member_id = auth.uid() then
    raise exception 'self_service';
  end if;
  if v.checked_out_at is not null then
    raise exception 'already_checked_out';
  end if;

  -- Items to charge as lost: one sale at today's price.
  if array_length(p_charge, 1) is not null then
    if p_payment_method is null or p_payment_method not in ('cash', 'transfer', 'card') then
      raise exception 'payment_method_required';
    end if;
    for r in
      select l.id as loan_id, l.item_id, l.name, l.qty from public.visit_loans l
      where l.id = any(p_charge) and l.visit_id = p_visit and l.returned_at is null and l.charged_sale_id is null
    loop
      v_prod := null;
      if r.item_id is not null then
        select * into v_prod from public.products where id = r.item_id;
      end if;
      v_price := coalesce(public.product_price(v_prod, public.bkk_today()), 0);
      v_total := v_total + v_price * r.qty;
      v_lines := v_lines || jsonb_build_object('item_id', r.item_id, 'name', r.name || ' · ของหาย', 'qty', r.qty, 'unit', v_price, 'loan', r.loan_id);
    end loop;
    if jsonb_array_length(v_lines) > 0 then
      insert into public.sales (member_id, member_no, subtotal, discount, total, payment_method, staff_id, branch_id)
      values (v.member_id, v.member_no, v_total, 0, v_total, p_payment_method, auth.uid(), v.branch_id)
      returning * into v_sale;
      for x in select value from jsonb_array_elements(v_lines) loop
        insert into public.sale_lines (sale_id, product_id, variant_id, kind, name, qty, unit_price, line_total)
        values (v_sale.id, nullif(x->>'item_id','')::uuid, null, 'merch', x->>'name', (x->>'qty')::int, (x->>'unit')::int, (x->>'unit')::int * (x->>'qty')::int);
        update public.visit_loans set returned_at = now(), returned_by = auth.uid(), charged_sale_id = v_sale.id
        where id = (x->>'loan')::uuid;
      end loop;
    end if;
  end if;

  -- Items handed back.
  if array_length(p_returned, 1) is not null then
    update public.visit_loans set returned_at = now(), returned_by = auth.uid()
    where id = any(p_returned) and visit_id = p_visit and returned_at is null;
  end if;

  update public.visits set checked_out_at = now(), checked_out_by = auth.uid() where id = p_visit;
  insert into public.staff_actions (actor_id, member_id, visit_id, action, detail)
  values (auth.uid(), v.member_id, p_visit, 'check_out',
    jsonb_build_object('charged', v_total, 'receipt_no', v_sale.receipt_no));

  select count(*) into v_outstanding from public.visit_loans where visit_id = p_visit and returned_at is null;
  return jsonb_build_object('charged_total', v_total, 'receipt_no', v_sale.receipt_no, 'outstanding', v_outstanding);
end;
$fn$;
revoke execute on function public.staff_checkout_with_loans(uuid, uuid[], uuid[], text) from public, anon;
grant execute on function public.staff_checkout_with_loans(uuid, uuid[], uuid[], text) to authenticated;

-- An ad-hoc loan need not come from a sale (a reward check-in has none).

-- Lend one or more items to a visit that is in the shop (§51). Staff only;
-- each item must be flagged lendable. Returns how many loans were added.
create or replace function public.staff_lend_items(p_visit uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.visits;
  x jsonb;
  v_prod public.products;
  v_qty integer;
  v_added integer := 0;
begin
  if not public.is_staff() then
    raise exception 'not_staff';
  end if;
  select * into v from public.visits where id = p_visit;
  if not found or v.cancelled_at is not null then
    raise exception 'visit_not_found';
  end if;
  if v.checked_out_at is not null then
    raise exception 'already_checked_out';
  end if;
  for x in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_qty := greatest(1, least(999, coalesce((x->>'qty')::int, 1)));
    select * into v_prod from public.products where id = (x->>'item_id')::uuid and lendable and not hidden;
    if not found then
      raise exception 'not_lendable';
    end if;
    -- The loan belongs to the visit (and its check-in sale, for reference).
    insert into public.visit_loans (sale_id, visit_id, member_id, item_id, name, qty)
    values (v.sale_id, p_visit, v.member_id, v_prod.id, v_prod.name_th, v_qty);
    v_added := v_added + 1;
  end loop;
  insert into public.staff_actions (actor_id, member_id, visit_id, action, detail)
  values (auth.uid(), v.member_id, p_visit, 'lend', jsonb_build_object('count', v_added));
  return v_added;
end;
$$;
revoke execute on function public.staff_lend_items(uuid, jsonb) from public, anon;
grant execute on function public.staff_lend_items(uuid, jsonb) to authenticated;

create or replace function public.submit_quiz_lead(
  p_name text,
  p_contact text,
  p_contact_type text,
  p_goals text[],
  p_journey_id text,
  p_journey_summary text,
  p_total_minutes integer,
  p_adjustments text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_contact is null or length(trim(p_contact)) = 0 then
    raise exception 'contact_required';
  end if;
  if length(p_contact) > 200 then
    raise exception 'contact_too_long';
  end if;
  insert into public.quiz_leads (member_id, name, contact, contact_type, goals, journey_id, journey_summary, total_minutes, adjustments)
  values (
    auth.uid(),
    nullif(left(trim(coalesce(p_name, '')), 120), ''),
    left(trim(p_contact), 200),
    case when p_contact_type in ('phone', 'email', 'line') then p_contact_type else 'other' end,
    p_goals,
    left(coalesce(p_journey_id, ''), 80),
    left(coalesce(p_journey_summary, ''), 400),
    p_total_minutes,
    p_adjustments
  );
end;
$fn$;
revoke execute on function public.submit_quiz_lead(text, text, text, text[], text, text, integer, text[]) from public;
grant execute on function public.submit_quiz_lead(text, text, text, text[], text, text, integer, text[]) to anon, authenticated;

-- Save the brand (Back Office › Settings › Brand). Admins only — checked here,
-- since the function runs as its owner. Takes one JSON object keyed by column
-- name (v0.41.0), so adding a setting never changes the signature. Missing or
-- empty keys store null = "use the default in code".
-- (The v0.39 version took nine text arguments; it's removed below.)
drop function if exists public.update_brand_settings(text, text, text, text, text, text, text, text, text);
create or replace function public.update_brand_settings(p jsonb)
returns public.brand_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r public.brand_settings;
  k text;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if coalesce(p->>'brand_color', '') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'bad_color' using errcode = '22023';
  end if;
  foreach k in array array['brand_fg_color', 'accent_color', 'soft_color'] loop
    if nullif(btrim(coalesce(p->>k, '')), '') is not null and btrim(p->>k) !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'bad_color' using errcode = '22023';
    end if;
  end loop;
  insert into public.brand_settings as b (id, brand_name, brand_name_en, brand_color, logo_url, phone, line_url, address, address_en, contact_email, logo_emblem_url, logo_wordmark_url, icon_url, brand_fg_color, accent_color, soft_color, city, city_en, map_lat, map_lng, map_url, hours, hours_en, visit_note, visit_note_en, facebook_url, instagram_url, tiktok_url, tagline, tagline_en, seo_title, seo_description, og_image_url, updated_at, updated_by)
  values (
    1,
    btrim(p->>'brand_name'),
    btrim(p->>'brand_name_en'),
    lower(p->>'brand_color'),
    nullif(btrim(coalesce(p->>'logo_url', '')), ''),
    nullif(btrim(coalesce(p->>'phone', '')), ''),
    nullif(btrim(coalesce(p->>'line_url', '')), ''),
    nullif(btrim(coalesce(p->>'address', '')), ''),
    nullif(btrim(coalesce(p->>'address_en', '')), ''),
    nullif(btrim(coalesce(p->>'contact_email', '')), ''),
    nullif(btrim(coalesce(p->>'logo_emblem_url', '')), ''),
    nullif(btrim(coalesce(p->>'logo_wordmark_url', '')), ''),
    nullif(btrim(coalesce(p->>'icon_url', '')), ''),
    lower(nullif(btrim(coalesce(p->>'brand_fg_color', '')), '')),
    lower(nullif(btrim(coalesce(p->>'accent_color', '')), '')),
    lower(nullif(btrim(coalesce(p->>'soft_color', '')), '')),
    nullif(btrim(coalesce(p->>'city', '')), ''),
    nullif(btrim(coalesce(p->>'city_en', '')), ''),
    nullif(btrim(coalesce(p->>'map_lat', '')), '')::double precision,
    nullif(btrim(coalesce(p->>'map_lng', '')), '')::double precision,
    nullif(btrim(coalesce(p->>'map_url', '')), ''),
    nullif(btrim(coalesce(p->>'hours', '')), ''),
    nullif(btrim(coalesce(p->>'hours_en', '')), ''),
    nullif(btrim(coalesce(p->>'visit_note', '')), ''),
    nullif(btrim(coalesce(p->>'visit_note_en', '')), ''),
    nullif(btrim(coalesce(p->>'facebook_url', '')), ''),
    nullif(btrim(coalesce(p->>'instagram_url', '')), ''),
    nullif(btrim(coalesce(p->>'tiktok_url', '')), ''),
    nullif(btrim(coalesce(p->>'tagline', '')), ''),
    nullif(btrim(coalesce(p->>'tagline_en', '')), ''),
    nullif(btrim(coalesce(p->>'seo_title', '')), ''),
    nullif(btrim(coalesce(p->>'seo_description', '')), ''),
    nullif(btrim(coalesce(p->>'og_image_url', '')), ''),
    now(),
    auth.uid()
  )
  on conflict (id) do update set
    brand_name = excluded.brand_name,
    brand_name_en = excluded.brand_name_en,
    brand_color = excluded.brand_color,
    logo_url = excluded.logo_url,
    phone = excluded.phone,
    line_url = excluded.line_url,
    address = excluded.address,
    address_en = excluded.address_en,
    contact_email = excluded.contact_email,
    logo_emblem_url = excluded.logo_emblem_url,
    logo_wordmark_url = excluded.logo_wordmark_url,
    icon_url = excluded.icon_url,
    brand_fg_color = excluded.brand_fg_color,
    accent_color = excluded.accent_color,
    soft_color = excluded.soft_color,
    city = excluded.city,
    city_en = excluded.city_en,
    map_lat = excluded.map_lat,
    map_lng = excluded.map_lng,
    map_url = excluded.map_url,
    hours = excluded.hours,
    hours_en = excluded.hours_en,
    visit_note = excluded.visit_note,
    visit_note_en = excluded.visit_note_en,
    facebook_url = excluded.facebook_url,
    instagram_url = excluded.instagram_url,
    tiktok_url = excluded.tiktok_url,
    tagline = excluded.tagline,
    tagline_en = excluded.tagline_en,
    seo_title = excluded.seo_title,
    seo_description = excluded.seo_description,
    og_image_url = excluded.og_image_url,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by
  returning * into r;
  return r;
end;
$fn$;
revoke execute on function public.update_brand_settings(jsonb) from public, anon;
grant execute on function public.update_brand_settings(jsonb) to authenticated;

-- =============================================================================
-- 4. Triggers
-- =============================================================================

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists protect_member_no on public.profiles;
create trigger protect_member_no
  before update on public.profiles
  for each row execute function public.protect_member_no();

drop trigger if exists protect_line_user_id on public.profiles;
create trigger protect_line_user_id
  before insert or update on public.profiles
  for each row execute function public.protect_line_user_id();

drop trigger if exists protect_role on public.profiles;
create trigger protect_role
  before insert or update on public.profiles
  for each row execute function public.protect_role();

drop trigger if exists member_package_items_fill on public.member_packages;
create trigger member_package_items_fill after insert on public.member_packages
for each row execute function public.member_package_items_fill();

drop trigger if exists sales_void_guard_items on public.sales;
create trigger sales_void_guard_items before update of voided_at on public.sales
for each row execute function public.sales_void_guard_items();

drop trigger if exists member_packages_entry on public.member_packages;
create trigger member_packages_entry before insert on public.member_packages
for each row execute function public.member_packages_entry();

-- =============================================================================
-- 5. Row level security, grants and policies
--    Every table has RLS on. Tables with no policy are reached only through
--    security-definer functions or the server (service role).
-- =============================================================================

-- profiles
alter table public.profiles enable row level security;
-- Staff look members up (scan / phone search), so they can read profiles.
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_staff());
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

-- account_merge_codes
alter table public.account_merge_codes enable row level security;
revoke all on public.account_merge_codes from anon, authenticated;

-- account_merge_events
alter table public.account_merge_events enable row level security;
revoke all on public.account_merge_events from anon, authenticated;

-- product_categories
alter table public.product_categories enable row level security;
revoke insert, update, delete on public.product_categories from anon, authenticated;
drop policy if exists "Staff read" on public.product_categories;
create policy "Staff read" on public.product_categories for select to authenticated using (public.is_staff());

-- products
alter table public.products enable row level security;
revoke insert, update, delete on public.products from anon, authenticated;
-- Staff read everything here (the desk needs it); nobody writes from the app.
drop policy if exists "Staff read" on public.products;
create policy "Staff read" on public.products for select to authenticated using (public.is_staff());

-- promotions
alter table public.promotions enable row level security;
revoke insert, update, delete on public.promotions from anon, authenticated;
drop policy if exists "Staff read" on public.promotions;
create policy "Staff read" on public.promotions for select to authenticated using (public.is_staff());

-- branches
alter table public.branches enable row level security;
revoke insert, update, delete on public.branches from anon, authenticated;
drop policy if exists "Staff read" on public.branches;
create policy "Staff read" on public.branches for select to authenticated using (public.is_staff());

-- sales
alter table public.sales enable row level security;
revoke insert, update, delete on public.sales from anon, authenticated;
-- Takings are admin business: staff sell through pos_* (security definer)
-- and never need to read bills directly.
drop policy if exists "Admins read" on public.sales;
create policy "Admins read" on public.sales for select to authenticated using (public.is_admin());

-- product_variants
alter table public.product_variants enable row level security;
revoke insert, update, delete on public.product_variants from anon, authenticated;
drop policy if exists "Staff read" on public.product_variants;
create policy "Staff read" on public.product_variants for select to authenticated using (public.is_staff());

-- sale_lines
alter table public.sale_lines enable row level security;
revoke insert, update, delete on public.sale_lines from anon, authenticated;
drop policy if exists "Admins read" on public.sale_lines;
create policy "Admins read" on public.sale_lines for select to authenticated using (public.is_admin());

-- member_packages
alter table public.member_packages enable row level security;
revoke insert, update, delete on public.member_packages from anon, authenticated;
drop policy if exists "Packages: own or staff" on public.member_packages;
create policy "Packages: own or staff" on public.member_packages for select to authenticated
  using (member_id = auth.uid() or public.is_staff());

-- visits
alter table public.visits enable row level security;
revoke insert, update, delete on public.visits from anon, authenticated;
drop policy if exists "Visits: own or staff" on public.visits;
create policy "Visits: own or staff"
  on public.visits for select to authenticated
  using (member_id = auth.uid() or public.is_staff());

-- staff_actions
alter table public.staff_actions enable row level security;
revoke insert, update, delete on public.staff_actions from anon, authenticated;
drop policy if exists "Staff actions: admins read" on public.staff_actions;
create policy "Staff actions: admins read"
  on public.staff_actions for select to authenticated
  using (public.is_admin());

-- email_verification_codes
alter table public.email_verification_codes enable row level security;
revoke all on public.email_verification_codes from anon, authenticated;

-- email_verification_events
alter table public.email_verification_events enable row level security;
revoke all on public.email_verification_events from anon, authenticated;

-- devices
alter table public.devices enable row level security;
revoke all on public.devices from anon, authenticated;

-- device_pairing_codes
alter table public.device_pairing_codes enable row level security;
revoke all on public.device_pairing_codes from anon, authenticated;

-- time_entries
alter table public.time_entries enable row level security;
revoke all on public.time_entries from anon, authenticated;

-- time_entry_edits
alter table public.time_entry_edits enable row level security;
revoke all on public.time_entry_edits from anon, authenticated;

-- shift_templates
alter table public.shift_templates enable row level security;
revoke all on public.shift_templates from anon, authenticated;

-- shift_assignments
alter table public.shift_assignments enable row level security;
revoke all on public.shift_assignments from anon, authenticated;

-- time_settings
alter table public.time_settings enable row level security;
revoke all on public.time_settings from anon, authenticated;

-- holidays
alter table public.holidays enable row level security;
revoke insert, update, delete on public.holidays from anon, authenticated;
drop policy if exists "Staff read" on public.holidays;
create policy "Staff read" on public.holidays for select to authenticated using (public.is_staff());

-- app_settings
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

-- staff_phone_access
alter table public.staff_phone_access enable row level security;
revoke all on public.staff_phone_access from anon, authenticated;

-- package_shares
alter table public.package_shares enable row level security;
revoke all on public.package_shares from anon, authenticated;

-- package_share_invites
alter table public.package_share_invites enable row level security;
revoke all on public.package_share_invites from anon, authenticated;

-- package_share_events
alter table public.package_share_events enable row level security;
revoke all on public.package_share_events from anon, authenticated;
grant select on public.package_share_events to authenticated;
drop policy if exists "Share events: admins" on public.package_share_events;
create policy "Share events: admins" on public.package_share_events for select to authenticated
  using (public.is_admin());

-- leave_requests
alter table public.leave_requests enable row level security;
revoke insert, update, delete on public.leave_requests from anon, authenticated;
drop policy if exists "Leave: own or admin" on public.leave_requests;
create policy "Leave: own or admin" on public.leave_requests for select to authenticated
  using (staff_id = auth.uid() or public.is_admin());

-- staff_pay
alter table public.staff_pay enable row level security;
revoke all on public.staff_pay from anon, authenticated;

-- checklist_points
alter table public.checklist_points enable row level security;
revoke all on public.checklist_points from anon, authenticated;

-- checklist_rounds
alter table public.checklist_rounds enable row level security;
revoke all on public.checklist_rounds from anon, authenticated;

-- checklist_scans
alter table public.checklist_scans enable row level security;
revoke all on public.checklist_scans from anon, authenticated;

-- cash_sessions
alter table public.cash_sessions enable row level security;
revoke all on public.cash_sessions from anon, authenticated;

-- calendar_items
alter table public.calendar_items enable row level security;
revoke all on public.calendar_items from anon, authenticated;

-- feedback_topics
alter table public.feedback_topics enable row level security;
revoke all on public.feedback_topics from anon, authenticated;

-- feedback
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

-- staff_commission
alter table public.staff_commission enable row level security;
revoke all on public.staff_commission from anon, authenticated;

-- commission_rules
alter table public.commission_rules enable row level security;
revoke all on public.commission_rules from anon, authenticated;

-- sale_commissions
alter table public.sale_commissions enable row level security;
revoke all on public.sale_commissions from anon, authenticated;

-- booking_categories
alter table public.booking_categories enable row level security;
revoke all on public.booking_categories from anon, authenticated;

-- booking_types
alter table public.booking_types enable row level security;
revoke all on public.booking_types from anon, authenticated;

-- booking_resources
alter table public.booking_resources enable row level security;
revoke all on public.booking_resources from anon, authenticated;

-- booking_hours
alter table public.booking_hours enable row level security;
revoke all on public.booking_hours from anon, authenticated;

-- bookings
alter table public.bookings enable row level security;
revoke all on public.bookings from anon, authenticated;

-- booking_pardons
alter table public.booking_pardons enable row level security;
revoke all on public.booking_pardons from anon, authenticated;

-- booking_templates
alter table public.booking_templates enable row level security;
revoke all on public.booking_templates from anon, authenticated;

-- staff_ref_codes
alter table public.staff_ref_codes enable row level security;
revoke all on public.staff_ref_codes from anon, authenticated;

-- member_referrals
alter table public.member_referrals enable row level security;
revoke all on public.member_referrals from anon, authenticated;

-- package_items
alter table public.package_items enable row level security;
revoke insert, update, delete on public.package_items from anon, authenticated;
drop policy if exists "Staff read" on public.package_items;
create policy "Staff read" on public.package_items for select to authenticated using (public.is_staff());

-- product_includes
alter table public.product_includes enable row level security;
revoke insert, update, delete on public.product_includes from anon, authenticated;
drop policy if exists "Staff read" on public.product_includes;
create policy "Staff read" on public.product_includes for select to authenticated using (public.is_staff());

-- visit_loans
alter table public.visit_loans enable row level security;
revoke insert, update, delete on public.visit_loans from anon, authenticated;
drop policy if exists "Staff read" on public.visit_loans;
create policy "Staff read" on public.visit_loans for select to authenticated using (public.is_staff());

-- member_package_items
alter table public.member_package_items enable row level security;
revoke insert, update, delete on public.member_package_items from anon, authenticated;
drop policy if exists "Staff or owner read" on public.member_package_items;
create policy "Staff or owner read" on public.member_package_items for select to authenticated using (
  public.is_staff()
  or exists (select 1 from public.member_packages mp where mp.id = member_package_id and mp.member_id = auth.uid())
);

-- package_item_uses
alter table public.package_item_uses enable row level security;
revoke insert, update, delete on public.package_item_uses from anon, authenticated;
drop policy if exists "Staff read" on public.package_item_uses;
create policy "Staff read" on public.package_item_uses for select to authenticated using (public.is_staff());

-- promotion_targets
alter table public.promotion_targets enable row level security;
revoke insert, update, delete on public.promotion_targets from anon, authenticated;
drop policy if exists "Staff read" on public.promotion_targets;
create policy "Staff read" on public.promotion_targets for select to authenticated using (public.is_staff());

-- product_branch_prices
alter table public.product_branch_prices enable row level security;
revoke insert, update, delete on public.product_branch_prices from anon, authenticated;
drop policy if exists "Staff read" on public.product_branch_prices;
create policy "Staff read" on public.product_branch_prices for select to authenticated using (public.is_staff());

-- product_branch_stock
alter table public.product_branch_stock enable row level security;
revoke insert, update, delete on public.product_branch_stock from anon, authenticated;
drop policy if exists "Staff read" on public.product_branch_stock;
create policy "Staff read" on public.product_branch_stock for select to authenticated using (public.is_staff());

-- variant_branch_stock
alter table public.variant_branch_stock enable row level security;
revoke insert, update, delete on public.variant_branch_stock from anon, authenticated;
drop policy if exists "Staff read" on public.variant_branch_stock;
create policy "Staff read" on public.variant_branch_stock for select to authenticated using (public.is_staff());

-- quiz_leads
alter table public.quiz_leads enable row level security;
revoke all on public.quiz_leads from anon;
revoke insert, update, delete on public.quiz_leads from authenticated;
grant select on public.quiz_leads to authenticated;
-- anon never touches the table directly (only the RPC below); authenticated may
-- read, but the RLS policy narrows that to staff. No one writes directly.
drop policy if exists "Staff read leads" on public.quiz_leads;
create policy "Staff read leads" on public.quiz_leads for select to authenticated using (public.is_staff());

-- brand_settings
alter table public.brand_settings enable row level security;
revoke all on public.brand_settings from anon, authenticated;
grant select on public.brand_settings to anon, authenticated;
drop policy if exists "Brand: everyone reads" on public.brand_settings;
create policy "Brand: everyone reads" on public.brand_settings for select to anon, authenticated using (true);

-- =============================================================================
-- 6. Storage buckets and their policies
-- =============================================================================

-- Private bucket: 1 MB per file, images only. The browser shrinks photos to
-- ~512px JPEG before upload, so real files are far smaller than the limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Attachments: private, read through short-lived links made by the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leave-docs', 'leave-docs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Category pictures: public (shown on the booking page), written only by
-- the server after an admin check. The browser shrinks them before upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('booking-images', 'booking-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Logo files: a public bucket (the site shows the logo to everyone). Only
-- admins may upload, replace or delete. If this insert is refused on your
-- project, create the bucket by hand (Storage › New bucket › "brand",
-- Public) — the policies below still apply.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Staff see photos at the desk to confirm the face matches the card.
drop policy if exists "Avatars: read own or admin" on storage.objects;
create policy "Avatars: read own or admin"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));

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

drop policy if exists "Brand: admin uploads" on storage.objects;
create policy "Brand: admin uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'brand' and public.is_admin());

drop policy if exists "Brand: admin updates" on storage.objects;
create policy "Brand: admin updates"
  on storage.objects for update to authenticated
  using (bucket_id = 'brand' and public.is_admin())
  with check (bucket_id = 'brand' and public.is_admin());

drop policy if exists "Brand: admin deletes" on storage.objects;
create policy "Brand: admin deletes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'brand' and public.is_admin());

-- =============================================================================
-- 7. Seed rows (each only when missing — re-running never overwrites)
-- =============================================================================

insert into public.time_settings (id) values (1) on conflict (id) do nothing;

-- The starting product categories (§37) — only on a new database (no products
-- yet); an existing shop keeps the categories it has.
insert into public.product_categories (legacy_kind, name_th, name_en, sort)
select v.legacy_kind, v.name_th, v.name_en, v.sort
from (values
  ('day_pass', 'Day Pass', 'Day Pass', 1),
  ('package', 'แพ็กเกจ', 'Packages', 2),
  ('addon', 'ส่วนเสริม', 'Add-ons', 3),
  ('merch', 'สินค้า', 'Merchandise', 4),
  ('souvenir', 'ของที่ระลึก', 'Souvenirs', 5)
) as v(legacy_kind, name_th, name_en, sort)
where not exists (select 1 from public.products)
on conflict (legacy_kind) do nothing;

insert into public.products (kind, name_th, name_en, price_weekday, price_weekend, price_holiday, sort, category_id)
select 'day_pass', 'Day Pass', 'Day Pass', 590, 790, 790, 0,
  (select id from public.product_categories where legacy_kind = 'day_pass')
where not exists (select 1 from public.products where kind = 'day_pass');

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

insert into public.feedback_topics (key, label, label_en, sort) values
  ('clean', 'ความสะอาด', 'Cleanliness', 1),
  ('staff', 'พนักงาน', 'Staff', 2),
  ('sauna', 'ซาวน่า', 'Sauna', 3),
  ('cold', 'น้ำเย็น', 'Cold plunge', 4),
  ('mood', 'บรรยากาศ', 'Atmosphere', 5)
on conflict (key) do nothing;

insert into public.branches (name, sort)
select 'สาขาหลัก', 0
where not exists (select 1 from public.branches);

insert into public.brand_settings (id, brand_name, brand_name_en, brand_color, logo_url, phone, line_url, address, address_en, contact_email)
values (
  1,
  'ราเวนต้า',
  'RAVENTA',
  '#8b1e2d',
  '/images/logo-full.png',
  '080-429-4264',
  'https://line.me/R/ti/p/@630xxrfx',
  'ราเวนต้า 18 ถนนเลียบชายหาดสุชาดา ต.เนินพระ อ.เมืองระยอง จ.ระยอง 21150',
  'RAVENTA, 18 Liab Chai Hat Suchada Road, Noen Phra, Mueang Rayong, Rayong 21150, Thailand',
  'raventa.wellness@gmail.com'
)
on conflict (id) do nothing;
