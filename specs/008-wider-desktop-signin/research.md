# Research: Wider desktop frame and a composed sign-in page

The owner approved before/after captures made by injecting CSS into the running app (06/11). Each
decision below turns that preview into the real code with the smallest change in the right place.

## R1. The frame

- **Decision**: in `frontend/src/index.css`, the `@media (min-width: 1024px)` rule for `.app-header, main`
  changes `max-width: calc(1320px + …)` to `calc(1520px + …)`; the padding `clamp(32px, 2.8vw, 40px)`
  stays.
- **Rationale**: FR-001. One number; every signed-in page follows. 1366 px is below the cap, so it does
  not move (SC-001).
- **Alternatives considered**: a proportional cap (`88vw`) widens the gutter at 1366 (82 px) and still
  leaves 520 px at 2560; a full-width header with a capped body leaves the content complaint as it was.

## R2. 640 px lines on Tổng quan (variant A)

- **Decision**: from 1280 px, `.dashboard-split .split-rest` gives `width: min(100%, 640px);
  margin-inline: auto` to `.balance-list > li`, `.recent-list > li` and, in `.recent-strip`, to its
  `.recent-head`, `ul` and `.recent-more`. An expanded balance explanation lives inside its `li`, so it
  follows. Panel edges are untouched.
- **Rationale**: FR-002, SC-002; the owner chose A over full-width lines. CSS only: no element moves,
  so keyboard order is unchanged.
- **Alternatives considered**: three columns (a new render branch, focus and breakpoint tests: too much
  for two days); lines left-aligned at 640 px (empty strip on the right reads as a bug); variant B
  (full-width lines, about 850 px name-to-amount at 1920; not chosen).

## R3. "Báo cáo tháng" beside the month title

- **Decision**: from 1280 px, `.dashboard-split .month-totals` becomes `display: flex; flex-wrap: wrap;
  justify-content: space-between; align-items: center`, its `.balance-list` takes `flex-basis: 100%`.
  `MonthTotals.tsx` is unchanged (heading, link, list in that order).
- **Rationale**: FR-003; wrapping is free with flex, and the DOM order already matches the reading
  order. Only Tổng quan passes `reportTo`, and Chi tiêu's month totals are not under `.dashboard-split`.

## R4. Outlined repeated actions

- **Decision**: the three `className="btn-primary"` buttons inside transfer cards in
  `components/VerdictBlock.tsx` (pay on a simple card, pay on a told card, notify) become
  `className="btn-secondary"`, the existing outlined style (surface, ink, control-line). The flat-card
  overrides under `.transfer-card .btn-primary` are removed or retargeted.
- **Rationale**: FR-004, SC-003. Reusing the existing variant keeps hover, focus, pressed and disabled
  states that are already measured in both themes; no new colour.
- **Alternatives considered**: a CSS override of `.transfer-card .btn-primary` (what the preview did):
  same look, but a "primary" that is not primary misleads the next reader.

## R5. Chi tiêu at 1280 px and wider

- **Decision**: in the `@media (min-width: 1280px)` block: `.expenses-split { grid-template-columns:
  minmax(380px, 420px) minmax(0, 1fr) }`; `.expenses-split .expense-filters { grid-template-columns:
  repeat(3, minmax(0, 1fr)) }`, with a clear-filters control spanning the row when present;
  `.expense-table th.col-payer { width: 250px }`. Outside the media query, `.expense-table .payer small`
  loses `white-space: nowrap` (the split line may wrap at any width).
- **Rationale**: FR-005, SC-005. The payer metadata's `nowrap` was what squeezed the description under
  automatic table layout; the amount column keeps its width so 12.500.000đ never wraps.

## R6. The sign-in composition

- **Decision**:
  - `AuthPage.tsx` renders the language and theme switches itself (moved from `App.tsx`, same
    `footer.app-footer` after the form), so the page owns its whole layout.
  - When `useWide()` is true, `AuthPage` wraps the form and footer in `.auth-layout` with a
    `.auth-intro` before them: `<Wordmark>` (its `role="img"` name stays), a `<p className="tagline">`
    with `t.tagline`, a `<p>` with `t.auth.intro`, and four decorative `Avatar`s (`decorative`, inside a
    span with `aria-hidden="true"`), tints 1–4, letters T, M, A, L. The form's `p.hint` with the same
    intro is then not rendered (no duplicate text for a screen reader). The invited note stays in the
    form.
  - When narrow, the output is exactly today's.
  - `App.tsx`: signed out on a wide screen, the header is not rendered (no lone wordmark), and `main`
    gets `className="signed-out"`; CSS centres it: `min-height: 100dvh; display: grid; align-content:
    center`, so content taller than the screen scrolls.
  - CSS: `.auth-layout` grid `minmax(0, 1fr) 440px`, gap 56 px, max 980 px, centred; wordmark 300 px;
    tagline in the display font, 40 px; intro 17 px muted, max 420 px; avatars 56 px, overlap −12 px.
- **Rationale**: FR-006–FR-010. DESIGN.md §6.6 says what a computer shows is decided by `useWide`, not
  by moving things with CSS; the intro holds no control, so the tab order is form, language, theme
  (FR-013). One `h1` remains the form's title; the tagline is a paragraph.
- **Alternatives considered**: a taro panel, a sample verdict and benefits (rejected: second loud place,
  fake data, BRAND.md speed rule); moving the switches into the header (adds prominence and a DOM move
  for little gain); the SẠCH NỢ stamp as decoration (DESIGN.md shows it only for a real zero balance).

## R7. Tests

- **Decision**: Vitest: `AuthPage.test.tsx` gains wide and narrow cases (matchMedia mocked): wide shows
  the tagline, the intro once, avatars hidden from the accessibility tree, one `h1`, switches after the
  form; narrow is today's markup. `App.test.tsx`: signed out and wide, no header wordmark link.
  `VerdictBlock` tests that query the pay/notify buttons by role keep passing (the class is not part of
  their queries; checked during implementation). Playwright on the local stack only
  (`E2E_BASE_URL`/`E2E_API_URL` = `http://172.21.33.10:3000`): `a11y.spec.ts` adds the signed-out page at
  1366 × 768 (44 px targets, no horizontal scroll, tab order) and at 360 px (unchanged).
- **Rationale**: SC-006; Vitest cannot measure layout, so widths are checked in the browser and in the
  before/after captures (quickstart).
