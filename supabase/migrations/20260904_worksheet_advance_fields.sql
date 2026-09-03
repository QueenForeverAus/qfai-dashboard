-- Worksheet + Advancing shared show/run fields (staging)
-- Applied 2026-09-04. Additive only.

alter table shows
  add column if not exists venue_address text,
  add column if not exists venue_phone text,
  add column if not exists venue_contact text,
  add column if not exists sets_label text default '2 x 60',
  add column if not exists production_company text,
  add column if not exists production_contact text,
  add column if not exists backline_company text,
  add column if not exists backline_contact text,
  add column if not exists sched_access text default '1:00pm',
  add column if not exists sched_soundcheck text default '4:00pm',
  add column if not exists sched_dinner text default '5:30pm',
  add column if not exists sched_doors text default '7:00pm',
  add column if not exists sched_show text default '7:30pm',
  add column if not exists sched_finish text default '9:50pm',
  add column if not exists travel_access_notes text,
  add column if not exists hotel_notes text,
  add column if not exists hospitality_merch_notes text;

-- Prefer travel_access_notes going forward; copy once from michael_notes if empty
update shows
set travel_access_notes = michael_notes
where travel_access_notes is null
  and michael_notes is not null
  and btrim(michael_notes) <> '';

alter table runs
  add column if not exists flights_notes text,
  add column if not exists vehicles_notes text,
  add column if not exists hotels_overview_notes text;

comment on column shows.venue_address is 'Venue street address for Worksheet (lookup or manual)';
comment on column shows.venue_phone is 'Venue phone — never invent; leave null/TBC if unknown';
comment on column shows.venue_contact is 'Venue contact name/details';
comment on column shows.sets_label is 'e.g. 2 x 60';
comment on column shows.production_company is 'Production company (Advancing → Worksheet)';
comment on column shows.production_contact is 'Production contact (Advancing → Worksheet)';
comment on column shows.backline_company is 'Backline company (G3 only)';
comment on column shows.backline_contact is 'Backline contact (G3 only)';
comment on column shows.travel_access_notes is 'Travel / access / parking notes (prefer over michael_notes)';
comment on column shows.hotel_notes is 'Hotel notes free-text (wire up later)';
comment on column shows.hospitality_merch_notes is 'Hospitality / merch free-text';
comment on column runs.flights_notes is 'Worksheet run overview flights/PAX notes';
comment on column runs.vehicles_notes is 'Worksheet run overview cars/vans notes';
comment on column runs.hotels_overview_notes is 'Worksheet run overview hotel nights notes';
