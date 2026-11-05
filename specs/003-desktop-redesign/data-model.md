# Data model: the colour tokens

No data is stored. The "model" is the set of colour tokens, each defined for both themes.

| Token | Light now | Light new | Dark now | Dark new |
|---|---|---|---|---|
| `--bg` | `#e3e1e9` | `#f6f1e7` | `#110e1c` | `#16130f` |
| `--surface` | `#ffffff` | `#fffdf8` | `#1b1730` | `#221e19` |
| `--surface-2` | `#f1edfe` | `#f1e9db` | `#251f42` | `#2d2822` |
| `--ink` | `#17132b` | unchanged | `#f3f0ff` | `#f6f1e7` |
| `--muted` | `#5b5675` | `#5e5868` | `#b1a9d4` | `#bdb3a3` |
| `--line` | `#e4def7` | `#ece4d5` | `#382f63` | `#37312a` |
| `--control-line` | `#7c72ab` | `#8a7f6e` | `#7366b3` | `#8f8576` |
| `--card-edge` | `#b2abc8` | `#c8b99f` | `#514765` | `#544b40` |
| `--edge` | `#ffffff` | unchanged | `#f3f0ff` | `#f6f1e7` |
| `--toast-bg` (dark) | | | `#f3f0ff` | `#f6f1e7` |
| `--text-small` (new) | 13 px | 14 px from 1024 px | same | same |

Unchanged in both themes: taro (`--primary`, `--block`, `--primary-text`, `--on-*`), money colours,
`--ai`, `--on-fill`, avatar tints, `--sticker-shadow`, `--focus-outline`.

## Invariants (checked by the contrast script and the a11y walk)

1. Text tokens on `--bg`, `--surface`, `--surface-2`: ≥ 4.5:1 in both themes.
2. `--control-line` on the same three: ≥ 3:1.
3. `--card-edge` to `--bg`: ≥ 1.70:1 light (UI review 04/11), ≥ 2:1 dark.
4. Every token in the light block has its dark value in both dark selectors.
