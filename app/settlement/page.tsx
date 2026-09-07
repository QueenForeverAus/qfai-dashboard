import { redirect } from 'next/navigation'

/** Legacy Settlement Checker / placeholder → W1.3 Settlements shell. */
export default function SettlementRedirect() {
  redirect('/settlements')
}
