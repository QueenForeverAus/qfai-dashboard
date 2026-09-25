-- Ticket Sales & Ads: On-sale tracker (v1). ADDITIVE ONLY. Apply on staging (nlenbzhwnyigsihcphoz) only.
-- One row per show. Every state column is NULLABLE: null = "unknown" (never guessed).
-- 'none' / 'not_built' are explicit, known states.
-- v2 sync hook: each auto-fillable group (website / fb_event / er_ad / ticket_ad / pixel) has
--   <group>_source ('manual' | 'wp' | 'meta') and <group>_synced_at. A later WP / Meta Graph sync
--   job writes the group columns plus source + synced_at; manual edits set source back to 'manual'.
--   Sync itself is NOT built in v1.
-- History: an AFTER INSERT/UPDATE trigger writes one onsale_tracker_history row per changed field
--   (field, old_value, new_value, actor, changed_at, source). Actor = NEW.updated_by (the app sets it
--   to the signed-in owner/admin on every save; the server uses the admin client like Slice 1, so
--   auth.uid() is null there), falling back to auth.uid().

create table if not exists public.onsale_tracker (
  show_id uuid primary key references public.shows(id) on delete cascade,

  -- Key dates (timestamptz; displayed in Australia/Melbourne with AEST/AEDT label)
  announce_at timestamptz,
  presale_at timestamptz,
  general_onsale_at timestamptz,
  show_local_tz text,                         -- e.g. 'Australia/Perth'; null = same as Melbourne / unknown

  -- Ticket link
  ticket_link_state text check (ticket_link_state is null or ticket_link_state in ('none','received','approved','live')),
  ticket_link_url text,
  ticket_link_platform text,                  -- TicketSearch / Ticketek / Ticketmaster / Spektrix / venue
  ticket_link_received_at timestamptz,        -- start of the 24h "awaiting Gareth" clock
  ticket_link_approved_at timestamptz,
  ticket_link_live_at timestamptz,

  -- EDM
  edm_state text check (edm_state is null or edm_state in ('none','draft_received','approved','sent_scheduled')),
  edm_received_at timestamptz,                -- start of the 24h "awaiting Gareth" clock
  edm_send_date date,                         -- date only when the time is not known
  edm_send_at timestamptz,                    -- exact send time when known

  -- Website (queenforever.com.au)
  website_state text check (website_state is null or website_state in ('not_built','scheduled','live')),
  website_go_live_at timestamptz,
  website_wp_post_id integer,
  website_url text,
  website_source text not null default 'manual' check (website_source in ('manual','wp','meta')),
  website_synced_at timestamptz,

  -- Facebook Event
  fb_event_state text check (fb_event_state is null or fb_event_state in ('none','drafted','live')),
  fb_event_id text,
  fb_event_url text,
  fb_event_live_at timestamptz,               -- start of the 24h "ER ad must exist" clock
  fb_event_venue_cohost boolean,
  fb_event_source text not null default 'manual' check (fb_event_source in ('manual','wp','meta')),
  fb_event_synced_at timestamptz,

  -- Event Response ad
  er_ad_state text check (er_ad_state is null or er_ad_state in ('none','paused','running','ended')),
  er_campaign_id text,
  er_paused_since timestamptz,                -- start of the 48h "waiting on GO" clock
  er_spend_to_date numeric(12,2),
  er_budget numeric(12,2),
  er_ad_source text not null default 'manual' check (er_ad_source in ('manual','wp','meta')),
  er_ad_synced_at timestamptz,

  -- Ticket (sales / traffic) ad
  ticket_ad_state text check (ticket_ad_state is null or ticket_ad_state in ('none','paused','running','ended')),
  ticket_campaign_id text,
  ticket_paused_since timestamptz,
  ticket_spend_to_date numeric(12,2),
  ticket_budget numeric(12,2),
  ticket_ad_source text not null default 'manual' check (ticket_ad_source in ('manual','wp','meta')),
  ticket_ad_synced_at timestamptz,

  -- Meta pixel on the ticketing path
  pixel_state text check (pixel_state is null or pixel_state in ('ours_added','chasing','cant_add')),
  pixel_platform text,                        -- venue ticketing platform (esp. for cant_add)
  pixel_verified_at timestamptz,
  pixel_source text not null default 'manual' check (pixel_source in ('manual','wp','meta')),
  pixel_synced_at timestamptz,

  -- Action / flags
  next_action text,
  next_action_owner text check (next_action_owner is null or next_action_owner in ('Gareth','Comms','Website','Marketing','Harbour')),
  manual_red_flag boolean not null default false,
  manual_red_reason text,
  notes text,
  source_of_data text,                        -- Notes / Source of Data pattern

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.onsale_tracker_history (
  id bigint generated always as identity primary key,
  show_id uuid not null references public.shows(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  actor uuid references public.profiles(id),
  changed_at timestamptz not null default now(),
  source text not null default 'manual'       -- 'manual' | 'seed' | 'wp' | 'meta'
);

create index if not exists onsale_tracker_history_show_idx
  on public.onsale_tracker_history (show_id, changed_at desc);

create or replace function public.onsale_tracker_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  new_j jsonb := to_jsonb(new);
  old_j jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  who uuid := coalesce(new.updated_by, auth.uid());
  src text := coalesce(nullif(current_setting('app.onsale_change_source', true), ''), 'manual');
begin
  for k in select jsonb_object_keys(new_j) loop
    if k in ('show_id','created_at','updated_at','updated_by') then
      continue;
    end if;
    if tg_op = 'INSERT' and (new_j -> k) = 'null'::jsonb then
      continue;
    end if;
    if (old_j -> k) is distinct from (new_j -> k) then
      insert into public.onsale_tracker_history (show_id, field, old_value, new_value, actor, source)
      values (new.show_id, k, old_j ->> k, new_j ->> k, who, src);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists onsale_tracker_audit_trg on public.onsale_tracker;
create trigger onsale_tracker_audit_trg
  after insert or update on public.onsale_tracker
  for each row execute function public.onsale_tracker_audit();

create or replace function public.onsale_tracker_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists onsale_tracker_touch_trg on public.onsale_tracker;
create trigger onsale_tracker_touch_trg
  before update on public.onsale_tracker
  for each row execute function public.onsale_tracker_touch();

alter table public.onsale_tracker enable row level security;
alter table public.onsale_tracker_history enable row level security;

revoke all on table public.onsale_tracker from anon, public;
revoke all on table public.onsale_tracker_history from anon, public;

grant select, insert, update on table public.onsale_tracker to authenticated;
grant select on table public.onsale_tracker_history to authenticated;
grant select, insert, update, delete on table public.onsale_tracker to service_role;
grant select, insert on table public.onsale_tracker_history to service_role;

drop policy if exists "Owners and admins can read onsale tracker" on public.onsale_tracker;
create policy "Owners and admins can read onsale tracker"
  on public.onsale_tracker for select to authenticated
  using ((select get_my_role()) = any (array['admin'::text, 'owner'::text]));

drop policy if exists "Owners and admins can insert onsale tracker" on public.onsale_tracker;
create policy "Owners and admins can insert onsale tracker"
  on public.onsale_tracker for insert to authenticated
  with check ((select get_my_role()) = any (array['admin'::text, 'owner'::text]));

drop policy if exists "Owners and admins can update onsale tracker" on public.onsale_tracker;
create policy "Owners and admins can update onsale tracker"
  on public.onsale_tracker for update to authenticated
  using ((select get_my_role()) = any (array['admin'::text, 'owner'::text]))
  with check ((select get_my_role()) = any (array['admin'::text, 'owner'::text]));

drop policy if exists "Owners and admins can read onsale tracker history" on public.onsale_tracker_history;
create policy "Owners and admins can read onsale tracker history"
  on public.onsale_tracker_history for select to authenticated
  using ((select get_my_role()) = any (array['admin'::text, 'owner'::text]));
-- No insert/update/delete policy on history for authenticated: rows are written only by the
-- security-definer trigger. History is append-only (status history must be kept).
