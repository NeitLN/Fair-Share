import en from './en'
import { language, useLanguage } from './language'
import type { Language } from './language'
import vi from './vi'
import type { Messages } from './vi'

export { LANGUAGE_KEY, language, setLanguage, useLanguage } from './language'
export type { Language } from './language'
export type { Messages } from './vi'

const MESSAGES: Record<Language, Messages> = { en, vi }

/** The words of the current language, for plain functions (formatVND, errorMessage, the reminder…). */
export const messages = (): Messages => MESSAGES[language()]

/** The words of the current language, in a component: it re-renders when the language changes. */
export function useT(): Messages {
  return MESSAGES[useLanguage()]
}
