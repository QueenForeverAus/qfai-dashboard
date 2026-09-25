import Link from 'next/link'

const TABS = [
  { href: '/ticket-sales', label: 'Board', id: 'board' },
  { href: '/ticket-sales/onsale', label: 'On-sale tracker', id: 'onsale' },
] as const

export default function TicketSalesTabs({ active }: { active: 'board' | 'onsale' }) {
  return (
    <nav aria-label="Ticket Sales and Ads" className="flex flex-wrap gap-2 mt-3">
      {TABS.map(tab => {
        const on = tab.id === active
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={on ? 'page' : undefined}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              on
                ? 'bg-amber-400 text-slate-900 border-amber-400 font-semibold'
                : 'border-slate-600 text-slate-300 hover:border-slate-400'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
