import { useEffect, useId, useRef, useState } from 'react'

import { inviteLink } from '../lib/knownHouseholds'
import { useToast } from '../lib/toast'
import { useT } from '../i18n'

/**
 * "Mời bạn cùng phòng" (#132): copies the household's invite link, the only way into it from another
 * browser. When copying is not allowed the link is shown, selected, to copy by hand.
 */
function InviteLink({ householdId }: { householdId: number }) {
  const t = useT()
  const id = useId()
  const toast = useToast()
  const [showText, setShowText] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const link = inviteLink(householdId)

  function selectField() {
    field.current?.focus()
    field.current?.select()
  }
  useEffect(() => {
    if (showText) selectField()
  }, [showText])

  if (!link) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(link as string)
      setShowText(false)
      toast({ text: t.invite.copied })
    } catch {
      // No clipboard (an old browser, or not on https) or permission refused: copy it by hand
      if (showText) selectField()
      else setShowText(true)
    }
  }

  return (
    <section className="invite" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{t.invite.title}</h2>
      <p className="hint">
        {t.invite.hint}
      </p>
      <button type="button" className="btn-secondary" onClick={copy}>
        {t.invite.copy}
      </button>
      {showText && (
        <div className="note copy-fallback">
          <label htmlFor={`${id}-link`}>{t.common.copyFailedLink}</label>
          <input id={`${id}-link`} ref={field} type="text" readOnly value={link} />
        </div>
      )}
    </section>
  )
}

export default InviteLink
