import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'

import { getInvite, keys, renewInvite } from '../api/households'
import { formatDate } from '../lib/date'
import { errorMessage } from '../lib/errors'
import { formatCode, joinLink } from '../lib/invite'
import { useToast } from '../lib/toast'
import InlineConfirm from './InlineConfirm'
import { useT } from '../i18n'

/**
 * "Mời bạn cùng phòng" (docs/ACCOUNTS.md): the household's invite code, big enough to read out, with
 * its link for a group chat. Every member can show it; the owner can replace it, which makes the old
 * one stop working. When copying is not allowed, what was asked for is shown, selected, to copy by hand.
 */
function InviteCard({ householdId, isOwner }: { householdId: number; isOwner: boolean }) {
  const t = useT()
  const id = useId()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [shown, setShown] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)

  const invite = useQuery({ queryKey: keys.invite(householdId), queryFn: () => getInvite(householdId) })
  const renew = useMutation({
    mutationFn: () => renewInvite(householdId),
    onSuccess: (fresh) => queryClient.setQueryData(keys.invite(householdId), fresh),
  })

  useEffect(() => {
    if (shown !== null) {
      field.current?.focus()
      field.current?.select()
    }
  }, [shown])

  const code = invite.data?.code ?? null

  // A phone's share sheet (Zalo, Messenger…) where the browser has one; copying stays for the rest
  const canShare = typeof navigator.share === 'function'
  async function share(link: string) {
    try {
      await navigator.share({ title: 'Fair·Share', text: t.invite.shareText, url: link })
    } catch (failure) {
      // Closing the sheet is not a failure; anything else falls back to copying the link
      if (failure instanceof DOMException && failure.name === 'AbortError') return
      await copy(link, t.invite.copied)
    }
  }

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text)
      setShown(null)
      toast({ text: done })
    } catch {
      // No clipboard (an old browser, or not on https) or permission refused: copy it by hand
      setShown(text)
    }
  }

  return (
    <section className="invite" aria-labelledby={`${id}-title`} aria-busy={invite.isPending || undefined}>
      <h2 id={`${id}-title`}>{t.invite.title}</h2>
      {invite.isPending && <p className="hint">{t.invite.loading}</p>}
      {invite.error && <p role="alert">{errorMessage(invite.error)}</p>}
      {invite.isSuccess && !code && <p className="empty">{t.invite.none}</p>}
      {code && (
        <>
          <p className="invite-code" aria-label={t.invite.codeLabel}>
            {formatCode(code)}
          </p>
          {invite.data?.expires_at && (
            <p className="hint">{t.invite.expires(formatDate(invite.data.expires_at.slice(0, 10)))}</p>
          )}
          <p className="hint">{t.invite.hint}</p>
      <p className="hint">{t.invite.shows}</p>
          {/* Sending the link is what a phone user wants; copying the link, then the code, come after */}
          <div className="invite-actions">
            {canShare && (
              <button type="button" className="btn-primary invite-share" onClick={() => void share(joinLink(code))}>
                {t.invite.share}
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => copy(joinLink(code), t.invite.copied)}>
              {t.invite.copy}
            </button>
            <button type="button" className="btn-secondary" onClick={() => copy(formatCode(code), t.invite.codeCopied)}>
              {t.invite.copyCode}
            </button>
          </div>
        </>
      )}
      {shown !== null && (
        <div className="note copy-fallback">
          <label htmlFor={`${id}-text`}>{t.common.copyFailedText}</label>
          <input id={`${id}-text`} ref={field} type="text" readOnly value={shown} />
        </div>
      )}
      {isOwner && (
        <p>
          {/* The old code stops at once, also in a group chat it was posted to: asked first (review 12/11, A05) */}
          <InlineConfirm
            label={t.invite.renew}
            question={t.invite.renewConfirm}
            confirmLabel={t.invite.renewDo}
            onConfirm={() => {
              setShown(null)
              renew.mutate()
            }}
            busy={renew.isPending}
            busyLabel={t.invite.renewing}
            describedBy={`${id}-renew-hint`}
          />{' '}
          <small id={`${id}-renew-hint`} className="hint">
            {t.invite.renewHint}
          </small>
        </p>
      )}
      {renew.error && <p role="alert">{errorMessage(renew.error)}</p>}
    </section>
  )
}

export default InviteCard
