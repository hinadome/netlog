export type AppTab = 'overview' | 'sessions' | 'findings' | 'guide' | 'search' | 'compare'

export interface AppUrlState {
  tab: AppTab
  sessionId?: number
  eventIndex?: number
  findingId?: string
  brushStart?: number
  brushEnd?: number
  globalQuery?: string
}

const VALID_TABS = new Set<AppTab>([
  'overview',
  'sessions',
  'findings',
  'guide',
  'search',
  'compare',
])

export function parseAppUrlState(hash: string): Partial<AppUrlState> {
  const raw = hash.replace(/^#/, '').trim()
  if (!raw) return {}

  if (raw.startsWith('?')) {
    const params = new URLSearchParams(raw.slice(1))
    const tab = params.get('tab') as AppTab | null
    const out: Partial<AppUrlState> = {}
    if (tab && VALID_TABS.has(tab)) out.tab = tab
    const session = params.get('session')
    if (session) out.sessionId = Number(session)
    const event = params.get('event')
    if (event) out.eventIndex = Number(event)
    const finding = params.get('finding')
    if (finding) out.findingId = finding
    const brush = params.get('brush')
    if (brush) {
      const [a, b] = brush.split(',').map(Number)
      if (Number.isFinite(a) && Number.isFinite(b)) {
        out.brushStart = a
        out.brushEnd = b
      }
    }
    const q = params.get('q')
    if (q) out.globalQuery = q
    return out
  }

  return {}
}

export function buildAppUrlHash(state: AppUrlState): string {
  const params = new URLSearchParams()
  params.set('tab', state.tab)
  if (state.sessionId !== undefined) params.set('session', String(state.sessionId))
  if (state.eventIndex !== undefined) params.set('event', String(state.eventIndex))
  if (state.findingId) params.set('finding', state.findingId)
  if (state.brushStart !== undefined && state.brushEnd !== undefined) {
    params.set('brush', `${state.brushStart},${state.brushEnd}`)
  }
  if (state.globalQuery) params.set('q', state.globalQuery)
  return `#?${params.toString()}`
}

export const LARGE_CAPTURE_EVENT_THRESHOLD = 100_000
