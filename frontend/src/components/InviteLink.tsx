import { useEffect, useId, useRef, useState } from 'react'

import { inviteLink } from '../lib/knownHouseholds'
import { useToast } from '../lib/toast'

/**
 * "Mời bạn cùng phòng" (#132): copies the household's invite link, the only way into it from another
 * browser. When copying is not allowed the link is shown, selected, to copy by hand.
 */
function InviteLink({ householdId }: { householdId: number }) {
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
      toast({ text: 'Đã sao chép đường dẫn mời. Gửi vào nhóm chat của nhà nhé.' })
    } catch {
      // No clipboard (an old browser, or not on https) or permission refused: copy it by hand
      if (showText) selectField()
      else setShowText(true)
    }
  }

  return (
    <section className="invite" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Mời bạn cùng phòng</h2>
      <p className="hint">
        Ai có đường dẫn này đều xem và sửa được nhà, nên chỉ gửi cho người trong nhà.
      </p>
      <button type="button" className="btn-secondary" onClick={copy}>
        Sao chép đường dẫn mời
      </button>
      {showText && (
        <div className="note copy-fallback">
          <label htmlFor={`${id}-link`}>Không sao chép được. Chọn đường dẫn dưới đây rồi sao chép:</label>
          <input id={`${id}-link`} ref={field} type="text" readOnly value={link} />
        </div>
      )}
    </section>
  )
}

export default InviteLink
