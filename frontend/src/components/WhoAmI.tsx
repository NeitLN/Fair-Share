import { useEffect, useRef, useState } from 'react'

import type { Member } from '../api/types'
import { useMe } from '../lib/identity'
import type { MemberLook } from '../lib/names'
import { Avatar } from './Avatar'

interface WhoAmIProps {
  members: Member[]
  looks: Map<number, MemberLook>
}

/**
 * "Bạn là ai?" (UX-01, DESIGN.md §6.2). One line, never in the way: "Bạn là ai trong nhà này? Chọn"
 * until someone is chosen, then "Bạn là Tiến · Không phải bạn?". Either button opens the chooser: one
 * button per member, a tap chooses. Buttons rather than radios, so moving with the keyboard never
 * chooses by accident.
 */
function WhoAmI({ members, looks }: WhoAmIProps) {
  const { me, setMe } = useMe()
  const [open, setOpen] = useState(false)
  const chooser = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  // Focus moves into the chooser only when the user opened it, never on page load
  const openedByUser = useRef(false)

  useEffect(() => {
    if (!open || !openedByUser.current) return
    openedByUser.current = false
    const buttons = chooser.current?.querySelectorAll<HTMLButtonElement>('button')
    const current = chooser.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
    ;(current ?? buttons?.[0])?.focus()
  }, [open])

  function close() {
    setOpen(false)
    // Back to the button that opened the chooser, so keyboard users do not lose their place
    requestAnimationFrame(() => toggle.current?.focus())
  }

  if (!open) {
    const name = me !== null ? looks.get(me)?.short : undefined
    return (
      <p className="who-am-i">
        <span>{name ? <>Bạn là <b>{name}</b></> : 'Bạn là ai trong nhà này?'}</span>
        <button
          ref={toggle}
          type="button"
          className="btn-ghost"
          onClick={() => {
            openedByUser.current = true
            setOpen(true)
          }}
        >
          {name ? 'Không phải bạn?' : 'Chọn'}
        </button>
      </p>
    )
  }

  return (
    <div
      ref={chooser}
      className="chooser"
      role="group"
      aria-labelledby="chooser-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') close()
      }}
    >
      <p id="chooser-title" className="chooser-title">
        Bạn là ai trong nhà này?
      </p>
      <div className="pick">
        {members.map((member) => {
          const look = looks.get(member.id)
          if (!look) return null
          return (
            <button
              key={member.id}
              type="button"
              aria-pressed={me === member.id}
              onClick={() => {
                setMe(member.id)
                close()
              }}
            >
              <Avatar look={look} size="sm" decorative />
              <span className="name">{look.short}</span>
            </button>
          )
        })}
      </div>
      <p className="hint">Chỉ lưu trên máy này, để app nói “bạn” và chọn sẵn người trả.</p>
    </div>
  )
}

export default WhoAmI
