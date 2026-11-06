# Tasks: Wider desktop frame and a composed sign-in page

**Input**: Design documents from `/specs/008-wider-desktop-signin/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-contract.md, quickstart.md

**Tests**: requested by the spec (SC-006: unit tests, end-to-end walk and accessibility walk pass, and
the accessibility walk covers the signed-out page at a computer width).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 frame and 640 px lines, US2 sign-in, US3 outlined actions and month link, US4 Chi tiêu

## Path Conventions

Web application: `frontend/src/` (SPA), `frontend/e2e/` (Playwright), `docs/`.

---

## Phase 1: Setup

- [X] T001 Run the baseline in `frontend/`: `npm run lint`, `npm test`, `npm run build`, and note any
  failure that exists before this feature (none expected)
- [X] T002 Start the local stack (`podman compose -p fsdemo up --build -d`) with a household of four
  accounts and several weeks of expenses, and capture "before" screenshots of sign-in, Tổng quan and Chi
  tiêu at 1366, 1536, 1920 and 2560 px (quickstart.md, Setup)

---

## Phase 2: Foundational

No shared prerequisite: every story touches its own rules or components. (The frame cap in US1 is
independent of the others.)

---

## Phase 3: User Story 1 - The app fills a large screen without stretching the rows (Priority: P1) 🎯 MVP

**Goal**: content up to 1520 px; on Tổng quan, lines in the right-hand panels at most 640 px, centred.

**Independent Test**: quickstart.md checks 1 and 2 (gutters 38/40/200/520 px; name to amount ≤ 640 px).

### Implementation for User Story 1

- [X] T003 [US1] In `frontend/src/index.css`, `@media (min-width: 1024px)` rule for `.app-header, main`:
  change `max-width: calc(1320px + 2 * clamp(32px, 2.8vw, 40px))` to `calc(1520px + …)` and its comment
  (owner review 06/11: the sides were too wide; rows are bounded instead, see the 1280 px rule)
- [X] T004 [US1] In `frontend/src/index.css`, in the `@media (min-width: 1280px)` block, give
  `.dashboard-split .split-rest :is(.balance-list > li, .recent-list > li)` and
  `.dashboard-split .split-rest .recent-strip > :is(.recent-head, ul, .recent-more)`
  `width: min(100%, 640px); margin-inline: auto` with a comment (variant A, owner 06/11); check an opened
  "Vì sao" explanation stays inside its row and the `.highlighted` row's negative margin still lines up
  (contracts/ui-contract.md, Tổng quan)
- [X] T005 [US1] Check the other signed-in pages at 1920 px (Thành viên, Nhà của bạn, the monthly report)
  only grew with the frame and nothing stretches badly; fix with the smallest rule in
  `frontend/src/index.css` if one does

**Checkpoint**: US1 passes quickstart checks 1–2 at all four widths.

---

## Phase 4: User Story 2 - A sign-in page that looks like the product (Priority: P1)

**Goal**: signed out on a computer, one centred block: brand on the left, form and switches on the right,
no header; phones unchanged.

**Independent Test**: quickstart.md check 6.

### Tests for User Story 2

- [X] T006 [P] [US2] In `frontend/src/pages/AuthPage.test.tsx`, add cases with `window.matchMedia`
  mocked for `(min-width: 1024px)`: wide shows the tagline (`t.tagline`) once, the intro text once (not
  also in the form), one `h1` (the form title), avatars not in the accessibility tree, the wordmark with
  name "Fair-Share", and the language and theme switches after the submit button in document order;
  narrow renders the form with its intro hint and the switches as before; invited (`/join/CODE`) keeps
  the invited note in the form on both widths
- [X] T007 [P] [US2] In `frontend/src/App.test.tsx`, add: signed out on a wide screen there is no header
  wordmark link; signed out on a narrow screen the header is there; signed in the header is there on both
- [X] T008 [P] [US2] In `frontend/e2e/a11y.spec.ts`, add a signed-out check at 1366 × 768: every control
  ≥ 44 × 44 px, no horizontal scroll, the block's vertical centre within 24 px of the viewport's, and the
  tab order tabs → email → password → submit → EN → VI → theme buttons; and at 360 px: the page has the
  header wordmark and no `.auth-intro` (unchanged phone layout)

### Implementation for User Story 2

- [X] T009 [US2] In `frontend/src/pages/AuthPage.tsx`: import `LanguageSwitch`, `ThemeSwitch`, `Wordmark`,
  `Avatar` and `useWide`; render `footer.app-footer` (LanguageSwitch, ThemeSwitch) after the form card;
  when `useWide()` is true wrap them in `div.auth-layout` → `div.auth-intro` (Wordmark with
  `className="wordmark"`, `p.tagline` with `t.tagline`, `p.lead` with `t.auth.intro`,
  `span.avatar-stack` with `aria-hidden="true"` holding four `Avatar size="lg" decorative` with fixed looks
  T/M/A/L, tints 1–4) and `div.auth-form-column` (the card, then the footer); when wide, do not render
  the card's `p.hint` intro (the invited note stays); when narrow, output exactly today's card followed
  by the footer
- [X] T010 [US2] In `frontend/src/App.tsx`: remove the signed-out `<footer className="app-footer">` (now in
  AuthPage); call `useWide()`; when there is no session and the screen is wide, do not render
  `header.app-header`, and give `main` `className="signed-out"`
- [X] T011 [US2] In `frontend/src/index.css`, `@media (min-width: 1024px)`: replace the
  "Signing in is one small form" rules with `main.signed-out { min-height: 100dvh; display: grid;
  align-content: center; padding-block: 40px }`, `.auth-layout { display: grid; grid-template-columns:
  minmax(0, 1fr) 440px; gap: 56px; align-items: center; max-width: 980px; margin-inline: auto; width:
  100% }`, `.auth-intro` (grid, gap 18 px, start-aligned), `.auth-intro .wordmark { width: 300px }`,
  `.auth-intro .tagline` (display font, 800, 40 px, line-height 1.1, `--ink`), `.auth-intro .lead`
  (17 px, `--muted`, max 420 px), `.auth-intro .avatar` size 56 px with −12 px overlap, the card with no
  top margin and `.auth-form-column .app-footer { margin-top: 16px }`; keep the narrow `.auth` and
  `.app-footer` rules as they are; tokens only
- [X] T012 [US2] Check the sign-in at 1024, 1366 × 768 and 1920 × 1080 in EN/VI and light/dark, the
  create-account tab with errors (page scrolls, nothing cut), and `/join/ABCDEFGH` signed out; run
  T006–T008 green

**Checkpoint**: US2 matches the approved 1366 capture; phones unchanged.

---

## Phase 5: User Story 3 - Fewer purple buttons, and the month's report beside its title (Priority: P2)

**Goal**: transfer-card actions outlined; "Báo cáo tháng" on the month title's line from 1280 px.

**Independent Test**: quickstart.md checks 3 and 4.

### Implementation for User Story 3

- [X] T013 [P] [US3] In `frontend/src/components/VerdictBlock.tsx`, change the three transfer-card
  buttons with `className="btn-primary"` (pay on a simple card, pay on a told card, notify) to
  `className="btn-secondary"`; keep words, `aria-describedby`, `data-action` and `disabled`; then in
  `frontend/src/index.css` remove or retarget the `.transfer-card .btn-primary` rules (no shadow,
  `:active` translate, focus ring) so the outlined buttons keep a visible focus ring and no stray shadow
- [X] T014 [P] [US3] In `frontend/src/index.css`, `@media (min-width: 1280px)`:
  `.dashboard-split .month-totals { display: flex; flex-wrap: wrap; justify-content: space-between;
  align-items: center; column-gap: 16px }` and `.dashboard-split .month-totals > .balance-list {
  flex-basis: 100% }` (Chi tiêu's month totals are not under `.dashboard-split`)
- [X] T015 [US3] Run `frontend/src/components/VerdictBlock.test.tsx` and `DashboardPage.test.tsx`; update
  any assertion that relied on the old class only, never one that checks behaviour

**Checkpoint**: on Tổng quan for a receiver owed by three, only "+ Ghi khoản chi" and the verdict are
filled purple; light and dark.

---

## Phase 6: User Story 4 - The expense table reads on one line (Priority: P2)

**Goal**: Chi tiêu form 380–420 px, filters on one row, payer split line may wrap.

**Independent Test**: quickstart.md check 5.

### Implementation for User Story 4

- [X] T016 [US4] In `frontend/src/index.css`, `@media (min-width: 1280px)`: `.expenses-split {
  grid-template-columns: minmax(380px, 420px) minmax(0, 1fr) }` (replacing `minmax(380px, 1fr)
  minmax(0, 2fr)`), `.expenses-split .expense-filters { grid-template-columns: repeat(3, minmax(0, 1fr))
  }` with the clear-filters control on its own row (`grid-column: 1 / -1`), and
  `.expense-table th.col-payer { width: 250px }`
- [X] T017 [US4] In `frontend/src/index.css`, remove `white-space: nowrap` from `.expense-table .payer
  small` (keep it on amounts); check at 1024–1279 px the folded date/payer layout is unchanged and an
  expanded row's shares still line up with the amount column

**Checkpoint**: at 1536 px the demo descriptions are on one line, amounts never wrap.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T018 Rewrite `docs/DESIGN.md` §6.6: the frame (1520 px, owner review 06/11, why rows are bounded at
  640 px instead), Tổng quan (640 px lines, month link beside the title, outlined repeated actions), Chi
  tiêu (380–420 px form, one filter row, payer line wraps), Sign in (the composition, decided by
  `useWide`, no header, tab order); replace "Sign in: a 440 px form in the middle, the language and theme
  under it"
- [X] T019 Run `npm run lint`, `npm test`, `npm run build` in `frontend/`; then Playwright on the local
  stack only (`E2E_BASE_URL` and `E2E_API_URL` set to the local web address), whole suite
- [X] T020 Measure contrast of every changed pair (outlined button text and border on the card surface;
  tagline and intro on the ground) in light and dark: text ≥ 4.5:1, control border ≥ 3:1
- [X] T021 Capture "after" screenshots at 1366, 1536, 1920 and 2560 px and 390 px with the same data as
  T002 and compare with the approved preview; check 320 and 360 px have no horizontal scroll
- [X] T022 Re-read the diff for leftovers (the preview's class names, unused CSS) and for any AI-usage
  wording; prepare the PR description (issue, what changed, before/after widths)

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (T001–T002) first, for the baseline and the "before" captures.
- US1, US2, US3 and US4 are independent of one another; all edit `frontend/src/index.css`, so their CSS
  tasks run one after another, in different blocks of the file.
- Polish after the stories.

### User Story Dependencies

- None between stories. US2 touches `AuthPage`/`App`; US3 `VerdictBlock`; US1 and US4 CSS only.

### Within Each User Story

- US2: tests T006–T008 first (they fail), then T009–T011, then T012.

### Parallel Opportunities

- T006, T007, T008 (three test files).
- T013 (VerdictBlock.tsx) alongside T009/T010 (AuthPage/App).
- T014 and T013 touch different parts; T014 is CSS only.

## Parallel Example: User Story 2

```text
T006 AuthPage.test.tsx  |  T007 App.test.tsx  |  T008 e2e/a11y.spec.ts
then T009 AuthPage.tsx → T010 App.tsx → T011 index.css → T012 checks
```

## Implementation Strategy

### MVP First

US1 alone answers the owner's first complaint (the wide sides) with two CSS rules; it can be checked
before anything else.

### Incremental Delivery

US1 → US2 (the second complaint) → US3 → US4 → Polish, one PR, checked against the approved captures.

## Notes

- Below 1024 px nothing may change: every new rule sits in a 1024 or 1280 px media query, except the
  payer line's wrap (harmless on a phone, where the payer folds under the description) and the outlined
  transfer buttons (approved at every width).
- E2E only against the local stack, never the live site.
