-- W1.4 Remittance + challenge drafts (staging only — nlenbzhwnyigsihcphoz)
-- Additive. Do NOT apply to prod (pfbgrukqxegkiaksuatm).

-- Rights payer stub on shows (APRA / OneMusic double-up hook).
alter table public.shows
  add column if not exists rights_payer text not null default 'tbd';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shows_rights_payer_check'
  ) then
    alter table public.shows
      add constraint shows_rights_payer_check
      check (rights_payer in ('tbd', 'venue', 'qf'));
  end if;
end $$;

comment on column public.shows.rights_payer is
  'W1.4 stub: who pays APRA/OneMusic — tbd | venue | qf. QF + remittance rights deduction = HARD double-up.';

-- Per-run remittance status (accept / rectify). Never overwrites Agent Settlement.
alter table public.run_settlements
  add column if not exists remittance_status text not null default 'open';
alter table public.run_settlements
  add column if not exists remittance_accepted_at timestamptz;
alter table public.run_settlements
  add column if not exists remittance_accepted_by uuid references public.profiles (id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'run_settlements_remittance_status_check'
  ) then
    alter table public.run_settlements
      add constraint run_settlements_remittance_status_check
      check (remittance_status in ('open', 'accepted', 'rectify_awaiting'));
  end if;
end $$;

comment on column public.run_settlements.remittance_status is
  'W1.4: open | accepted (remittance as-is) | rectify_awaiting. Accept/rectify do not rewrite Agent Settlement.';

-- Proposed agent statement lines (Settlement). Manual entry — no OCR.
create table if not exists public.agent_settlement_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  show_id uuid references public.shows (id) on delete set null,
  description text not null,
  amount numeric(12, 2) not null default 0,
  occurred_on date,
  reference text,
  hours numeric(8, 2),
  rate numeric(12, 2),
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.agent_settlement_lines is
  'W1.4 proposed Settlement (agent statement). Not cash. Remittance is remittance_lines.';

create index if not exists agent_settlement_lines_run_id_idx
  on public.agent_settlement_lines (run_id);

-- Actual cash received.
create table if not exists public.remittance_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  show_id uuid references public.shows (id) on delete set null,
  line_type text not null default 'payment',
  description text not null,
  amount numeric(12, 2) not null default 0,
  occurred_on date,
  reference text,
  hours numeric(8, 2),
  rate numeric(12, 2),
  headcount numeric(8, 2),
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint remittance_lines_type_check
    check (line_type in ('payment', 'deduction', 'adjustment'))
);

comment on table public.remittance_lines is
  'W1.4 Remittance — cash received. line_type adjustment is the manual clawback edge (no multi-show engine).';
comment on column public.remittance_lines.line_type is
  'payment = cash in; deduction = withheld (e.g. APRA); adjustment = manual clawback.';

create index if not exists remittance_lines_run_id_idx
  on public.remittance_lines (run_id);
create index if not exists remittance_lines_show_id_idx
  on public.remittance_lines (show_id);

-- Challenge drafts — never auto-sent (sent_at stays null).
create table if not exists public.remittance_challenges (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  show_id uuid references public.shows (id) on delete set null,
  status text not null default 'draft',
  reason text not null,
  subject text not null,
  body text not null,
  to_label text not null default 'Harbour (agent)',
  evidence jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint remittance_challenges_status_check
    check (status in ('draft', 'accepted', 'rectify')),
  constraint remittance_challenges_reason_check
    check (length(trim(reason)) > 0)
);

comment on table public.remittance_challenges is
  'W1.4 challenge email drafts to Harbour. sent_at must stay null — operator sends outside the portal.';
comment on column public.remittance_challenges.sent_at is
  'Always null in v1. API refuses any send. Operator copies the draft.';

create index if not exists remittance_challenges_run_id_idx
  on public.remittance_challenges (run_id);

create table if not exists public.remittance_challenge_items (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.remittance_challenges (id) on delete cascade,
  remittance_line_id uuid references public.remittance_lines (id) on delete set null,
  comparison_id text not null,
  flag_codes text[] not null default '{}',
  proposed_amount numeric(12, 2),
  paid_amount numeric(12, 2),
  variance numeric(12, 2),
  snapshot jsonb not null default '{}'::jsonb
);

create index if not exists remittance_challenge_items_challenge_id_idx
  on public.remittance_challenge_items (challenge_id);

alter table public.agent_settlement_lines enable row level security;
alter table public.remittance_lines enable row level security;
alter table public.remittance_challenges enable row level security;
alter table public.remittance_challenge_items enable row level security;

drop policy if exists "Admins and owners can view agent settlement lines" on public.agent_settlement_lines;
create policy "Admins and owners can view agent settlement lines" on public.agent_settlement_lines
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

drop policy if exists "Admins and owners can modify agent settlement lines" on public.agent_settlement_lines;
create policy "Admins and owners can modify agent settlement lines" on public.agent_settlement_lines
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

drop policy if exists "Admins and owners can view remittance lines" on public.remittance_lines;
create policy "Admins and owners can view remittance lines" on public.remittance_lines
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

drop policy if exists "Admins and owners can modify remittance lines" on public.remittance_lines;
create policy "Admins and owners can modify remittance lines" on public.remittance_lines
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

drop policy if exists "Admins and owners can view remittance challenges" on public.remittance_challenges;
create policy "Admins and owners can view remittance challenges" on public.remittance_challenges
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

drop policy if exists "Admins and owners can modify remittance challenges" on public.remittance_challenges;
create policy "Admins and owners can modify remittance challenges" on public.remittance_challenges
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

drop policy if exists "Admins and owners can view remittance challenge items" on public.remittance_challenge_items;
create policy "Admins and owners can view remittance challenge items" on public.remittance_challenge_items
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

drop policy if exists "Admins and owners can modify remittance challenge items" on public.remittance_challenge_items;
create policy "Admins and owners can modify remittance challenge items" on public.remittance_challenge_items
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );
