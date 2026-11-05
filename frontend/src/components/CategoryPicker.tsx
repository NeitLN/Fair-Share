import { useRef, useState } from 'react'

import type { Category } from '../api/types'
import { CATEGORIES } from '../lib/categories'
import { useT } from '../i18n'

interface CategoryPickerProps {
  value: Category
  /** The user chose one: from now on the description no longer moves it. */
  onPick: (category: Category) => void
}

/**
 * "Danh mục  Điện nước · Đổi" in the expense form (specs/005-expense-categories), folded like Ngày and
 * Cách chia: the usual case needs no press. Đổi opens the seven names as toggle buttons; one press
 * picks and closes, giving the focus back to Đổi, as Escape does (DESIGN.md §8).
 */
export function CategoryPicker({ value, onPick }: CategoryPickerProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const name = t.categories[value]

  function close() {
    setOpen(false)
    toggle.current?.focus()
  }

  return (
    <div
      className="field fold-field"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.preventDefault()
        event.stopPropagation()
        close()
      }}
    >
      <div className="fold-row">
        <span className="fold-label" id="expense-category-label">
          {t.categories.label}
        </span>
        <span className="fold-value">
          <b>{name}</b>
        </span>
        <button
          type="button"
          className="btn-ghost"
          ref={toggle}
          aria-label={open ? t.categories.doneLabel : t.categories.changeLabel(name)}
          aria-expanded={open}
          aria-controls="expense-category-control"
          onClick={() => setOpen((now) => !now)}
        >
          {open ? t.common.done : t.categories.change}
        </button>
      </div>
      <div id="expense-category-control" hidden={!open}>
        {open && (
          <div className="fold-control pick category-pick" role="group" aria-labelledby="expense-category-label">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={value === category}
                onClick={() => {
                  onPick(category)
                  close()
                }}
              >
                {t.categories[category]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
