import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError } from '../api/client'
import type { AiDraft, DraftWarning, Member } from '../api/types'
import { warningMessage } from '../lib/aiWarnings'
import { draftSummary } from '../lib/draftSummary'
import { errorMessage } from '../lib/errors'
import { useElapsedSeconds } from '../lib/useElapsedSeconds'
import type { FillField, FillResult } from './ExpenseForm'
import { useT } from '../i18n'

interface AiComposerProps {
  members: Member[]
  /** Asks the API for a draft (POST …/ai/parse-expense). Nothing is saved. */
  onParse: (text: string) => Promise<AiDraft>
  /** Puts the draft into the expense form; returns what was filled and what was kept. */
  /** Warnings come along: the form shows the ones about a field next to that field. */
  onDraft: (draft: AiDraft['draft'], warnings: DraftWarning[]) => FillResult
  /** Restores the form as it was before the draft. */
  onUndo: () => void
  /** "Nhập tay": stop waiting and go to the form. */
  onManual: () => void
}

type State =
  | { step: 'idle' }
  | { step: 'reading' }
  | { step: 'filled'; summary: string; warnings: string[]; kept: FillField[] }
  | { step: 'failed'; message: string; code: string; sentence: string }

// What a failure lets the user do next (DESIGN.md §6.3). Retrying cannot help a missing key or an
// empty household; a sentence the AI did not understand is worth retrying only once it is edited.
const NO_RETRY = new Set(['ai_not_configured', 'no_members', 'household_not_found'])
const RETRY_AFTER_EDIT = new Set(['ai_unparseable', 'too_many_participants', 'validation_error'])

const MAX_TEXT = 300

// US-09, US-10: one sentence in, the form below filled for the user to check. The AI never saves;
// when it fails the sentence stays and the manual form is right there.
function AiComposer({ members, onParse, onDraft, onUndo, onManual }: AiComposerProps) {
  const t = useT()
  const [text, setText] = useState('')
  const [state, setState] = useState<State>({ step: 'idle' })
  // Each request gets a number; an answer that arrives after "Nhập tay" or a newer request is dropped
  const latest = useRef(0)
  const seconds = useElapsedSeconds(state.step === 'reading')
  // No Gemini key on this server: Quick add stays off until the page is reloaded
  const [notConfigured, setNotConfigured] = useState(false)

  // Removed from the page (expense saved, another household): any pending answer is stale
  useEffect(() => {
    const requests = latest
    return () => {
      requests.current += 1
    }
  }, [])

  async function read() {
    const sentence = text.trim()
    if (!sentence || notConfigured) return
    const request = ++latest.current
    setState({ step: 'reading' })
    try {
      const { draft, warnings } = await onParse(sentence)
      if (request !== latest.current) return
      const result = onDraft(draft, warnings)
      // Describe what was applied, not the raw draft: kept fields keep the user's values
      const applied = new Set(result.filled)
      const summary = draftSummary(
        {
          ...draft,
          description: applied.has('description') ? draft.description : '',
          amount: applied.has('amount') ? draft.amount : null,
          payer_id: applied.has('payer') ? draft.payer_id : null,
          split: { ...draft.split, member_ids: applied.has('split') ? draft.split.member_ids : [] },
        },
        members,
      )
      setState({
        step: 'filled',
        summary: summary || t.ai.nothingFilled,
        // participants_assumed is about the split: the form shows it beside Cách chia instead
        warnings: warnings.filter((w) => w.code !== 'participants_assumed').map(warningMessage),
        kept: result.kept,
      })
    } catch (error) {
      if (request !== latest.current) return
      const code = error instanceof ApiError ? error.code : 'error'
      if (code === 'ai_not_configured') setNotConfigured(true)
      setState({ step: 'failed', message: errorMessage(error) ?? '', code, sentence })
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void read()
  }

  function manual() {
    latest.current += 1
    setState({ step: 'idle' })
    onManual()
  }

  function undo() {
    onUndo()
    setState({ step: 'idle' })
  }

  const reading = state.step === 'reading'
  const canRetry =
    state.step === 'failed' &&
    !NO_RETRY.has(state.code) &&
    (!RETRY_AFTER_EDIT.has(state.code) || text.trim() !== state.sentence)

  return (
    <section className="ai-composer" aria-labelledby="ai-composer-title">
      <h2 id="ai-composer-title">
        <span aria-hidden="true">✦ </span>
          {t.ai.title}
      </h2>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="ai-text" className="visually-hidden">
          {t.ai.sentenceLabel}
        </label>
        <textarea
          id="ai-text"
          rows={2}
          maxLength={MAX_TEXT}
          value={text}
          placeholder={t.ai.placeholder}
          aria-describedby="ai-hint"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter reads the sentence; Shift+Enter is a new line. While an input method is still
            // composing a word (Telex on some keyboards, phone keyboards), Enter only commits that
            // word: browsers say so with isComposing, Safari with keyCode 229.
            const composing = e.nativeEvent.isComposing || e.keyCode === 229
            if (e.key === 'Enter' && !e.shiftKey && !composing) {
              e.preventDefault()
              void read()
            }
          }}
        />
        <button type="submit" className="ai" disabled={reading || notConfigured || !text.trim()}>
          {t.ai.fill}
        </button>
        <p id="ai-hint" className="hint">
          {t.ai.hint}
        </p>
      </form>

      <div aria-live="polite">
        {reading && (
          <div className="ai-reading">
            <div className="ai-progress" aria-hidden="true" />
            <p>
              {t.ai.reading(seconds)}{' '}
              <button type="button" className="ghost" onClick={manual}>
                {t.ai.manual}
              </button>
            </p>
          </div>
        )}

        {state.step === 'filled' && (
          <div className="note ok">
            <p>{state.summary}</p>
            {state.kept.length > 0 && (
              <p>{t.ai.kept(state.kept.map((f) => t.ai.fields[f]).join(', '))}</p>
            )}
            {state.warnings.map((warning) => (
              <p key={warning} className="note attention">
                {warning}
              </p>
            ))}
            <button type="button" className="secondary" onClick={undo}>
              {t.ai.undoFill}
            </button>
          </div>
        )}

        {state.step === 'failed' && (
          <div className="note attention" role="alert">
            <p>{state.message}</p>
            {canRetry && (
              <button type="button" className="secondary" onClick={() => void read()}>
                {t.common.tryAgain}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export default AiComposer
