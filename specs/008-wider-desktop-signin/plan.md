# Implementation Plan: Wider desktop frame and a composed sign-in page

**Branch**: `feat/wider-desktop-signin` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-wider-desktop-signin/spec.md`

## Summary

Front-end and documentation only. The desktop frame grows from 1320 px to 1520 px of content (one
number in `index.css`); from 1280 px Tổng quan keeps each line of its right-hand panels within 640 px,
centred (variant A), puts "Báo cáo tháng" beside the month title, and the repeated transfer-card
actions become the existing outlined button; Chi tiêu bounds its form at 380–420 px, puts the three
filters on one row and lets the payer's split line wrap. Signed out on a computer, `AuthPage` (asked
through `useWide`) composes a centred block: wordmark, tagline, intro and decorative sticker avatars on
the left, the unchanged form and the language/theme switches on the right; the header is not rendered.
Below 1024 px nothing changes. DESIGN.md §6.6 is rewritten for the new rules.

## Technical Context

**Language/Version**: TypeScript 5, React 19 (Vite); CSS in `frontend/src/index.css` with tokens in
`styles/tokens.css`

**Primary Dependencies**: none new

**Storage**: N/A (no data change)

**Testing**: Vitest + Testing Library (AuthPage wide/narrow, App header signed out, VerdictBlock
buttons still found by role); Playwright on the local stack (`a11y.spec.ts` adds the signed-out page at
1366 × 768 and 360 px); before/after captures at 1366/1536/1920/2560 compared with the approved preview

**Target Platform**: Render static site; desktop 1024–2560 px is the focus; phones unchanged

**Project Type**: web application (SPA part only)

**Performance Goals**: none beyond today

**Constraints**: constitution VI (4.5:1 text, 3:1 control edges, both themes, tokens only, 44 px, no
horizontal scroll at 320/360, keyboard order = visual order, both languages); DESIGN.md §2 (one loud
place, no sticky); BRAND.md (no speed claim); two days to the deadline, so no structural change to
Tổng quan

**Scale/Scope**: ~60 lines of CSS, 2 components (`AuthPage`, `App`), 3 class names in `VerdictBlock`,
tests in 3 files, DESIGN.md §6.6

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this feature meets it | Status |
|---|---|---|
| I. Money in whole đồng | No calculation changes; amounts keep `nowrap` and right alignment | Pass |
| II. Access by the server | No route, request or right changes | Pass |
| III. Migrations, real PostgreSQL | No schema change | Pass |
| IV. Reviewed PR, four checks | One issue, one PR; DESIGN.md updated in it | Pass |
| V. No secret | Nothing secret | Pass |
| VI. Vietnamese housemates | Both languages from existing strings; existing tokens and the measured `btn-secondary`; 44 px kept; phone layout untouched; `useWide` decides what a computer shows, so tab order follows the screen | Pass |
| VII. Quick add | The AI box keeps its place in the Chi tiêu form | Pass |

*Re-check after Phase 1*: the outlined actions reuse an existing measured variant and the sign-in adds
no colour; still Pass.

## Project Structure

### Documentation (this feature)

```text
specs/008-wider-desktop-signin/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/ui-contract.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
frontend/src/index.css                    # frame cap, 640 px lines, month head, Chi tiêu, sign-in layout
frontend/src/App.tsx                       # signed out + wide: no header, main.signed-out; switches move to AuthPage
frontend/src/pages/AuthPage.tsx (+ test)   # wide composition: intro, form column, switches
frontend/src/App.test.tsx                  # header absent signed out on a wide screen
frontend/src/components/VerdictBlock.tsx   # transfer-card actions: btn-primary → btn-secondary
frontend/e2e/a11y.spec.ts                  # signed-out page at 1366 × 768 and 360 px
docs/DESIGN.md §6.6
```

**Structure Decision**: existing SPA layout; no new component file (the intro is a few elements inside
`AuthPage`, the avatars reuse `Avatar`).

## Complexity Tracking

No violations to justify.
