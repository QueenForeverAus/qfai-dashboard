-- Self-serve Portal Profile + passport PII.
-- Additive only. Staging apply; no prod in this job.
--
-- Storage:
--   public.profiles — contact / FF / travel prefs / extras (additive columns)
--   public.profile_passports — dedicated 1:1 passport + DOB table (sensitive PII)
--
-- RLS (both tables):
--   anon: no policies; privileges revoked
--   authenticated self: SELECT + UPDATE own row (INSERT own passport row)
--   admin: ALL via get_my_role()
--   owner: SELECT + UPDATE via get_my_role() (ops)
--
-- Encryption-at-rest for passport_number is a follow-up (do not block).

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists nickname text,
  add column if not exists mobile text,
  add column if not exists qantas_ff text,
  add column if not exists virgin_ff text,
  add column if not exists dietary_requirements text,
  add column if not exists seat_preference text,
  add column if not exists hotel_memberships jsonb not null default '[]'::jsonb,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_mobile text,
  add column if not exists allergies_medical text,
  add column if not exists shirt_size text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_seat_preference_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_seat_preference_check
      check (seat_preference is null or seat_preference in ('middle', 'window', 'aisle'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_shirt_size_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_shirt_size_check
      check (shirt_size is null or shirt_size in ('S', 'M', 'L', 'XL', 'XXL'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_hotel_memberships_array_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_hotel_memberships_array_check
      check (jsonb_typeof(hotel_memberships) = 'array');
  end if;
end $$;

-- Best-effort split of existing display names. Leaves last_name null for single-token names.
update public.profiles
set
  first_name = coalesce(nullif(first_name, ''), nullif(split_part(trim(full_name), ' ', 1), '')),
  last_name = coalesce(
    nullif(last_name, ''),
    nullif(trim(substring(trim(full_name) from length(split_part(trim(full_name), ' ', 1)) + 1)), '')
  )
where full_name is not null and trim(full_name) <> '';

create table if not exists public.profile_passports (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  passport_number text,
  nationality text,
  passport_name text,
  date_of_birth date,
  expiry_date date,
  place_of_issue text,
  updated_at timestamptz not null default now()
);

comment on table public.profile_passports is
  'PII: passport + DOB for tour travel. RLS own-row; admin/owner staff. No public RPC.';
comment on column public.profile_passports.passport_number is
  'PII — do not write to audit_log or application logs. Encryption-at-rest follow-up.';
comment on column public.profile_passports.date_of_birth is
  'PII — required for some flight/NZ bookings. Do not log.';
comment on column public.profiles.qantas_ff is
  'PII — frequent flyer. Do not write full number to audit_log.';
comment on column public.profiles.virgin_ff is
  'PII — frequent flyer. Do not write full number to audit_log.';
comment on column public.profiles.mobile is
  'PII — contact mobile.';
comment on column public.profiles.emergency_contact_mobile is
  'PII — ICE mobile.';
comment on column public.profiles.hotel_memberships is
  'Flexible hotel loyalty rows: [{programme_name, membership_number}]. No fixed brands.';
comment on column public.profiles.seat_preference is
  'Plane seat: middle | window | aisle. Null = unset / no preference.';

create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role / SQL editor have no JWT; allow invite + admin-client writes.
  if auth.uid() is null then
    return new;
  end if;
  if public.get_my_role() = 'admin' then
    return new;
  end if;
  new.id := old.id;
  new.role := old.role;
  new.permissions := old.permissions;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileged_columns on public.profiles;
create trigger protect_profile_privileged_columns
  before update on public.profiles
  for each row
  execute function public.protect_profile_privileged_columns();

alter table public.profiles enable row level security;
alter table public.profile_passports enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.profile_passports from anon;
revoke all on table public.profiles from public;
revoke all on table public.profile_passports from public;
revoke all on table public.profiles from authenticated;
revoke all on table public.profile_passports from authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update on table public.profile_passports to authenticated;

-- Trigger-only; must not be callable as a PostgREST RPC.
revoke execute on function public.protect_profile_privileged_columns() from anon, authenticated, public;

drop policy if exists "Admins can manage profiles" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Owners can view profiles" on public.profiles;
drop policy if exists "Owners can update profiles" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Owners can view profiles" on public.profiles
  for select using (get_my_role() = 'owner');

create policy "Owners can update profiles" on public.profiles
  for update
  using (get_my_role() = 'owner')
  with check (get_my_role() = 'owner');

-- Admin manage-all. Do not OR auth.uid() = id — that previously let any user
-- UPDATE role/permissions on their own row via the ALL policy.
create policy "Admins can manage profiles" on public.profiles
  for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

drop policy if exists "Users can view own passport" on public.profile_passports;
drop policy if exists "Users can update own passport" on public.profile_passports;
drop policy if exists "Users can insert own passport" on public.profile_passports;
drop policy if exists "Staff can view passports" on public.profile_passports;
drop policy if exists "Staff can update passports" on public.profile_passports;
drop policy if exists "Staff can insert passports" on public.profile_passports;
drop policy if exists "Admins can manage passports" on public.profile_passports;

create policy "Users can view own passport" on public.profile_passports
  for select using (auth.uid() = profile_id);

create policy "Users can update own passport" on public.profile_passports
  for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

create policy "Users can insert own passport" on public.profile_passports
  for insert
  with check (auth.uid() = profile_id);

create policy "Staff can view passports" on public.profile_passports
  for select using (get_my_role() = any (array['admin'::text, 'owner'::text]));

create policy "Staff can update passports" on public.profile_passports
  for update
  using (get_my_role() = any (array['admin'::text, 'owner'::text]))
  with check (get_my_role() = any (array['admin'::text, 'owner'::text]));

create policy "Staff can insert passports" on public.profile_passports
  for insert
  with check (get_my_role() = any (array['admin'::text, 'owner'::text]));
