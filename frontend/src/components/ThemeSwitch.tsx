import { useTheme } from '../lib/theme'
import type { ThemeChoice } from '../lib/theme'

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Tự động' },
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
]

/** Light, dark or follow the phone (docs/DESIGN.md §3); remembered on this device only. */
function ThemeSwitch() {
  const [choice, setChoice] = useTheme()
  return (
    <div className="segmented theme-switch" role="group" aria-label="Giao diện">
      {CHOICES.map(({ value, label }) => (
        <button key={value} type="button" aria-pressed={choice === value} onClick={() => setChoice(value)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export default ThemeSwitch
