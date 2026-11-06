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
   Avatars, the two stamps, a form's submit and the AI button keep their 2–3 px offset shadow, and
   pressing one moves it down by exactly its shadow. (UI review 04/11: on a laptop the white panels
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
| `--line` | `#ECE4D5` | `#37312A` | row dividers only (quiet on purpose) |
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
| **Avatar** | Circle, 32 px (26 small, 44 large). Background tint per §3 (stable, no repeats up to 8), initial of the **last word** of the name in `--on-fill`, 2 px `--edge` ring, 2 px `--sticker-shadow` offset. `title` and accessible name = full name. A stack shows at most 3, then `+n` |
| **Money** | `<Money amount={n} />` → `120.000<span class="cur">đ</span>`; sign variants `+` (credit text) and `−` (debt text, a real minus `U+2212`). Replaces `formatVND`'s "₫" everywhere |
| **Chip** | 12 px 700, pill. `credit` mint, `debt` pink, `ai` yellow (`✦ AI`): text `--on-fill`. `me` (*bạn*) is the exception: background `--ink`, text `--bg` (16:1 both themes) |
| **Stamp ĐÃ TRẢ** | Mint sticker, 3 px edge, −8°, on a transfer the moment it is recorded; animation: scale 1.7 → 1 in 240 ms with a slight overshoot (the one deliberate bounce in the app; instant under reduce motion). The card turns `--surface-2`, never faded |
| **Stamp SẠCH NỢ** | Small mint sticker, −6°, next to a member whose net is 0 **and** who has at least one expense or settlement (a brand-new house is not "settled") |
| **Buttons** | `primary` (taro, edge, hard shadow), `ai` (yellow, same), `secondary` (surface + `--control-line` border; `--muted` on hover), `ghost` (primary text), `danger` (debt text). Height 44, radius 12. Press: translate by the shadow, shadow to 0, 120 ms. Disabled: 60% opacity, no shadow |
| **Segmented** | Pill track on `--surface`, selected segment ink with `--bg` text; 44 px. Used for the household tabs and Chia đều / Chia riêng |
| **Fold row** | `--surface-2` row "**Hôm nay**, 21/10 · Đổi" / "**Chia đều cả nhà** (4 người) · Sửa"; shows exclusions ("Chia đều (3/4 người)"). Opens the full control in place |
| **Pick chips** | Radio group as avatar + short name pills (Ai trả?, Bạn là ai?); checked = ink border on `--surface-2`; long names ellipsize |
| **Section** | Title row (17 px 700 + optional `--text-small` muted note) above a `--surface` panel with a 1 px `--card-edge` and 1 px `--line` dividers between rows; rows ≥ 60 px |
| **Toast** | Bottom centre, `min(420px, 100vw − 32px)` wide, one line where possible, action button on the right (*Hoàn tác*). Stays 7 s. `role="status"` |
| **Note** | `--surface-2` box with a mint (ok) or pink (attention) dot; used for AI results and blocked actions, placed next to what it is about |
| **Composer (T-19)** | See §6.3 |

## 6. Screens

### 6.1 Danh sách nhà `/`

```
Fair·Share
Nhà của bạn                          ← page title, Bricolage 28
┌──────────────────────────────────┐
│ Nhà trọ Q7               (T)(M)(A)+1 │  ← whole row is the link
│ Bạn cần trả 120.000đ · 4 người   │
└──────────────────────────────────┘
[ + Tạo nhà mới ]                    ← secondary; opens the name field + "Tạo nhà" in place
```
List first, create second (returning users far outnumber new ones). The list holds only the households
**this browser** created or opened (#132; `lib/knownHouseholds.ts`), most recent first, each with
*Bỏ khỏi danh sách* (forgets it here and its key, deletes nothing; a toast offers *Hoàn tác*). Empty
state: "Máy này chưa có nhà nào. Tạo nhà đầu tiên, hoặc mở đường dẫn mời mà bạn cùng phòng gửi."

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

**Invite link** (#132). A household opens only with its key, which this browser gets by creating it or
by opening its invite link `/households/{id}#k={key}` once (the key is then removed from the address
bar). Opening `/households/{id}` without a key shows *Cần đường dẫn mời*: one sentence on asking a
housemate for the link from Thành viên, and a link back to the list. A wrong key looks like a deleted
household ("Có thể nhà đã bị xoá, hoặc đường dẫn mời không đúng").

**Shipped in T-42: the name only.** Each row is one `GET /api/households/{id}`; the second line and the
avatar stack would need one more request per house. If it is added later, one
`GET /households/{id}/balances` per row already has the names, the count and your net.

### 6.2 Khung một nhà + Tổng quan `/households/:id`

```
←  Fair·Share
Nhà trọ Q7                     (T)(M)(A)+1      ← 22 px on a phone
[ Tổng quan | Chi tiêu | Thành viên ]
[ + Ghi khoản chi ]                              ← 48 px, filled, no sticker shadow
╔══════════ taro block ═══════════╗   ← verdict B (05/11): only the answer
║ Bạn cần trả Minh                 ║
║ 120.000đ                         ║   ← 44 px
║ Vì sao ra số này?                ║   ← when your balance is not 0
║ Đã báo chuyển 120.000đ · chờ Minh xác nhận ║ ← only your own sent notice
╚═════════════════════════════════╝
┌─────────── transfers panel ─────┐   ← white, 1 px --card-edge, right under the block
│ (T) Bạn trả Minh 120.000đ        │   ← yours first
│     Đã báo, chờ Minh xác nhận.   │   ← where it stands
│     Huỷ báo                      │   ← then what you can do (flat buttons)
│ ─────────────────────────────── │   ← --line between the rows
│ (A) Duy Anh trả Minh 80.000đ · Chưa trả. │
│ [ Sao chép tin nhắn nhắc nợ ]    │   ← secondary button, last
└─────────────────────────────────┘
Tháng 10/2026: cả nhà chi 3.460.000đ             ← this month, a section of its own
 (M) Minh   đã trả 1.065.000đ      860.000đ  phần chia
 (T) Tiến bạn đã trả 0đ            1.300.000đ  phần chia
Số dư từng người                   tính từ đầu tới hôm nay
 (M) Minh   tổng đã chi 1.065.000đ  +200.000đ  được nhận
 (T) Tiến bạn                      −120.000đ  cần trả
 (L) Lan                                  0đ  SẠCH NỢ
Lịch sử trả                      Ghi khoản trả khác
```
* **Verdict B** (design review 05/11, mockup variant B). The taro block holds only the answer: the
  sentence, the amount, *Vì sao ra số này?* and your own sent notice. The transfer cards, their actions
  and *Sao chép tin nhắn nhắc nợ* sit in a white panel right under it, as rows with `--line` dividers;
  white cards nested in the taro made the one loud place heavy. With no transfer and nothing to copy
  there is no panel.
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
  says "Đã báo Minh là đã chuyển 120.000đ, chờ xác nhận" with *Huỷ báo*. The receiver sees "Tiến báo đã
  chuyển 120.000đ" and *Chưa nhận được* under the text; *Đã nhận* records that told amount, and the line
  says so when it is not today's suggestion. Anyone else sees "Chưa trả" or who is waiting for whom. A
  card never says a payment is waiting for confirmation before anyone said it was sent (UI review, 03/11).
  A notice whose transfer is no longer suggested keeps a card of its own ("Số dư đã đổi sau lần báo
  này"), and the reminder adds "(đã báo chuyển, chờ Minh xác nhận)" to a told line. Until the notices
  load, Đã nhận and Tôi đã chuyển cannot be pressed. In English the card's button takes its own row
  under 480 px. Since the design review of 05/11 the button says what it does and how much, **Xác nhận
  đã nhận 120.000đ** ("Mark 120,000 ₫ as received"): "Đã nhận" alone read like a status, not something to
  press. Told a different amount, the button carries the told one, the amount it records. The rules
  and these notes still call the action *Đã nhận*.
* **Sao chép tin nhắn nhắc nợ** copies plain text for the household's Zalo group (below); on failure the
  text is shown selectable instead. No bank account, QR or payment of any kind (PROJECT_SPEC §3.3).
  ```
  Nhà trọ Q7 chốt sổ tháng 10 nè:
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
  Lịch sử trả. Line amounts carry a sign but no colour; only the total is coloured, with its words.

**Mới ghi** ([spec 006](../specs/006-recently-added/spec.md)): a quiet strip (white surface, card edge, not
the taro block) at the top of the right column on a computer; on a phone it follows the verdict and its
transfers, so the money actions stay first. It lists the expenses and repayments another account saved
since you last pressed *Đã xem tất cả* in this browser, newest first: "Minh ghi Lẩu tối · 90.000đ",
"Minh ghi đã nhận 45.000đ từ bạn", each with its time ("Hôm nay, 06/11 · 14:05"). 3 lines on a computer
and 5 on a phone, so *Báo cáo tháng* stays in the first screen; *Xem thêm N* shows the rest in place. An
expense opens in Chi tiêu (revealed), a repayment scrolls to its row in Lịch sử trả. Your own records,
records from before accounts, edits, deletions and "Tôi đã chuyển" notices are not in it: it is "recently
added", not an activity log. The marks are kept per account and per house in this browser only (two, one
for expenses and one for repayments, since they refresh on different schedules); a first visit shows the
last 7 days. No strip while any list is loading or failed, and none when there is nothing new.

**Tới hạn** ([spec 007](../specs/007-recurring-expenses/spec.md)): a quiet card under the transfers in the
left column (after them on a phone), so the right column and *Báo cáo tháng* do not move. One line per
recurring expense whose day has come and that nobody recorded this month: "Internet · 300.000đ · Minh trả
· ngày 5", or "nhập số tiền tháng này" for one whose amount varies, with *Ghi luôn* (44 px). 3 lines, then
*Xem tất cả (n)*. *Ghi luôn* opens Chi tiêu with the add form filled and "Đang ghi kỳ 11/2026" above it;
a person presses Lưu. No card when nothing is due or while the lists load.

### 6.3 Chi tiêu `/households/:id/expenses`

```
Thêm khoản chi                       Xem các khoản chi   ← jump link, phones only
┌ one white surface ───────────────┐
│ ✦ Gõ nhanh bằng AI                │
│ [ lẩu 240k Minh trả…   ] [Điền giúp] │ ← one auto-growing line, 300 chars
│ AI điền form bên dưới…             │
├──────── hairline ─────────────────┤    (UI review 03/11: no ink ring, one surface)
Nội dung      [ Tiền điện tháng 10      ]
Số tiền       [ 240k                    ]  = 240.000đ
Ai trả?       ((T) Tiến (bạn)) ((M) Minh) ((A) Anh) ((L) Lan)
Ngày          Hôm nay, 21/10 ·······  Đổi
Danh mục      Điện nước ············  Đổi   ← guessed from Nội dung (spec 005)
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
  once ticked, "Số tiền thay đổi mỗi tháng". Only an equal split recurs (a custom one says so). Filled
  from a due item, people no longer in the house are left out and named. A second expense of the same
  item in one month is refused: "Kỳ 11/2026 của Tiền nhà đã có người ghi", with *Xem khoản đã ghi*.
  Under the form, a folded *Khoản định kỳ (n)* lists each item, its day and this month (đã ghi, tới hạn,
  chưa tới ngày), with *Ngừng lặp* for its creator or the owner (asks first; what was recorded stays).
* **Danh mục** ([spec 005](../specs/005-expense-categories/spec.md)): seven fixed categories (Ăn uống, Đi
  chợ, Điện nước, Tiền nhà, Đi lại, Sinh hoạt, Khác). The row follows Nội dung with no press: "Tiền
  điện" reads Điện nước, "Lẩu" Ăn uống, words typed without accents too, and *Khác* when nothing
  matches; an AI fill sets Nội dung, so the guess follows it. *Đổi* opens the seven as chips (44 px,
  the chosen one with a ✓); one press picks and closes, and from then on Nội dung no longer moves it.
  Editing keeps the stored category. Each row in the list ends with it ("chia đều 3 người · Ăn uống"),
  the filters gain *Danh mục*, and the CSV a column.
* **Errors** appear under the field (`aria-invalid`, `aria-describedby`) and the first invalid field gets
  focus; the server's message stays above the button.
* **Expense rows** are `<details>`: tap a row to reveal *Sửa* and *Xoá* (44 px). Deleting still asks
  first. AI-made expenses carry the `✦ AI` chip. Since the design review of 05/11 every row opens, first
  to who shares it and how much each (a share of 0đ is not listed), then *Sửa* / *Xoá* for the rows you
  may change; "chia riêng 2 người" did not say whether you were in it. The hint says "chạm để xem phần
  từng người, sửa hoặc xoá".
* **Composer states (T-19, owner Duy Anh):**

  | State | What shows |
  |---|---|
  | Idle | Textarea + "Điền giúp" (AI button) + hint "AI điền form bên dưới, bạn duyệt rồi mới lưu." |
  | Reading | Full-width yellow progress bar, "AI đang đọc… 6 giây · thường mất 10–20 giây", link **Nhập tay** (stops waiting, focuses *Nội dung*). The form stays editable |
  | Filled | Mint note "Đã điền: Lẩu · 240.000đ · Minh trả · chia đều 4 người.", fields that were filled flash yellow once; **only fields the user has not touched are filled** ("Giữ nguyên số tiền bạn đã nhập."); button **Hoàn tác điền** restores the form |
  | Warnings | Pink note per API warning. `unknown_member` (payer **or** a participant): "“Hùng” không có trong nhà. Kiểm tra người trả và người cùng chia ở biểu mẫu." · `no_payer`: "Chọn người trả." · `no_amount`: "Nhập số tiền." · `participants_assumed`: shown beside the split fold, "AI chia cho cả nhà, bạn kiểm tra lại." |
  | Failed | The typed sentence is always kept and the form stays usable; the note depends on the code (wording in `lib/errors.ts`): `ai_unavailable` (503) → "AI đang bận…" + **Thử lại** · `ai_rate_limited` (429) → "…đợi một phút rồi thử lại" + **Thử lại** · `ai_unparseable` / `too_many_participants` (422) → fix the sentence or use the form, **Thử lại** after an edit |
  | Not set up | `ai_not_configured` (503, no Gemini key on this server): "Gõ nhanh chưa được bật trên máy chủ này. Bạn điền biểu mẫu bên dưới nhé." **Điền giúp** is disabled until the page is reloaded; no **Thử lại** |

### 6.4 Thành viên `/households/:id/members`

Order on a phone (UI review 03/11): someone asking to join first (the owner's next task), then the list
titled "Thành viên · 3", then the invite card. A list, not a card grid (it scales to 6 long names). Each
row: large avatar, **full name**, "gọi là *Anh*" (left out when it is the whole name), the signed amount
with *cần trả* / *được nhận* as on Tổng quan (no coloured pill) or SẠCH NỢ, the *bạn* chip for you, and two 44 px
buttons under the name, *Đổi tên* (opens the field in place) and *Xoá* (asks first). One tap fewer than a *Sửa* menu,
and both still fit at 360 px with long names. Removing someone who is in an expense shows a note under that row (API `member_in_use`). The add
field's hint: "App gọi mỗi người bằng tên cuối: Hương, Minh, Lan…". A last word that reads as a pronoun
(Anh, Em, Chị, Bạn, Cô, Chú…) keeps the word before it, so "Nguyễn Duy Anh" is "Duy Anh", never "Anh trả
Minh" (design review 05/11). If two members share a last word, both are shown by their last two words
("Duy Anh", "Tuấn Anh"); if those still match, by the full name.

Above the add field, **Mời bạn cùng phòng** (#132): the hint "Ai có đường dẫn này đều xem và sửa được
nhà, nên chỉ gửi cho người trong nhà." and *Sao chép đường dẫn mời* (toast "Đã sao chép đường dẫn mời.
Gửi vào nhóm chat của nhà nhé."). Where the clipboard is blocked, the link is shown in a read-only field,
selected, to copy by hand. The Tổng quan reminder ends with the same link.

### 6.5 States on every screen

Loading: skeleton rows in `--surface-2` (no spinners over 300 ms). Empty: one sentence that says what to
do next, with the action. Error: a note with the message from `lib/errors.ts` and *Thử lại*; nothing
already typed is lost.

### 6.6 On a computer (1024 px and wider)

The phone layout above is the design; a computer gets its own arrangement of the same parts, not a
phone column in the middle of a wide screen. Below 1024 px nothing changes. Where a computer changes
what is shown or its order, the page asks `lib/useWide.ts` instead of moving things with CSS, so the
keyboard goes through the page in the order it is seen.

* **Frame:** 32 px sides (40 px from 1440), and the content (header included) stops growing at 1320 px,
  centred. The whole screen was the owner's choice on 04/11; the design review of 05/11 measured a name
  and its amount a thousand pixels apart at 1920 px, so the owner capped it. Up to that cap the columns
  keep their 1280 proportions, with a floor so the verdict and the form never get narrower than at 1280. The header keeps the
  wordmark and the account; under it, one row for the household: its name and avatars on the left, the
  three tabs on the right as the same segmented control. No sidebar: three tabs do not pay for 270 px.
  Above that row, on every screen size, *‹ Nhà của bạn* leads back to the list, and for an account in
  more than one house *Chuyển nhà* opens a short list of the others (design review 05/11: only the
  wordmark led out, and changing house took two pages).
  Nothing is sticky, so nothing covers a focused field on a short laptop screen.
* **Tổng quan:** two columns (equal at 1024, `minmax(480px, 2fr) 3fr` from 1280). Left: the verdict block,
  *+ Ghi khoản chi*, then Lịch sử trả. Right: this month, Số dư từng người, then **Khoản chi gần đây**, the last five
  expenses with *Xem tất cả*, so the balances can be explained without leaving the page.
* **Chi tiêu:** the AI box and the form on the left (360 px; `minmax(380px, 1fr) 2fr` from 1280), the list on the right as
  a **table**: Ngày, Nội dung, Người trả (with the split under the name), Số tiền right-aligned, and
  *Sửa* / *Xoá* on each row the user may change. The row being edited is tinted. Between 1024 and 1279 px
  the date and the payer fold under the description instead of squeezing it. The description is a
  button with the row chevron: it opens a tinted row under it with each share (the description and not
  the split under the payer, which that 1024–1279 fold hides). The list hint says "mới nhất ở trên". *Lưu khoản chi* sits at the end of the form, not stuck to the
  bottom of the screen.
* **Thành viên:** the people get the wide column on the left; on the right (320 px; `2fr minmax(360px, 1fr)` from 1280)
  a request to approve comes before the invite.
* **Nhà của bạn:** a new account sees the start of §6.1 (two panels, at most 960 px). Otherwise one column up to 880 px: the groups, the wait, then *Nhập mã mời* and *+ Tạo nhà mới*
  as two buttons side by side that open their form under them.
* **Sign in:** a 440 px form in the middle, the language and theme under it.
* Hover tints rows and inactive tabs with `--surface-2`; the focus ring stays on top of it.

### 6.7 UI review of 03/11: what changed and why

A review of every screen against the jobs in §1 led to these changes; the brand (wordmark, taro,
yellow coin, sticker avatars, stamps) and the three tabs stayed.

* **Logging an expense comes first.** *+ Ghi khoản chi* moved above the verdict: it used to sit under
  every transfer, further down the more debts there were. It stays filled but flat, so the taro block is
  still the one loud place; buttons repeated on every transfer card are flat too.
* **Your business first, in the order you read it.** Transfers involving you come before the rest (a
  stable split, so a card never moves while you press it). Each card reads amount → where it stands →
  what you can do, in both languages. Your own *Tôi đã chuyển* shows under the big amount, which does not
  change until the receiver confirms.
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
* **Joining.** The request waiting for approval is one card with *Kiểm tra lại* and *Hủy yêu cầu*; the
  tips for people who invite others are not shown to someone waiting. On a phone that can share, the
  invite card leads with *Gửi link mời* (the share sheet: Zalo, Messenger); copying the link, then the
  code, follow.
* **Copy.** Amount examples are "VD: 240000" (the field opens the number pad, which has no "k"); the
  split reads "Chia đều cả nhà · 3 người" and never breaks between the number and "người"; an empty
  history says "Chưa có khoản trả nào được ghi nhận." AI quick add clears only the messages of the fields
  it filled.
* **Wide screens (from 1280 px).** Balances read across (who, đã chi, số dư); a member row has its name,
  its money and its actions in three regions; the expense filters keep a sensible width; Nhà của bạn has
  the groups on the left and the ways in on the right; the verdict block gets a little more padding (the
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

Numbers: `240.000đ` (dot thousands, no space, *đ*). Dates: "Hôm nay", "Hôm qua", "Thứ bảy, 18/10", full
`18/10/2026` only in history older than this year.

### 7.1 English and Vietnamese

The app speaks **English by default**; **EN / VI** switches the whole page and is remembered on the
device, like the theme. Both switches live in the account menu, so the header is one line on a phone
(the wordmark and the account); signed out they sit under the sign-in form (UI review, 03/11). Every word lives in `frontend/src/i18n/` (`en.tsx`, `vi.tsx`,
the same keys, checked by TypeScript); components take them from `useT()`, plain functions from
`messages()`. The Vietnamese above is unchanged. The English terms were agreed in a translation review:

| Vietnamese | English | Why |
|---|---|---|
| nhà | **group** (Your groups, New group) | Short and right for a group opened by an invite link; "household" sounds formal, "home" is the start page |
| khoản chi · khoản trả · số dư | **expense · repayment · balance** | "Repayment" keeps paying someone back apart from paying for an expense |
| cần trả · được nhận · sạch nợ | **owes · gets back · SETTLED** | |
| Đã trả (button) · ĐÃ TRẢ (stamp) | **Mark as paid · PAID** | The button records money already paid outside the app |
| Bạn cần trả Minh · Minh trả Lan (suggestions) | **You owe Minh · Minh owes Lan** | A suggestion must never read as already done |
| Minh đã trả Lan (history) | **Minh paid Lan** | |
| Gõ nhanh bằng AI · Điền giúp · Nhập tay · Hoàn tác điền | **Quick add with AI · Fill form · Enter manually · Undo autofill** | |
| đường dẫn mời · Mời bạn cùng phòng | **invite link · Invite housemates** | "Roommates" can mean one bedroom |
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
  undoFill(): void          // Hoàn tác điền
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
4. **Hoàn tác điền** undoes the latest fill only, and only for fields or groups not edited since.
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
