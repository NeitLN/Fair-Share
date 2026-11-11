---

description: "Task list for the house list and profile redesign"
---

# Tasks: House list and profile redesign

**Input**: Design documents from `specs/017-houses-profile-redesign/` ([plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-contract.md](contracts/ui-contract.md), [quickstart.md](quickstart.md))

**Tests**: requested by the spec (FR-028, SC-003, SC-006). Within a story, the tests are written first and fail before the code that makes them pass.

**Organization**: one phase per user story, grouped into the four PRs of plan.md: PR 0 (foundational, tests by region), PR 1 (US1, US2 on `/`), PR 2 (US3, US4 on `/account`), PR 3 (US5, header). Paths are relative to the repo root; the web app is in `frontend/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story of spec.md the task belongs to

---

## Phase 1: Setup

- [X] T001 Check `gh api user --jq .login` is NeitLN, update `main`, and confirm the local stack runs (`podman compose -p fsdemo up --build -d`, app at `http://172.21.33.10:3000`) per [quickstart.md](quickstart.md) Setup

---

## Phase 2: Foundational (PR 0, `test/017-profile-saves-by-region`, blocks PR 2)

**Purpose**: FR-028. The profile tests press each save inside its region, so renaming and moving buttons in PR 2 cannot break the unit tests or the live smoke run.

- [X] T002 Create branch `test/017-profile-saves-by-region` from `main`
- [X] T003 [P] In `frontend/src/pages/AccountPage.test.tsx` replace every `getAllByRole('button', { name: 'Lưu' })[i]` / `saves[saves.length - 1]` (lines 52, 76, 89, 93, 166, 198, 226, 274, 298 to 302) with `within(screen.getByRole('region', { name: '<part>' })).getByRole('button', { name: /^Lưu/ })`, using the region names *Tên của bạn*, *Trạng thái*, *Ảnh đại diện*, *Giới tính*; change the three `within(section()).getByRole('button', { name: 'Lưu' })` (lines 346, 372, 421) to `{ name: /^Lưu/ }`
- [X] T004 [P] In `frontend/e2e/profile.spec.ts` replace `getByRole('button', { name: 'Lưu' }).first()` / `.last()` (lines 34, 122, 132, 162) with `page.getByRole('region', { name: '<part>' }).getByRole('button', { name: /^Lưu/ })` for the part each step saves
- [X] T005 Run `npx vitest run`, `npx tsc -b`, `npm run lint` and the local `npx playwright test e2e/profile.spec.ts`; all green with no product change; open PR 0 (Minh reviews), merge, watch deploy and the live smoke run

**Checkpoint**: PR 0 merged and the live smoke green before T029 starts.

---

## Phase 3: User Story 1, see where I stand in each house (P1, PR 1 `feat/017-house-rows`)

**Goal**: houses as rows in one panel, money words and amounts on one right edge, no help paragraphs for a returning user, the tab title.

**Independent Test**: an account in three houses (owing, owed, settled, one with a waiting item) on `/` at 390 and 1440 px, light and dark ([quickstart.md](quickstart.md) PR 1 steps 1 to 3 and 7).

### Tests for User Story 1

- [X] T006 [US1] Create branch `feat/017-house-rows` from `main`
- [X] T007 [P] [US1] Vitest in `frontend/src/lib/usePageTitle.test.ts`: sets `"<text> · Fair-Share"`, puts back the previous title on unmount
- [X] T008 [P] [US1] Vitest in `frontend/src/components/HouseholdList.test.tsx` (create if absent): one `ul.house-rows` with a `li` per house; each row a link to `/households/<id>`; the `.house-tile` has `aria-hidden="true"`; owing row text "Bạn cần trả" + "150.000đ", owed "Bạn được nhận", zero *Đã xong*; owner chip; the waiting badge keeps `role="status"` and the name "1 việc đang chờ bạn"
- [X] T009 [US1] Vitest in `frontend/src/pages/HouseholdsPage.test.tsx`: with ≥ 1 house neither `inviteHint` nor `howItWorks` text is on the page; with 0 houses the start screen still shows `howItWorks`; `document.title` is "Nhà của bạn · Fair-Share"

### Implementation for User Story 1

- [X] T010 [P] [US1] Create `frontend/src/lib/usePageTitle.ts` (research R8): `usePageTitle(text)` sets `document.title = \`${text} · Fair-Share\`` in an effect and restores the previous title on cleanup
- [X] T011 [P] [US1] Add keys in `frontend/src/i18n/vi.tsx` and `frontend/src/i18n/en.tsx`: `households.oweWords` ("Bạn cần trả" / "You owe"), `households.getWords` ("Bạn được nhận" / "You get back"), `households.addTitle` ("Thêm nhà" / "Add a group")
- [X] T012 [US1] Rewrite `frontend/src/components/HouseholdList.tsx` (research R2): `<ul className="house-rows">`; each `<Link className="household-row">` holds `<span className="house-tile tint-N" aria-hidden="true">` with the roof SVG (N = `(id % 8) + 1`), `<span className="household-head">` (name, owner chip, the existing waiting badge unchanged), and `<span className="household-money">` with `<span className="household-words">` + `<Money>` (debt or credit class), or `t.households.settled`; the empty state unchanged
- [X] T013 [US1] In `frontend/src/index.css`: `.house-rows` panel (`--surface`, 1 px `--card-edge`, `--radius-section`, rows split by `--line`, no gap); `.household-row` grid `auto minmax(0,1fr) auto`, min-height 64 px, hover `--surface-2`; `.house-tile` 40 px, radius `--radius-control`, 2 px `--edge` ring, `2px 2px 0 var(--sticker-shadow)`, glyph `--on-fill`; `.household-money` right-aligned, amount bold, tabular, 20 px from 1024 px; below 480 px the money spans `2 / -1` on its own line; move the 1024 px `repeat(auto-fill, minmax(280px, 1fr))` rule from `.household-list` to nothing (the pending and outcome lists stay one column); no fixed heights
- [X] T014 [US1] In `frontend/src/pages/HouseholdsPage.tsx`: call `usePageTitle(t.households.title)`; stop rendering `inviteHint` and `howItWorks` in the returning-user branch (the start branch keeps `howItWorks`)
- [X] T015 [US1] In `frontend/e2e/lists.spec.ts` replace the grid-track count (lines 101 to 104) with: at 1024 px, the `right` of every `.household-money` is equal (±1 px)

**Checkpoint**: US1 works on its own: rows, money edge, no hints, title.

---

## Phase 4: User Story 2, join or create a house without losing my place (P1, same PR 1)

**Goal**: a *Thêm nhà* panel beside the list from 1280 px and under it below; fold titles stay visible; focus moves into the field; the invite hint inside the create fold; `/join/<code>` focuses the code.

**Independent Test**: [quickstart.md](quickstart.md) PR 1 steps 2, 4, 5 and 6, mouse and keyboard only.

### Tests for User Story 2

- [X] T016 [US2] Vitest in `frontend/src/pages/HouseholdsPage.test.tsx`: the folds sit in a region named *Thêm nhà* after the list and *Đang chờ duyệt* in DOM order; opening *Nhập mã mời* focuses `#join-code` and its summary is still visible; Escape closes and focuses the summary (keep the existing Escape test); the open create fold shows the invite hint; `/join/K7QM2XRT` with a house opens the code fold and focuses the code field; the spec 015 *Tạo nhà khác* rule on the start screen unchanged
- [X] T017 [P] [US2] Vitest in `frontend/src/components/JoinForm.test.tsx` and `HouseholdCreateForm.test.tsx` (create if absent): a problem has an id that the field's `aria-describedby` lists; the join preview area is in the DOM before any preview

### Implementation for User Story 2

- [X] T018 [P] [US2] In `frontend/src/components/JoinForm.tsx` and `frontend/src/components/HouseholdCreateForm.tsx` (research R7): ids on the problem texts, `aria-describedby` listing hint and problem ids, `aria-invalid`; the create form accepts a `hint` prop rendered under its name field; keep the field ids (`#join-code`)
- [X] T019 [US2] In `frontend/src/pages/HouseholdsPage.tsx` (research R1, R3): wrap the two `<details className="fold">` in `<section className="ways-in" aria-labelledby="ways-in-title">` with `<h2 id="ways-in-title">{t.households.addTitle}</h2>`, after the list, the outcomes and the wait; on `onToggle` to open, focus the fold's first field in `requestAnimationFrame`; pass `t.households.inviteHint` as the create form's hint; when `linkCode` is set and the person has a house, once the fold is open `scrollIntoView({ block: 'center' })` and focus `#join-code`
- [X] T020 [US2] In `frontend/src/index.css`: from 1280 px `.households-split { grid-template-columns: minmax(0, 1fr) minmax(320px, 360px) }`; `.ways-in` panel (same panel look as `.house-rows`, padding 16 to 22 px); inside `.ways-in` a fold summary is always shown (override `.fold[open] > summary { display: none }`), a 44 px row with a chevron that turns 90° when open (`transform` only, reduced motion respected); drop `.join-preview:empty { display: none }` and give it no height when empty; remove the old `.households-split > .split-rest` flex rules that the panel replaces
- [X] T021 [US2] In `frontend/e2e/a11y.spec.ts` replace `page.locator('summary.btn-secondary').first()` (line 127) with the *Nhập mã mời* summary found by text inside the *Thêm nhà* region, keep its assertions; add `/` to the width loop at 320, 360 and 1440 px (no sideways scroll, every control ≥ 44 × 44 px)
- [X] T022 [US2] Update `docs/DESIGN.md` §6.1 (rows, *Thêm nhà*, no hints for returning users), §6.6 and §6.8 (the right column is now ~360 px, the list gets the rest)
- [X] T023 [US2] Run vitest, tsc, lint, build and the local E2E; walk [quickstart.md](quickstart.md) PR 1 by hand; screenshots at 360 and 1440 px light and dark in the PR; open PR 1 (Duy Anh and Minh review); after merge watch deploy and the live smoke run

**Checkpoint**: `/` fully redesigned and live.

---

## Phase 5: User Story 3, my profile in one look (P1, PR 2 `feat/017-profile-layout`, after PR 0)

**Goal**: back link, identity card on the left, the parts in one panel on the right from 1024 px, the receiving facts as a list, password fields side by side, gender pills, focus on the title from the menu.

**Independent Test**: [quickstart.md](quickstart.md) PR 2 steps 1, 2 and 7.

### Tests for User Story 3

- [X] T024 [US3] Create branch `feat/017-profile-layout` from `main` (with PR 0 merged)
- [X] T025 [US3] Vitest in `frontend/src/pages/AccountPage.test.tsx`: a link "Nhà của bạn" to `/` comes before the h1; the regions in DOM order are *Bạn cùng nhà thấy bạn thế này*, *Tên của bạn*, *Trạng thái*, *Tài khoản nhận tiền*, *Mật khẩu*, *Giới tính*; the card shows name, status or *Chưa có trạng thái*, the email and its note, and "MB Bank •••• 6070" when a supported account is saved (none otherwise); typed but unsaved status does not change the card; change the photo-region name used by PR 0's queries from *Ảnh đại diện* to *Bạn cùng nhà thấy bạn thế này*; `document.title` is "Hồ sơ của bạn · Fair-Share"
- [X] T026 [P] [US3] Vitest for `frontend/src/components/ReceivingAccountForm.tsx` (in its existing test place): the saved account renders a `dl.receiving-facts` with three `dt`/`dd` pairs; *Sửa* and *Xoá* still work
- [X] T027 [P] [US3] Vitest for `frontend/src/components/AccountMenu.tsx`: the *Hồ sơ của bạn* link has `aria-current="page"` on `/account` only; following it puts the focus on the profile h1

### Implementation for User Story 3

- [X] T028 [P] [US3] Add keys in `frontend/src/i18n/vi.tsx` and `en.tsx`: `profile.cardTitle` ("Bạn cùng nhà thấy bạn thế này" / "How your housemates see you"), `profile.noStatus` ("Chưa có trạng thái" / "No status yet"); reuse `members.receivingHint` for the card's hint line
- [X] T029 [US3] Restructure `frontend/src/pages/AccountPage.tsx` (research R4): `usePageTitle(t.profile.title)`; before the h1 the `<Link to="/" className="crumb-back">` with the chevron and `t.households.title`; h1 with `tabIndex={-1}`, focused when `location.state?.focus === 'title'`; `<div className="profile-layout">` with `IdentityCard` (the old `PhotoForm` plus name, status or `noStatus`, the receiving hint from `useQuery(keys.receivingAccount)` when saved and supported, and the email block moved in) then `<div className="profile-parts">` holding `NameForm`, `StatusForm`, `ReceivingAccountForm`, `PasswordForm`, `GenderForm` in that order; *Chọn ảnh* / *Đổi ảnh* become `btn-secondary`, *Gỡ ảnh* `btn-ghost`
- [X] T030 [US3] In `frontend/src/components/ReceivingAccountForm.tsx` render the saved account as `<dl className="receiving-facts">` (bank or wallet, account number, holder) instead of `p.receiving-saved`; keep the intro, privacy, unsupported and after-delete lines and the delete question
- [X] T031 [US3] In `frontend/src/components/AccountMenu.tsx`: `aria-current="page"` on the profile link when the path is `/account`; navigate with `state: { focus: 'title' }`
- [X] T032 [US3] In `frontend/src/index.css` (replace the `.profile` block at line ~3985): `.profile` max width 1120 px; `.profile-layout` one column, from 1024 px `grid-template-columns: 320px minmax(0, 1fr)`, gap 28 px, `align-items: start`; `.profile-card` panel with a 64 px `--surface-2` band and the `lg` avatar overlapping it; `.profile-parts` one panel, `.profile-part` without its own border, 22 px padding, a `--line` top border from the second; `.profile-pair` for the two password fields (`repeat(auto-fit, minmax(200px, 1fr))`, max 640 px); `.profile-choice` pills (44 px, 2 px `--control-line`, checked: `--ink` border on `--surface-2`, the native radio visible); `.receiving-facts` (`repeat(auto-fit, minmax(180px, 1fr))`, `dt` muted, `dd` bold tabular); no sticky, no fixed heights

**Checkpoint**: US3 visible and navigable on its own.

---

## Phase 6: User Story 4, save one part and know what is saved (P2, same PR 2)

**Goal**: six distinct save names, *Chưa lưu*, pending without losing focus, errors that keep the counter, focus after every self-replacing control.

**Independent Test**: [quickstart.md](quickstart.md) PR 2 steps 3 to 6.

### Tests for User Story 4

- [X] T033 [US4] Vitest in `frontend/src/pages/AccountPage.test.tsx`: the buttons are named *Lưu tên*, *Lưu trạng thái*, *Lưu tài khoản*, *Đổi mật khẩu*, *Lưu giới tính*, and *Lưu ảnh* after a pick (six distinct names, SC-004); typing shows *Chưa lưu* next to that part's button and it is in the button's description; saving removes it, also after typing an NFD "Tiến" (separate accent marks) that the server returns as NFC; while saving the button reads *Đang lưu…*, has `aria-disabled="true"` and keeps the focus; a too-long status shows its error and the "N/60" counter together; one test per row of research R6 (8 rows) checks where the focus lands (SC-003)
- [X] T034 [P] [US4] In `frontend/e2e/a11y.spec.ts` add `/account` to the width loop at 320, 360 and 1440 px and a keyboard check that *Xoá trạng thái* and the receiving *Huỷ* never leave the focus on `body`; in `frontend/e2e/profile.spec.ts` change the photo region name to *Bạn cùng nhà thấy bạn thế này*

### Implementation for User Story 4

- [X] T035 [P] [US4] Add keys in `frontend/src/i18n/vi.tsx` and `en.tsx`: `profile.saveName`, `saveStatus`, `savePhoto`, `saveReceiving`, `saveGender`, `unsaved` (research R5 texts, English "Save name", "Save status", "Save photo", "Save account", "Save gender", "Not saved")
- [X] T036 [US4] In `frontend/src/pages/AccountPage.tsx` (research R5, data-model "Page state per profile part"): each form computes `dirty` exactly as the data-model table says (both sides `.normalize('NFC')`, the field set to the server's value on success), renders `<span className="unsaved" id="<part>-unsaved">` when dirty and adds that id to its button's `aria-describedby`; buttons use the new names; pending shows `t.profile.saving` with `aria-disabled="true"` and an `onClick` guard instead of `disabled`; name and status wrap field and button in `.field-inline`; problems render under the hint and `aria-describedby` lists both ids
- [X] T037 [US4] Focus after a swap (research R6) in `frontend/src/pages/AccountPage.tsx` (`IdentityCard` photo states, `StatusForm` after *Xoá trạng thái*) and `frontend/src/components/ReceivingAccountForm.tsx` (*Thêm tài khoản*, *Sửa*, *Huỷ*, *Lưu tài khoản*, *Xoá*): a `focusNext` ref set before the state change and a layout effect that focuses it, falling back to the part's h2 with `tabIndex={-1}`; the receiving save button uses `saveReceiving` and the same pending pattern
- [X] T038 [US4] In `frontend/src/index.css`: `.field-inline` (flex, wrap, gap 10 px; field `flex: 1 1 220px; max-width: 420px`; from 1024 px only, below it stacks); `.unsaved` (a small `--ai` pill with `--on-fill` text, and a visible border so it survives forced colours)
- [X] T039 [US4] Update `docs/DESIGN.md` §6.10 (card, parts panel, names, *Chưa lưu*, focus rules)
- [X] T040 [US4] Run vitest, tsc, lint, build and the local E2E; walk [quickstart.md](quickstart.md) PR 2 by hand with the keyboard and a screen reader; screenshots at 360 and 1440 px light and dark in the PR; open PR 2 (Minh reviews); after merge watch deploy and the live smoke run

**Checkpoint**: `/account` fully redesigned and live.

---

## Phase 7: User Story 5, the account button shows me (P3, PR 3 `feat/017-header-avatar`)

**Goal**: the header button shows the user's photo or initial on their own tint, and follows a photo change.

**Independent Test**: [quickstart.md](quickstart.md) PR 3.

- [X] T041 [US5] Create branch `feat/017-header-avatar` from `main`
- [X] T042 [US5] Vitest for `frontend/src/components/AccountMenu.tsx`: without a photo the summary shows the initial on tint `(id % 8) + 1`; with `getMyPhoto` returning data it shows the image; after `keys.myPhoto` is invalidated with a new photo the image changes; the summary keeps its accessible name and is at least 44 px
- [X] T043 [US5] In `frontend/src/components/AccountMenu.tsx` (research R9) render `<Avatar look={…} size="sm" decorative />` inside the summary instead of `.account-initial`, with the photo from `useQuery({ queryKey: keys.myPhoto, queryFn: getMyPhoto, staleTime: Infinity })`; in `frontend/src/index.css` size it inside the 44 px summary with the sticker ring and drop `.account-initial`
- [X] T044 [US5] Update `docs/DESIGN.md` §5 (header account button); run the checks; open PR 3 (Minh reviews); after merge watch deploy and the live smoke run (#280, main 5e07e36, live smoke green)

---

## Phase 8: Polish and cross-cutting

- [X] T045 On live with the test house: measure SC-001 (amount edges, gap to *Thêm nhà*), SC-002 (profile height at 1440), SC-005 (the eight widths, VI and EN, light and dark) and record them in the last PR (results below)
- [X] T046 Hallway check SC-007 with Tiến, Minh and Duy Anh (three questions, under 5 s each); record the result in the last PR (results below)
- [X] T047 Mark the tasks done in `specs/017-houses-profile-redesign/tasks.md` in a small docs PR

## Results (11/11/2026, live)

Measured with the test account `tien123` in *Nhà trọ VLU*, read only, at main 5e07e36.

| Criterion | Result |
|---|---|
| SC-001 amounts on one edge, *Thêm nhà* at most 48 px from the list (1440 px) | 0 px apart, 26 px gap (was about 800 px). The account has one house; three houses on one edge show in `screenshots/houses-1440-light.png` and `houses-1440-dark.png` (#278), and `lists.spec.ts` checks two at 1024 and 1440 px |
| SC-002 profile within 1.5 screens at 1440 px | 1359 px = 1.51 screens of 900 px (was about 2.5): 9 px over, accepted |
| SC-003 focus never on the page body (11 actions) | 11 of 11, Vitest and `a11y.spec.ts` |
| SC-004 six different save names | 6 of 6, Vitest |
| SC-005 no sideways scroll, no clipped text | No sideways scroll and no control under 44 px: 64 checks (8 widths × VI/EN × light/dark × 2 pages), 0 problems. Clipped text was not measured: checked by eye on the 360 and 1440 px screenshots, light and dark, none seen |
| SC-006 accessibility checks and all tests after each PR, live smoke included | green after PR 0 to PR 3 (#277, #278, #279, #280) |
| SC-007 hallway check, three questions under 5 s each | Tiến, Minh and Duy Anh: all three questions under 5 s each |

Found along the way and fixed: the light theme's row dividers were 1.24:1 on the panels and hard to see (owner, 11/11); `--line` is `#DCD0BA` now, about 1.5:1 (#281).

---

## Dependencies & Execution Order

- **PR 0** (T002 to T005) blocks **PR 2** (T024 onward), because PR 2 renames the save buttons the live smoke presses.
- **PR 1** (T006 to T023) depends on nothing but `main`; it may run in parallel with PR 0. Inside it US1 (T007 to T015) comes before US2 (T016 to T023) because both edit `HouseholdsPage.tsx`.
- **PR 2**: US3 (T025 to T032) then US4 (T033 to T040), same files.
- **PR 3** (T041 to T044) after PR 2, because PR 2 touches `AccountMenu.tsx` too.
- Polish after all four are live.

## Parallel Opportunities

- PR 0 and PR 1 can be built at the same time on separate branches.
- PR 0: T003 and T004.
- US1: T007, T008, T010, T011.
- US2: T017 and T018.
- US3: T026, T027, T028.
- US4: T034 and T035.

## Implementation Strategy

1. PR 0 first: small, no product change, protects the live smoke.
2. PR 1 = the MVP (US1 + US2): the page every returning user sees.
3. PR 2 (US3 + US4), then PR 3 (US5).
4. Each PR: tests red, code, tests green, by-hand quickstart, screenshots, review, merge, deploy and live smoke watched.
