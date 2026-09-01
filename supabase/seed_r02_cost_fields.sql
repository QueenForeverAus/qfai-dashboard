-- R02 Taree + Wyong — seed known/estimated cost fields
-- Run: 26-27 Feb 2027, Group 2 (Fly + Van)
-- Source: Gig Costings 2026-2027.xlsx + QF Historical Venue Cost Raw Data

-- Update shows with capacity + ticket price
UPDATE shows SET capacity = 500, ticket_price = 75.00
  WHERE run_id = (SELECT id FROM runs WHERE code = 'R02')
  AND venue_city = 'Taree';

UPDATE shows SET capacity = 500, ticket_price = 75.00
  WHERE run_id = (SELECT id FROM runs WHERE code = 'R02')
  AND venue_city = 'Wyong';

-- Also update venue name for Wyong (our seed had "Wyong venue TBC" but the actual is Art House)
UPDATE shows SET venue_name = 'Art House'
  WHERE run_id = (SELECT id FROM runs WHERE code = 'R02')
  AND venue_city = 'Wyong';

-- ─────────────────────────────────────────────────────────────
-- SHOW-LEVEL FIELDS: Manning Entertainment Centre, Taree (show_order=1)
-- ─────────────────────────────────────────────────────────────

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, s.id,
  'Revenue', 'gross_box_office', 'Gross Box Office', NULL, 'pending',
  'Cap 500 × $75 nett — pending ticket sales. Use sell-through slider.'
FROM runs r JOIN shows s ON s.run_id = r.id AND s.show_order = 1
WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, s.id,
  'Venue Costs', 'venue_hire', 'Venue Hire', 3300, 'estimated',
  'MAX($1,400 flat, 11% GBO) — at 75% sell-through: 11% × $80 × 375 = $3,300. Source: Draft 22 Schedule. ⚠ Historical 2024 actual was $2,660 (10% NBO on 372 tix).'
FROM runs r JOIN shows s ON s.run_id = r.id AND s.show_order = 1
WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, s.id,
  'Venue Costs', 'venue_staff', 'Venue Staff / On-costs', 2837, 'estimated',
  'Historical 2024 actual (372 tix): venue marketing $660, tech staff $1,444, followspot $223, FOH mgr $309, catering $200.'
FROM runs r JOIN shows s ON s.run_id = r.id AND s.show_order = 1
WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- SHOW-LEVEL FIELDS: Art House, Wyong (show_order=2)
-- ─────────────────────────────────────────────────────────────

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, s.id,
  'Revenue', 'gross_box_office', 'Gross Box Office', NULL, 'pending',
  'Cap 500 × $75 nett — pending ticket sales. Use sell-through slider.'
FROM runs r JOIN shows s ON s.run_id = r.id AND s.show_order = 2
WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, s.id,
  'Venue Costs', 'venue_hire', 'Venue Hire', 3630, 'estimated',
  '⚠ $3,630 flat (5 hr quote only) — LIKELY UNDERSTATED. Historical: 2024 $4,709, 2026 $5,555. Full show day (~9 hrs) ≈ +$1,540. Recommend budgeting $5,200 pending Harbour confirmation.'
FROM runs r JOIN shows s ON s.run_id = r.id AND s.show_order = 2
WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, s.id,
  'Venue Costs', 'venue_staff', 'Venue Staff / On-costs', 4744, 'estimated',
  'Historical 2026 actual (477 tix): audio/lighting techs $1,595, ushers $485, FOH/function staff $526, projector $550, hazer/megadeck/followspot $704, solo EDM $517, rider $273, LPA fee. ⚠ Quote warns hourly rates may have changed.'
FROM runs r JOIN shows s ON s.run_id = r.id AND s.show_order = 2
WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- RUN-LEVEL FIELDS (shared, show_id = NULL)
-- ─────────────────────────────────────────────────────────────

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, NULL,
  'Travel & Accommodation', 'flights', 'Flights (band + crew, ex-MEL)', 2000, 'estimated',
  'Planning estimate — Sydney/Central NSW bracket. Thu fly-in assumed (SYD→Taree = 3.5 hrs, over same-day rule). Price PQQ/TRO alternative too.'
FROM runs r WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, NULL,
  'Travel & Accommodation', 'accommodation', 'Accommodation (3 nights)', 4200, 'estimated',
  '$1,400/night × 3 nights (includes Thu pre-show night Thu 25 Feb + Fri + Sat). 7 rooms.'
FROM runs r WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, NULL,
  'Travel & Accommodation', 'ground_transport', 'Ground Transport', 2847, 'estimated',
  'Van hire (Melbourne, Group 2) $1,250 + Brad driver fee $400 (Thu 25 Feb) + van fuel (2,280 km return) $477 + Kia Carnival hire $600 ($200/day × 3) + local car fuel $120.'
FROM runs r WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, NULL,
  'Crew & Operations', 'crew_fees_total', 'Crew Fees (2 shows)', 5300, 'known',
  'Fixed rates × 2 shows: Adam Dahl sound $600 + Michael Richardson lighting $600 + Michael PM $250 + Darryn McLaughlin bass $600 + Danny Oakhill keys $600 = $2,650/show.'
FROM runs r WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, NULL,
  'Crew & Operations', 'food_basics', 'Food & Basics', 450, 'known',
  '$225/show fixed × 2 shows.'
FROM runs r WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, NULL,
  'Crew & Operations', 'per_diems', 'Per Diems (Darryn + Danny)', 240, 'known',
  '$40/day × 2 people × 3 days (Thu–Sat).'
FROM runs r WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, NULL,
  'Crew & Operations', 'lighting_hire', 'Lighting Equipment Hire', 330, 'known',
  'Fixed per weekend run.'
FROM runs r WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, NULL,
  'Crew & Operations', 'crew_travel_day', 'Crew Travel-Day Fee (Thu fly-in)', 500, 'estimated',
  'Adam Dahl + Michael Richardson $250 each for non-performance Thursday fly-in day. ⚠ If Sun return after midday, add further ~$500.'
FROM runs r WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, NULL,
  'Marketing', 'fb_ads', 'Facebook / Social Ads', 5000, 'estimated',
  '$2,500/venue × 2 venues (500 cap each). Managed by Daniel Champagne.'
FROM runs r WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;

INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source)
SELECT r.id, NULL,
  'Marketing', 'social_ads_var', 'Social Media — Per-Ticket Fee (Daniel Champagne)', NULL, 'pending',
  '$1.10 inc GST per paid ticket (= $825 at 75%, $935 at 85%, $1,100 at 100%). Calculated at settlement.'
FROM runs r WHERE r.code = 'R02'
ON CONFLICT DO NOTHING;
