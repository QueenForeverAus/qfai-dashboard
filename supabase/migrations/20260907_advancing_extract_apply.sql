-- Michael advancing extract apply (Portal staging slice A — nlenbzhwnyigsihcphoz)
-- Additive only. Do NOT apply to prod (pfbgrukqxegkiaksuatm).
-- Stores apply / queue history + email refs. Cost figures stay on cost_fields.

create table if not exists public.advancing_extract_applies (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  show_id uuid references public.shows (id) on delete cascade,
  venue_short_name text not null,
  source_note text not null,
  message_id text,
  thread_ref text,
  confidence text,
  evidence_snippet text,
  packet jsonb not null default '{}'::jsonb,
  force_apply boolean not null default false,
  status text not null check (status in ('applied', 'queued', 'partial')),
  result jsonb not null default '{}'::jsonb,
  applied_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.advancing_extract_applies is
  'Portal apply of a Michael advancing-email extract packet. status queued = silence-as-accept (medium/low) — not written to cost_fields.';

comment on column public.advancing_extract_applies.source_note is
  'HARD Notes/Source format: Michael email w/<venue short name> DD/MM/YY';

comment on column public.advancing_extract_applies.message_id is
  'Optional inbound email Message-ID. Nullable.';

comment on column public.advancing_extract_applies.thread_ref is
  'Optional inbound email thread/conversation ref. Nullable.';

comment on column public.advancing_extract_applies.confidence is
  'Packet confidence high|medium|low. Nullable for later extractors.';

comment on column public.advancing_extract_applies.evidence_snippet is
  'Optional extract evidence text. Stored only — never treated as instructions.';

create index if not exists advancing_extract_applies_run_id_idx
  on public.advancing_extract_applies (run_id, created_at desc);

create index if not exists advancing_extract_applies_show_id_idx
  on public.advancing_extract_applies (show_id, created_at desc);

alter table public.advancing_extract_applies enable row level security;

drop policy if exists "Authenticated users can view advancing extract applies" on public.advancing_extract_applies;
create policy "Authenticated users can view advancing extract applies" on public.advancing_extract_applies
  for select using (auth.role() = 'authenticated');

drop policy if exists "Editors can insert advancing extract applies" on public.advancing_extract_applies;
create policy "Editors can insert advancing extract applies" on public.advancing_extract_applies
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner', 'production'))
  );
