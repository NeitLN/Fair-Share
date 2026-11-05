# Research: Desktop look

## R1. The palette, measured

- **Decision**: The mockup's cream and warm-charcoal values (data-model.md), with one change: the panel
  edge is darker than in the mockup, light `#C8B99F` (1.71:1 to the ground) and dark `#544B40` (2.17:1).
- **Rationale**: Every text pair (ink, muted, primary-text, credit-text, debt-text on ground, panel and
  panel-2) measures ≥ 4.5:1 in both themes; the lowest are 5.21:1 (light debt-text on panel-2) and the
  unchanged 4.79:1 of `--on-block-muted` on taro. Control outlines are ≥ 3.26:1 (light) and ≥ 4.02:1
  (dark). The mockup's panel edge was only 1.42:1, below the 1.70:1 the UI review of 04/11 set after
  white panels vanished on a laptop; cream and white are closer (1.11:1) than lilac and white were
  (1.30:1), so the edge carries more weight. The script that measured it is in the PR description.
- **Alternatives considered**: a whiter lilac (the other position in the design review, not chosen by the owner);
  the mockup's lighter edge (fails the 04/11 rule).

## R2. Verdict B without touching behaviour

- **Decision**: `VerdictBlock` returns two sibling sections: the taro `.verdict` (sentence, amount,
  "Vì sao ra số này?", own pending notices, the refresh error note) and a white `.transfers-panel`
  (the transfer list, the error note under it, the reminder button and its copy fallback). Same props,
  same handlers, same order; the panel is not rendered when there is no transfer card and no reminder.
- **Rationale**: Keeps every test that finds controls by role and name; only tests that assume the list
  is inside the taro section change (FR-007, FR-013).
- **Alternatives considered**: moving the list to `DashboardPage` (splits one component's state across
  two files for no gain).

## R3. Width

- **Decision**: From 1024 px, `.app-header` and `main` get `max-width: calc(1320px + 2 × side padding)`
  and `margin-inline: auto`; the column ratios inside stay as they are.
- **Rationale**: 1320 px is the mockup's container and inside the requested 1280–1440 range; the header
  follows so the wordmark and the account do not drift away from the content.

## R4. Small text

- **Decision**: a `--text-small` token, 13 px by default and 14 px from 1024 px, used by the 22
  `font-size: 13px` rules (and the 12 px ones stay as they are: chips and stamps).
- **Rationale**: one place to change, phone sizes untouched (FR-010).

## R5. The two table details

- **Decision**: the share row becomes an empty date cell (`col-date`, so it folds away with the date),
  then one cell from the description to Số tiền, then the empty actions cell; the list fills it, so
  amounts end where the Số tiền column ends. That cell spans 3 columns from 1280 px and 2 below, where
  date and payer fold under the description (`useWideTable`, next to `useWide`). The description button
  drops its negative margin, and below 1280 px the date and payer line under it starts 8 px lower (the
  ring's 7 px plus one), so the focus ring no longer covers it.
- **Found while measuring**: a fixed span of 3 lined up at 1440 px but was 16 px off at 1100 px, and
  the ring covered the meta line there by 5 px; both pass after the change (quickstart step 7).
- **Rationale**: lines up by construction rather than by a measured width; the a11y walk measures every
  button at ≥ 44 px, which rules out shrinking the box.
