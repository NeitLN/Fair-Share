import { useId, useState } from 'react'
import { Link } from 'react-router'

import { dayLabel } from '../lib/date'
import type { BalanceExplanation as Explanation, ExplanationLine, LineKind } from '../lib/explain'
import { closeFoldOnEscape } from '../lib/fold'
import { REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { Stamp } from './Chip'
import { Money } from './Money'
import { useT } from '../i18n'

interface BalanceExplanationProps {
  explanation: Explanation
  looks: Map<number, MemberLook>
  /** The signed-in person's name in the household: their own balance is worded with "bạn". */
  me: number | null
  householdId: number
}

// What each line does to the balance: spending and repayments made raise it, a share and repayments received lower it
const SIGN: Record<LineKind, 1 | -1> = { spent: 1, share: -1, paidBack: 1, gotBack: -1 }

/**
 * "Vì sao ra số này?" (specs/002-balance-explanation): the four lines that add up to one person's
 * balance, each opening the expenses or repayments behind it, and the "Tôi đã chuyển" notices that do
 * not count yet. Read only: an item leads to where it can be changed. Props only.
 */
function BalanceExplanation({ explanation, looks, me, householdId }: BalanceExplanationProps) {
  const t = useT()
  const id = useId()
  // A line's items are only rendered while it is open (explain() has already listed them): a house can have
  // hundreds of expenses
  const [open, setOpen] = useState<ReadonlySet<LineKind>>(new Set())
  const you = me !== null && explanation.memberId === me
  const nameOf = (memberId: number) => (looks.get(memberId) ?? REMOVED_MEMBER).short
  const name = nameOf(explanation.memberId)
  const { net } = explanation

  function toggle(kind: LineKind, isOpen: boolean) {
    setOpen((current) => {
      const next = new Set(current)
      if (isOpen) next.add(kind)
      else next.delete(kind)
      return next
    })
  }

  function items(line: ExplanationLine, label: string) {
    if (!line.inStep) return <p className="explain-hint">{t.explain.updating}</p>
    const expenses = line.kind === 'spent' || line.kind === 'share'
    return (
      <>
        <ul className="explain-items" aria-label={label}>
          {line.items.map((item) =>
            item.kind === 'expense' ? (
              <li key={`e${item.expenseId}`} className="explain-item">
                <span className="explain-item-main">
                  <Link to={`/households/${householdId}/expenses`} state={{ revealExpense: item.expenseId }}>
                    {item.description}
                  </Link>
                  <small>
                    {dayLabel(item.spentAt)} · {t.explain.paidBy(nameOf(item.payerId))}
                    {line.kind === 'share' && <> · {t.explain.of(<Money amount={item.amount} />)}</>}
                  </small>
                </span>
                <Money amount={item.part} />
              </li>
            ) : (
              <li key={`s${item.settlementId}`} className="explain-item">
                <span className="explain-item-main">
                  <a href={`#settlement-${item.settlementId}`}>
                    {line.kind === 'paidBack' ? t.explain.to(nameOf(item.otherMemberId)) : t.explain.from(nameOf(item.otherMemberId))}
                  </a>
                  <small>
                    {dayLabel(item.settledAt)}
                    {item.note && <> · {item.note}</>}
                  </small>
                </span>
                <Money amount={item.amount} />
              </li>
            ),
          )}
        </ul>
        <p className="explain-hint">{expenses ? t.explain.expenseHint : t.explain.repaymentHint}</p>
      </>
    )
  }

  return (
    <div className="explain" role="group" aria-labelledby={`${id}-title`}>
      <span id={`${id}-title`} className="visually-hidden">
        {t.explain.title(you, name)}
      </span>
      <ul className="explain-lines">
        {explanation.lines.map((line) => {
          const label = t.explain[line.kind](you, name)
          const amount = <Money amount={line.total === 0 ? 0 : SIGN[line.kind] * line.total} kind="signed" />
          // Nothing behind a zero line: it says so and does not open (FR-009)
          if (line.total === 0) {
            return (
              <li key={line.kind} className="explain-line">
                <span className="explain-label">
                  {label}
                  <small className="explain-none">{t.explain.nothing}</small>
                </span>
                {amount}
              </li>
            )
          }
          return (
            <li key={line.kind} className="explain-line">
              <details
                onToggle={(event) => toggle(line.kind, event.currentTarget.open)}
                onKeyDown={closeFoldOnEscape}
              >
                <summary>
                  <span className="explain-label">{label}</span>
                  {amount}
                </summary>
                {open.has(line.kind) && items(line, label)}
              </details>
            </li>
          )
        })}
      </ul>
      <p className="explain-total">
        <span>{t.explain.total}</span>
        <span className="standing">
          <Money amount={net} kind="balance" />
          {net > 0 ? (
            <small>{t.money.getsShort}</small>
          ) : net < 0 ? (
            <small>{t.money.owesShort}</small>
          ) : (
            <Stamp kind="settled" decorative={false} />
          )}
        </span>
      </p>
      {explanation.waiting.map((w) => (
        <p key={`${w.otherMemberId}-${w.iSent}`} className="explain-waiting">
          {w.iSent
            ? t.explain.waiting(you ? t.verdict.you : name, nameOf(w.otherMemberId), <Money amount={w.amount} />)
            : t.explain.waiting(nameOf(w.otherMemberId), you ? t.common.you : name, <Money amount={w.amount} />)}
        </p>
      ))}
    </div>
  )
}

export default BalanceExplanation
