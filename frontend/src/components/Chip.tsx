import type { ReactNode } from 'react'
import { useT } from '../i18n'

type ChipKind = 'credit' | 'debt' | 'zero' | 'ai' | 'me'

/** A small pill: được nhận (mint), cần trả (pink), ✦ AI (yellow), bạn (ink). DESIGN.md §5. */
export function Chip({ kind, children }: { kind: ChipKind; children: ReactNode }) {
  return <span className={`chip chip-${kind}`}>{children}</span>
}

type StampKind = 'paid' | 'settled'

/**
 * The two stickers, the only uppercase text in the app. Decorative by default: the toast or the row
 * text says the same thing in words.
 */
export function Stamp({ kind, decorative = true }: { kind: StampKind; decorative?: boolean }) {
  const t = useT()
  return (
    <span className={`stamp stamp-${kind}`} aria-hidden={decorative || undefined}>
      {t.stamps[kind]}
    </span>
  )
}
