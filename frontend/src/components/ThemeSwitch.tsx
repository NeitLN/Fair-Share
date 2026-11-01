import { useT } from '../i18n'
import { useTheme } from '../lib/theme'
import type { ThemeChoice } from '../lib/theme'

const CHOICES: ThemeChoice[] = ['system', 'light', 'dark']

/** Light, dark or follow the phone (docs/DESIGN.md §3); remembered on this device only. */
function ThemeSwitch() {
  const t = useT()
  const [choice, setChoice] = useTheme()
  return (
    <div className="segmented theme-switch" role="group" aria-label={t.theme.label}>
      {CHOICES.map((value) => (
        <button key={value} type="button" aria-pressed={choice === value} onClick={() => setChoice(value)}>
          {t.theme[value]}
        </button>
      ))}
    </div>
  )
}

export default ThemeSwitch
