# Implementation Plan: Desktop look: warm cream ground, verdict B, readable width

**Branch**: `feat/desktop-redesign` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-desktop-redesign/spec.md`

## Summary

A visual pass with no behaviour change: the colour tokens move from grey lilac to the warm cream (and
warm charcoal in dark) of the approved mockup, measured pair by pair; the verdict block splits into a
small taro block and a white panel of transfers (mockup B); content stops growing at 1320 px; small
text becomes a token that is 14 px from 1024 px; and two table details from #193 are fixed. All of it
lives in `tokens.css`, `index.css`, `VerdictBlock.tsx`, `ExpenseTable.tsx` and the two docs.

## Technical Context

**Language/Version**: TypeScript 5, React 19, CSS custom properties

**Primary Dependencies**: none new

**Storage**: N/A

**Testing**: Vitest + Testing Library (the verdict's structure, the share row's span); Playwright a11y
walk (44 px, sideways scroll, focus ring) on a local stack; a contrast script over every token pair
(research R1)

**Target Platform**: the web app; desktop first, phones must not break

**Project Type**: web application, SPA only

**Performance Goals**: none beyond today

**Constraints**: every text pair ≥ 4.5:1 and control outline ≥ 3:1 in both themes; tokens only; 44 px;
no sideways scroll at 320/360/640 px or 200% zoom; no behaviour or copy change

**Scale/Scope**: 2 tokens blocks (light, dark), ~26 font-size rules, 1 component restructure, 1 table
fix, BRAND.md §3, DESIGN.md §2–§3 and §6

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this feature meets it | Status |
|---|---|---|
| I. Money in whole đồng | No money logic touched | Pass (n/a) |
| II. Access by the server | No request or right changes | Pass (n/a) |
| III. Migrations, real PostgreSQL | No backend change | Pass (n/a) |
| IV. Reviewed PR, four checks | One issue, one PR; tests updated where they assert structure | Pass |
| V. No secret | Nothing secret | Pass |
| VI. Vietnamese housemates on a phone | Contrast recomputed for every pair in both themes (R1), tokens only, both themes defined together, 44 px kept, phone layout checked at 320/360 | Pass |
| VII. Quick add | The AI button keeps its yellow and its contrast (13.85:1) | Pass |

*Re-check after Phase 1*: the palette in data-model.md passes every pair (R1); still Pass.

## Project Structure

### Documentation (this feature)

```text
specs/003-desktop-redesign/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/ui-contract.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
frontend/src/
├── styles/tokens.css            # new light and dark values; --text-small (13 px, 14 px from 1024)
├── index.css                    # font-size: 13px → var(--text-small); width cap; verdict B; table fixes
├── components/VerdictBlock.tsx  # the taro section ends after the amount; transfers in a sibling panel
├── components/ExpenseTable.tsx  # the share row spans the amount column; no negative margin on the button
└── pages/DashboardPage.test.tsx, components/*.test.tsx  # structure assertions where they change
frontend/e2e/a11y.spec.ts         # measures the new ground's contrast pairs in the walk
docs/BRAND.md §3, docs/DESIGN.md §2–§3, §6.2, §6.6
```

**Structure Decision**: SPA styles and one component; no new file except the spec folder.

## Complexity Tracking

No violations to justify.
