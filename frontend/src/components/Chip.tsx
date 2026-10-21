import type { ReactNode } from 'react'

type ChipKind = 'credit' | 'debt' | 'zero' | 'ai' | 'me'

/** A small pill: được nhận (mint), cần trả (pink), ✦ AI (yellow), bạn (ink). DESIGN.md §5. */
export function Chip({ kind, children }: { kind: ChipKind; children: ReactNode }) {
  return <span className={`chip chip-${kind}`}>{children}</span>
}

type StampKind = 'paid' | 'settled'

const STAMP_TEXT: Record<StampKind, string> = { paid: 'ĐÃ TRẢ', settled: 'SẠCH NỢ' }

/**
 * The two stickers, the only uppercase text in the app. Decorative by default: the toast or the row
 * text says the same thing in words.
 */
export function Stamp({ kind, decorative = true }: { kind: StampKind; decorative?: boolean }) {
  return (
    <span className={`stamp stamp-${kind}`} aria-hidden={decorative || undefined}>
      {STAMP_TEXT[kind]}
    </span>
  )
}
