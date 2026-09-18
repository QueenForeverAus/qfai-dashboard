-- Wave B2: show-local Music Rights line % on Costings + Advancing.
-- Additive / idempotent. Staging first. Do NOT apply to prod from this PR.
-- Factors music_rights_pct stays the unbooked seed/refresh default.
-- Never copies retired apra_pct.

alter table public.cost_fields
  add column if not exists line_pct numeric;

alter table public.advancing_cost_fields
  add column if not exists line_pct numeric;

comment on column public.cost_fields.line_pct is
  'Show-local Music Rights % override. $ = ticket base × line_pct/100. Does not write Factors music_rights_pct.';

comment on column public.advancing_cost_fields.line_pct is
  'Show-local Music Rights % override on the Advancing twin. Independent of Factors. BOOKED editable even when Factors is empty.';

-- Existing Music Rights rows currently live-calc from Factors in the UI.
-- Backfill line_pct from standing music_rights_pct only so display stays
-- the same. Do not invent %. Do not copy apra_pct.
update public.cost_fields cf
set line_pct = rf.value
from public.run_factors rf
where cf.field_key = 'music_rights'
  and cf.line_pct is null
  and rf.key = 'music_rights_pct'
  and rf.value is not null
  and rf.key <> 'apra_pct';

update public.advancing_cost_fields acf
set line_pct = rf.value
from public.run_factors rf
where acf.field_key = 'music_rights'
  and acf.line_pct is null
  and rf.key = 'music_rights_pct'
  and rf.value is not null
  and rf.key <> 'apra_pct';
