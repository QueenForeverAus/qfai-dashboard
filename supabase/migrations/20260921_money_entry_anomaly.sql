-- Staging: per money_entry / cost line anomaly flags on JSONB entries + line_items.
-- Additive / idempotent. Do NOT apply to prod (Builder applies staging separately).
--
-- Canon (2026-09-21): invoice received → INVOICED (never PAID from invoice alone).
-- New/unknown line or significant Δ (A$100 or ~20% or qualitative) → anomaly ⚠ + note.
-- Ordinary match → INVOICED only. Distinct money_entries per invoice #.
-- Fields live on the JSONB money_entry / planned-role object (not a parallel table).

do $$
begin
  -- cost_fields.entries
  if to_regclass('public.cost_fields') is not null then
    update public.cost_fields
    set entries = (
      select coalesce(jsonb_agg(
        case
          when jsonb_typeof(e) = 'object' then
            e || jsonb_build_object(
              'anomaly', coalesce((e->>'anomaly')::boolean, false),
              'anomaly_note', case
                when e ? 'anomaly_note' then e->'anomaly_note'
                else 'null'::jsonb
              end
            )
          else e
        end
      ), '[]'::jsonb)
      from jsonb_array_elements(coalesce(entries, '[]'::jsonb)) e
    ),
        updated_at = now()
    where entries is not null
      and jsonb_typeof(entries) = 'array'
      and exists (
        select 1
        from jsonb_array_elements(entries) e
        where jsonb_typeof(e) = 'object'
          and not (e ? 'anomaly')
      );

    update public.cost_fields
    set line_items = (
      select coalesce(jsonb_agg(
        case
          when jsonb_typeof(e) = 'object' then
            e || jsonb_build_object(
              'anomaly', coalesce((e->>'anomaly')::boolean, false),
              'anomaly_note', case
                when e ? 'anomaly_note' then e->'anomaly_note'
                else 'null'::jsonb
              end
            )
          else e
        end
      ), '[]'::jsonb)
      from jsonb_array_elements(coalesce(line_items, '[]'::jsonb)) e
    ),
        updated_at = now()
    where line_items is not null
      and jsonb_typeof(line_items) = 'array'
      and exists (
        select 1
        from jsonb_array_elements(line_items) e
        where jsonb_typeof(e) = 'object'
          and not (e ? 'anomaly')
      );

    comment on column public.cost_fields.entries is
      'JSONB money_entries. Each object may include anomaly (boolean) + anomaly_note (string|null) + invoice_number + invoice_amount. INVOICED is cost_fields.state; PAID is entries[].paid. invoiced ≠ paid.';
    comment on column public.cost_fields.line_items is
      'JSONB planned roles. Each object may include anomaly (boolean) + anomaly_note (string|null) + invoice_amount. Same INVOICED ≠ PAID rule as entries.';
  end if;

  if to_regclass('public.advancing_cost_fields') is not null then
    update public.advancing_cost_fields
    set entries = (
      select coalesce(jsonb_agg(
        case
          when jsonb_typeof(e) = 'object' then
            e || jsonb_build_object(
              'anomaly', coalesce((e->>'anomaly')::boolean, false),
              'anomaly_note', case
                when e ? 'anomaly_note' then e->'anomaly_note'
                else 'null'::jsonb
              end
            )
          else e
        end
      ), '[]'::jsonb)
      from jsonb_array_elements(coalesce(entries, '[]'::jsonb)) e
    ),
        updated_at = now()
    where entries is not null
      and jsonb_typeof(entries) = 'array'
      and exists (
        select 1
        from jsonb_array_elements(entries) e
        where jsonb_typeof(e) = 'object'
          and not (e ? 'anomaly')
      );

    update public.advancing_cost_fields
    set line_items = (
      select coalesce(jsonb_agg(
        case
          when jsonb_typeof(e) = 'object' then
            e || jsonb_build_object(
              'anomaly', coalesce((e->>'anomaly')::boolean, false),
              'anomaly_note', case
                when e ? 'anomaly_note' then e->'anomaly_note'
                else 'null'::jsonb
              end
            )
          else e
        end
      ), '[]'::jsonb)
      from jsonb_array_elements(coalesce(line_items, '[]'::jsonb)) e
    ),
        updated_at = now()
    where line_items is not null
      and jsonb_typeof(line_items) = 'array'
      and exists (
        select 1
        from jsonb_array_elements(line_items) e
        where jsonb_typeof(e) = 'object'
          and not (e ? 'anomaly')
      );

    comment on column public.advancing_cost_fields.entries is
      'Same money_entry shape as cost_fields.entries (anomaly / anomaly_note / invoice_number / invoice_amount). INVOICED ≠ PAID.';
    comment on column public.advancing_cost_fields.line_items is
      'Same planned-role shape as cost_fields.line_items (anomaly / anomaly_note). INVOICED ≠ PAID.';
  end if;
end $$;
