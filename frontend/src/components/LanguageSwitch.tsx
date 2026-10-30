import { setLanguage, useLanguage, useT } from '../i18n'
import type { Language } from '../i18n'

const CHOICES: { value: Language; name: string }[] = [
  // Each language named in itself, so someone who cannot read the current one still finds theirs
  { value: 'en', name: 'English' },
  { value: 'vi', name: 'Tiếng Việt' },
]

/** EN / VI in the header; English by default, the choice remembered on this device only. */
function LanguageSwitch() {
  const t = useT()
  const current = useLanguage()
  return (
    <div className="segmented language-switch" role="group" aria-label={t.language.label}>
      {CHOICES.map(({ value, name }) => (
        <button
          key={value}
          type="button"
          lang={value}
          title={name}
          aria-pressed={current === value}
          onClick={() => setLanguage(value)}
        >
          {t.language[value]}
        </button>
      ))}
    </div>
  )
}

export default LanguageSwitch
