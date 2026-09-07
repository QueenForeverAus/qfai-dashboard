-- Phase 4 Settlements Col3 Actuals (staging only — nlenbzhwnyigsihcphoz)
-- Additive. Do NOT apply to prod (pfbgrukqxegkiaksuatm).
-- Venue settlement lines enter as confirmed; band costs copy from Advancing
-- and lock when PAID. Challenge drafts reuse remittance_challenges (never auto-sent).

create table if not exists public.settlement_actual_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  show_id uuid references public.shows (id) on delete cascade,
  line_key text not null,
  line_kind text not null,
  amount numeric(12, 2) not null default 0,
  status text not null default 'confirmed',
  source text not null default 'manual',
  notes text,
  challenge_id uuid references public.remittance_challenges (id) on delete set null,
  paid boolean not null default false,
  paid_at timestamptz,
  quote_note text,
  attachment_path text,
  attachment_filename text,
  attachment_mime text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlement_actual_lines_kind_check
    check (line_kind in ('venue_settlement', 'band_cost')),
  constraint settlement_actual_lines_status_check
    check (status in ('confirmed', 'challenged')),
  constraint settlement_actual_lines_source_check
    check (source in ('manual', 'harbour_fixture', 'advancing_copy'))
);

comment on table public.settlement_actual_lines is
  'Phase 4 Col3 actuals. Venue settlement = confirmed Harbour/manual figures. Band costs = Advancing copies, editable until PAID.';
comment on column public.settlement_actual_lines.status is
  'Venue lines enter confirmed. challenged after a Wave 1 challenge draft (never auto-sent).';
comment on column public.settlement_actual_lines.paid is
  'Band-cost PAID lock only. Same semantics as Wave 1 cost-field entries — un-pay to edit amount.';
comment on column public.settlement_actual_lines.challenge_id is
  'FK to remittance_challenges draft. sent_at on that row stays null.';

create unique index if not exists settlement_actual_lines_run_show_key_idx
  on public.settlement_actual_lines (
    run_id,
    line_key,
    (coalesce(show_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );

create index if not exists settlement_actual_lines_run_id_idx
  on public.settlement_actual_lines (run_id);
create index if not exists settlement_actual_lines_show_id_idx
  on public.settlement_actual_lines (show_id);

alter table public.settlement_actual_lines enable row level security;

drop policy if exists "Admins and owners can view settlement actual lines" on public.settlement_actual_lines;
create policy "Admins and owners can view settlement actual lines" on public.settlement_actual_lines
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

drop policy if exists "Admins and owners can modify settlement actual lines" on public.settlement_actual_lines;
create policy "Admins and owners can modify settlement actual lines" on public.settlement_actual_lines
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );
