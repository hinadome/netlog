import { useEffect } from 'react'
import type { AppTab } from '../model/appUrlState'

interface ShortcutHandlers {
  onTab: (tab: AppTab) => void
  onFocusSearch: () => void
  onExportSession?: () => void
}

export function useKeyboardShortcuts(enabled: boolean, handlers: ShortcutHandlers) {
  useEffect(() => {
    if (!enabled) return

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        handlers.onFocusSearch()
        return
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key) {
        case '1':
          handlers.onTab('overview')
          break
        case '2':
          handlers.onTab('sessions')
          break
        case '3':
          handlers.onTab('findings')
          break
        case '4':
          handlers.onTab('search')
          break
        case '5':
          handlers.onTab('compare')
          break
        case 'g':
          handlers.onTab('guide')
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, handlers])
}
