/** What each Portal role can open. Keep /settings (Profile) on every signed-in role. */
export const ROLE_ACCESS: Record<string, { pages: string[]; tabs: string[] }> = {
  admin:      { pages: ['/', '/runs', '/advancing', '/emails', '/settlement', '/settlements', '/feedback', '/admin', '/admin-settings', '/factors', '/settings', '/profile'], tabs: ['costs', 'outlook', 'audit', 'run_advancing', 'advancement', 'show_pack'] },
  owner:      { pages: ['/', '/runs', '/advancing', '/emails', '/settlement', '/settlements', '/feedback', '/factors', '/admin-settings', '/settings', '/profile'],           tabs: ['costs', 'outlook', 'audit', 'run_advancing', 'advancement', 'show_pack'] },
  production: { pages: ['/runs', '/advancing', '/feedback', '/settings', '/profile'],                                         tabs: ['costs', 'run_advancing', 'advancement', 'show_pack'] },
  crew:       { pages: ['/runs', '/advancing', '/feedback', '/settings', '/profile'],                                         tabs: ['advancement'] },
  external:   { pages: ['/feedback', '/settings', '/profile'],                                                  tabs: [] },
}

export function isAdminOrOwner(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'owner'
}

export function canAccessAdminSettings(role: string | undefined | null): boolean {
  return isAdminOrOwner(role)
}

export function canAccessPage(role: string, page: string): boolean {
  const access = ROLE_ACCESS[role] ?? ROLE_ACCESS.external
  return access.pages.some(p => page === p || (p !== '/' && page.startsWith(p)))
}

export function canAccessTab(role: string, tab: string): boolean {
  const access = ROLE_ACCESS[role] ?? ROLE_ACCESS.external
  return access.tabs.includes(tab)
}
