# Fair-Share — Design system "Sticker pop"

The visual and interaction spec for the web app. Build from this file; if code and this file disagree,
fix one of them in the same PR. Decided 21/10/2026 after two review rounds (below); owners and dates are in
[ROADMAP.md](ROADMAP.md) (T-41, T-42, T-43, T-19, T-32).

| | |
|---|---|
| **Who** | A Vietnamese student sharing a *nhà trọ* with 2–6 housemates, on a mid-range Android phone over 4G, one hand, right after paying |
| **Jobs, in order** | 1. Log an expense in under 10 s · 2. See who pays whom · 3. Mark a transfer as paid · 4. Check the history |
| **Tone** | Friendly and a bit playful, never cute about money. First person ("Bạn cần trả Minh"), plain Vietnamese, no jokes in errors |
| **Themes** | Light and dark, following the phone; a user can force either |

## 1. Direction and why

**Sticker pop.** A calm, near-white app where colour and play appear in exactly two places: one drenched
taro block that answers *who pays whom*, and stickers (avatars, the **ĐÃ TRẢ** and **SẠCH NỢ** stamps).

How we got here:

1. Two directions were compared on 21/10: *Sticker pop* (candy colours, stickers) and *Bill nhiệt* (a
   monochrome thermal-receipt ledger with one red stamp). The team leader chose Sticker pop.
2. The first Sticker pop mock-up was reviewed against Nielsen's 10 heuristics (**26/40**) and checked
   with an automated contrast, touch-target and long-data probe. The verdict: it read as a 2023
   "neo-brutalist pastel" template; Tổng quan answered the wrong question first; the AI wait was invisible
   on a phone; long Vietnamese names and amounts like 12.500.000 đ broke the layout; 8 text pairs failed
   contrast and many targets were under 44 px.
3. Version 2 (this spec) fixes all of those. What changed is listed in §10.

## 2. Five rules (read these before any CSS)

1. **One loud place per screen.** Only the taro verdict block on Tổng quan is drenched. Everything else
   sits on the warm cream ground as near-white surfaces with a quiet 1 px edge. Yellow means *attention*: the coin in the
   logo, the AI and the focus ring, nothing else ([BRAND.md](BRAND.md)).
2. **Flat panels; hard shadows only on stickers and a form's primary action.** A white panel on the
   page (a list, a table, a form, the invite, the tab track) has one 1 px solid `--card-edge`
   (`#C8B99F` light, `#544B40` dark) and no shadow. Inside a panel, spacing and quiet `--line` dividers
   group things, never a second frame; fields and controls keep their own 2 px `--control-line`. The
   taro verdict block and its transfer cards stay borderless (their fill already stands out, 6.3:1).
   Avatars, the two stamps, a form's submit, the AI button and *+ Ghi khoản chi* on Tổng quan keep
   their 2–3 px offset shadow, and pressing one moves it down by exactly its shadow. (UI review 04/11: on a laptop the white panels
   vanished against the page at 1.30:1; the edge is 1.70:1 to the page. The cream of 05/11 kept it at
   1.71:1, darker than the mockup's 1.42:1.)
3. **Money is sacred.** Bold, tabular figures, right-aligned in lists, always with a sign or a word
   (*cần trả*, *được nhận*), never colour alone. The *đ* is smaller and never wraps away from its number.
4. **No uppercase except the two stamps.** Secondary labels are sentence case, 13 px on a phone and 14 px from 1024 px (`--text-small`). People are shown by
   the **last word of their name** (how students address each other); the full name lives on Thành viên.
5. **Every target ≥ 44 px, four animations at most**: the stamp, the AI progress bar, the one-time
   yellow flash on fields the AI filled, and the toast. With *reduce motion* on, all of them become instant.

## 3. Tokens

All colours are CSS custom properties in `frontend/src/styles/tokens.css`. Components use the tokens,
never a literal colour. Dark values apply under `prefers-color-scheme: dark` unless the user forced
`data-theme="light"`, and always under `data-theme="dark"`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6F1E7` | `#16130F` | page: warm cream / warm charcoal (design review 05/11; grey lilac `#E3E1E9` before) |
| `--surface` | `#FFFDF8` | `#221E19` | sections, inputs, the transfers panel |
| `--surface-2` | `#F1E9DB` | `#2D2822` | folds, segmented track, paid transfer, opened shares |
| `--ink` | `#17132B` | `#F6F1E7` | text |
| `--muted` | `#5E5868` | `#BDB3A3` | secondary text |
| `--line` | `#DCD0BA` | `#37312A` | row dividers only: quiet, about 1.5:1 on `--surface` in light (was `#ECE4D5`, 1.24:1, too faint; owner 11/11) |
| `--card-edge` | `#C8B99F` | `#544B40` | the 1 px edge of a white panel on the page (rule 2): 1.71:1 to bg, 1.90:1 to surface (light); 2.17 / 1.94 (dark) |
| `--control-line` | `#8A7F6E` | `#8F8576` | the 2 px edge of fields, selects, secondary buttons, folds, payer chips, the account menu |
| `--focus-outline` | `#17132B` | `#17132B` | the ring inside the yellow focus halo |
| `--primary` | `#5A3CF0` | `#8C74FF` | primary button fill |
| `--on-primary` | `#FFFFFF` | `#120C33` | text on primary |
| `--primary-text` | `#5A3CF0` | `#A996FF` | links, ghost buttons |
| `--block` / `--on-block` | `#5A3CF0` / `#FFFFFF` | `#4B33D1` / `#FFFFFF` | the verdict block |
| `--on-block-muted` | `#E4DCFF` | `#E4DCFF` | small text in the verdict block |
| `--credit` / `--credit-text` | `#3DDC97` / `#05694A` | `#3DDC97` / `#5EE9AE` | *được nhận*, ĐÃ TRẢ, SẠCH NỢ |
| `--debt` / `--debt-text` | `#FF5C8A` / `#B71F55` | `#FF5C8A` / `#FF8FB0` | *cần trả*, errors |
| `--ai` | `#FFE14D` | `#FFE14D` | AI button and chip, focus ring |
| `--on-fill` | `#17132B` | `#0E0A1F` | text on mint, pink, yellow and avatar tints |
| `--edge` | `#FFFFFF` | `#F6F1E7` | sticker die-cut outline |
| `--sticker-shadow` | `#17132B` | `#6A52E8` | sticker and primary-button shadow |
| `--toast-bg` / `--toast-fg` / `--toast-action` | `#17132B` / `#FFFFFF` / `#FFE14D` | `#F6F1E7` / `#17132B` / `#5A3CF0` | toast |
| `--toast-shadow` | ink at 30% | black at 45% | the soft shadow under a toast |

**Avatar tints** (same in both themes): `#FFB5C9` `#FFD27A` `#B8F0D4` `#BFD8FF` `#D9C7FF` `#FFC9A8`
`#A8EDEA` `#E6F27A`. Initials use **`--on-fill`** (light `#17132B`, dark `#0E0A1F`), never `--ink`, which
is light in dark mode and gives 1.08–1.47:1 on these tints. A member's tint is chosen once and stays put:
take the members in id order; each one's preferred tint is `id mod 8`, and if an earlier member already
has it, the next free tint. Adding someone never recolours anyone; removing someone recolours only a
member who had been pushed off a taken tint. Houses of up to 8 never repeat a colour.

**Measured contrast** (WCAG 2.1, all text pairs ≥ 4.5:1; recomputed for the cream of 05/11 with
`specs/003-desktop-redesign/contrast.py`). Light: ink on bg 16.02, muted 6.07 / 6.73 / 5.67 on bg /
surface / surface-2, primary text 5.59 / 6.19 / 5.22, credit text 5.97 / 6.61 / 5.57, debt text 5.58 /
6.18 / 5.21. Dark: ink on bg 16.45, muted 8.94 / 8.00 / 7.05, primary text 7.49 / 6.70 / 5.91, credit
text 12.12 / 10.84 / 9.56, debt text 8.65 / 7.74 / 6.82. Unchanged: white on primary 6.3, `#120C33` on
dark primary 5.4, white on the dark verdict block 7.8, `#E4DCFF` on the light block 4.8, `--on-fill` on
the avatar tints ≥ 10.91 (light) / 11.74 (dark), the focus ring 13.85 against its yellow halo. Surface vs.
bg is 1.11 (light) and 1.12 (dark), closer than the lilac's 1.30, so panels read by their `--card-edge`
(1.71:1 light, 2.17:1 dark). Anything you type in or press is outlined in `--control-line`: 3.49 on bg,
3.87 on surface, 3.26 on surface-2 (light); 5.10 / 4.56 / 4.02 (dark), above WCAG 1.4.11's 3:1.
Placeholders use `--muted`. The dark sticker shadow is 3.5:1 against bg so stickers stay visible on OLED.

**Shape and space.** Radii: sections 16 px, transfer cards 14 px, buttons and inputs 12 px, chips and
segmented controls 999 px, avatars circles, the verdict block 24 px. Spacing on a 4 px grid; page gutter
16 px; vertical gap between page parts 16 px; inside a section 10 px.

## 4. Typography

Two families, self-hosted through `@fontsource` with only the **latin + vietnamese** subsets.

| Role | Face | Size / line | Notes |
|---|---|---|---|
| Verdict amount | Bricolage Grotesque 800 | 44/42 (36 under 380 px) | tracking −0.035em, *đ* at 0.6em |
| House name, page title | Bricolage Grotesque 800 | 28/30 (24 under 380 px) | tracking −0.025em, `overflow-wrap: anywhere` |
| Verdict sentence | Bricolage Grotesque 800 | 22/25 | |
| Section title | Be Vietnam Pro 700 | 17/24 | |
| Body, inputs | Be Vietnam Pro 400 / 500 | 15/22, inputs 16 | 16 px inputs stop iOS zooming |
| Money in lists | Be Vietnam Pro 700 | 15–18 | `font-variant-numeric: tabular-nums`, `white-space: nowrap` |
| Labels, meta | Be Vietnam Pro 500 | 13/18 | sentence case, `--muted` |
| Buttons | Be Vietnam Pro 700 | 15 | |
| Stamps | Bricolage Grotesque 800 | 16 (ĐÃ TRẢ), 11 (SẠCH NỢ) | the only uppercase text |

Weights loaded: Be Vietnam Pro 400, 500, 700; Bricolage Grotesque 800. Nothing else (no mono font).

## 5. Components

| Component | Spec |
|---|---|
| **Avatar** | Circle, 32 px (26 small, 44 large). Background tint per §3 (stable, no repeats up to 8), initial of the **last word** of the name in `--on-fill`, 2 px `--edge` ring, 2 px `--sticker-shadow` offset. `title` and accessible name = full name. A stack shows at most 3, then `+n`. With a photo (spec 010) the photo fills the same circle (`object-fit: cover`), same ring and shadow, `alt=""` so the name is read once; while it loads or if it fails, the initial |
| **Account button** | The header's 44 px round button that opens the account menu (specs/017, US5): the person's own avatar inside it, 34 px, the same as on the profile (the photo, or the initial on the tint of their user id; a house's member list picks colours per house, so there it may differ). Decorative: the button keeps its name "Tài khoản: …". The photo loads once per session and follows a change on the profile without a reload |
| **Money** | `<Money amount={n} />` → `120.000<span class="cur">đ</span>`; sign variants `+` (credit text) and `−` (debt text, a real minus `U+2212`). Replaces `formatVND`'s "₫" everywhere |
| **Chip** | 12 px 700, pill. `credit` mint, `debt` pink, `ai` yellow (`✦ AI`): text `--on-fill`. `me` (*bạn*) is the exception: background `--ink`, text `--bg` (16:1 both themes) |
| **Stamp ĐÃ TRẢ** | Mint sticker, 3 px edge, −8°, on a transfer the moment it is recorded; animation: scale 1.7 → 1 in 240 ms with a slight overshoot (the one deliberate bounce in the app; instant under reduce motion). The card turns `--surface-2`, never faded |
| **Stamp SẠCH NỢ** | Small mint sticker, −6°, next to a member whose net is 0 **and** who has at least one expense or settlement (a brand-new house is not "settled") |
| **Buttons** | `primary` (taro, edge, hard shadow), `ai` (yellow, same), `secondary` (surface + `--control-line` border; `--muted` on hover), `ghost` (primary text), `danger` (debt text). Height 44, radius 12. Press: translate by the shadow, shadow to 0, 120 ms. Disabled: 60% opacity, no shadow |
| **Segmented** | Pill track on `--surface`, selected segment ink with `--bg` text; 44 px. Used for the household tabs and Chia đều / Tự chia |
| **Fold row** | `--surface-2` row "**Hôm nay**, 21/10 · Đổi" / "**Chia đều cả nhà** (4 người) · Sửa"; shows exclusions ("Chia đều (3/4 người)"). Opens the full control in place |
| **Pick chips** | Radio group as avatar + short name pills (Ai trả?, Bạn là ai?); checked = ink border on `--surface-2`; long names ellipsize |
| **Section** | Title row (17 px 700 + optional `--text-small` muted note) above a `--surface` panel with a 1 px `--card-edge` and 1 px `--line` dividers between rows; rows ≥ 60 px |
| **Toast** | Bottom centre, `min(420px, 100vw − 32px)` wide, one line where possible, action button on the right (*Hoàn tác*). Stays 7 s, counted only while nobody uses it: keyboard focus or the pointer on it pauses it, and leaving starts the full 7 s again. `role="status"`. Rules from specs/018 (safe saves): <br>• **Phone (< 600 px):** one at a time. A new one replaces one nobody uses, or waits behind one in use. Only the newest waits; those it passes leave at once, so their undo closes as it would on time-out. <br>• **From 600 px:** up to three stack. The oldest one nobody uses makes room; one in use is never pushed out. <br>• **Below 1024 px with the sticky save bar on screen:** just above the bar, measured (with or without its error line, with the keyboard open). If there is no room, it waits out of sight with its time stopped. Text keeps to two lines there; the whole text is still read out and is in its title. <br>• **A "saved" toast** (a money write that went through) goes when a new save starts from the same place and nobody uses it. Any save error on screen takes it away, even in use, with the focus moving to that save's control, and keeps new ones off while the error shows. <br>• **Sticky:** only an undo whose result is unknown. No time limit, a *Đóng* button, and nothing replaces it |
| **Ask in place** | An action that changes something for others (delete an expense, stop a recurring one, *Đổi mã mới*, *Gỡ ảnh*) asks first, never with the browser's dialog: its button turns into the question, then a filled red action (`.btn-danger-solid`) and *Huỷ* (`components/InlineConfirm.tsx`). The focus goes to the action, and back to the button on *Huỷ* or Escape; Escape closes only the question. Where it can be undone, a toast follows with *Hoàn tác*: a deleted expense is recorded again, a removed photo is saved again. On the desktop table, *Xoá* is muted until pointed at or focused (`.btn-danger-quiet`), so the table is not a column of red |
| **Password field** | Every password field has *Hiện* / *Ẩn* inside it on the right (`components/PasswordInput.tsx`); Edge's own eye is hidden. A new password is typed twice, since there is no reset by email. A lockout says how many minutes are left (`retry_after`) |
| **Leaving unsaved** | On the profile page, a part that shows *Chưa lưu* makes a link away ask first, and closing the tab gets the browser's question. A new expense being typed is kept in this tab (sessionStorage, per account and house, with its draft id), so a reload or a session that ended loses nothing; the sign-in page then says the session ended |
| **Sticky save bar** | Below 1024 px the expense form's save area sticks to the bottom: `--surface`, a 1 px `--line` top border and a soft upward `--toast-shadow`, so what scrolls under it reads as under a bar (specs/018, D23). From 1024 px it is in the flow, no border |
| **Note** | `--surface-2` box with a mint (ok) or pink (attention) dot; used for AI results and blocked actions, placed next to what it is about |
| **Composer (T-19)** | See §6.3 |

## 6. Screens

### 6.1 Danh sách nhà `/`

```
Fair·Share
Nhà của bạn                                         ← page title, Bricolage 28
┌───────────────────────────────────────────────┐  ┌ Thêm nhà ───────────────┐
│ [⌂] Nhà Thảo Điền [Trưởng nhóm]  Bạn cần trả 350.000đ │  │ Nhập mã mời           › │
│───────────────────────────────────────────────│  │─────────────────────────│
│ [⌂] Nhà trọ Q7 [Trưởng nhóm] (2)  Bạn được nhận 5.858.500đ │  │ + Tạo nhà mới         › │
└───────────────────────────────────────────────┘  └── ~360 px, from 1280 ───┘
```
List first, create second (returning users far outnumber new ones). The list holds every household the
signed-in account is approved into, by name, and the requests to join still waiting below it
(docs/ACCOUNTS.md). Since [spec 017](../specs/017-houses-profile-redesign/spec.md) the houses are **rows in
one panel**, split by `--line` (Astryx's "records as rows in one section"; a card each read as a grid of
boxes far from everything else). Each row is one link, filled by `GET /api/households` in one answer
(spec 012, US4):

* a 40 px sticker in the house's colour (`--tint-(id % 8 + 1)`, a roof in `--on-fill`, the avatar ring and
  hard shadow), decoration only;
* the name, which wraps, the chip **Trưởng nhóm** for an owner, and the pill when something waits for you
  (`waiting` join requests for an owner plus "Tôi đã chuyển" notices to answer), its accessible name
  "n việc đang chờ bạn";
* on the right your balance there from `my_net`, so it always matches the house's Tổng quan: the words
  ("Bạn cần trả", "Bạn được nhận") quiet in `--muted`, the amount bold, tabular, in the debt or credit
  colour, or "Đã xong" (muted). Every amount ends on one right edge; below 480 px the words and the amount
  move to their own line under the name.

If the figures are missing (an older API), the row is the name alone and still opens the house. No line
adds the amounts of different houses together. With a house the page shows no help paragraph: the
how-it-works line stays on the new-account start, and the invite line sits inside *+ Tạo nhà mới*,
under its name field.

**Thêm nhà.** The two ways in are one quiet panel (h2 *Thêm nhà*) with two folds, *Nhập mã mời* and
*+ Tạo nhà mới*. A fold's title is a 44 px row with a chevron that turns; it stays in view when open, so
it says it is open and closes again (or Escape), and opening takes the keyboard to the first field. From
1280 px the panel is a column of about 360 px beside the list; below that it comes after the list and the
wait. Arriving by an invite link with a house already, the code fold is open, scrolled to and focused.
The browser tab reads "Nhà của bạn · Fair-Share".

**A new account** (no house, no request; design review 05/11) gets one place to start instead of an
empty list and a lone code field: "Chào Lan, bắt đầu thôi", the how-it-works line, then two panels side
by side from 720 px, both open. *Có mã mời?* holds the code form and says the owner approves it;
*Chưa ai tạo nhà?* holds the name form and says its maker becomes the owner. Until the list loads only
the skeleton shows, so nothing typed is swapped away when the start appears.

```
Chào Lan, bắt đầu thôi
Ghi khoản chi lúc vừa trả. Cuối tháng app tự tính ai trả ai…
┌ Có mã mời? ─────────────┐ ┌ Chưa ai tạo nhà? ────────┐
│ Trưởng nhóm duyệt xong… │ │ Bạn sẽ là trưởng nhóm.   │
│ Mã mời [ABCD-EFGH]      │ │ Tên nhà [            ]   │
│ [Gửi yêu cầu vào nhà]   │ │ [Tạo nhà]                │
└─────────────────────────┘ └──────────────────────────┘
```

**Joining.** A signed-in account sees only the houses it was approved into. A code (or the invite link
`/join/CODE`, which fills the code in) asks to join; the owner approves, under a name of their choosing
(docs/ACCOUNTS.md). Since [spec 015](../specs/015-invite-preview/spec.md) a complete valid code shows
"Lời mời vào Nhà trọ Q7 của Tiến" under the field before asking (a wrong one says nothing until it is sent),
and the waiting card reads "Bạn đang xin vào Nhà trọ Q7 của Tiến · gửi ngày 08/11". Nothing else of the
house shows until approval; the owner sees one more thing in the card's badge. While a request waits the
page checks every 10 seconds (in front only): approved, the house appears with "Bạn đã vào Nhà trọ Q7.";
refused, a line stays, "Tiến không duyệt yêu cầu vào Nhà trọ Q7 của bạn." with *Đã hiểu*; a deleted house
reads "Nhà trọ Q7 không còn nữa, yêu cầu của bạn đã dừng.". Someone who arrived with a valid invite and has
no house sees no *Chưa ai tạo nhà?* panel, only a *Tạo nhà khác* link, until that invite ends. The invite
card on Thành viên says "Ai có mã này sẽ thấy tên nhà và tên trưởng nhóm." An address of a house you are not in shows the
same sentence as a missing one ("Nhà này không tồn tại hoặc bạn chưa có quyền vào. Nếu được mời, hãy
nhập mã mời ở trang Nhà của bạn.").

### 6.2 Khung một nhà + Tổng quan `/households/:id`

```
←  Fair·Share
Nhà trọ Q7                     (T)(M)(A)+1      ← 22 px on a phone
[ Tổng quan | Chi tiêu | Thành viên ]
[ + Ghi khoản chi ]                              ← 48 px, ink fill, 3 px taro shadow (07/11)
╔══════════ taro block ═══════════╗   ← verdict B (05/11): only the answer
║ Bạn cần trả Minh           (M)   ║   ← verdict C (07/11): who it is about, top right
║ 120.000đ                         ║   ← 44 px
║ Vì sao ra số này?                ║   ← when your balance is not 0
║ [ Tôi đã chuyển 120.000đ cho Minh ] ║ ← verdict D (08/11): the debtor's next step
║ Đã báo chuyển 120.000đ, chờ Minh xác nhận. ║ ← once told; then Huỷ thông báo below it
╚═════════════════════════════════╝
┌─────────── transfers panel ─────┐   ← white, 1 px --card-edge, right under the block
│ (T) Bạn cần trả Minh 120.000đ    │   ← yours first
│     Đã báo, chờ Minh xác nhận.   │   ← where it stands (the action is in the block above)
│ ─────────────────────────────── │   ← --line between the rows
│ (A) Duy Anh cần trả Minh 80.000đ │
│ [ Sao chép tin nhắn nhắc nợ ]    │   ← secondary button, last
└─────────────────────────────────┘
Tháng 10/2026: cả nhà chi 3.460.000đ             ← this month, a section of its own
 (M) Minh   đã trả 1.065.000đ      860.000đ  phần chia
 (T) Tiến bạn đã trả 0đ            1.300.000đ  phần chia
Số dư từng người                   tính từ đầu tới hôm nay
 (M) Minh   tổng đã chi 1.065.000đ  +200.000đ  được nhận
 (T) Tiến bạn                      −120.000đ  cần trả
 (L) Lan                                  0đ  SẠCH NỢ
Lịch sử trả tiền                 Ghi khoản trả khác
```
* **Verdict B** (design review 05/11, mockup variant B). The taro block holds only the answer: the
  sentence, the amount, *Vì sao ra số này?* and your own sent notice. The transfer cards, their actions
  and *Sao chép tin nhắn nhắc nợ* sit in a white panel right under it, as rows with `--line` dividers;
  white cards nested in the taro made the one loud place heavy. With no transfer and nothing to copy
  there is no panel.
* **Verdict C** (owner's choice, 07/11). The block got a little depth and says who it is about at a
  glance. The fill is the same taro with a soft light corner top right (a radial gradient that fades
  into `--block` within 180 px) and a faint 5 % ring behind it, so every point of the block keeps white
  ≥ 5.9:1 and `--on-block-muted` ≥ 4.5:1 in both themes (measured at 360 and 1440 px). In that corner
  sit the avatars of the people in your transfers: those who owe you when you are owed, those you owe
  when you owe. Up to three, then *+n*; none when you are not in any transfer. They are decorative
  (`aria-hidden`), since the sentence already names them, and the sentence keeps 120 px clear of them.
  *+ Ghi khoản chi* is filled with `--ink` and carries a 3 px taro shadow, so it reads as the one action
  without a second purple block next to the verdict.
* **Verdict D** ([spec 012](../specs/012-overview-and-lists/spec.md), 08/11). At 479 px and below the
  stickers take a row of their own above the sentence (still right-aligned, still `aria-hidden`), so the
  sentence has the full width; the total drops from 44 to 36 px and may wrap, the currency sign staying
  with the last digits. From 480 px the stickers are back in the corner, beside the sentence in a second
  grid column rather than over it, so a sentence long enough to wrap does it in the room that is left.
  At 1440 px the block looks as it did on 07/11. A 13-digit balance (999.999.999.999đ) then shows every
  digit at 320 px, with no sideways scroll and no word hidden.
* **The debtor's next step** ([spec 012](../specs/012-overview-and-lists/spec.md) US2). The person who owes
  gets the primary action under the total, inside the taro block: **Tôi đã chuyển 120.000đ cho Minh**, one
  per transfer they must make, in the order of the suggestions. White on the taro, since a filled purple
  button would vanish into the block; full width under 720 px, 44 px tall. Under it, *Chuyển số khác*
  opens a step (amount read like the expense form, "= …đ", at most the amount owed, a note) for money
  sent in parts ([spec 014](../specs/014-partial-transfer-notices/spec.md)). Once told it becomes "Đã báo
  chuyển 120.000đ, chờ Minh xác nhận." and *Huỷ thông báo*; told less, "Đã báo 60.000đ, còn thiếu
  60.000đ." with *Báo thêm*, whose step shows "60.000đ + 60.000đ = 120.000đ" as it is typed; told more
  than owed now, "Đã báo 150.000đ, nhiều hơn số cần trả lúc này 120.000đ."; declined, "Minh báo chưa nhận
  được 120.000đ." and the buttons again. The note shows in quotes under the line. One line under all the
  actions says why there is one transfer to one person ("Số này đã gộp nợ của cả nhà…") and opens *Vì
  sao ra số này?*. A refusal (the numbers changed) stays in the step with what was typed. The cards in the panel keep their row and status but no button of their own, since the
  action is above, where the eye lands first; focus follows the next step after each press. Creditors and
  settled people see none.
* **Paying by VietQR** ([spec 016](../specs/016-vietqr/spec.md)). When the receiver has saved an account,
  *Mở mã QR* sits beside *Chuyển số khác*; without one, a quiet line "Minh chưa thêm tài khoản nhận tiền.";
  when a waiting notice already covers the debt, neither. The panel opens under the action as a light card:
  the code (black on white in both themes, at least 200 px), then the bank, the number, the holder's name
  "(tên Minh tự nhập)", the amount and the message, each with *Sao chép*, and "So tên người nhận trong app
  ngân hàng trước khi xác nhận.". *Mã không kèm số tiền* swaps the code for one without an amount and says
  so. After "Đã báo 100.000đ" the code is for the 20.000đ not told yet; after "Chưa nhận được" the panel
  warns first and shows the code only after *Vẫn chuyển 120.000đ*; from 500.000.000đ there is no code, only
  the details as text. On a refresh that changes the amount or the account, the code and every detail go
  and *Tải lại* brings them back. Escape and *Đóng* close it; nothing is recorded, and "Tôi đã chuyển" is
  still how the receiver is told.
* **A house with one person** ([spec 012](../specs/012-overview-and-lists/spec.md) US3). *+ Ghi khoản chi*,
  "Fair-Share có ích khi bạn cùng phòng vào nhà." and the invite card (code, link, copy) replace the month
  totals, the balances and the history, which would all be zeros. One join request waiting adds "Có 1
  người đang chờ duyệt", a link to Thành viên. With a second member the page is as above.
* **A busy house** (5 people or more, plan G2-10). In an 8-person house the page was 3.528 px long on a
  phone: seven transfer cards when only one was yours, eight month rows with the same share, eight
  balances, the history. Now what is about you stays in view and the rest of the house folds behind a
  line that sums it up: "6 lần trả khác trong nhà" under your own transfer cards; your row of the month,
  then "7 người còn lại"; your balance, then "7 người khác: 1 được nhận, 6 cần trả"; under *Ghi khoản trả
  khác*, "2 khoản trả, gần nhất: Hôm nay, 09/11". Folds start closed, and one opened stays open on this
  device for that house (localStorage, ignored when blocked). Someone in every transfer, like the owner
  who paid the rent, sees them all. A link into a folded part (Mới ghi's repayment, an explanation) opens
  it first. Native `<details>`, 44 px lines, Escape closes them. The page of a member who owes went from
  3.528 to 2.132 px at 360 px, and from 2.366 to 1.521 px at 1440 px. Houses of 2 to 4 are unchanged.
* **Identity.** Since accounts ([ACCOUNTS.md](ACCOUNTS.md)) "bạn" is the name the signed-in account
  has in the household, given by the API (`member_id`); there is nothing to choose. It powers "Bạn…"
  sentences, the default payer, and who sees **Đã nhận** on a transfer (only its receiver). Before
  accounts it was a "Bạn là ai?" chooser kept in this browser.
* **Verdict sentence**, built from the suggested transfers that involve you (names, number of people and
  the big total all come from the same rows, which are always listed below):

  | You… | Sentence (+ the total in the big number) |
  |---|---|
  | owe 1 / 2 / 3+ people | "Bạn cần trả Minh" · "Bạn cần trả Minh và Lan" · "Bạn cần trả 3 người" |
  | are owed by 1 / 2 / 3+ | "Bạn được nhận từ Minh" · "Bạn được nhận từ Minh và Lan" · "Bạn được nhận từ 3 người" |
  | are not in any transfer | "Bạn không nợ ai. Còn 2 lần trả trong nhà." (no big number) |
  | — no transfers left | "Cả nhà sạch nợ. Nhà trọ bình yên." |
  | — nobody has spent anything yet | "Chưa có khoản chi nào. Ghi khoản đầu tiên để xem ai trả ai." (a new house is not "sạch nợ", same rule as the stamp) |
  | — no identity chosen | "Còn 2 lần trả là cả nhà về 0đ" |

  Names are the display short names (§6.4, collision-aware). "được nhận từ" and not "sẽ trả": the app
  suggests transfers, nobody has promised them.
* **Đã trả** records the suggested transfer for today (existing API), slaps the stamp and shows the toast
  "Đã ghi: Bạn trả Minh 120.000đ · Hoàn tác" (*Hoàn tác* deletes that settlement).
* **Since accounts** the button is **Đã nhận**, on the receiver's card only (ACCOUNTS.md S2). The person
  who owes gets **Tôi đã chuyển** (S3), which tells the receiver and changes no balance; their card then
  says "Đã báo Minh là đã chuyển 120.000đ, chờ xác nhận" with *Huỷ báo* — since spec 012 both the action
  and that state sit under the block, and the card keeps the line alone. The receiver sees "Tiến báo đã
  chuyển 120.000đ" and *Chưa nhận được* under the text; *Đã nhận* records that told amount, and the line
  adds "· lúc này Tiến cần trả bạn 150.000đ" when it is not today's suggestion, then the note. Anyone else sees "Chưa trả" or who is waiting for whom. A
  card never says a payment is waiting for confirmation before anyone said it was sent (UI review, 03/11).
  A notice whose transfer is no longer suggested keeps a card of its own ("· hiện không còn gợi ý" for
  the receiver, "Đã báo 50.000đ · Hiện không còn gợi ý chuyển cho Minh." for the payer), and the reminder
  adds "(đã báo chuyển 120.000đ, chờ Minh xác nhận)" to a told line, or gives such a notice a line of its
  own without asking for money. Until the notices
  load, Đã nhận and Tôi đã chuyển cannot be pressed. In English the card's button takes its own row
  under 480 px. Since the design review of 05/11 the button says what it does and how much, **Xác nhận
  đã nhận 120.000đ** ("Mark 120,000 ₫ as received"): "Đã nhận" alone read like a status, not something to
  press. Told a different amount, the button carries the told one, the amount it records. The rules
  and these notes still call the action *Đã nhận*.
* **Sao chép tin nhắn nhắc nợ** copies plain text for the household's Zalo group (below); on failure the
  text is shown selectable instead. No bank account, QR or payment of any kind (PROJECT_SPEC §3.3).
  ```
  Nhà trọ Q7 ơi, còn mấy khoản cần trả nè:
  • Tiến trả Minh 120.000đ
  • Anh trả Minh 80.000đ
  Xem chi tiết: https://fair-share-web.onrender.com/households/1
  ```
* **Ghi khoản trả khác** opens the existing settlement form (different amount, cash) in place; its summary stays, so it closes again.
* The old balance table (Đã trả / Phải trả columns) becomes the "Số dư từng người" rows; *đã chi* is the
  only breakdown shown, the rest is in the expense list.
* **Vì sao ra số này?** (design review 05/11, [specs/002-balance-explanation](../specs/002-balance-explanation/spec.md)).
  A quiet underlined link under the big amount, only when your balance is not 0, and every row of Số dư
  từng người (a chevron at its end) open the same explanation in place, on a white card in the taro
  block and on `--surface-2` under a row:

  ```
  ▸ Bạn đã chi cho cả nhà                  +450.000đ
  ▾ Phần của bạn trong các khoản chi     −1.890.000đ
      Mì gói và trứng   Hôm qua · Duy Anh trả · trên tổng 100.000đ   40.000đ
      …                                   (newest first, each a link to it in Chi tiêu)
  ▸ Bạn đã trả lại                       +1.000.000đ
    Bạn đã nhận lại   Không có khoản nào           0đ
  Số dư                                    −440.000đ cần trả
  Bạn đã báo chuyển 440.000đ cho Minh, chờ xác nhận: chưa tính vào số dư.
  ```

  The four totals are the balance's own (paid, owed, sent, received), so they always add up to the
  number on the page; the items under a line show only while they add up to it, otherwise "Đang cập
  nhật…" for the moment one request refreshed before the other. A zero line does not open. Nothing
  changes from here: an expense opens Chi tiêu with that row revealed, a repayment scrolls to its row in
  Lịch sử trả tiền. Line amounts carry a sign but no colour; only the total is coloured, with its words.

**Mới ghi** ([spec 006](../specs/006-recently-added/spec.md)): a quiet strip (white surface, card edge, not
the taro block) at the top of the right column on a computer; on a phone it follows the verdict and its
transfers, so the money actions stay first. It lists the expenses and repayments another account saved
since you last pressed *Đánh dấu đã xem hết* in this browser, newest first: "Minh ghi Lẩu tối · 90.000đ",
"Minh xác nhận đã nhận 45.000đ từ bạn", each with its time ("Hôm nay, 06/11 · 14:05"). 3 lines on a computer
and 5 on a phone, so *Báo cáo tháng* stays in the first screen; *Xem thêm N mục* shows the rest in place and then reads *Thu gọn*, which folds them again (owner, 07/11). An
expense opens in Chi tiêu (revealed), a repayment scrolls to its row in Lịch sử trả tiền. Your own records,
records from before accounts, edits, deletions and "Tôi đã chuyển" notices are not in it: it is "recently
added", not an activity log. The marks are kept per account and per house in this browser only (two, one
for expenses and one for repayments, since they refresh on different schedules); a first visit shows the
last 7 days. No strip while any list is loading or failed, and none when there is nothing new.

**Đến ngày ghi** ([spec 007](../specs/007-recurring-expenses/spec.md)): a quiet card under the transfers in the
left column (after them on a phone), so the right column and *Báo cáo tháng* do not move. One line per
recurring expense whose day has come and that nobody recorded this month: "Internet · 300.000đ · Minh trả
· ngày 5", or "nhập số tiền tháng này" for one whose amount varies, with *Ghi tháng này* (44 px). 3 lines, then
*Xem tất cả (n)*. *Ghi tháng này* opens Chi tiêu with the add form filled and "Đang ghi kỳ 11/2026" above it;
a person presses Lưu. No card when nothing is due or while the lists load.

### 6.3 Chi tiêu `/households/:id/expenses`

```
Ghi khoản chi                        Xem các khoản chi   ← jump link, phones only
┌ one white surface ───────────────┐
│ ✦ Gõ nhanh bằng AI                │
│ [ lẩu 240k Minh trả…   ] [Điền giúp] │ ← one auto-growing line, 300 chars
│ AI điền form bên dưới…             │
├──────── hairline ─────────────────┤    (UI review 03/11: no ink ring, one surface)
Nội dung      [ Tiền điện tháng 10      ]
Số tiền       [ 240k                    ]  = 240.000đ
Ai trả?       ((T) Tiến (bạn)) ((M) Minh) ((A) Anh) ((L) Lan)
Ngày          Hôm nay, 21/10 ·······  Đổi
Danh mục      Điện, nước, mạng ·····  Đổi   ← guessed from Nội dung (spec 005)
Cách chia     Chia đều cả nhà (4 người)  Sửa
[ Lưu khoản chi ]                          ← sticky to the bottom of the screen
Các khoản chi                 chạm để sửa hoặc xoá
Hôm qua, 20/10
 (T) Tiền điện tháng 10            450.000đ
     Tiến trả · chia đều 4 người
```
* **Defaults:** payer = you (else the last payer saved on this device, else nobody: the form asks rather than
  guess); every new expense starts from that default again; date = today; split = equal
  between everyone. The 90% case needs only *Nội dung*, *Số tiền* and *Lưu*.
* **Lặp lại hằng tháng** ([spec 007](../specs/007-recurring-expenses/spec.md)): a tick before Lưu when
  adding (not when editing or recording a due item), with "Nhắc ngày 5 mỗi tháng · không tự ghi tiền";
  once ticked, "Số tiền thay đổi mỗi tháng". Only an equal split recurs: choosing *Tự chia* (by hand or by
  an AI fill) unticks the box and locks it, with "Khoản định kỳ chỉ chia đều được." under it; back on
  *Chia đều* it is free again but stays unticked, and *Hoàn tác điền* gives back what was ticked before the
  fill ([spec 011](../specs/011-first-impressions/spec.md)). Filled
  from a due item, people no longer in the house are left out and named. A second expense of the same
  item in one month is refused: "Kỳ 11/2026 của Tiền nhà đã có người ghi", with *Xem khoản đã ghi*.
  Under the form, a folded *Khoản định kỳ (n)* lists each item, its day and this month (đã ghi, đến ngày ghi,
  chưa tới ngày), with *Ngừng lặp* for its creator or the owner (asks first; what was recorded stays).
* **Danh mục** ([spec 005](../specs/005-expense-categories/spec.md)): seven fixed categories (Ăn uống, Đi
  chợ, Điện, nước, mạng, Tiền nhà, Đi lại, Đồ dùng, Khác). The row follows Nội dung with no press: "Tiền
  điện" reads Điện, nước, mạng, "Lẩu" Ăn uống, words typed without accents too, and *Khác* when nothing
  matches; an AI fill sets Nội dung, so the guess follows it. *Đổi* opens the seven as chips (44 px,
  the chosen one with a ✓); one press picks and closes, and from then on Nội dung no longer moves it.
  Editing keeps the stored category. Each row in the list ends with it ("chia đều 3 người · Ăn uống"),
  the filters gain *Danh mục*, and the CSV a column.
* **Errors** appear under the field (`aria-invalid`, `aria-describedby`) and the first invalid field gets
  focus, scrolled into view (a share that does not add up focuses the first share). Since
  [spec 011](../specs/011-first-impressions/spec.md) the reason also shows in the sticky save area, right
  above *Lưu khoản chi*, so it is seen with the keyboard open: "Chưa lưu được: Tổng các phần phải bằng đúng
  số tiền của khoản chi." The server's refusal goes there too, and focuses the field it is about when it
  names one. After a failed save each edit checks again, so the line goes as soon as the problem is fixed.
* **Large amounts:** above 50.000.000đ, *Lưu* first swaps the buttons for "Số tiền 120.000.000đ lớn bất
  thường. Lưu thật nhé?" with *Sửa lại* (focused) and *Lưu thật*, in the same sticky area, not a pop-up.
  The answer holds for that amount only; changing it asks again, and editing an expense without changing
  its saved amount does not ask. Both buttons carry the question for screen readers. Escape is *Sửa lại*, and Enter held over
  from the form never presses *Lưu thật*. Above 1.000.000.000.000đ the amount is refused: "Một khoản chi
  tối đa 1.000.000.000.000đ."
* **Tự chia starts at the equal split:** the first switch to *Tự chia* fills each share with what Chia
  đều would give; without a total yet it waits until the person
  leaves *Số tiền* with one, never on each digit. It runs once per expense and never over a share
  already typed. Each share shows its value under it, "= 120.000đ", like *Số tiền*.
* **Expense rows** are `<details>`: tap a row to reveal *Sửa* and *Xoá* (44 px). Deleting still asks
  first. AI-made expenses carry the `✦ AI` chip. Since the design review of 05/11 every row opens, first
  to who shares it and how much each (a share of 0đ is not listed), then *Sửa* / *Xoá* for the rows you
  may change; "chia riêng 2 người" did not say whether you were in it. The hint says "chạm để xem phần
  từng người, sửa hoặc xoá".
* **Two lines at most** (spec 012, US5): in the phone rows and the laptop table a description longer
  than two lines is cut with an ellipsis, and the line under it ("Tiến trả · …") to two lines too. The
  whole description stays in its `title` and in the DOM for screen readers. A cut one offers *Xem đủ*
  under it (44 px); pressing it shows that row's whole text and the button reads *Thu gọn*. A short one
  offers nothing.
* **The month filter stays honest** (spec 012, FR-014): a month with no expenses stays chosen, from a
  monthly report, from the select, or after its last expense is deleted. It stays an option in the
  select, and the list area says "Tháng {m}/{yyyy} chưa có khoản chi nào." with *Bỏ lọc*; the filters
  above show a single clear action for that state.
* **Composer states (T-19, owner Duy Anh):**

  | State | What shows |
  |---|---|
  | Idle | Textarea + "Điền giúp" (AI button) + hint "AI điền form bên dưới, bạn duyệt rồi mới lưu." |
  | Reading | Full-width yellow progress bar, "AI đang đọc… 6 giây · thường dưới 10 giây", link **Nhập tay** (stops waiting, focuses *Nội dung*). The form stays editable |
  | Filled | Mint note "Đã điền: Lẩu · 240.000đ · Minh trả · chia đều 4 người.", fields that were filled flash yellow once; **only fields the user has not touched are filled** ("Giữ nguyên số tiền bạn đã nhập."); button **Hoàn tác điền** restores the form |
  | Warnings | Pink note per API warning. `unknown_member` (payer **or** a participant): "“Hùng” không có trong nhà. Kiểm tra người trả và người cùng chia bên dưới." · `no_payer`: "Chọn người trả." · `no_amount`: "Nhập số tiền." · `participants_assumed`: shown beside the split fold, "AI chia cho cả nhà, bạn kiểm tra lại." |
  | Failed | The typed sentence is always kept and the form stays usable; the note depends on the code (wording in `lib/errors.ts`): `ai_unavailable` (503) → "AI đang bận…" + **Thử lại** · `ai_rate_limited` (429) → "…đợi một phút rồi thử lại" + **Thử lại** · `ai_unparseable` / `too_many_participants` (422) → fix the sentence or use the form, **Thử lại** after an edit |
  | Not set up | Known up front since [spec 011](../specs/011-first-impressions/spec.md): `/api/version` says `"ai": false`, and the box gives way to one line, "Gõ nhanh bằng AI chưa được bật trên máy chủ này."; a sentence typed before that answer stays under it, as selectable text with "Nhập các thông tin trong câu vào biểu mẫu bên dưới." Until the answer comes (a sleeping server, or the question failed) the box works as before, and `ai_not_configured` (503) still says "Gõ nhanh chưa được bật. Bạn nhập thông tin bên dưới nhé." with **Điền giúp** disabled until the page is reloaded; no **Thử lại**. A busy or rate-limited AI is never mistaken for this: only the explicit answer hides the box |
  | One at a time | While AI reads, Enter, **Điền giúp** and **Thử lại** send nothing more, and after **Nhập tay** a new Enter waits until the earlier call has ended (each call spends the house's shared daily quota) |
  | Named amounts | ([specs/009-ai-custom-split](../specs/009-ai-custom-split/spec.md)) "lẩu 500k Tiến trả, Minh 200k, Lan 100k": the mint note says "tự chia 3 người", *Cách chia* opens on **Tự chia** with the amounts, and a line under it says who took the rest, "Còn lại 200.000đ tính cho Tiến (người trả)." The split is applied only while it still holds: when the total or payer already in the form differ, or the user had set the split, it is left alone with a pink line "Số tiền hoặc người trả trong form khác câu vừa gõ…". Picking another payer after such a fill (when the rest went to the payer) drops the "Còn lại…" line and blocks **Lưu** with "Người trả vừa đổi, nên phần còn lại không còn tính đúng người…" until the split is set again |
  | Split blocked | Named amounts that cannot be placed (over the total, a name not in the house or meaning several people, one person given two amounts, nobody to take the rest, no total, fractions, several payers): **Tự chia** opens with the amounts as read, the reason shows once, as a pink line under *Cách chia* (not again in the composer), e.g. "Các phần đã nêu cộng lại 600.000đ, hơn tổng 500.000đ. Sửa lại cách chia rồi mới lưu được." **Lưu** is refused with that reason until the user changes the split itself; changing only the total or the payer does not lift it, and **Hoàn tác** does |

### 6.4 Thành viên `/households/:id/members`

Order on a phone (UI review 03/11): someone asking to join first (the owner's next task), then the list
titled "Thành viên · 3", then the invite card. A list, not a card grid (it scales to 6 long names). Each
row: large avatar, **full name**, "gọi là *Anh*" (left out when it is the whole name), the signed amount
with *cần trả* / *được nhận* as on Tổng quan (no coloured pill) or SẠCH NỢ, the *bạn* chip for you, their stated gender as a small muted word after the name (nothing for Không nêu), the person's status
under the name if they set one (muted, one line with an ellipsis, the whole text in its title; plain text), and two 44 px
buttons under the name, *Đổi tên* (opens the field in place) and *Xoá* (asks first). One tap fewer than a *Sửa* menu,
and both still fit at 360 px with long names. Removing someone who is in an expense shows a note under that row (API `member_in_use`). The add
field's hint: "App gọi mỗi người bằng tên cuối: Hương, Minh, Lan…". A last word that reads as a pronoun
(Anh, Em, Chị, Bạn, Cô, Chú…) keeps the word before it, so "Nguyễn Duy Anh" is "Duy Anh", never "Anh trả
Minh" (design review 05/11). If two members share a last word, both are shown by their last two words
("Duy Anh", "Tuấn Anh"); if those still match, by the full name.

Above the add field, **Mời bạn cùng phòng** (#132): the hint "Ai có link này đều xem và sửa được
nhà, nên chỉ gửi cho người trong nhà." and *Sao chép link mời* (toast "Đã sao chép link mời.
Gửi vào nhóm chat của nhà nhé."). Where the clipboard is blocked, the link is shown in a read-only field,
selected, to copy by hand. The Tổng quan reminder ends with the same link.

For the owner, a fold *Đổi tên nhà* under the invite: the name (1–60 characters, like a new house) and
*Lưu tên nhà*; the header and Nhà của bạn follow (owner, 07/11: the API could rename, the page could not).

### 6.5 States on every screen

Loading: skeleton rows in `--surface-2` (no spinners over 300 ms). Empty: one sentence that says what to
do next, with the action. Error: a note with the message from `lib/errors.ts` and *Thử lại*; nothing
already typed is lost.

Slow: the free server sleeps after about 15 minutes and takes about 50 s to wake. While any request has
waited more than 5 s, a band above the page, signed in or not, says "Phản hồi đang lâu hơn bình thường. Máy
chủ có thể đang khởi động, thường mất khoảng 1 phút. Bạn không cần tải lại trang." It sits in the page flow
(`--surface-2`, 44 px), covers nothing, and goes by itself once no request has waited that long; a
failure then shows the usual error. Quick add's AI call is left out: it usually takes 7 to 9 s and has
its own "AI đang đọc… n giây". Screen readers hear it once per episode: shown again within 10 s of
hiding, or kept while moving between pages, it is not read again ([spec 011](../specs/011-first-impressions/spec.md)).
A repeating item whose *Ngừng lặp* did not go through says so under it: "Chưa xác nhận được là đã ngừng
lặp." with the reason; each item has its own wait.

### 6.6 On a computer (1024 px and wider)

The phone layout above is the design; a computer gets its own arrangement of the same parts, not a
phone column in the middle of a wide screen. Below 1024 px nothing changes. Where a computer changes
what is shown or its order, the page asks `lib/useWide.ts` instead of moving things with CSS, so the
keyboard goes through the page in the order it is seen.

* **Frame:** 32 px sides (40 px from 1440), and the content (header included) stops growing at 1520 px,
  centred. The whole screen was the owner's choice on 04/11; the design review of 05/11 measured a name
  and its amount a thousand pixels apart at 1920 px, so the owner capped it at 1320 px; using the app
  with three months of data on 06/11, the owner found the 300 px of bare page on each side at 1920 too
  wide, so the cap moved to 1520 (200 px at 1920, 40 px at 1536, 1366 unchanged) and the rows are
  bounded instead (Tổng quan below). Signed in, every page is shown at 110 % on a computer (header
  included; the sign-in block and phones at 100 %): the owner found it read best on a laptop, from
  100 % / 110 % captures on 07/11. The zoom shrinks the room a laptop has (1366 px reads like 1242), so
  the expense table keeps all its columns only from 1408 px (1280 × 1.1). Up to that cap the columns
  keep their 1280 proportions, with a floor so the verdict and the form never get narrower than at 1280. The header keeps the
  wordmark and the account; under it, one row for the household: its name and avatars on the left, the
  three tabs on the right as the same segmented control. No sidebar: three tabs do not pay for 270 px.
  Above that row, on every screen size, *‹ Nhà của bạn* leads back to the list, and for an account in
  more than one house *Nhà khác* opens a short list of the others (design review 05/11: only the
  wordmark led out, and changing house took two pages).
  Nothing is sticky, so nothing covers a focused field on a short laptop screen.
* **Tổng quan:** two columns (equal at 1024, `minmax(480px, 2fr) 3fr` from 1280). Left: the verdict block,
  *+ Ghi khoản chi*, then Lịch sử trả tiền. Right: this month, Số dư từng người, then **Khoản chi gần đây**, the last five
  expenses with *Xem tất cả*, so the balances can be explained without leaving the page. From 1280 the
  right column's panels span it, but each line inside them (Mới ghi, this month, Số dư, Khoản chi gần
  đây) is at most 640 px wide and centred, so a name and its amount are never more than 640 px apart
  (variant A, chosen by the owner on 06/11 from before/after captures over lines that span the panel).
  *Báo cáo tháng* sits on the month title's line, under it when the line is too short. The repeated
  action on each transfer card (*Xác nhận đã nhận …đ*) is the outlined secondary button at every width:
  four filled purple buttons under the verdict competed with it, so only *+ Ghi khoản chi* and the
  verdict block stay filled. Since spec 012 the payer's *Tôi đã chuyển* is not one of them: it is the
  one white primary inside the block, where the person who owes needs it.
* **Chi tiêu:** the AI box and the form on the left (360 px; 380–420 px from 1280, the table taking the rest), the list on the right as
  a **table**: Ngày, Nội dung, Người trả (with the split under the name), Số tiền right-aligned, and
  *Sửa* / *Xoá* on each row the user may change. The row being edited is tinted. Between 1024 and 1407 px
  the date and the payer fold under the description instead of squeezing it. The description is a
  button with the row chevron: it opens a tinted row under it with each share (the description and not
  the split under the payer, which that 1024–1407 fold hides). The list hint says "mới nhất ở trên". *Lưu khoản chi* sits at the end of the form, not stuck to the
  bottom of the screen. From 1280 the three filters (Tháng, Người trả, Danh mục) share one row, the payer
  column is about 250 px and its split line may wrap, so a description like "Xăng đi chợ đầu mối" keeps
  one line (06/11: kept on one line, the split line pushed the payer column wide and broke descriptions).
* **Thành viên:** the people get the wide column on the left; on the right (320 px; `2fr minmax(360px, 1fr)` from 1280)
  a request to approve comes before the invite.
* **Nhà của bạn:** a new account sees the start of §6.1 (two panels, at most 960 px). Otherwise the
  house rows take the page's width, with the wait below them; from 1280 px the *Thêm nhà* panel moves to
  a column on the right, `minmax(0, 1fr) minmax(320px, 360px)` (it was 3 : 2 until spec 017), so the list
  and the ways in are never far apart. Below 1280 px the panel comes under the list and the wait.
* **Sign in:** one block of at most 980 px in the middle of the screen, both ways, and no header (the
  owner on 06/11: a small card under a lone corner logo looked unfinished). On the left, holding no
  control: the wordmark at 300 px, the tagline (*Rõ ai trả ai.*), the intro that the form shows on a phone,
  and four overlapping 56 px sticker avatars, decoration hidden from screen readers. On the right the
  same 440 px form, then the language and theme 16 px under it, so Tab goes form, language, theme. No
  taro background, no sample amount, no speed claim, no stamp: the form's submit stays the strongest
  colour. `useWide` decides it, so a phone gets exactly the form of §6.1. Taller than the screen (Tạo tài
  khoản with errors), the page scrolls. After a sign-in review on 07/11: the block sits 5 % of the height
  above the middle (the optical centre; the exact middle read as low); the form's title is 24 px so it
  keeps one line under the tagline; the two tabs are as wide as the fields; the stickers carry a line,
  *Một nhà, nhiều người. Chi tiêu vẫn rõ ràng.*; the intro is one sentence; and the language and theme
  lose their track, in smaller muted words with the chosen one on a light pill, still 44 px to press.
  On every screen size the password field has *Hiện* / *Ẩn* inside it. No *Quên mật khẩu?* while the app
  has no reset (it would be a dead link), and the title keeps saying what the form does.
* Hover tints rows and inactive tabs with `--surface-2`; the focus ring stays on top of it.

### 6.7 UI review of 03/11: what changed and why

A review of every screen against the jobs in §1 led to these changes; the brand (wordmark, taro,
yellow coin, sticker avatars, stamps) and the three tabs stayed.

* **Logging an expense comes first.** *+ Ghi khoản chi* moved above the verdict: it used to sit under
  every transfer, further down the more debts there were. It stays filled but flat, so the taro block is
  still the one loud place; buttons repeated on every transfer card are flat too.
* **Your business first, in the order you read it.** Transfers involving you come before the rest (a
  stable split, so a card never moves while you press it). Each card reads amount → where it stands →
  what you can do, in both languages. A payer's next step, *Tôi đã chuyển … cho …*, is the button under
  the big amount (spec 012), whose figure does not change until the receiver confirms.
* **Two time scopes, said apart.** "Tháng 11 · cả nhà đã chi" left the verdict for the balances section,
  whose note says the balances run from the start. The design review of 05/11 found it still read as one
  number with the balances ("cả nhà đã chi 790.000đ" right above "Minh đã chi 4.740.000đ"), so this month
  is now its own section (the Tổng tháng block of Chi tiêu: who paid what and each share), the balance
  note says "tính từ đầu tới hôm nay" and a row says *tổng đã chi*.
* **One surface to add an expense.** The AI line (kept visible: it is the quick way and the demo) and the
  fields it fills share one white card, no ink ring; *Xem các khoản chi* jumps to the list on phones.
  Rows that open to Sửa/Xoá show a drawn chevron.
* **Rhythm.** 28 px between sections on a phone (32 px on a computer), 8 px from a title to its content,
  house name 22 px on a phone.
* **First use.** Joining with a code leads and *+ Tạo nhà mới* waits folded; the sign-in title follows
  the tab (Đăng nhập / Tạo tài khoản mới).
* **Not done, on purpose:** a bottom tab bar with a centre "+" (it duplicates Chi tiêu and fights the
  sticky Lưu, the toast and the keyboard), collapsing the AI line, a new palette.

### 6.8 Flow review of 04/11

Two new housemates were walked through every journey on a 390 px phone (sign up, create, invite,
approve, expenses, Tôi đã chuyển, Đã nhận, undo, sign out, errors). What changed:

* **Saving says so.** "Đã lưu: Tiền điện 450.000đ · Xem" after adding or editing an expense; *Xem*
  lifts a filter hiding it, scrolls to its row and tints it for a moment. The next expense is dated
  today again. A row you may not change is a plain row (it does not open to an empty menu).
* **Money is said done when it is done.** While *Đã nhận* is being recorded the verdict still counts
  that transfer; undoing from the card also removes its "Đã ghi … Hoàn tác" toast.
* **What waits for you** shows as a count on the tab (pink, dark figures): requests to approve on
  Thành viên for the owner, a "Tôi đã chuyển" to confirm on Tổng quan. Open pages refresh every 30 s
  (PROJECT_SPEC §3.3, 04/11).
* **Joining.** The request waiting for approval is one card with *Kiểm tra lại* and *Huỷ yêu cầu*; the
  tips for people who invite others are not shown to someone waiting. On a phone that can share, the
  invite card leads with *Gửi link mời* (the share sheet: Zalo, Messenger); copying the link, then the
  code, follow.
* **Copy.** Amount examples are "VD: 240000" (the field opens the number pad, which has no "k"); the
  split reads "Chia đều cả nhà · 3 người" and never breaks between the number and "người"; an empty
  history says "Chưa có khoản trả nào được ghi nhận." AI quick add clears only the messages of the fields
  it filled.
* **Wide screens (from 1280 px).** Balances read across (who, đã chi, số dư); a member row has its name,
  its money and its actions in three regions; the expense filters keep a sensible width; Nhà của bạn has
  the house rows on the left and the *Thêm nhà* panel (about 360 px since spec 017) on the right; the verdict block gets a little more padding (the
  amount stays 44 px).

### 6.9 Báo cáo tháng `/households/:id/report/:month`

One month, read only ([specs/004-monthly-report](../specs/004-monthly-report/spec.md)). Opened from the
*Báo cáo tháng* link under the "Tháng …" block on Tổng quan, on the current month; the Tổng quan tab stays
marked. The heading names the month ("Báo cáo tháng 11/2026"), with *‹ Tháng 10/2026* and *Tháng 12/2026 ›*
beside it (44 px, left out at either end of the house's history), then "Cả nhà chi 790.000đ".

For each housemate six figures that read left to right: *Đầu tháng*, *Đã chi*, *Phần*, *Đã trả lại*,
*Nhận lại*, *Cuối tháng*. The first and last are balances (+ / − in the money colours, as in Số dư từng
người), the four in between plain amounts. On a computer a table with a *Cả nhà* total row (starts and
ends 0, Đã chi = Phần = the month's total); below 1024 px one card per housemate, the six figures as a
two-column list with *Cuối tháng* last and bold. Your row or card is tinted and has the *bạn* chip. A line
under the figures spells the rule: "Đầu tháng + đã chi − phần + đã trả lại − nhận lại = cuối tháng.",
then *Xem các khoản chi tháng này*, which opens Chi tiêu filtered to that month.

The figures come from the expenses and repayments the app already loads, cut by their dates; nothing is
reset, closed or stored. The last month must end exactly on the balances Tổng quan shows; while a refresh
leaves them one step apart the page says "Đang cập nhật…" instead of a number that disagrees. An empty
month says "Tháng này không có khoản chi hay khoản trả nào."; a month followed by later-dated items says
why its end is not yet the balance on Tổng quan. "Tôi đã chuyển" notices change no figure.

Under the rule line, **Chi theo danh mục** (spec 005): one line per category spent on that month, biggest
first, each "Tiền nhà · bar · 4.500.000đ · 80%". The amounts add up to *Cả nhà chi*; the percentages are
whole numbers that add up to 100 (largest remainder), and a category under 1% reads "<1%". The bar, in
taro on `--surface-2` and scaled to the biggest category, only decorates: the line's words carry every
value and screen readers skip the bar. A line opens Chi tiêu filtered to that month and category. No
chart for an empty month.

### 6.10 Hồ sơ của bạn `/account`

Opened from *Hồ sơ của bạn* in the account menu ([specs/010-profile-page](../specs/010-profile-page/spec.md),
laid out by [spec 017](../specs/017-houses-profile-redesign/spec.md)). The link is marked current there and
puts the keyboard on the h1; *‹ Nhà của bạn* above the h1 leads back. From 1024 px two areas, at most
1120 px: on the left (320 px) a card **Bạn cùng nhà thấy bạn thế này**, on the right one panel of parts split
by `--line`; below 1024 px the card, then the parts, one under the other. Same order either way (photo and
identity, name, status, receiving account, password, gender), so the keyboard follows the eye. No in-page
menu, nothing sticky; *Đăng xuất* stays in the account menu. The tab reads "Hồ sơ của bạn · Fair-Share".

Each part is its own form with its own button, so an error in one never loses what was typed in another.
Every button says what it saves (*Lưu ảnh*, *Lưu tên*, *Lưu trạng thái*, *Lưu tài khoản*, *Đổi mật khẩu*,
*Lưu giới tính*) and is never disabled: while saving it reads *Đang lưu…* with `aria-disabled` and keeps the
focus. A save is secondary while its part has nothing unsaved; typed and not saved, it turns filled and a small
yellow *Chưa lưu* sits beside it as part of its description, so the page has one loud save at most;
after a save each field takes what the server kept (NFC), so the mark goes. When a control replaces itself
(*Chọn ảnh*, *Huỷ*, *Xoá trạng thái*, the receiving account's *Thêm tài khoản*, *Sửa*, *Huỷ*, *Lưu tài
khoản*, *Xoá*), the focus goes to what appears in the same part, never to the page.

* **The card**: a quiet `--surface-2` band with the avatar sticker (96 px, photo or initial on the person's
  tint) over its edge, then saved values only (the one exception: a picked photo shows as its preview until
  *Lưu ảnh* or *Huỷ*): the name, the status or "Chưa có trạng thái", the receiving
  account as housemates see it ("Có tài khoản nhận tiền · Timo •••• 3019"), the email read only with
  "Email là tên tài khoản, không đổi được.", and *Chọn ảnh* / *Đổi ảnh* (secondary) with *Gỡ ảnh* (quiet). A
  picked photo is shown as it will be saved (the centre square, upright) with *Lưu ảnh*, the card's one
  filled button, and *Huỷ*. A picture the browser cannot open: "Chưa đọc được ảnh này. Chọn ảnh JPEG, PNG
  hoặc WebP nhé."
* **Tên của bạn**: the display name and *Lưu tên* on one line where they fit, with "Đổi ở đây là đổi tên của
  bạn ở mọi nhà đang ở."; saving the same name again brings back a household the owner renamed. The answer
  is "Đã đổi tên ở mọi nhà." in a green note, or one line per household that kept the old name: "Ở Nhà B đã
  có người tên Lan, nên ở đó bạn vẫn là Tiến." The account button in the header follows at once.
* **Trạng thái**: one line and *Lưu trạng thái*, placeholder "VD: đang ăn kiêng 🥗"; the hint counts "10/60
  ký tự" (an emoji is one) and stays when there is a problem, which comes under it; *Xoá trạng thái* (quiet)
  when one is set.
* **Mật khẩu**: current and new password side by side once they fit, the new one with its 8–128 hint; both
  fields empty after any answer. A wrong current password is said under its field; too many tries reads like
  sign-in ("Bạn thử quá nhiều lần…"); success: "Đã đổi mật khẩu. Các nơi khác đã đăng xuất."

Field problems sit under their field (`field-problem`, `aria-describedby` with the hint); answers are in a
polite live region.

* **Tài khoản nhận tiền** ([spec 016](../specs/016-vietqr/spec.md)), after *Trạng thái*: a bank from the
  VietQR list, the account number (numeric keyboard), the holder's name with "Sẽ hiện: NGUYEN VAN MINH" as
  typed, and before *Lưu* the line "Chỉ bạn cùng nhà đang cần trả bạn mới thấy đầy đủ số tài khoản và tên.
  Những người khác trong nhà thấy ngân hàng và 4 số cuối.". Saved, it reads as three labelled values
  (*Ngân hàng hoặc ví*, *Số tài khoản*, *Tên chủ tài khoản*), side by side once they fit, with *Sửa* and
  *Xoá* (asked first). On Thành viên, housemates see "Có tài khoản nhận tiền ·
  Vietcombank •••• 6789" under the name, never more.
* **Giới tính** (last): the notice first, "Không bắt buộc. Dùng để cho bạn cùng nhà biết giới tính của bạn;
  bạn cùng nhà hiện tại và sau này đều thấy. Giữ tới khi bạn đổi hoặc bỏ. Chọn Không nêu là xoá hẳn.", then
  four real radios drawn as 44 px pills, the radio itself kept as the mark, *Không nêu* (checked by
  default), *Nam*, *Nữ*, *Khác*, and *Lưu giới tính*. Nobody is asked
  for a gender anywhere else.

## 7. Copy

| Use | Not |
|---|---|
| cần trả · được nhận · sạch nợ | đang nợ · nợ nần |
| Đã trả (button) → "Đã ghi: …" (toast) | Ghi nhận khoản này · Đã chuyển khoản |
| Ghi khoản chi · Lưu khoản chi | Thêm khoản chi mới · Submit |
| Số dư từng người | Ai nợ ai (for the per-person table) |
| Tin nhắn nhắc nợ | Đòi nợ |
| Đăng xuất (in the account menu) | Không phải bạn? (before accounts) |
| Trưởng nhóm | Chủ nhà (means the landlord in a nhà trọ) |
| Tôi đã chuyển · Chưa nhận được | Đã chuyển khoản (as if it were already recorded) |
| Đã báo {told}, còn thiếu {rest} · Báo thêm · Chuyển số khác · Nhận số khác | Thanh toán một phần · Đã trả một phần (nothing is recorded until the receiver confirms) |
| đã chi (what someone paid for the house's expenses) · đã trả / đã nhận lại (money paid back between housemates) | đã trả for an expense |
| Minh cần trả Lan (a suggestion) · Minh đã trả Lan (recorded) | Minh trả Lan (reads as already done) |
| Lưu khoản chi · Lưu khoản trả (the save buttons) | Ghi nhận khoản này (no object; "ghi nhận" may still explain something) |
| Chưa ghi khoản trả (nothing recorded) | Chưa trả (the app cannot know what happened outside it) |
| Nhập tên nhà. / Nhập tên của bạn. (an empty field) | Tên nhà phải từ 1 đến 60 ký tự. (a length rule for an empty field) |
| Hiện trên Tổng quan từ ngày {day} hằng tháng · không tự lưu khoản chi | Nhắc ngày {day}… (the app cannot remind anyone) |
| Số liệu đang tải lại, bạn xem lại khi số mới hiện ra | Trang đã cập nhật (the page may not have finished loading) |
| Đến ngày ghi · Ngừng lặp (recurring reminders) | Tới hạn (reads as a payment deadline) |
| Chưa lưu được: … (a refused save) · Sửa lại · Lưu thật (the large-amount question) | Lỗi! · Xác nhận / OK |
| Máy chủ có thể đang khởi động (it may be; the app cannot know) · Chưa xác nhận được là đã ngừng lặp (the answer was lost, not a refusal) | Máy chủ đang khởi động · Ngừng lặp thất bại |
| Bỏ quyền vào nhà (keeps the name and its records) · Xoá (removes a name nobody uses) | using one for the other |
| link mời · nhập thông tin bên dưới · Huỷ / Xoá / khoá | đường dẫn mời · form / biểu mẫu in everyday hints · Hủy / Xóa (mixed) |

Say only what the data or the algorithm guarantees: *tháng này*, *đến hôm nay*, *ngay*, *ít nhất* or a
duration only when it is true or measured (the reminder lists what is open now, not one month; the AI hint
says "thường dưới 10 giây" because the live server measured 7.2–8.8 s). A button names an action
(*Đánh dấu đã xem hết*), a status names a result (*Đã ghi: …*). The app speaks to the person as *bạn*; *tôi*
only where a button speaks for them (*Tôi đã chuyển*). The whole Vietnamese text was reviewed on 07/11 and
these rules came out of it.

Numbers: `240.000đ` (dot thousands, no space, *đ*). Dates: "Hôm nay", "Hôm qua", "Thứ bảy, 18/10", full
`18/10/2026` only in history older than this year.

### 7.1 English and Vietnamese

The app speaks **Vietnamese by default**; **EN / VI** switches the whole page and is remembered on the
device, like the theme. The default follows the browser: a first visit is English only when the browser's
first language starts with `en`, and any saved choice wins. Both switches live in the account menu, so the header is one line on a phone
(the wordmark and the account); signed out they sit under the sign-in form (UI review, 03/11). Every word lives in `frontend/src/i18n/` (`en.tsx`, `vi.tsx`,
the same keys, checked by TypeScript); components take them from `useT()`, plain functions from
`messages()`. The Vietnamese above is unchanged. The English terms were agreed in a translation review:

| Vietnamese | English | Why |
|---|---|---|
| nhà | **group** (Your groups, New group) | Short and right for a group opened by an invite link; "household" sounds formal, "home" is the start page |
| khoản chi · khoản trả · số dư | **expense · repayment · balance** | "Repayment" keeps paying someone back apart from paying for an expense |
| cần trả · được nhận · sạch nợ | **owes · gets back · SETTLED** | |
| Đã trả (button) · ĐÃ TRẢ (stamp) | **Mark as paid · PAID** | The button records money already paid outside the app |
| Bạn cần trả Minh · Minh cần trả Lan (suggestions) | **You owe Minh · Minh owes Lan** | A suggestion must never read as already done |
| Minh đã trả Lan (history) | **Minh paid Lan** | |
| Gõ nhanh bằng AI · Điền giúp · Nhập tay · Hoàn tác | **Quick add with AI · Fill form · Enter manually · Undo autofill** | |
| link mời · Mời bạn cùng phòng | **invite link · Invite housemates** | "Roommates" can mean one bedroom |
| Bỏ khỏi danh sách | **Remove from list** | Nothing is deleted; the hint says so |
| App gọi mỗi người bằng tên cuối | **The app uses the last word of each name** | "Last name" would mean the family name |
| Rõ ai trả ai. | **See who owes who.** | |

English rules: sentence case for headings, tabs and buttons (only the stamps are upper case); "you" for
the person, "your" for things; counts agree ("1 repayment", "2 repayments"; "Minh owes", "Minh and Lan
owe"). Numbers: `240,000 ₫` (comma thousands, a no-break space, ₫). Dates: "Today, 30 Oct",
"Yesterday, 29 Oct", "Saturday, 18 Oct", `18 Oct 2025` for another year. Names keep their Vietnamese
spelling in both languages. A label that is longer in English is shortened rather than allowed to
overflow: at 320 px the split fold reads "Split · Equally · Custom amounts".

## 8. Accessibility checklist

Checked on 22/10/2026. Items marked *(test)* are asserted by `frontend/e2e/a11y.spec.ts`, which runs on the
live site after every deploy (`.github/workflows/e2e.yml`); the others say how they were checked.

- [x] Every text pair ≥ 4.5:1 in both themes (table in §3); focus ring: 2 px ink + 5 px yellow halo.
      *42 text pairs recomputed with the WCAG formula in the #101 review, none under 4.5:1; the focus
      ring measured as a 2 px outline + 5 px yellow shadow (test).*
- [x] Every control ≥ 44 × 44 px; inputs 16 px. *Playwright sweep of the four screens at 320 / 360 /
      640 px in #110: no button, link or summary under 44 px; inputs and selects 16 px (test).*
- [x] Money never relies on colour alone (sign or word). *"được nhận" / "cần trả" / "SẠCH NỢ" next to
      every amount, a real minus sign (`Money`, `BalanceRows`).*
- [x] Headings in order: house name `h1`, sections `h2` *(test: one h1, first, no skipped level).*
- [x] Toasts and AI status in `aria-live="polite"`; the stamp has a text equivalent (the toast and the
      history row). *(test: the toast region is polite, says "Đã ghi: …", and ĐÃ TRẢ is text on the card;
      the Quick add status is a polite region in `AiComposer`.)*
- [x] Usable at 360 px and at 200% zoom; no horizontal scroll. *Sweep in #110 at 320 / 360 / 640 px
      (640 = 1280 px at 200 %), light and dark, with long names and 12.500.000đ: no overflow.*
- [x] `prefers-reduced-motion`: stamp, progress bar and toast appear without movement *(test: nothing
      animates or transitions after Đã trả).*
- [x] Keyboard: every action reachable, Enter submits, Escape closes an open fold or chooser *(test: the
      chooser, both form folds, "+ Tạo nhà mới" and "Ghi khoản trả khác" close on Escape and return the
      focus; Enter saves an expense). The folds did not close on Escape before 22/10; fixed with `lib/fold.ts`.*

## 9. Implementation plan

| Issue | Scope | Owner → reviewer | Due |
|---|---|---|---|
| **T-41** | This document; tokens agreed; contrast table | Việt Tiến → Duy Anh | Thu 22/10 |
| **T-42** | `styles/tokens.css`, fonts, base CSS, `Avatar`, `Money`, chips, buttons, segmented, toast, `lib/names.ts` (short name, initial, tint), identity hook; Danh sách nhà and Thành viên screens; household frame | Việt Tiến → Duy Anh | **Sat 24/10** |
| **T-19** | Composer on the T-42 components, states in §6.3, **and the form's AI-fill interface** (below) | Duy Anh → Việt Tiến | fill interface and composer in #104 (22/10) |
| **T-43** | Tổng quan (verdict block, Đã trả + stamp + undo, copy message, Số dư từng người, history), Chi tiêu form behaviour and look (defaults, folds, sticky save, inline errors) on top of the fill interface, and the list | Việt Tiến → Duy Anh | Wed 28/10 |
| **T-32** | Loading / empty / error states (§6.5), 360 px and 200% zoom pass, dark-mode pass | Duy Anh → Việt Tiến | Sat 31/10 |

Order matters: **T-42 → T-19's fill interface → T-43**. T-42 lands first so T-19 and T-43 build on the same
components and do not edit the same CSS. Existing tests are updated in the same PR as the copy they check
(§7 renames several strings).

**AI-fill interface of `ExpenseForm` (owned by T-19, used by T-43).** Shipped in #104 as a ref handle,
so the page drives it and the form keeps its own state; T-43 restyles the form around it:

```ts
type FillField = 'description' | 'amount' | 'payer' | 'date' | 'split'
interface ExpenseFormHandle {
  fill(values: { description?; amount?; payer_id?; spent_at?; member_ids? }):
    { filled: FillField[]; kept: FillField[]; cleared: FillField[] }
  undoFill(): void          // Hoàn tác
  focusDescription(): void  // Nhập tay
}
// <ExpenseForm ref={formRef} … />; the page maps AiDraft.draft to fill()
```

The form records which fields the user changed; `fill()` reports what it filled, what it kept because
the user had changed it, and what it emptied. The rules below are what it guarantees; each has a test in
`ExpenseForm.test.tsx` or `AiComposer.test.tsx`. If T-43 changes how a field is edited (pick chips for
the payer, the date and split folds), the new control must still mark that field as changed.

1. A fill applies only to fields the user has not changed. Defaults
   (payer = you, date = today, equal split) and earlier AI fills do not count as user changes.
2. The split is one atomic group: `splitType`, the selected members and the custom amounts are filled
   together or not at all.
3. A `null` amount or payer clears that field if untouched and leaves it for the user (the warning says
   so); it never silently keeps a default payer.
4. **Hoàn tác** undoes the latest fill only, and only for fields or groups not edited since.
5. A save, a reset, **Nhập tay**, switching household or a newer request makes a pending response stale:
   it is dropped, never applied to a new expense. (The composer numbers its requests and is keyed by
   household and saved expense, so a remount drops anything pending.)
6. The "Đã điền: …" note describes what was actually applied, not the raw draft.

Tests for T-19: a missing key spends no budget and calls nothing; edits during the wait survive; the split
stays atomic; undo keeps later edits; a stale response cannot fill a new expense; a null payer does not
keep the default.

## 10. Changes from the first mock-up

* Tổng quan opens with the answer ("Bạn cần trả Minh 120.000đ") inside the only drenched block, with the
  transfers and the reminder message in it; the per-person table moved below and was renamed.
* "Bạn là ai?" identity on the device; payer defaults to you.
* Avatars use the given name (not the family name, which made everyone "N"), 8 tints by join order.
* Monospace money, uppercase labels, the yellow marker highlight and card borders were dropped.
* The AI wait shows elapsed seconds and a *Nhập tay* exit; the AI fills only untouched fields and can be
  undone.
* Form: folded date and split, sticky save, errors under fields; list rows reveal actions on tap.
* Fixed: 8 contrast failures, sub-44 px targets, a 180 px toast, and layout breaks with long names and
  8-digit amounts.
* After the T-41 review (22/10): the AI-fill interface and the order T-42 → T-19 → T-43; `ai_not_configured`
  as its own state; avatar initials and the *bạn* chip use the right tokens; verdict sentences for owing
  or being owed by several people; stable avatar tints.
