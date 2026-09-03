/** How this session row was constructed for the UI. */
export type SessionOrigin = 'events' | 'events+polled' | 'polledOnly'

export function sessionOriginLabel(origin: SessionOrigin | undefined): string {
  switch (origin) {
    case 'events+polled':
      return 'Events + snapshot'
    case 'polledOnly':
      return 'Snapshot only'
    default:
      return 'Events'
  }
}

export function originBadgeModifier(origin: SessionOrigin | undefined): string {
  switch (origin) {
    case 'events+polled':
      return 'session-origin-badge--merged'
    case 'polledOnly':
      return 'session-origin-badge--snapshot'
    default:
      return 'session-origin-badge--events'
  }
}

export function originBadgeShort(origin: SessionOrigin | undefined): string {
  switch (origin) {
    case 'polledOnly':
      return 'Snap'
    case 'events+polled':
      return 'Both'
    default:
      return 'Evts'
  }
}
