export type AssignedTo = 'tour_manager' | 'production_manager' | 'finance'

export type AdvancementChecklistItem = {
  category: string
  item_key: string
  label: string
  assigned_to: AssignedTo
  sort_order: number
  payment_type?: 'upfront' | 'post_gig'
}

export const ADVANCEMENT_CHECKLIST: AdvancementChecklistItem[] = [
  // Show Day Schedule — TM confirms times with venue/Harbour; PM operates them
  { category: 'Show Day Schedule', item_key: 'show_time_confirmed',    label: 'Performance start time confirmed with venue (target: 19:30)', assigned_to: 'tour_manager',       sort_order: 10 },
  { category: 'Show Day Schedule', item_key: 'venue_access_confirmed', label: 'Venue access time confirmed (target: 13:00)',                   assigned_to: 'tour_manager',       sort_order: 20 },
  { category: 'Show Day Schedule', item_key: 'soundcheck_time',        label: 'Soundcheck time confirmed with venue (target: 16:30)',          assigned_to: 'production_manager', sort_order: 30 },
  { category: 'Show Day Schedule', item_key: 'dinner_arranged',        label: 'Dinner time confirmed with venue (target: 17:30)',              assigned_to: 'production_manager', sort_order: 40 },
  { category: 'Show Day Schedule', item_key: 'doors_time',             label: 'Doors time confirmed with venue (target: 19:00)',               assigned_to: 'tour_manager',       sort_order: 50 },
  { category: 'Show Day Schedule', item_key: 'meet_greet_confirmed',   label: 'Freddie Meet & Greet slot confirmed (target: 22:00)',           assigned_to: 'tour_manager',       sort_order: 60 },

  // Venue / Tech Requirements
  { category: 'Venue / Tech Requirements', item_key: 'loading_dock_info',      label: 'Loading dock address and access instructions received',               assigned_to: 'tour_manager',       sort_order: 110 },
  { category: 'Venue / Tech Requirements', item_key: 'bump_in_tech_audio',     label: 'Bump-in tech confirmed — Audio (4–5hr call)',                          assigned_to: 'production_manager', sort_order: 120 },
  { category: 'Venue / Tech Requirements', item_key: 'bump_in_tech_lighting',  label: 'Bump-in tech confirmed — Lighting (4–5hr call)',                       assigned_to: 'production_manager', sort_order: 130 },
  { category: 'Venue / Tech Requirements', item_key: 'bump_out_techs',         label: 'Bump-out techs confirmed × 2 (3–4hr min call)',                        assigned_to: 'production_manager', sort_order: 140 },
  { category: 'Venue / Tech Requirements', item_key: 'followspot_op',          label: 'Followspot operator confirmed (18:45–22:15)',                           assigned_to: 'production_manager', sort_order: 150 },
  { category: 'Venue / Tech Requirements', item_key: 'risers_keys',            label: 'Keys riser confirmed ≥300mm',                                          assigned_to: 'production_manager', sort_order: 160 },
  { category: 'Venue / Tech Requirements', item_key: 'risers_drum',            label: 'Drum riser confirmed ≥600mm',                                          assigned_to: 'production_manager', sort_order: 170 },
  { category: 'Venue / Tech Requirements', item_key: 'risers_amp',             label: 'Amp riser confirmed ≥600mm',                                           assigned_to: 'production_manager', sort_order: 180 },
  { category: 'Venue / Tech Requirements', item_key: 'guitar_risers',          label: 'Guitar risers pre-assembled confirmed',                                 assigned_to: 'production_manager', sort_order: 185 },
  { category: 'Venue / Tech Requirements', item_key: 'vision_input',           label: 'Vision input at USL of drum riser confirmed (HDMI or SDI)',             assigned_to: 'production_manager', sort_order: 190 },
  { category: 'Venue / Tech Requirements', item_key: 'merch_seller',           label: 'Merch seller arranged by venue (1 table + 1 pinboard + cash float)',    assigned_to: 'tour_manager',       sort_order: 200 },

  // Travel — all TM
  { category: 'Travel', item_key: 'travel_type',             label: 'Group travel type determined (van / fly / mixed)',                       assigned_to: 'tour_manager', sort_order: 210 },
  { category: 'Travel', item_key: 'flights_booked',          label: 'Flights booked for all travelling members',                             assigned_to: 'tour_manager', sort_order: 220 },
  { category: 'Travel', item_key: 'flight_details_recorded', label: 'Flight details recorded (name, flight no., times, terminals)',           assigned_to: 'tour_manager', sort_order: 230 },
  { category: 'Travel', item_key: 'baggage_allowance',       label: 'Baggage allowance checked and confirmed for all travellers',            assigned_to: 'tour_manager', sort_order: 240 },
  { category: 'Travel', item_key: 'car_hire_van',            label: 'Car hire / van booked',                                                assigned_to: 'tour_manager', sort_order: 250 },
  { category: 'Travel', item_key: 'driver_confirmed',        label: 'Designated driver confirmed (Brad or hire driver)',                     assigned_to: 'tour_manager', sort_order: 260 },

  // Accommodation — all TM
  { category: 'Accommodation', item_key: 'hotel_booked',             label: 'Hotel booked — 7 rooms',                                             assigned_to: 'tour_manager', sort_order: 310 },
  { category: 'Accommodation', item_key: 'tech_rooms_noon',          label: '2 × tech rooms requested available by 12 noon',                     assigned_to: 'tour_manager', sort_order: 320 },
  { category: 'Accommodation', item_key: 'early_checkin_flights',    label: 'Early check-in / late check-out arranged for early or late flights', assigned_to: 'tour_manager', sort_order: 330 },
  { category: 'Accommodation', item_key: 'names_on_booking',         label: 'All 7 names confirmed on booking',                                   assigned_to: 'tour_manager', sort_order: 340 },
  { category: 'Accommodation', item_key: 'hotel_details_to_michael', label: 'Hotel address and check-in details sent to Michael',                 assigned_to: 'tour_manager', sort_order: 350 },

  // Backline & Hire — PM (relevant when flying, Group 2/3 runs)
  { category: 'Backline & Hire', item_key: 'backline_needed',    label: 'Backline hire need assessed (relevant if flying)',                    assigned_to: 'production_manager', sort_order: 410 },
  { category: 'Backline & Hire', item_key: 'backline_quotes',    label: 'Backline hire quotes obtained',                                       assigned_to: 'production_manager', sort_order: 420 },
  { category: 'Backline & Hire', item_key: 'extra_lighting',     label: 'Extra lighting assessed (6 beams? moving spots? wash package?)',      assigned_to: 'production_manager', sort_order: 430 },
  { category: 'Backline & Hire', item_key: 'extra_pa',           label: 'Extra PA assessed (ground stack? desk?)',                             assigned_to: 'production_manager', sort_order: 440 },
  { category: 'Backline & Hire', item_key: 'hire_orders_placed', label: 'Hire quotes approved and orders placed',                              assigned_to: 'production_manager', sort_order: 450 },

  // Hospitality — PM
  { category: 'Hospitality', item_key: 'catering_rider_submitted', label: 'Hospitality rider submitted to venue — sandwiches ×7, fruit ×7, Coke Zero ×4, Coke ×8, Lemonade ×4, water ×24', assigned_to: 'production_manager', sort_order: 510 },
  { category: 'Hospitality', item_key: 'catering_quote_received',  label: 'Venue catering quote received',                                                                                   assigned_to: 'production_manager', sort_order: 520 },
  { category: 'Hospitality', item_key: 'catering_confirmed',       label: 'Catering arrangements confirmed',                                                                                  assigned_to: 'production_manager', sort_order: 530 },

  // Payments — PM flags, Finance acts
  { category: 'Payments', item_key: 'payment_terms_noted',  label: 'All supplier payment terms noted (upfront vs post-gig)',          assigned_to: 'production_manager',                    sort_order: 610 },
  { category: 'Payments', item_key: 'accounts_notified',    label: 'Scott notified of all upfront payment requirements',              assigned_to: 'finance', payment_type: 'upfront',       sort_order: 620 },
  { category: 'Payments', item_key: 'upfront_payments_made', label: 'All upfront payments made on time',                             assigned_to: 'finance', payment_type: 'upfront',       sort_order: 630 },
]

export const CATEGORY_ORDER = [
  'Show Day Schedule',
  'Venue / Tech Requirements',
  'Travel',
  'Accommodation',
  'Backline & Hire',
  'Hospitality',
  'Payments',
]

export const OWNER_LABELS: Record<AssignedTo, string> = {
  tour_manager:       'TM',
  production_manager: 'PM',
  finance:            'Finance',
}

export const OWNER_STYLES: Record<AssignedTo, string> = {
  tour_manager:       'bg-blue-900/50 text-blue-300 border border-blue-800',
  production_manager: 'bg-purple-900/50 text-purple-300 border border-purple-800',
  finance:            'bg-emerald-900/50 text-emerald-300 border border-emerald-800',
}
