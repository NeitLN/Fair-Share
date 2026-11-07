import { useState } from 'react'

import type { MemberLook } from '../lib/names'
import { useT } from '../i18n'

type Size = 'sm' | 'md' | 'lg'

interface AvatarProps {
  look: MemberLook
  size?: Size
  /** Next to the visible name the avatar adds nothing for a screen reader, so it is hidden. */
  decorative?: boolean
}

/**
 * A circular sticker with the member's photo, or their initial (docs/DESIGN.md §5). The photo sits in
 * the same circle, ring and shadow; the label stays on the circle, so a screen reader hears the name
 * once. A photo that fails to show falls back to the initial.
 */
export function Avatar({ look, size = 'md', decorative = false }: AvatarProps) {
  const [broken, setBroken] = useState<string | null>(null)
  const photo = look.photo && look.photo !== broken ? look.photo : undefined
  const label = decorative ? {} : { role: 'img', 'aria-label': look.full }
  return (
    <span
      className={`avatar avatar-${size} tint-${look.tint}${photo ? ' has-photo' : ''}`}
      title={look.full}
      aria-hidden={decorative || undefined}
      {...label}
    >
      {photo ? <img src={photo} alt="" onError={() => setBroken(photo)} /> : look.initial}
    </span>
  )
}

interface AvatarStackProps {
  looks: MemberLook[]
  /** At most this many avatars, then "+n". */
  max?: number
}

/** The household at a glance: up to three avatars, then how many more. */
export function AvatarStack({ looks, max = 3 }: AvatarStackProps) {
  const t = useT()
  const shown = looks.slice(0, max)
  const more = looks.length - shown.length
  const names = looks.map((look) => look.full).join(', ')
  return (
    <span className="avatar-stack" role="img" aria-label={`${t.common.people(looks.length)}${names}`}>
      {shown.map((look, index) => (
        <Avatar key={index} look={look} decorative />
      ))}
      {more > 0 && (
        <span className="avatar avatar-md avatar-more" aria-hidden="true">
          +{more}
        </span>
      )}
    </span>
  )
}
