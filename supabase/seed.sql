-- Queen Forever Tours - Seed Data (Draft 22)
-- Run AFTER schema.sql

insert into runs (code, name, status, region, start_date, end_date) values
  ('R01', 'Broken Hill + Renmark + Adelaide', 'confirmed', 'group2', '2027-02-11', '2027-02-13'),
  ('R02', 'Taree + Wyong', 'confirmed', 'group2', '2027-02-26', '2027-02-27'),
  ('R03', 'Springwood + Thirroul', 'confirmed', 'group1', '2027-03-12', '2027-03-13'),
  ('R04', 'Penrith + Bathurst', 'confirmed', 'group1', '2027-03-19', '2027-03-20'),
  ('R05', 'Bunbury + Mandurah + Perth', 'confirmed', 'group3', '2027-04-01', '2027-04-03'),
  ('R06', 'Ararat', 'confirmed', 'group1', '2027-04-10', '2027-04-10'),
  ('R07', 'Dubbo + Narrabri', 'confirmed', 'group2', '2027-04-16', '2027-04-17'),
  ('R08', 'Albury', 'confirmed', 'group1', '2027-04-24', '2027-04-24'),
  ('R09', 'Sydney State Theatre', 'confirmed', 'group2', '2027-11-20', '2027-11-20'),
  ('R10', 'Newcastle + Wollondilly', 'proposed', 'group2', '2027-04-30', '2027-05-01'),
  ('R11', 'Bega Valley + Canberra', 'proposed', 'group2', '2027-05-07', '2027-05-08'),
  ('R12', 'Goulburn + Chatswood', 'proposed', 'group2', '2027-05-14', '2027-05-15'),
  ('R13', 'Hobart + Launceston', 'proposed', 'group3', '2027-06-04', '2027-06-05'),
  ('R14', 'Hamilton + Geelong', 'proposed', 'group1', '2027-09-10', '2027-09-11')
on conflict (code) do nothing;

-- Shows for R01
insert into shows (run_id, venue_name, venue_city, state_territory, show_date, show_order) values
  ((select id from runs where code='R01'), 'Broken Hill Entertainment Centre', 'Broken Hill', 'NSW', '2027-02-11', 1),
  ((select id from runs where code='R01'), 'Renmark Hotel', 'Renmark', 'SA', '2027-02-12', 2),
  ((select id from runs where code='R01'), 'Adelaide venue TBC', 'Adelaide', 'SA', '2027-02-13', 3);

-- Shows for R02
insert into shows (run_id, venue_name, venue_city, state_territory, show_date, show_order) values
  ((select id from runs where code='R02'), 'Manning Entertainment Centre', 'Taree', 'NSW', '2027-02-26', 1),
  ((select id from runs where code='R02'), 'Wyong venue TBC', 'Wyong', 'NSW', '2027-02-27', 2);

-- Shows for R03
insert into shows (run_id, venue_name, venue_city, state_territory, show_date, show_order) values
  ((select id from runs where code='R03'), 'Springwood venue TBC', 'Springwood', 'NSW', '2027-03-12', 1),
  ((select id from runs where code='R03'), 'Thirroul venue TBC', 'Thirroul', 'NSW', '2027-03-13', 2);

-- Shows for R04
insert into shows (run_id, venue_name, venue_city, state_territory, show_date, show_order) values
  ((select id from runs where code='R04'), 'Penrith venue TBC', 'Penrith', 'NSW', '2027-03-19', 1),
  ((select id from runs where code='R04'), 'Bathurst venue TBC', 'Bathurst', 'NSW', '2027-03-20', 2);

-- Shows for R05
insert into shows (run_id, venue_name, venue_city, state_territory, show_date, show_order) values
  ((select id from runs where code='R05'), 'Bunbury venue TBC', 'Bunbury', 'WA', '2027-04-01', 1),
  ((select id from runs where code='R05'), 'Mandurah venue TBC', 'Mandurah', 'WA', '2027-04-02', 2),
  ((select id from runs where code='R05'), 'Astor Theatre', 'Perth', 'WA', '2027-04-03', 3);

-- Single show runs
insert into shows (run_id, venue_name, venue_city, state_territory, show_date, show_order) values
  ((select id from runs where code='R06'), 'Ararat venue TBC', 'Ararat', 'VIC', '2027-04-10', 1);

insert into shows (run_id, venue_name, venue_city, state_territory, show_date, show_order) values
  ((select id from runs where code='R07'), 'Dubbo venue TBC', 'Dubbo', 'NSW', '2027-04-16', 1),
  ((select id from runs where code='R07'), 'Narrabri venue TBC', 'Narrabri', 'NSW', '2027-04-17', 2);

insert into shows (run_id, venue_name, venue_city, state_territory, show_date, show_order) values
  ((select id from runs where code='R08'), 'Albury venue TBC', 'Albury', 'NSW', '2027-04-24', 1);

insert into shows (run_id, venue_name, venue_city, state_territory, show_date, show_order) values
  ((select id from runs where code='R09'), 'State Theatre', 'Sydney', 'NSW', '2027-11-20', 1);
