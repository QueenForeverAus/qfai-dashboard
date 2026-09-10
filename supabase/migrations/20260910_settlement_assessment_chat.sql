-- Settlements v3 P3 — Portal assessment chat (staging only — nlenbzhwnyigsihcphoz)
-- Additive. Do NOT apply to prod (pfbgrukqxegkiaksuatm).
-- This is the Portal store. It is not a Lead mirror.

create table if not exists public.settlement_assessment_messages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  show_id uuid references public.shows (id) on delete set null,
  author_id uuid references public.profiles (id),
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint settlement_assessment_messages_body_check
    check (length(trim(body)) > 0)
);

comment on table public.settlement_assessment_messages is
  'Settlements v3 Portal assessment chat (Gareth comments). Not a Lead mirror. Never auto-sends email.';

create index if not exists settlement_assessment_messages_run_id_idx
  on public.settlement_assessment_messages (run_id, created_at);

alter table public.settlement_assessment_messages enable row level security;

drop policy if exists "Admins and owners can view settlement assessment messages"
  on public.settlement_assessment_messages;
create policy "Admins and owners can view settlement assessment messages"
  on public.settlement_assessment_messages
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

drop policy if exists "Admins and owners can modify settlement assessment messages"
  on public.settlement_assessment_messages;
create policy "Admins and owners can modify settlement assessment messages"
  on public.settlement_assessment_messages
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );
