import type { Category, Expense } from '../api/types'

/**
 * What an expense was for (specs/005-expense-categories). Seven fixed categories, in the order the
 * form, the filter and ties in the chart use. The names are in i18n (`categories.<code>`).
 */
export const CATEGORIES: Category[] = ['food', 'groceries', 'utilities', 'rent', 'transport', 'household', 'other']

/**
 * Words that suggest a category, written without accents (research R3). A description matches when one
 * of them appears as whole words; the first category in CATEGORIES order with a match wins. Without
 * accents some words mean several things, so they only count inside a phrase: "nuoc" (tiền nước), "ga"
 * (bình ga), "cho" (đi chợ, not the preposition), "ca" (mua cá, not cả), "an" (đi ăn, not the name An),
 * "trung" (trứng gà, not the name Trung). Review of #199.
 */
const WORDS: Record<Exclude<Category, 'other'>, string[]> = {
  food: ['an uong', 'an sang', 'an trua', 'an toi', 'an vat', 'di an', 'tien an', 'lau', 'nuong', 'com', 'bun', 'pho',
    'tra sua', 'cafe', 'ca phe', 'nhau', 'pizza', 'ga ran'],
  groceries: ['di cho', 'tien cho', 'sieu thi', 'mi goi', 'trung ga', 'trung vit', 'mua trung', 'rau', 'thit',
    'mua ca', 'ca loc', 'ca thu', 'gao', 'dau an', 'nuoc mam'],
  utilities: ['dien', 'tien dien', 'tien nuoc', 'hoa don nuoc', 'internet', 'wifi', 'tien mang', 'gas', 'binh ga'],
  rent: ['tien nha', 'thue nha', 'tien phong', 'nha tro'],
  transport: ['xang', 'grab', 'xe', 'taxi', 'gui xe', 've xe', 'bus'],
  household: ['do dung', 'bong den', 'giay ve sinh', 'xa phong', 'nuoc rua chen', 'bot giat', 'sua chua', 'chen bat'],
}

/** "Lẩu nướng!" → " lau nuong ": lower case, no accents (đ → d), words split by single spaces. */
function plain(text: string): string {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll('đ', 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return ` ${words} `
}

/** The category a description suggests, else "other". Used while the user has not picked one. */
export function guessCategory(description: string): Category {
  const text = plain(description)
  for (const category of CATEGORIES) {
    if (category === 'other') continue
    if (WORDS[category].some((word) => text.includes(` ${word} `))) return category
  }
  return 'other'
}

export interface CategoryTotal {
  category: Category
  /** The category's expenses added up, in đồng. */
  amount: number
  /** Whole percent of the month; the non-tiny ones add up to exactly 100. 0 for a tiny one. */
  percent: number
  /** Spent something, but under 1% of the month: shown as "<1%". */
  tiny: boolean
}

/**
 * The expenses given (one month's) per category: largest first, ties in CATEGORIES order. Amounts add
 * up to the expenses' total. Percentages use the largest remainder over whole percents, so the ones
 * shown add up to 100 (never 99 or 101); a category under 1% is left out of that and reads "<1%".
 */
export function categoryTotals(expenses: Expense[]): CategoryTotal[] {
  const amounts = new Map<Category, number>()
  let total = 0
  for (const expense of expenses) {
    const category = expense.category ?? 'other'
    amounts.set(category, (amounts.get(category) ?? 0) + expense.amount)
    total += expense.amount
  }
  const rows = CATEGORIES.filter((c) => (amounts.get(c) ?? 0) > 0).map((category) => {
    const amount = amounts.get(category) as number
    return { category, amount, percent: 0, tiny: amount * 100 < total }
  })

  const counted = rows.filter((r) => !r.tiny)
  const countedTotal = counted.reduce((sum, r) => sum + r.amount, 0)
  if (countedTotal > 0) {
    // Integer maths only: floor of amount × 100 / total, then the leftover points by largest remainder
    const parts = counted.map((r, order) => ({
      row: r,
      order,
      remainder: (r.amount * 100) % countedTotal,
    }))
    for (const p of parts) p.row.percent = Math.floor((p.row.amount * 100) / countedTotal)
    let left = 100 - parts.reduce((sum, p) => sum + p.row.percent, 0)
    for (const p of [...parts].sort((a, b) => b.remainder - a.remainder || a.order - b.order)) {
      if (left === 0) break
      p.row.percent += 1
      left -= 1
    }
  }

  return rows.sort((a, b) => b.amount - a.amount || CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category))
}
