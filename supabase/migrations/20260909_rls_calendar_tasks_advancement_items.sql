-- Staging CRITICAL: enable RLS on public.calendar_tasks + public.advancement_items
-- Match cost_fields / runs: SELECT authenticated; ALL modify admin|owner via get_my_role().
-- Portal writes advancement_items via createAdminClient (service_role) after auth —
-- production role UI edits are not blocked by these policies. No Portal calendar_tasks
-- write path found in qfai-dashboard; same harden pattern applied.

alter table public.calendar_tasks enable row level security;
alter table public.advancement_items enable row level security;

drop policy if exists "Authenticated users can view calendar tasks" on public.calendar_tasks;
create policy "Authenticated users can view calendar tasks" on public.calendar_tasks
  for select using (auth.role() = 'authenticated');

drop policy if exists "Admins and owners can modify calendar tasks" on public.calendar_tasks;
create policy "Admins and owners can modify calendar tasks" on public.calendar_tasks
  for all using (get_my_role() = any (array['admin'::text, 'owner'::text]));

drop policy if exists "Authenticated users can view advancement items" on public.advancement_items;
create policy "Authenticated users can view advancement items" on public.advancement_items
  for select using (auth.role() = 'authenticated');

drop policy if exists "Admins and owners can modify advancement items" on public.advancement_items;
create policy "Admins and owners can modify advancement items" on public.advancement_items
  for all using (get_my_role() = any (array['admin'::text, 'owner'::text]));
