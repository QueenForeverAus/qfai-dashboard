-- Queen Forever Tours - Database Schema
-- Apply this in Supabase SQL Editor

-- Profiles (extends auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  email text not null,
  role text not null default 'external' check (role in ('admin','owner','crew','production','external')),
  permissions jsonb default '{}',
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);

create policy "Admins can view all profiles" on profiles
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can update profiles" on profiles
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'external');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Runs
create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'proposed' check (status in ('proposed','confirmed','booking','show_week','post_show','settled','archived')),
  region text not null default 'group1' check (region in ('group1','group2','group3')),
  start_date date,
  end_date date,
  completion_pct integer default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table runs enable row level security;

create policy "Authenticated users can view runs" on runs
  for select using (auth.role() = 'authenticated');

create policy "Admins and owners can modify runs" on runs
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','owner'))
  );

-- Shows
create table if not exists shows (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs on delete cascade not null,
  venue_name text not null,
  venue_city text not null,
  state_territory text,
  show_date date,
  capacity integer,
  capacity_bands jsonb,
  ticket_price decimal(10,2),
  sell_through_pct integer,
  show_order integer not null default 1,
  harbour_status text,
  ticket_outlook text,
  ticket_outlook_level text check (ticket_outlook_level is null or ticket_outlook_level in ('clear','watch','impediment')),
  ticket_outlook_status text not null default 'empty' check (ticket_outlook_status in ('empty','draft','confirmed')),
  ticket_outlook_as_of timestamptz,
  ticket_outlook_sources jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table shows enable row level security;

create policy "Authenticated users can view shows" on shows
  for select using (auth.role() = 'authenticated');

create policy "Admins and owners can modify shows" on shows
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','owner'))
  );

-- Cost fields (the green/orange/red data cells)
create table if not exists cost_fields (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs on delete cascade not null,
  show_id uuid references shows on delete cascade,
  category text not null,
  field_key text not null,
  label text not null,
  value decimal(12,2),
  state text not null default 'guess' check (state in ('known','estimated','guess','pending')),
  source text,
  verified_by uuid references profiles,
  verified_at timestamptz,
  assigned_to uuid references profiles,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(run_id, show_id, field_key)
);

alter table cost_fields enable row level security;

create policy "Authenticated users can view cost fields" on cost_fields
  for select using (auth.role() = 'authenticated');

create policy "Admins and owners can modify cost fields" on cost_fields
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','owner'))
  );

-- Audit log
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  field_name text,
  old_value text,
  new_value text,
  changed_by uuid references profiles,
  changed_at timestamptz default now(),
  change_type text not null check (change_type in ('insert','update','delete'))
);

alter table audit_log enable row level security;

create policy "Admins and owners can view audit log" on audit_log
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','owner'))
  );

create policy "System can insert audit log" on audit_log
  for insert with check (auth.role() = 'authenticated');

-- Field comments
create table if not exists field_comments (
  id uuid primary key default gen_random_uuid(),
  cost_field_id uuid references cost_fields on delete cascade not null,
  author_id uuid references profiles not null,
  body text not null,
  created_at timestamptz default now()
);

alter table field_comments enable row level security;

create policy "Authenticated users can view comments" on field_comments
  for select using (auth.role() = 'authenticated');

create policy "Authenticated users can add comments" on field_comments
  for insert with check (auth.uid() = author_id);

-- Feature requests
create table if not exists feature_requests (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references profiles not null,
  title text not null,
  description text,
  status text default 'pending' check (status in ('pending','reviewing','planned','done','rejected')),
  created_at timestamptz default now()
);

alter table feature_requests enable row level security;

create policy "Users can view own requests" on feature_requests
  for select using (auth.uid() = submitted_by);

create policy "Admins can view all requests" on feature_requests
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Authenticated users can submit requests" on feature_requests
  for insert with check (auth.uid() = submitted_by);

-- Advancement checklist (run-level + per-show)
-- show_id null = run scope; show_id set = that show
-- Unique: (run_id, item_key) where show_id is null
--         (run_id, item_key, show_id) where show_id is not null

-- Virtual Show Pack / Worksheet (additive migrations)
-- see supabase/migrations/20260903_show_pack_and_advancing.sql
-- see supabase/migrations/20260904_worksheet_advance_fields.sql
-- shows.michael_notes text
-- shows.venue_address, venue_phone, venue_contact
-- shows.sets_label default '2 x 60'
-- shows.production_company, production_contact
-- shows.backline_company, backline_contact (G3)
-- shows.sched_access/soundcheck/dinner/doors/show/finish (defaults)
-- shows.travel_access_notes, hotel_notes, hospitality_merch_notes
-- runs.show_pack_status text draft|published
-- runs.show_pack_published_at timestamptz
-- runs.show_pack_published_by uuid -> profiles
-- runs.flights_notes, vehicles_notes, hotels_overview_notes

-- Advancing Shows owners: gareth|michael|harbour|anita|brad|finance|nigel
-- (legacy tour_manager/production_manager mapped in app to gareth/michael)
-- Migration of advancement_items: additive seed of new item_keys on GET;
-- legacy keys soft-ignored in API response; overlapping keys keep status;
-- wrong-scope orphans deleted only after new-scope copies exist.
