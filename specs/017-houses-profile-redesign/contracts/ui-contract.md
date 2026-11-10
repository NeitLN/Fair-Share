# UI contract: House list and profile

What other code and the tests (Vitest, the E2E suite and the live smoke run) may rely on after this feature. A PR that breaks a line here updates this file and the tests in the same PR.

## `/` (returning user)

| Thing | Contract |
|---|---|
| Page title | h1 *Nhà của bạn* / *Your groups*; tab title *Nhà của bạn · Fair-Share* |
| House list | `<ul class="house-rows">` inside one panel; one `<li>` per house holding `<a class="household-row" href="/households/<id>">` |
| A row's text, in order | house name, *Trưởng nhóm* if owner, the money words and amount (*Bạn cần trả 150.000đ* / *Bạn được nhận …* / *Đã xong*) |
| Waiting badge | unchanged: `.household-waiting`, `role="status"`, accessible name *N việc đang chờ bạn* |
| House tile | `.house-tile`, `aria-hidden="true"`, never focusable |
| Amount edge | from 1024 px every `.household-money` ends on the same right edge (E2E compares `getBoundingClientRect().right`) |
| Waiting requests | section named by h2 *Đang chờ duyệt* (`#pending-title`, `tabIndex=-1`), still `ul.household-list > li.pending-card` |
| Ways in | `<section class="ways-in">` named by h2 *Thêm nhà* / *Add a group*; after the list and the wait in the DOM |
| Folds | two `<details class="fold">` with summaries exactly *Nhập mã mời* and *+ Tạo nhà mới*; the summary stays visible when open; Escape closes and focuses the summary (`closeFoldOnEscape`) |
| Opening a fold | focus moves to its first field (`#join-code`, the house name field) |
| Invite hint | inside the create fold; not on the page |
| Help paragraphs | not rendered with ≥ 1 house; the new-account start screen unchanged |

## `/account`

| Thing | Contract |
|---|---|
| Back link | `<a href="/">‹ Nhà của bạn</a>` before the h1 |
| Page title | h1 *Hồ sơ của bạn* (`tabIndex=-1`, focused when arriving from the menu); tab title *Hồ sơ của bạn · Fair-Share* |
| Regions, in DOM order | *Bạn cùng nhà thấy bạn thế này* (the card, holds the photo controls and the email), *Tên của bạn*, *Trạng thái*, *Tài khoản nhận tiền*, *Mật khẩu*, *Giới tính*; each a `<section aria-labelledby>` whose h2 gives the name |
| Save buttons (exact names) | *Lưu ảnh* (only after a pick), *Lưu tên*, *Lưu trạng thái*, *Lưu tài khoản*, *Đổi mật khẩu*, *Lưu giới tính*; English *Save photo*, *Save name*, *Save status*, *Save account*, *Change password*, *Save gender* |
| Tests press a save as | `within(region).getByRole('button', { name: /^Lưu/ })` (PR 0) |
| Pending | the button text *Đang lưu…*, `aria-disabled="true"`, focus kept |
| Unsaved mark | `.unsaved` with text *Chưa lưu*, referenced by the button's `aria-describedby` |
| Errors | `.field-problem` with an id, in the field's `aria-describedby` together with the hint id; the status hint (counter) stays |
| Live areas | `.profile-live` with `aria-live="polite"`, present from the first render, never `display:none` |
| Gender | native radios in a `<fieldset>` with a legend; the notice (`#profile-gender-notice`) before them |
| Receiving facts | `<dl class="receiving-facts">` with three `dt`/`dd` pairs |
| Sign out | not on this page |

## Header (every signed-in page)

| Thing | Contract |
|---|---|
| Account button | the `<summary>` keeps its accessible name (`t.account.menu(name)`) and 44 px size; shows the user's `Avatar` (photo or initial on tint), decorative |
| Profile link | `aria-current="page"` on `/account`; navigates with `state: { focus: 'title' }` |
