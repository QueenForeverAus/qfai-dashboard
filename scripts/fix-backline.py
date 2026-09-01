#!/usr/bin/env python3
import json, urllib.request, sys

import os
PAT = os.environ["SUPABASE_PAT"]
BASE = "https://api.supabase.com/v1/projects/pfbgrukqxegkiaksuatm/database/query"

def run_query(query):
    data = json.dumps({"query": query}).encode()
    req = urllib.request.Request(BASE, data=data, method="POST",
        headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())

RUN_ID = "98689b29-9b2b-401d-90f3-6f40768f52b2"

# 1. Check if backline_hire already exists
check = run_query(f"SELECT id FROM cost_fields WHERE run_id='{RUN_ID}' AND field_key='backline_hire';")
if check:
    print(f"backline_hire already exists: {check[0]['id']}")
else:
    entries = json.dumps([{
        "id": "468f0379-ee73-4c5d-b4dc-301f3cec937b",
        "description": "Backline hire (local WA)",
        "notes": "Group 3 - no van; quote needed",
        "amount": 3800,
        "gst_included": True,
        "confirmed": False
    }])
    # Use parameterised-style by escaping in the query string
    source = "Local WA backline hire - no van (Group 3). Drum kit, keys, guitar amps hired locally. $3,800 estimate; get supplier quote."
    q = f"""INSERT INTO cost_fields (run_id, show_id, category, field_key, label, value, state, source, entries)
VALUES ('{RUN_ID}', NULL, 'Production', 'backline_hire', 'Backline Hire (local)', 3800, 'estimated',
  '{source}',
  '{entries.replace("'", "''")}'::jsonb)
RETURNING id;"""
    result = run_query(q)
    print(f"Inserted backline_hire: {result}")

# 2. Add backline_hire_per_run to run_factors if not present
check2 = run_query("SELECT key FROM run_factors WHERE key='backline_hire_per_run';")
if check2:
    print(f"backline_hire_per_run already in run_factors")
else:
    result2 = run_query("""INSERT INTO run_factors (key, label, category, value, unit, description)
VALUES ('backline_hire_per_run', 'Backline hire - Group 3 runs', 'Production', 3800, '$',
  'Local backline hire for Group 3 runs (WA, Nth QLD, NT) where the band cannot freight their own gear. Covers drum kit, keys, and guitar amps hired from a local supplier. Get a quote per run - this is an estimate baseline.')
RETURNING key;""")
    print(f"Inserted run_factors: {result2}")

print("Done.")
