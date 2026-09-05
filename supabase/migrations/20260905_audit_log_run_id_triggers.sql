-- Audit Trail: denormalized run_id + SECURITY DEFINER triggers
-- Applied on staging (qfai-staging / nlenbzhwnyigsihcphoz) 2026-09-05.
-- Additive only — does NOT wipe audit_log or invent changed_by backfill.
--
-- Staging applied as:
--   20260905045918 audit_log_run_id_and_triggers
--   20260905045947 audit_trail_triggers
--   20260905050013 audit_trail_helpers_actor_text
--
-- This file documents the qf_audit_* contract the app relies on:
--   * audit_log.run_id for the run Audit Trail tab
--   * qf_audit_actor() = auth.uid() OR current_setting('app.user_id')
--   * AFTER INSERT/UPDATE triggers on cost_fields / shows / advancement_items
--
-- Note: advancement_items has no `done` column (status = 'done' is the flag).
-- Staging’s first qf_audit_advancement_items referenced NEW.done and would
-- fail UPDATEs; this copy audits status / assigned_to / notes only.
--
-- Service-role API writes have auth.uid() IS NULL. The Next.js admin client
-- should call writeAuditLog() with the session user, and set updated_by
-- where that column exists. set_config('app.user_id', …, true) only lasts
-- for the current transaction — a separate PostgREST RPC cannot feed the
-- following UPDATE.

-- ── Column + indexes ─────────────────────────────────────────────────────

alter table public.audit_log
  add column if not exists run_id uuid;

comment on column public.audit_log.run_id is
  'Denormalized run for Audit Trail tab; filled by triggers from NEW.run_id.';

create index if not exists audit_log_run_id_idx
  on public.audit_log (run_id);

create index if not exists audit_log_run_id_changed_at_idx
  on public.audit_log (run_id, changed_at desc);

create index if not exists audit_log_record_id_idx
  on public.audit_log (record_id);

-- Last editor on service-role writes (staging already has these).
-- Triggers that coalesce auth.uid() / app.user_id / NEW.updated_by use this
-- when the admin client has no JWT uid.
alter table public.cost_fields
  add column if not exists updated_by uuid references public.profiles(id);
alter table public.shows
  add column if not exists updated_by uuid references public.profiles(id);

comment on column public.cost_fields.updated_by is
  'Last editor; set by API on service-role writes so audit triggers can record changed_by when auth.uid() is null.';
comment on column public.shows.updated_by is
  'Last editor; set by API on service-role writes so audit triggers can record changed_by when auth.uid() is null.';

-- ── Actor + row helper ───────────────────────────────────────────────────

create or replace function public.qf_audit_actor()
returns uuid
language sql
stable
as $$
  select coalesce(
    auth.uid(),
    nullif(current_setting('app.user_id', true), '')::uuid
  );
$$;

create or replace function public.qf_audit_log_row(
  p_table text,
  p_record_id uuid,
  p_run_id uuid,
  p_field text,
  p_old text,
  p_new text,
  p_change text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_old is distinct from p_new then
    insert into audit_log (
      table_name, record_id, run_id, field_name, old_value, new_value, changed_by, change_type
    )
    values (
      p_table, p_record_id, p_run_id, p_field, p_old, p_new, public.qf_audit_actor(), p_change
    );
  end if;
end;
$$;

-- ── cost_fields ──────────────────────────────────────────────────────────

create or replace function public.qf_audit_cost_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ch text := case when tg_op = 'INSERT' then 'insert' else 'update' end;
begin
  if tg_op = 'INSERT' then
    perform public.qf_audit_log_row('cost_fields', new.id, new.run_id, 'value', null, new.value::text, ch);
    perform public.qf_audit_log_row('cost_fields', new.id, new.run_id, 'state', null, new.state, ch);
    perform public.qf_audit_log_row('cost_fields', new.id, new.run_id, 'source', null, new.source, ch);
    perform public.qf_audit_log_row('cost_fields', new.id, new.run_id, 'entries', null, new.entries::text, ch);
    perform public.qf_audit_log_row('cost_fields', new.id, new.run_id, 'line_items', null, new.line_items::text, ch);
    return new;
  end if;
  perform public.qf_audit_log_row('cost_fields', new.id, new.run_id, 'value', old.value::text, new.value::text, ch);
  perform public.qf_audit_log_row('cost_fields', new.id, new.run_id, 'state', old.state, new.state, ch);
  perform public.qf_audit_log_row('cost_fields', new.id, new.run_id, 'source', old.source, new.source, ch);
  perform public.qf_audit_log_row('cost_fields', new.id, new.run_id, 'entries', old.entries::text, new.entries::text, ch);
  perform public.qf_audit_log_row('cost_fields', new.id, new.run_id, 'line_items', old.line_items::text, new.line_items::text, ch);
  perform public.qf_audit_log_row('cost_fields', new.id, new.run_id, 'label', old.label, new.label, ch);
  return new;
end;
$$;

drop trigger if exists trg_qf_audit_cost_fields on public.cost_fields;
create trigger trg_qf_audit_cost_fields
  after insert or update on public.cost_fields
  for each row execute function public.qf_audit_cost_fields();

-- ── shows ────────────────────────────────────────────────────────────────

create or replace function public.qf_audit_shows()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ch text := case when tg_op = 'INSERT' then 'insert' else 'update' end;
  cols text[] := array[
    'venue_name','venue_city','state_territory','show_date','capacity','ticket_price',
    'harbour_status','michael_notes','venue_address','venue_phone','venue_contact',
    'sets_label','production_company','production_contact','backline_company','backline_contact',
    'sched_access','sched_soundcheck','sched_dinner','sched_doors','sched_show','sched_finish',
    'travel_access_notes','hotel_notes','hospitality_merch_notes','capacity_bands'
  ];
  c text;
  old_v text;
  new_v text;
begin
  foreach c in array cols loop
    execute format('select ($1).%I::text, ($2).%I::text', c, c) into old_v, new_v using old, new;
    if tg_op = 'INSERT' then old_v := null; end if;
    perform public.qf_audit_log_row('shows', new.id, new.run_id, c, old_v, new_v, ch);
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_qf_audit_shows on public.shows;
create trigger trg_qf_audit_shows
  after insert or update on public.shows
  for each row execute function public.qf_audit_shows();

-- ── advancement_items ────────────────────────────────────────────────────

create or replace function public.qf_audit_advancement_items()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ch text := case when tg_op = 'INSERT' then 'insert' else 'update' end;
begin
  if tg_op = 'INSERT' then
    perform public.qf_audit_log_row('advancement_items', new.id, new.run_id, 'status', null, new.status::text, ch);
    perform public.qf_audit_log_row('advancement_items', new.id, new.run_id, 'assigned_to', null, new.assigned_to::text, ch);
    perform public.qf_audit_log_row('advancement_items', new.id, new.run_id, 'notes', null, new.notes::text, ch);
    return new;
  end if;
  perform public.qf_audit_log_row('advancement_items', new.id, new.run_id, 'status', old.status::text, new.status::text, ch);
  perform public.qf_audit_log_row('advancement_items', new.id, new.run_id, 'assigned_to', old.assigned_to::text, new.assigned_to::text, ch);
  perform public.qf_audit_log_row('advancement_items', new.id, new.run_id, 'notes', old.notes::text, new.notes::text, ch);
  return new;
end;
$$;

drop trigger if exists trg_qf_audit_advancement_items on public.advancement_items;
create trigger trg_qf_audit_advancement_items
  after insert or update on public.advancement_items
  for each row execute function public.qf_audit_advancement_items();
