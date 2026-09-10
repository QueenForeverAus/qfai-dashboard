-- Portal Settings key/value (Admin/Owner write). Additive. Staging only; prod held.
-- BOOKED costing lock, lighting hire default, Advancing SLA weeks.
-- Owner split and Harbour commission % are parked — do not add those keys.

create table if not exists public.portal_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.portal_settings enable row level security;

drop policy if exists "Authenticated users can view portal settings" on public.portal_settings;
create policy "Authenticated users can view portal settings" on public.portal_settings
  for select using (auth.role() = 'authenticated');

drop policy if exists "Admins and owners can insert portal settings" on public.portal_settings;
create policy "Admins and owners can insert portal settings" on public.portal_settings
  for insert
  with check (get_my_role() = any (array['admin'::text, 'owner'::text]));

drop policy if exists "Admins and owners can update portal settings" on public.portal_settings;
create policy "Admins and owners can update portal settings" on public.portal_settings
  for update
  using (get_my_role() = any (array['admin'::text, 'owner'::text]))
  with check (get_my_role() = any (array['admin'::text, 'owner'::text]));

drop policy if exists "Admins and owners can delete portal settings" on public.portal_settings;
create policy "Admins and owners can delete portal settings" on public.portal_settings
  for delete
  using (get_my_role() = any (array['admin'::text, 'owner'::text]));

grant select, insert, update, delete on table public.portal_settings to authenticated;

insert into public.portal_settings (key, value)
values
  ('booked_costing_lock', 'true'::jsonb),
  ('lighting_hire_default', '330'::jsonb),
  ('advancing_sla_aim_weeks', '12'::jsonb),
  ('advancing_sla_ping_weeks', '10'::jsonb),
  ('advancing_sla_tech_chase_weeks', '4'::jsonb)
on conflict (key) do nothing;
