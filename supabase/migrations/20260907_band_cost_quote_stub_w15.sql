-- W1.5 Band Cost / costing-line quote-invoice stub (staging only — nlenbzhwnyigsihcphoz)
-- Additive: optional attachment + stub note + nullable Wave 2 FK.
-- Do NOT apply to prod (pfbgrukqxegkiaksuatm).
-- Attachment is optional — close-gate still only requires PAID/waived.

alter table public.band_cost_lines
  add column if not exists attachment_path text,
  add column if not exists attachment_filename text,
  add column if not exists attachment_mime text,
  add column if not exists quote_note text,
  add column if not exists payables_document_id uuid;

comment on column public.band_cost_lines.attachment_path is
  'W1.5 stub store id/path for an optional quote/invoice PDF or image.';
comment on column public.band_cost_lines.attachment_filename is
  'Display filename for the attached stub. Missing attach must not block close-gate.';
comment on column public.band_cost_lines.attachment_mime is
  'MIME type of the stub attachment (PDF or image).';
comment on column public.band_cost_lines.quote_note is
  'W1.5 free-text stub. UI label/placeholder: Link quote/invoice later.';
comment on column public.band_cost_lines.payables_document_id is
  'Wave 2 Payables document FK — unused in W1.5 UI.';

create table if not exists public.settlement_file_stubs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  filename text not null,
  mime_type text not null,
  byte_size integer not null default 0,
  content_base64 text not null,
  storage_path text not null unique,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.settlement_file_stubs is
  'W1.5 PDF/image stub store for Band Costs and Run Costing lines. Wave 2 will replace this with Payables documents.';

create index if not exists settlement_file_stubs_run_id_idx
  on public.settlement_file_stubs (run_id);

alter table public.settlement_file_stubs enable row level security;

drop policy if exists "Admins and owners can view settlement file stubs" on public.settlement_file_stubs;
create policy "Admins and owners can view settlement file stubs" on public.settlement_file_stubs
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

drop policy if exists "Admins and owners can modify settlement file stubs" on public.settlement_file_stubs;
create policy "Admins and owners can modify settlement file stubs" on public.settlement_file_stubs
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );
