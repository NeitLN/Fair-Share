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
 * until someone is chosen, then "Bạn là Tiến · Không phải bạn?". Either button opens the chooser.
 */
function WhoAmI({ members, looks }: WhoAmIProps) {
  const { me, setMe } = useMe()
  const [changing, setChanging] = useState(false)
  const open = changing
  const group = useRef<HTMLFieldSetElement>(null)
  const changeButton = useRef<HTMLButtonElement>(null)
  // Focus moves into the chooser only when the user asked to change, not when the page first loads
  const askedToChange = useRef(false)

  useEffect(() => {
    if (changing && askedToChange.current) {
      group.current?.querySelector<HTMLInputElement>('input:checked, input')?.focus()
      askedToChange.current = false
    }
  }, [changing])

  function close() {
    setChanging(false)
    // Back to the button that opened the chooser, so keyboard users do not lose their place
    requestAnimationFrame(() => changeButton.current?.focus())
  }

  function choose(id: number) {
    setMe(id)
    close()
  }

  if (!open) {
    const name = me !== null ? looks.get(me)?.short : undefined
    return (
      <p className="who-am-i">
        <span>{name ? <>Bạn là <b>{name}</b></> : 'Bạn là ai trong nhà này?'}</span>
        <button
          ref={changeButton}
          type="button"
          className="btn-ghost"
          aria-expanded="false"
          onClick={() => {
            askedToChange.current = true
            setChanging(true)
          }}
        >
          {name ? 'Không phải bạn?' : 'Chọn'}
        </button>
      </p>
    )
  }

  return (
    <fieldset
      ref={group}
      className="chooser"
      onKeyDown={(event) => {
        if (event.key === 'Escape') close()
      }}
    >
      <legend>Bạn là ai trong nhà này?</legend>
      <div className="pick">
        {members.map((member) => {
          const look = looks.get(member.id)
          if (!look) return null
          const id = `me-${member.id}`
          return (
            <span key={member.id}>
              <input
                type="radio"
                name="me"
                id={id}
                checked={me === member.id}
                onChange={() => choose(member.id)}
              />
              <label htmlFor={id}>
                <Avatar look={look} size="sm" decorative />
                <span className="name">{look.short}</span>
              </label>
            </span>
          )
        })}
      </div>
      <p className="hint">Chỉ lưu trên máy này, để app nói “bạn” và chọn sẵn người trả.</p>
    </fieldset>
  )
}

export default WhoAmI
