-- Staging: allow invoiced on cost_fields.state (+ advancing_cost_fields).
-- Additive / idempotent. Do NOT apply to prod (Builder applies staging separately).
-- PAID remains entries[].paid / paid_at chrome — never a cost_fields.state string.
-- invoiced ≠ paid; known (Confirmed) ≠ PAID.

do $$
declare
  rec record;
begin
  for rec in
    select c.conname, c.conrelid::regclass as tbl
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname in ('cost_fields', 'advancing_cost_fields')
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ~* 'state'
      and pg_get_constraintdef(c.oid) ~* 'known'
  loop
    execute format('alter table %s drop constraint if exists %I', rec.tbl, rec.conname);
  end loop;

  if to_regclass('public.cost_fields') is not null
     and not exists (
       select 1
       from pg_constraint c
       join pg_class r on r.oid = c.conrelid
       join pg_namespace n on n.oid = r.relnamespace
       where n.nspname = 'public'
         and r.relname = 'cost_fields'
         and c.conname = 'cost_fields_state_check'
     )
  then
    alter table public.cost_fields
      add constraint cost_fields_state_check
      check (state in (
        'known',
        'estimated',
        'guess',
        'pending',
        'auto_calc',
        'figures_needed',
        'invoiced'
      ));
  end if;

  if to_regclass('public.advancing_cost_fields') is not null
     and not exists (
       select 1
       from pg_constraint c
       join pg_class r on r.oid = c.conrelid
       join pg_namespace n on n.oid = r.relnamespace
       where n.nspname = 'public'
         and r.relname = 'advancing_cost_fields'
         and c.conname = 'advancing_cost_fields_state_check'
     )
  then
    alter table public.advancing_cost_fields
      add constraint advancing_cost_fields_state_check
      check (state in (
        'known',
        'estimated',
        'guess',
        'pending',
        'auto_calc',
        'figures_needed',
        'invoiced'
      ));
  end if;
end $$;

comment on column public.cost_fields.state is
  'Figure-source ladder: figures_needed/pending → guess → estimated → known (Confirmed) → invoiced. PAID is entries[].paid — not a state. invoiced ≠ paid.';

do $$
begin
  if to_regclass('public.advancing_cost_fields') is not null then
    comment on column public.advancing_cost_fields.state is
      'Same figure-source ladder as cost_fields.state. PAID is entries[].paid — not a state. invoiced ≠ paid.';
  end if;
end $$;
