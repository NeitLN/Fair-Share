import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { closeFoldOnEscape } from '../lib/fold'
import { foldOpen, rememberFold } from '../lib/folds'
import type { FoldName } from '../lib/folds'

interface FoldMoreProps {
  householdId: number
  name: FoldName
  /** The line that stands for what is folded, e.g. "7 người khác: 1 được nhận, 6 cần trả". */
  summary: ReactNode
  children: ReactNode
}

/**
 * The household's part of a section of Tổng quan in a busy house (plan G2-10): a native fold, closed
 * until opened, remembered per house on this device (lib/folds.ts). Escape closes it (DESIGN.md §8).
 * A link to something inside it (Mới ghi's "#settlement-…", an explanation's repayment) opens it first,
 * so the browser can scroll to it.
 */
function FoldMore({ householdId, name, summary, children }: FoldMoreProps) {
  const fold = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(() => foldOpen(householdId, name))

  useEffect(() => {
    function reveal(hash: string) {
      if (!hash.startsWith('#') || hash.length < 2) return
      const target = document.getElementById(decodeURIComponent(hash.slice(1)))
      if (target && fold.current && !fold.current.open && fold.current.contains(target)) {
        fold.current.open = true
      }
    }
    // Before the browser scrolls: a click on such a link, and a page opened at that address
    function onClick(event: MouseEvent) {
      const link = (event.target as Element | null)?.closest?.('a[href^="#"]')
      if (link) reveal(link.getAttribute('href') ?? '')
    }
    reveal(window.location.hash)
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return (
    <details
      ref={fold}
      className="fold-more"
      open={open}
      onToggle={(event) => {
        const now = event.currentTarget.open
        setOpen(now)
        rememberFold(householdId, name, now)
      }}
      onKeyDown={closeFoldOnEscape}
    >
      <summary>{summary}</summary>
      {children}
    </details>
  )
}

export default FoldMore
