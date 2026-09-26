-- APPLY run-level cost_fields dedupe. STAGING ONLY.
-- Not an auto-applied migration. Refuses to run unless this transaction has
--   select set_config('qf.dedupe_apply', 'yes', true);
-- Never point this at production (pfbgrukqxegkiaksuatm).
--
-- Prints the batch_id via RAISE NOTICE. Rollback is in the dry-run file header.

begin;

select set_config('qf.dedupe_apply', 'yes', true);

create table if not exists public.cost_fields_run_level_dedupe_backup (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  cost_field_id uuid not null,
  run_id uuid not null,
  field_key text not null,
  keeper_id uuid not null,
  row_data jsonb not null,
  deleted_at timestamptz not null default now()
);

alter table public.cost_fields_run_level_dedupe_backup enable row level security;

comment on table public.cost_fields_run_level_dedupe_backup is
  'Rollback snapshot of run-level cost_fields rows removed by the manual dedupe script. No policies: SQL/service role only.';

do $$
declare
  batch uuid := gen_random_uuid();
  removed int := 0;
begin
  if current_setting('qf.dedupe_apply', true) is distinct from 'yes' then
    raise exception 'Refusing dedupe apply: set qf.dedupe_apply = yes in this transaction';
  end if;

  create temp table _dedupe_drop on commit drop as
  with base as (
    select
      cf.id,
      cf.run_id,
      cf.field_key,
      cf.created_at,
      (
        coalesce(cf.value, 0) <> 0
        or (
          jsonb_typeof(cf.entries) = 'array'
          and exists (
            select 1
            from jsonb_array_elements(cf.entries) e
            where coalesce((e->>'amount')::numeric, 0) <> 0
          )
        )
        or (
          jsonb_typeof(cf.line_items) = 'array'
          and exists (
            select 1
            from jsonb_array_elements(cf.line_items) e
            where coalesce((e->>'rate')::numeric, 0)
                * coalesce((e->>'hours')::numeric, 0)
                * coalesce((e->>'headcount')::numeric, 0) <> 0
          )
        )
      ) as nonzero_money,
      (
        (jsonb_typeof(cf.entries) = 'array' and jsonb_array_length(cf.entries) > 0)
        or (jsonb_typeof(cf.line_items) = 'array' and jsonb_array_length(cf.line_items) > 0)
      ) as has_line_items,
      (cf.updated_by is not null) as human_edit
    from public.cost_fields cf
    where cf.show_id is null
  ),
  ranked as (
    select
      base.*,
      first_value(id) over (
        partition by run_id, field_key
        order by
          nonzero_money desc,
          has_line_items desc,
          human_edit desc,
          created_at asc,
          id asc
      ) as keeper_id,
      count(*) over (partition by run_id, field_key) as copies
    from base
  )
  select id as cost_field_id, run_id, field_key, keeper_id
  from ranked
  where copies > 1
    and id <> keeper_id;

  insert into public.cost_fields_run_level_dedupe_backup (
    batch_id, cost_field_id, run_id, field_key, keeper_id, row_data
  )
  select
    batch,
    d.cost_field_id,
    d.run_id,
    d.field_key,
    d.keeper_id,
    to_jsonb(cf)
  from _dedupe_drop d
  join public.cost_fields cf on cf.id = d.cost_field_id;

  get diagnostics removed = row_count;

  update public.field_comments fc
  set cost_field_id = d.keeper_id
  from _dedupe_drop d
  where fc.cost_field_id = d.cost_field_id;

  delete from public.cost_fields cf
  using _dedupe_drop d
  where cf.id = d.cost_field_id;

  raise notice 'dedupe batch % removed % run-level cost_fields rows', batch, removed;
end $$;

commit;
