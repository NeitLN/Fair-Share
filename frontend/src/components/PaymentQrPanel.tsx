import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { ApiError } from '../api/client'
import { getPaymentDetails, keys } from '../api/households'
import type { PaymentDetails } from '../api/types'
import { useT } from '../i18n'
import { formatVND } from '../lib/money'
import { REFRESH_MS } from '../lib/refresh'
import { vietqrPayload } from '../lib/vietqr'
import { QrCode } from './QrCode'

interface PaymentQrPanelProps {
  householdId: number
  /** The member being paid. */
  memberId: number
  /** Their short name, for the words. */
  to: string
  onClose: () => void
}

// The states that show the account; the others never carry it (contracts/api.md)
const WITH_DETAILS = new Set<PaymentDetails['state']>(['ready', 'partly_told', 'declined_acknowledged', 'too_large'])

/**
 * Paying by VietQR (specs/016-vietqr, US2): the code and the details as text, for the transfer the server
 * suggests right now. Asked again every time it opens and on the usual foreground refresh; a change of
 * the pair, the amount, the notice or the account drops the code and every detail until it is loaded
 * again (FR-022). Nothing is recorded: "Tôi đã chuyển" stays the way to tell the receiver (FR-020).
 * The details live only while the panel is open (FR-021).
 */
function PaymentQrPanel({ householdId, memberId, to, onClose }: PaymentQrPanelProps) {
  const t = useT()
  const id = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const queryClient = useQueryClient()
  // "Vẫn chuyển": the declined notice the payer acknowledged
  const [acknowledge, setAcknowledge] = useState<number | null>(null)
  const [withAmount, setWithAmount] = useState(true)
  // The snapshot the code on screen was drawn from (null until the first answer)
  const [accepted, setAccepted] = useState<string | null>(null)

  const details = useQuery({
    queryKey: [...keys.payment(householdId, memberId), acknowledge],
    queryFn: () => getPaymentDetails(householdId, memberId, acknowledge),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  })
  const data = details.data
  if (data && accepted === null) setAccepted(data.snapshot)

  useEffect(() => {
    heading.current?.focus()
    return () => queryClient.removeQueries({ queryKey: keys.payment(householdId, memberId) })
  }, [queryClient, householdId, memberId])

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onClose()
  }

  let body
  if (details.isPending) {
    body = <p aria-busy="true">{t.verdict.qrLoading}</p>
  } else if (details.isError) {
    const gone = details.error instanceof ApiError && [404, 409].includes(details.error.status)
    body = gone ? (
      <p>{t.verdict.qrGone}</p>
    ) : (
      <p role="alert">
        {t.verdict.qrFailed}{' '}
        <button type="button" className="btn-secondary" onClick={() => void details.refetch()}>
          {t.common.tryAgain}
        </button>
      </p>
    )
  } else if (data && accepted !== null && data.snapshot !== accepted) {
    body = (
      <p role="status">
        {t.verdict.qrChanged}{' '}
        <button type="button" className="btn-secondary" onClick={() => setAccepted(data.snapshot)}>
          {t.verdict.qrReload}
        </button>
      </p>
    )
  } else if (data?.state === 'declined') {
    body = (
      <>
        <p>{t.verdict.qrDeclined(to, formatVND(data.told ?? 0))}</p>
        <button type="button" className="btn-secondary" onClick={() => setAcknowledge(data.notice_version)}>
          {t.verdict.qrSendAnyway(formatVND(data.suggested ?? 0))}
        </button>
      </>
    )
  } else if (data && WITH_DETAILS.has(data.state) && data.account && data.message && data.amount !== null) {
    body = (
      <Details
        data={data}
        account={data.account}
        message={data.message}
        amount={data.amount}
        to={to}
        withAmount={withAmount}
        onToggle={() => setWithAmount((v) => !v)}
      />
    )
  } else {
    body = <p>{t.verdict.qrGone}</p>
  }

  return (
    <section className="qr-panel" aria-labelledby={`${id}-title`} onKeyDown={onKeyDown}>
      <h3 id={`${id}-title`} ref={heading} tabIndex={-1}>
        {t.verdict.qrTitle(to)}
      </h3>
      {body}
      <button type="button" className="btn-ghost" onClick={onClose}>
        {t.verdict.qrClose}
      </button>
    </section>
  )
}

interface DetailsProps {
  data: PaymentDetails
  account: NonNullable<PaymentDetails['account']>
  message: string
  amount: number
  to: string
  withAmount: boolean
  onToggle: () => void
}

function Details({ data, account, message, amount: owed, to, withAmount, onToggle }: DetailsProps) {
  const t = useT()
  const tooLarge = data.state === 'too_large'
  const amount = formatVND(owed)
  const payload = vietqrPayload({
    bin: account.bank_bin,
    account: account.account_number,
    amount: withAmount ? owed : undefined,
    message,
  })
  const rows: [string, string, string?][] = [
    [t.verdict.qrBank, account.bank_name],
    [t.verdict.qrNumber, account.account_number],
    [t.verdict.qrHolder, account.holder_name, t.verdict.qrSelfEntered(to)],
    [withAmount && !tooLarge ? t.verdict.qrAmount : t.verdict.qrReference, amount],
    [t.verdict.qrMessage, message],
  ]
  return (
    <>
      {data.state === 'partly_told' && (
        <p>
          {t.verdict.qrPartly(formatVND(data.suggested ?? 0), formatVND(data.told ?? 0), amount)}
        </p>
      )}
      {tooLarge ? (
        <p className="note">{t.verdict.qrTooLarge}</p>
      ) : (
        <>
          <QrCode
            payload={payload}
            label={withAmount ? t.verdict.qrLabel(amount, to) : t.verdict.qrLabelNoAmount(to)}
          />
          {!withAmount && <p className="note">{t.verdict.qrNoAmountNote}</p>}
          <button type="button" className="btn-secondary" onClick={onToggle}>
            {withAmount ? t.verdict.qrWithoutAmount : t.verdict.qrWithAmount}
          </button>
        </>
      )}
      <dl className="qr-details">
        {rows.map(([label, value, note]) => (
          <div key={label} className="qr-detail">
            <dt>{label}</dt>
            <dd>
              <span className="qr-value">{value}</span>
              {note && <small> {note}</small>}
            </dd>
            <CopyButton value={value} what={label} />
          </div>
        ))}
      </dl>
      <p className="hint">{t.verdict.qrCompare}</p>
    </>
  )
}

/** "Sao chép"; when the clipboard is refused, the value is selected for copying by hand. */
function CopyButton({ value, what }: { value: string; what: string }) {
  const t = useT()
  const button = useRef<HTMLButtonElement>(null)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const text = button.current?.parentElement?.querySelector('.qr-value')
      const selection = window.getSelection()
      if (text && selection) {
        const range = document.createRange()
        range.selectNodeContents(text)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
  }

  return (
    <button
      ref={button}
      type="button"
      className="btn-ghost qr-copy"
      aria-label={t.verdict.qrCopyFor(what)}
      onClick={() => void copy()}
    >
      <span aria-hidden="true">{copied ? t.verdict.qrCopied : t.verdict.qrCopy}</span>
    </button>
  )
}

export default PaymentQrPanel
