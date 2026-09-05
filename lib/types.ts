export type RunStatus = 'proposed' | 'confirmed' | 'booking' | 'show_week' | 'post_show' | 'settled' | 'archived'
export type RunRegion = 'group1' | 'group2' | 'group3'
export type FieldState = 'known' | 'estimated' | 'guess' | 'pending'
export type UserRole = 'admin' | 'owner' | 'crew' | 'production' | 'external'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  permissions: Record<string, boolean>
  created_at: string
}

export interface Run {
  id: string
  code: string
  name: string
  status: RunStatus
  region: RunRegion
  start_date: string | null
  end_date: string | null
  completion_pct: number
  created_at: string
  updated_at: string
  shows?: Show[]
}

export interface Show {
  id: string
  run_id: string
  venue_name: string
  venue_city: string
  show_date: string | null
  capacity: number | null
  /** Ordered Harbour capacity options; null/[] = single-cap. See lib/capacity-bands.ts */
  capacity_bands?: unknown | null
  ticket_price: number | null
  show_order: number
  created_at: string
}

export interface CostField {
  id: string
  run_id: string
  show_id: string | null
  category: string
  field_key: string
  label: string
  value: number | null
  state: FieldState
  source: string | null
  verified_by: string | null
  verified_at: string | null
  assigned_to: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  table_name: string
  record_id: string
  run_id?: string | null
  field_name: string | null
  old_value: string | null
  new_value: string | null
  changed_by: string | null
  changed_at: string
  change_type: 'insert' | 'update' | 'delete'
}

export interface FieldComment {
  id: string
  cost_field_id: string
  author_id: string
  body: string
  created_at: string
  author?: Profile
}

export interface FeatureRequest {
  id: string
  submitted_by: string
  title: string
  description: string | null
  status: 'pending' | 'reviewing' | 'planned' | 'done' | 'rejected'
  created_at: string
}
