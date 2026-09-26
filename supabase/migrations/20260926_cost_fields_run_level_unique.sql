-- Run-level cost_fields: one row per (run_id, field_key) when show_id is null.
-- Additive. Does not delete anything.
--
-- unique(run_id, show_id, field_key) does not cover NULL show_id, so the
-- page-load create race inserted duplicate run-level rows. This partial
-- index closes that once the duplicates are gone.
--
-- Prod still has those duplicates until scripts/dedupe-run-level-cost-fields.sql
-- is approved and run. If any pair remains, this migration skips the index
-- and does not fail. Re-run the CREATE INDEX after that dedupe
-- (the migration itself will not run a second time).

do $$
begin
  if to_regclass('public.cost_fields') is null then
    return;
  end if;

  if exists (
    select 1
    from public.cost_fields
    where show_id is null
    group by run_id, field_key
    having count(*) > 1
  ) then
    raise notice 'Skipped cost_fields_run_level_field_key_uidx: run-level duplicates remain. Run scripts/dedupe-run-level-cost-fields.sql on this database first, then create the index.';
    return;
  end if;

  if to_regclass('public.cost_fields_run_level_field_key_uidx') is null then
    create unique index cost_fields_run_level_field_key_uidx
      on public.cost_fields (run_id, field_key)
      where show_id is null;
  end if;

  comment on index public.cost_fields_run_level_field_key_uidx is
    'One run-level cost line per field_key. Show-level rows stay on unique(run_id, show_id, field_key).';
end $$;
