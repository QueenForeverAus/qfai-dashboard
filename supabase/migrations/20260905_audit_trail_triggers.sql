-- Audit Trail fix (STAGING): additive run_id + triggers + updated_by for actor on service-role writes.
-- Does NOT wipe audit_log. Does NOT invent historical who.

-- 1) Additive columns
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES public.runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS audit_log_run_id_changed_at_idx
  ON public.audit_log (run_id, changed_at DESC);

ALTER TABLE public.cost_fields
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.audit_log.run_id IS
  'Denormalized run for Audit Trail tab queries; filled by triggers from NEW.run_id / show.run_id.';
COMMENT ON COLUMN public.cost_fields.updated_by IS
  'Last editor; set by API on service-role writes so audit triggers can record changed_by when auth.uid() is null.';
COMMENT ON COLUMN public.shows.updated_by IS
  'Last editor; set by API on service-role writes so audit triggers can record changed_by when auth.uid() is null.';

-- 2) Helpers
CREATE OR REPLACE FUNCTION public.audit_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  uid uuid;
  cfg text;
BEGIN
  uid := auth.uid();
  IF uid IS NOT NULL THEN
    RETURN uid;
  END IF;
  BEGIN
    cfg := nullif(current_setting('app.audit_actor', true), '');
    IF cfg IS NOT NULL THEN
      RETURN cfg::uuid;
    END IF;
  EXCEPTION WHEN others THEN
    NULL;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_text(val text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN val IS NULL THEN NULL ELSE left(val, 2000) END;
$$;

CREATE OR REPLACE FUNCTION public.audit_insert_row(
  p_table_name text,
  p_record_id uuid,
  p_run_id uuid,
  p_field_name text,
  p_old_value text,
  p_new_value text,
  p_change_type text,
  p_changed_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip no-op
  IF p_change_type = 'update' AND p_old_value IS NOT DISTINCT FROM p_new_value THEN
    RETURN;
  END IF;
  INSERT INTO public.audit_log (
    table_name, record_id, run_id, field_name, old_value, new_value, changed_by, changed_at, change_type
  ) VALUES (
    p_table_name,
    p_record_id,
    p_run_id,
    p_field_name,
    p_old_value,
    p_new_value,
    COALESCE(p_changed_by, public.audit_actor()),
    now(),
    p_change_type
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_diff_jsonb_entries(
  p_table_name text,
  p_record_id uuid,
  p_run_id uuid,
  p_field_prefix text,
  p_old jsonb,
  p_new jsonb,
  p_change_type text,
  p_changed_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_arr jsonb := COALESCE(p_old, '[]'::jsonb);
  new_arr jsonb := COALESCE(p_new, '[]'::jsonb);
  old_ids text[];
  new_ids text[];
  el jsonb;
  oid text;
  o_el jsonb;
  n_el jsonb;
BEGIN
  IF old_arr IS NOT DISTINCT FROM new_arr THEN
    RETURN;
  END IF;

  -- Prefer per-entry diffs when objects have id keys
  IF jsonb_typeof(old_arr) = 'array' AND jsonb_typeof(new_arr) = 'array' THEN
    SELECT COALESCE(array_agg(e->>'id'), ARRAY[]::text[])
      INTO old_ids
      FROM jsonb_array_elements(old_arr) e
      WHERE e ? 'id';
    SELECT COALESCE(array_agg(e->>'id'), ARRAY[]::text[])
      INTO new_ids
      FROM jsonb_array_elements(new_arr) e
      WHERE e ? 'id';

    IF COALESCE(cardinality(old_ids), 0) > 0 OR COALESCE(cardinality(new_ids), 0) > 0 THEN
      -- Removed entries
      FOR el IN SELECT value FROM jsonb_array_elements(old_arr)
      LOOP
        oid := el->>'id';
        IF oid IS NULL THEN CONTINUE; END IF;
        IF NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(new_arr) n WHERE n->>'id' = oid
        ) THEN
          PERFORM public.audit_insert_row(
            p_table_name, p_record_id, p_run_id,
            p_field_prefix || '.entries[' || left(oid, 8) || ']',
            left(el::text, 2000), NULL, p_change_type, p_changed_by
          );
        END IF;
      END LOOP;

      -- Added / changed entries
      FOR el IN SELECT value FROM jsonb_array_elements(new_arr)
      LOOP
        oid := el->>'id';
        IF oid IS NULL THEN CONTINUE; END IF;
        SELECT value INTO o_el FROM jsonb_array_elements(old_arr) WHERE value->>'id' = oid LIMIT 1;
        IF o_el IS NULL THEN
          PERFORM public.audit_insert_row(
            p_table_name, p_record_id, p_run_id,
            p_field_prefix || '.entries[' || left(oid, 8) || ']',
            NULL, left(el::text, 2000), p_change_type, p_changed_by
          );
        ELSIF o_el IS DISTINCT FROM el THEN
          IF (o_el->>'amount') IS DISTINCT FROM (el->>'amount') THEN
            PERFORM public.audit_insert_row(
              p_table_name, p_record_id, p_run_id,
              p_field_prefix || '.entries[' || left(oid, 8) || '].amount',
              o_el->>'amount', el->>'amount', p_change_type, p_changed_by
            );
          END IF;
          IF (o_el->>'description') IS DISTINCT FROM (el->>'description') THEN
            PERFORM public.audit_insert_row(
              p_table_name, p_record_id, p_run_id,
              p_field_prefix || '.entries[' || left(oid, 8) || '].description',
              o_el->>'description', el->>'description', p_change_type, p_changed_by
            );
          END IF;
          IF (o_el->>'notes') IS DISTINCT FROM (el->>'notes') THEN
            PERFORM public.audit_insert_row(
              p_table_name, p_record_id, p_run_id,
              p_field_prefix || '.entries[' || left(oid, 8) || '].notes',
              o_el->>'notes', el->>'notes', p_change_type, p_changed_by
            );
          END IF;
          IF (o_el->>'confirmed') IS DISTINCT FROM (el->>'confirmed') THEN
            PERFORM public.audit_insert_row(
              p_table_name, p_record_id, p_run_id,
              p_field_prefix || '.entries[' || left(oid, 8) || '].confirmed',
              o_el->>'confirmed', el->>'confirmed', p_change_type, p_changed_by
            );
          END IF;
          -- Fallback if other keys changed but none of the above
          IF (o_el->>'amount') IS NOT DISTINCT FROM (el->>'amount')
             AND (o_el->>'description') IS NOT DISTINCT FROM (el->>'description')
             AND (o_el->>'notes') IS NOT DISTINCT FROM (el->>'notes')
             AND (o_el->>'confirmed') IS NOT DISTINCT FROM (el->>'confirmed')
             AND o_el IS DISTINCT FROM el THEN
            PERFORM public.audit_insert_row(
              p_table_name, p_record_id, p_run_id,
              p_field_prefix || '.entries[' || left(oid, 8) || ']',
              left(o_el::text, 2000), left(el::text, 2000), p_change_type, p_changed_by
            );
          END IF;
        END IF;
      END LOOP;
      RETURN;
    END IF;
  END IF;

  -- Fallback whole-json diff
  PERFORM public.audit_insert_row(
    p_table_name, p_record_id, p_run_id,
    p_field_prefix || '.entries',
    left(old_arr::text, 2000), left(new_arr::text, 2000),
    p_change_type, p_changed_by
  );
END;
$$;

-- 3) cost_fields trigger
CREATE OR REPLACE FUNCTION public.tg_audit_cost_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid;
  prefix text;
  run uuid;
BEGIN
  actor := COALESCE(public.audit_actor(), NEW.updated_by);
  run := NEW.run_id;
  prefix := COALESCE(NEW.field_key, NEW.label, 'cost_field');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_insert_row('cost_fields', NEW.id, run, prefix || '.value', NULL, public.audit_text(NEW.value::text), 'insert', actor);
    IF NEW.state IS NOT NULL THEN
      PERFORM public.audit_insert_row('cost_fields', NEW.id, run, prefix || '.state', NULL, NEW.state, 'insert', actor);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    actor := COALESCE(public.audit_actor(), NEW.updated_by, OLD.updated_by);
    IF NEW.value IS DISTINCT FROM OLD.value THEN
      PERFORM public.audit_insert_row('cost_fields', NEW.id, run, prefix || '.value', public.audit_text(OLD.value::text), public.audit_text(NEW.value::text), 'update', actor);
    END IF;
    IF NEW.state IS DISTINCT FROM OLD.state THEN
      PERFORM public.audit_insert_row('cost_fields', NEW.id, run, prefix || '.state', OLD.state, NEW.state, 'update', actor);
    END IF;
    IF NEW.source IS DISTINCT FROM OLD.source THEN
      PERFORM public.audit_insert_row('cost_fields', NEW.id, run, prefix || '.source', OLD.source, NEW.source, 'update', actor);
    END IF;
    IF NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
      PERFORM public.audit_insert_row('cost_fields', NEW.id, run, prefix || '.verified_by', OLD.verified_by::text, NEW.verified_by::text, 'update', actor);
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      PERFORM public.audit_insert_row('cost_fields', NEW.id, run, prefix || '.assigned_to', OLD.assigned_to::text, NEW.assigned_to::text, 'update', actor);
    END IF;
    IF NEW.line_items IS DISTINCT FROM OLD.line_items THEN
      PERFORM public.audit_insert_row('cost_fields', NEW.id, run, prefix || '.line_items', left(COALESCE(OLD.line_items::text, ''), 2000), left(COALESCE(NEW.line_items::text, ''), 2000), 'update', actor);
    END IF;
    IF NEW.entries IS DISTINCT FROM OLD.entries THEN
      PERFORM public.audit_diff_jsonb_entries('cost_fields', NEW.id, run, prefix, OLD.entries, NEW.entries, 'update', actor);
    END IF;
    IF NEW.label IS DISTINCT FROM OLD.label THEN
      PERFORM public.audit_insert_row('cost_fields', NEW.id, run, prefix || '.label', OLD.label, NEW.label, 'update', actor);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_cost_fields ON public.cost_fields;
CREATE TRIGGER trg_audit_cost_fields
  AFTER INSERT OR UPDATE ON public.cost_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_audit_cost_fields();

-- 4) shows trigger
CREATE OR REPLACE FUNCTION public.tg_audit_shows()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid;
  run uuid;
  col text;
  old_v text;
  new_v text;
  cols text[] := ARRAY[
    'venue_name','venue_city','state_territory','show_date','capacity','ticket_price',
    'sell_through_pct','harbour_status','ticket_outlook','ticket_outlook_level',
    'ticket_outlook_status','ticket_outlook_as_of','michael_notes','venue_address',
    'venue_phone','venue_contact','sets_label','production_company','production_contact',
    'backline_company','backline_contact','sched_access','sched_soundcheck','sched_dinner',
    'sched_doors','sched_show','sched_finish','travel_access_notes','hotel_notes',
    'hospitality_merch_notes'
  ];
BEGIN
  actor := COALESCE(public.audit_actor(), NEW.updated_by);
  run := NEW.run_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_insert_row('shows', NEW.id, run, 'shows.venue_name', NULL, NEW.venue_name, 'insert', actor);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    actor := COALESCE(public.audit_actor(), NEW.updated_by, OLD.updated_by);
    FOREACH col IN ARRAY cols LOOP
      EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', col, col)
        INTO old_v, new_v
        USING OLD, NEW;
      IF old_v IS DISTINCT FROM new_v THEN
        PERFORM public.audit_insert_row('shows', NEW.id, run, 'shows.' || col, old_v, new_v, 'update', actor);
      END IF;
    END LOOP;
    IF NEW.ticket_outlook_sources IS DISTINCT FROM OLD.ticket_outlook_sources THEN
      PERFORM public.audit_insert_row(
        'shows', NEW.id, run, 'shows.ticket_outlook_sources',
        left(COALESCE(OLD.ticket_outlook_sources::text, ''), 2000),
        left(COALESCE(NEW.ticket_outlook_sources::text, ''), 2000),
        'update', actor
      );
    END IF;
    IF NEW.capacity_bands IS DISTINCT FROM OLD.capacity_bands THEN
      PERFORM public.audit_insert_row(
        'shows', NEW.id, run, 'shows.capacity_bands',
        left(COALESCE(OLD.capacity_bands::text, ''), 2000),
        left(COALESCE(NEW.capacity_bands::text, ''), 2000),
        'update', actor
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_shows ON public.shows;
CREATE TRIGGER trg_audit_shows
  AFTER INSERT OR UPDATE ON public.shows
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_audit_shows();

-- 5) advancement_items trigger
CREATE OR REPLACE FUNCTION public.tg_audit_advancement_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid;
  run uuid;
  prefix text;
BEGIN
  actor := COALESCE(public.audit_actor(), NEW.updated_by);
  run := NEW.run_id;
  prefix := 'advancement.' || COALESCE(NEW.item_key, NEW.label, 'item');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_insert_row('advancement_items', NEW.id, run, prefix || '.status', NULL, NEW.status, 'insert', actor);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    actor := COALESCE(public.audit_actor(), NEW.updated_by, OLD.updated_by);
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.audit_insert_row('advancement_items', NEW.id, run, prefix || '.status', OLD.status, NEW.status, 'update', actor);
    END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      PERFORM public.audit_insert_row('advancement_items', NEW.id, run, prefix || '.notes', OLD.notes, NEW.notes, 'update', actor);
    END IF;
    IF NEW.paid IS DISTINCT FROM OLD.paid THEN
      PERFORM public.audit_insert_row('advancement_items', NEW.id, run, prefix || '.paid', OLD.paid::text, NEW.paid::text, 'update', actor);
    END IF;
    IF NEW.payment_type IS DISTINCT FROM OLD.payment_type THEN
      PERFORM public.audit_insert_row('advancement_items', NEW.id, run, prefix || '.payment_type', OLD.payment_type, NEW.payment_type, 'update', actor);
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      PERFORM public.audit_insert_row('advancement_items', NEW.id, run, prefix || '.assigned_to', OLD.assigned_to, NEW.assigned_to, 'update', actor);
    END IF;
    IF NEW.label IS DISTINCT FROM OLD.label THEN
      PERFORM public.audit_insert_row('advancement_items', NEW.id, run, prefix || '.label', OLD.label, NEW.label, 'update', actor);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_advancement_items ON public.advancement_items;
CREATE TRIGGER trg_audit_advancement_items
  AFTER INSERT OR UPDATE ON public.advancement_items
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_audit_advancement_items();

-- 6) runs trigger (worksheet / synopsis / status)
CREATE OR REPLACE FUNCTION public.tg_audit_runs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid;
  col text;
  old_v text;
  new_v text;
  cols text[] := ARRAY[
    'status','name','region','synopsis','notes','ticket_outlook_summary',
    'flights_notes','vehicles_notes','hotels_overview_notes',
    'show_pack_status','start_date','end_date'
  ];
BEGIN
  actor := public.audit_actor();

  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_insert_row('runs', NEW.id, NEW.id, 'runs.code', NULL, NEW.code, 'insert', actor);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOREACH col IN ARRAY cols LOOP
      EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', col, col)
        INTO old_v, new_v
        USING OLD, NEW;
      IF old_v IS DISTINCT FROM new_v THEN
        PERFORM public.audit_insert_row('runs', NEW.id, NEW.id, 'runs.' || col, old_v, new_v, 'update', actor);
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_runs ON public.runs;
CREATE TRIGGER trg_audit_runs
  AFTER INSERT OR UPDATE ON public.runs
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_audit_runs();

-- Allow authenticated inserts to set run_id (policy already allows insert)
-- Ensure service role / triggers can insert regardless of RLS (SECURITY DEFINER handles it)

GRANT EXECUTE ON FUNCTION public.audit_actor() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audit_insert_row(text, uuid, uuid, text, text, text, text, uuid) TO authenticated, service_role;
