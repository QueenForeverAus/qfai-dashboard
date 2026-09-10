-- Additive: reversible Portal user deactivate.
-- Staging apply; prod held.
--
-- HARD (Gareth/Lead): audit trail for a removed user MUST stay.
-- This migration does NOT delete or rewrite audit_log.
-- Confirmed users are deactivated in-app (ban + revoke sessions).
-- The profiles row stays so audit_log.changed_by / updated_by FKs remain valid.
-- Hard Auth delete is only for never-confirmed invites with zero audit rows.

alter table public.profiles
  add column if not exists deactivated_at timestamptz;

comment on column public.profiles.deactivated_at is
  'When set, login is disabled (Auth ban + session revoke). Profile row is kept so audit_log history for this user id is never cascaded away. Reversible.';

-- Self-serve / owner PostgREST cannot flip deactivate. Service role (no JWT) and admin may.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role / SQL editor have no JWT; allow invite + admin-client writes.
  if auth.uid() is null then
    return new;
  end if;
  if public.get_my_role() = 'admin' then
    return new;
  end if;
  new.id := old.id;
  new.role := old.role;
  new.permissions := old.permissions;
  new.created_at := old.created_at;
  new.deactivated_at := old.deactivated_at;
  return new;
end;
$$;
