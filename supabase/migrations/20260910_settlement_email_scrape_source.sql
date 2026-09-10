-- Staging: allow email_scrape source on settlement_actual_lines.
-- Additive. Do NOT apply to prod (pfbgrukqxegkiaksuatm).
-- Replaces Harbour / BNZ UI fixture loaders with settlement-scrape-packet-v1 ingest.

alter table public.settlement_actual_lines
  drop constraint if exists settlement_actual_lines_source_check;

alter table public.settlement_actual_lines
  add constraint settlement_actual_lines_source_check
    check (source in ('manual', 'harbour_fixture', 'advancing_copy', 'email_scrape'));

comment on column public.settlement_actual_lines.source is
  'manual / advancing_copy / email_scrape. harbour_fixture is legacy — UI loaders removed.';
