-- Dedupe run-level cost_fields duplicates (show_id IS NULL).
--
-- NOT an auto-applied migration. Do not put this file in supabase/migrations.
-- Staging: review the DRY RUN, then run the APPLY block by hand.
-- Prod: DRY RUN only, and only after a separate approval. Never run APPLY on
-- prod from this change.
--
-- Keeper (highest wins; no merging of the dropped row into the keeper):
--   1. non-zero money (value, entries[].amount, or line_items role total)
--   2. has line items (entries or line_items array is non-empty)
--   3. human edit (updated_by is set)
--   4. else oldest created_at, then lowest id
--
-- Matches lib/cost-field-dedupe.ts. APPLY copies each dropped row into
-- public.cost_fields_run_level_dedupe_backup (jsonb) before deleting it.
-- field_comments on a dropped row are re-pointed at the keeper so a note
-- is not cascade-deleted. Cost amounts are not combined.
--
-- Rollback (staging), after APPLY, using the printed batch_id:
--   insert into public.cost_fields
--   select (jsonb_populate_record(null::public.cost_fields, b.row_data)).*
--   from public.cost_fields_run_level_dedupe_backup b
--   where b.batch_id = '<batch_id>'
--   on conflict (id) do nothing;

-- ===================== DRY RUN (read-only) =====================

with base as (
  select
    cf.*,
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
    row_number() over (
      partition by run_id, field_key
      order by
        nonzero_money desc,
        has_line_items desc,
        human_edit desc,
        created_at asc,
        id asc
    ) as keeper_rank,
    count(*) over (partition by run_id, field_key) as copies
  from base
)
select
  r.code as run_code,
  ranked.run_id,
  ranked.field_key,
  ranked.id,
  ranked.keeper_rank,
  ranked.value,
  ranked.nonzero_money,
  ranked.has_line_items,
  ranked.human_edit,
  ranked.created_at,
  case when ranked.keeper_rank = 1 then 'KEEP' else 'DROP' end as action
from ranked
join public.runs r on r.id = ranked.run_id
where ranked.copies > 1
order by r.code, ranked.field_key, ranked.keeper_rank;

-- Pair count:
-- select count(*) as duplicate_pairs
-- from (
--   select run_id, field_key
--   from public.cost_fields
--   where show_id is null
--   group by run_id, field_key
--   having count(*) > 1
-- ) d;

-- ===================== APPLY (staging only; commented) =====================
-- Uncomment and run as one transaction on STAGING after reading the dry run.
-- Refuses to do anything unless qf.dedupe_apply is 'yes' in this transaction.
--
-- begin;
-- select set_config('qf.dedupe_apply', 'yes', true);
--
-- create table if not exists public.cost_fields_run_level_dedupe_backup (
--   id uuid primary key default gen_random_uuid(),
--   batch_id uuid not null,
--   cost_field_id uuid not null,
--   run_id uuid not null,
--   field_key text not null,
--   keeper_id uuid not null,
--   row_data jsonb not null,
--   deleted_at timestamptz not null default now()
-- );
-- alter table public.cost_fields_run_level_dedupe_backup enable row level security;
-- comment on table public.cost_fields_run_level_dedupe_backup is
--   'Rollback snapshot of run-level cost_fields rows removed by scripts/dedupe-run-level-cost-fields.sql. No policies: SQL/service role only.';
--
-- -- Then run the DO block in scripts/dedupe-run-level-cost-fields-apply.sql
-- -- (kept separate so a casual execute of this file cannot delete rows).
-- commit;
