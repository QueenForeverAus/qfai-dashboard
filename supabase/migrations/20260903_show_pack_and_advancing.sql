-- Virtual Show Pack + Advancing Shows support (staging)
-- Applied 2026-09-03. Additive only — does not destroy advancement checkmarks.

-- Per-show Michael notes for Virtual Show Pack
alter table shows
  add column if not exists michael_notes text;

-- Per-run publish state for multi-show packs
alter table runs
  add column if not exists show_pack_status text not null default 'draft'
    check (show_pack_status in ('draft', 'published'));

alter table runs
  add column if not exists show_pack_published_at timestamptz;

alter table runs
  add column if not exists show_pack_published_by uuid references profiles(id);

comment on column shows.michael_notes is 'Access/parking/special notes for Virtual Show Pack (Michael)';
comment on column runs.show_pack_status is 'Virtual Show Pack: draft | published (per-run)';
