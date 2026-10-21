import type { MemberLook } from '../lib/names'

type Size = 'sm' | 'md' | 'lg'

interface AvatarProps {
  look: MemberLook
  size?: Size
  /** Next to the visible name the avatar adds nothing for a screen reader, so it is hidden. */
  decorative?: boolean
}

/** A circular sticker with the member's initial (docs/DESIGN.md §5). */
export function Avatar({ look, size = 'md', decorative = false }: AvatarProps) {
  const label = decorative ? {} : { role: 'img', 'aria-label': look.full }
  return (
    <span
      className={`avatar avatar-${size} tint-${look.tint}`}
      title={look.full}
      aria-hidden={decorative || undefined}
      {...label}
    >
      {look.initial}
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
  const shown = looks.slice(0, max)
  const more = looks.length - shown.length
  const names = looks.map((look) => look.full).join(', ')
  return (
    <span className="avatar-stack" role="img" aria-label={`${looks.length} người: ${names}`}>
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
