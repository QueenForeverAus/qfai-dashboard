/**
 * Cost-field data completeness for Mission Control /runs list / run detail dial.
 * Matches the historical /runs list formula: (known + estimated) / non-pending.
 * Advancing Shows checklist is a separate metric — do not reuse this for it.
 */
export type CompletionField = { state: string }

export function computeCompletionPct(fields: CompletionField[]): number {
  const actionable = fields.filter(f => f.state !== 'pending')
  if (actionable.length === 0) return 0
  const resolved = actionable.filter(f => f.state === 'known' || f.state === 'estimated')
  return Math.round((resolved.length / actionable.length) * 100)
}
