import { useEffect } from 'react'

/**
 * What is typed and not saved yet, part by part ("Chưa lưu", specs/017 FR-017), so leaving the page asks
 * first (review 12/11, F09). Each part says whether it holds something unsaved; the page guards itself
 * while any does.
 */
const unsaved = new Set<string>()

/** Marks `part` as holding something unsaved while `dirty` is true (and never once it unmounts). */
export function useUnsaved(part: string, dirty: boolean) {
  useEffect(() => {
    if (dirty) unsaved.add(part)
    else unsaved.delete(part)
    return () => {
      unsaved.delete(part)
    }
  }, [part, dirty])
}

export const hasUnsaved = () => unsaved.size > 0

/**
 * While anything is unsaved: closing or reloading the tab gets the browser's own question, and a link to
 * another page of the app asks `question` first. The link is caught before React Router sees it (a
 * capture listener), so "Ở lại" leaves the page as it is. The browser's Back button is not caught.
 */
export function useLeaveGuard(question: string) {
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsaved()) return
      event.preventDefault()
      // Older browsers need a value to show their question
      event.returnValue = ''
    }
    const click = (event: MouseEvent) => {
      if (!hasUnsaved() || event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || link.origin !== window.location.origin) return
      // A jump within the page ("#expense-list-title") leaves nothing
      if (link.getAttribute('href')?.startsWith('#')) return
      if (window.confirm(question)) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', click, true)
    }
  }, [question])
}
