# Research: House list and profile redesign

Decisions taken while planning [spec.md](spec.md). Each one: what we chose, why, and what else we weighed. Widths are screen widths; signed-in pages are zoomed 110% from 1024 px (`index.css`), so the room a layout really gets is (screen − gutters) / 1.1: about 873 px at 1024, 1098 at 1280, 1236 at 1440.

## R1. Where things sit on `/`

- **Decision**: keep `.households-split` and its breakpoints (spec 012): one column below 1280 px, two from 1280. Change the columns from `3fr 2fr` to `minmax(0, 1fr) minmax(320px, 360px)`. The ways in are wrapped in a `<section class="ways-in" aria-labelledby>` with an h2 *Thêm nhà*; below 1280 it follows the list, the outcomes and *Đang chờ duyệt* in the DOM, so the keyboard order is list, outcomes, wait, ways in at every width.
- **Why**: the design review's 2 votes of 3, and Astryx's responsive rule (a side region only where it has room, otherwise after the content). A fixed ~360 px column puts the panel next to the list instead of 800 px away (SC-001).
- **Alternatives**: actions in the title row (one review vote; goes against "list first", DESIGN §6.1); both forms always open (brings back the accidental second house that spec 015 FR-012 hides, and needs duplicate fields).

## R2. Houses as rows

- **Decision**: `HouseholdList` renders `<ul class="house-rows">` in one panel (`--surface`, 1 px `--card-edge`, radius `--radius-section`, rows split by `--line`). Each `<li>` holds the existing `<Link class="household-row">` laid out as a grid `auto minmax(0,1fr) auto`: a 40 px `.house-tile` (tint `(id % 8) + 1`, roof icon in `--on-fill`, 2 px `--edge` ring, 2 px `--sticker-shadow`, `aria-hidden`), the head (name, *Trưởng nhóm* chip, the existing waiting badge with its `role="status"` and label), and `.household-money` (words in `--muted`, amount bold, tabular, money colour). Below 480 px the money moves to its own line under the head (`grid-column: 2 / -1`), left words and right amount. The pending and outcome lists keep `.household-list`.
- **Why**: Astryx "records as rows in one section, not one card each"; the amounts share one right edge (SC-001); Tổng quan's balance rows already look like this, so the app reads as one.
- **Text**: new keys `households.oweWords` ("Bạn cần trả") and `households.getWords` ("Bạn được nhận"), amount next to them through `<Money>`; the row still reads "Nhà trọ VLU, Bạn cần trả 150.000đ" to a screen reader. `settled` stays.
- **Alternatives**: keep cards (the owner chose rows on 11/11); a table (too heavy for 1 to 5 rows, and a link per row is simpler).

## R3. The folds of *Thêm nhà*

- **Decision**: keep both `<details class="fold">` with their exact summary texts and `closeFoldOnEscape`. Inside `.ways-in` the summary is no longer hidden when open (scoped rule overriding `.fold[open] > summary { display:none }`): it becomes a 44 px row with a chevron that turns, so its open state is announced and a mouse can close it. On open (`onToggle` to open), focus moves to the fold's first field after paint (`requestAnimationFrame`). With a house, `inviteHint` and `howItWorks` are no longer rendered; `inviteHint` renders inside the create fold under the name field. On `/join/<code>` with houses, the code fold opens (already), then the field scrolls into view (`block: 'center'`) and takes focus once.
- **Why**: fixes the lost focus (FR-007, SC-003) and keeps the unit tests that use `getByText('Nhập mã mời').closest('details')` and Escape.
- **Alternatives**: a button + region instead of `<details>` (more code, breaks tests for no gain).

## R4. Profile layout

- **Decision**: `AccountPage` becomes `<div class="profile">` with: the back link (the same `<Link to="/" className="crumb-back">` with its chevron and `t.households.title` that `HouseholdLayout` uses), the h1, then `<div class="profile-layout">` holding `IdentityCard` (left) and `<div class="profile-parts">` (right). From 1024 px `.profile-layout` is `grid-template-columns: 320px minmax(0, 1fr)`, gap 28 px, max width 1120 px; below, one column. `IdentityCard` is the old `PhotoForm` grown: its section keeps `aria-labelledby` on a new h2 *Bạn cùng nhà thấy bạn thế này*; inside it the avatar (`lg`), name, status or *Chưa có trạng thái*, the receiving hint, the email block (moved from under the h1), then the photo buttons and their messages. The parts keep their own `<section class="profile-part" aria-labelledby>` and h2, now without their own border: the `.profile-parts` panel carries the border and each part after the first has a `--line` top border.
- **Why**: Astryx `detail-page` (summary beside the content) and `settings` (sections in order, no nav); review round 2. DOM order stays photo, name, status, receiving, password, gender (FR-013).
- **Receiving hint in the card**: read the same query as `ReceivingAccountForm` (`keys.receivingAccount`); the card only shows `bank name •••• last4` of the saved, supported account. Both observers live and die with the page, so the existing `gcTime: 0` and remove-on-unmount rules still clear it.
- **Alternatives**: an in-page nav (dropped by the review); audience groups that reorder parts (breaks DOM order and the live smoke).

## R5. Save buttons, "Chưa lưu", pending state

- **Decision**: new keys `profile.saveName` *Lưu tên*, `saveStatus` *Lưu trạng thái*, `savePhoto` *Lưu ảnh*, `saveReceiving` *Lưu tài khoản*, `saveGender` *Lưu giới tính* (English: *Save name*, *Save status*, *Save photo*, *Save account*, *Save gender*); *Đổi mật khẩu* stays. Each part computes `dirty` (name ≠ saved name, status ≠ saved status, gender ≠ saved gender, the receiving form being added or edited with a change, either password field not empty, a photo picked); when dirty, `<span class="unsaved" id="…-unsaved">Chưa lưu</span>` shows next to the button and the button gets `aria-describedby` to it. While a save is in flight the button shows *Đang lưu…*, gets `aria-disabled="true"` and ignores presses, but stays focusable (the #248 pattern), so "never disabled" holds and focus is never lost.
- **Inline**: from 1024 px, name and status put field and button on one wrapping row (`.field-inline`, field `flex: 1 1 220px; max-width: 420px`); below, the button sits under the field.
- **Only one filled button in the card**: *Chọn ảnh* / *Đổi ảnh* become `btn-secondary`, *Gỡ ảnh* `btn-ghost`; *Lưu ảnh* is the filled one, only after a pick.

## R6. Focus after a control replaces itself

| Action | Focus goes to |
|---|---|
| Photo picked (Chọn ảnh / Đổi ảnh → file chosen) | *Lưu ảnh* |
| Huỷ after a pick | *Chọn ảnh* / *Đổi ảnh* |
| Lưu ảnh done, Gỡ ảnh done | *Đổi ảnh* / *Chọn ảnh* |
| Xoá trạng thái done | the status field |
| Receiving *Thêm tài khoản* / *Sửa* | the bank select |
| Receiving *Huỷ* | *Sửa* (or *Thêm tài khoản*) |
| Receiving *Lưu tài khoản* done | *Sửa* |
| Receiving *Xoá* done | *Thêm tài khoản* |

Implemented with a `focusNext` ref set before the state change and a layout effect that focuses it once the new control exists, falling back to the part's h2 (`tabIndex={-1}`). Covered by Vitest per row (SC-003).

## R7. Errors and live areas

- **Decision**: `JoinForm` and `HouseholdCreateForm` give their problem `<p>` an id and point `aria-describedby` at it (and at the hint); `.join-preview` stays in the DOM when empty (drop `:empty { display:none }`, keep it with no height). On the profile a problem shows **under** the hint instead of replacing it, and `aria-describedby` lists both ids, so the status counter stays (FR-021).

## R8. Page titles, menu link

- **Decision**: new `usePageTitle(text)` sets `document.title = "<text> · Fair-Share"` and puts back the app title on leave; `HouseholdsPage` uses *Nhà của bạn*, `AccountPage` *Hồ sơ của bạn*. The menu link gets `aria-current="page"` on `/account` and navigates with `state: { focus: 'title' }`; `AccountPage` focuses its h1 (`tabIndex={-1}`) when it arrives with that state.
- **Note**: `english.test.tsx:90` checks the app title on a page that does not use the hook; it stays green.

## R9. Header avatar (PR 3)

- **Decision**: `AccountMenu` renders `<Avatar look=… size="sm" decorative>` inside its 44 px summary instead of `.account-initial`: initial from the display name, tint `(user.id % 8) + 1`, photo from `useQuery({ queryKey: keys.myPhoto, queryFn: getMyPhoto, staleTime: Infinity })`. The profile already invalidates `keys.myPhoto` after a save or removal, so the header follows without a reload. On sign-out the query cache is cleared already.
- **Cost**: one existing `GET /api/me/photo` per session; no new endpoint.

## R10. Tests first (PR 0) and what each PR changes

- **PR 0**: `AccountPage.test.tsx` and `e2e/profile.spec.ts` press `within(region).getByRole('button', { name: /^Lưu/ })` with the regions named by today's h2s (`Tên của bạn`, `Trạng thái`, `Tài khoản nhận tiền`, `Giới tính`, `Ảnh đại diện`). `/^Lưu/` matches *Lưu* today and *Lưu tên* later, never *Xoá trạng thái* or *Đang lưu…*.
- **PR 1**: `lists.spec.ts:101-104` checks that the amounts' right edges are equal at 1024 px instead of counting grid tracks; `a11y.spec.ts:127` finds the fold by role and text instead of `summary.btn-secondary`; `HouseholdsPage.test.tsx` adds: no hints with a house, the invite hint in the create fold, focus into the field on open, `/join` focus, title.
- **PR 2**: the photo region is renamed *Bạn cùng nhà thấy bạn thế này*, so PR 2 updates that one region name in both test files; adds Vitest for every row of R6, the six names, *Chưa lưu*, errors keeping the counter; adds `/account` to the a11y width loop (320, 360, 1440).
- **PR 3**: `AccountMenu` test: initial and tint without a photo, the photo with one, change after invalidation.
