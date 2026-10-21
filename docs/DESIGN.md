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
   sits on the near-white background as borderless surfaces. Yellow means *attention*: the coin in the
   logo, the AI and the focus ring, nothing else ([BRAND.md](BRAND.md)).
2. **Hard shadows only on stickers and primary buttons.** Avatars, the two stamps, primary and AI buttons
   get the 2–3 px offset shadow; pressing a button moves it down by exactly its shadow. Cards never get a
   shadow or a border.
3. **Money is sacred.** Bold, tabular figures, right-aligned in lists, always with a sign or a word
   (*cần trả*, *được nhận*), never colour alone. The *đ* is smaller and never wraps away from its number.
4. **No uppercase except the two stamps.** Secondary labels are 13 px sentence case. People are shown by
   the **last word of their name** (how students address each other); the full name lives on Thành viên.
5. **Every target ≥ 44 px, four animations at most**: the stamp, the AI progress bar, the one-time
   yellow flash on fields the AI filled, and the toast. With *reduce motion* on, all of them become instant.

## 3. Tokens

All colours are CSS custom properties in `frontend/src/styles/tokens.css`. Components use the tokens,
never a literal colour. Dark values apply under `prefers-color-scheme: dark` unless the user forced
`data-theme="light"`, and always under `data-theme="dark"`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F3F0FC` | `#110E1C` | page |
| `--surface` | `#FFFFFF` | `#1B1730` | sections, inputs, transfer cards |
| `--surface-2` | `#F1EDFE` | `#251F42` | folds, segmented track, paid transfer |
| `--ink` | `#17132B` | `#F3F0FF` | text |
| `--muted` | `#5B5675` | `#B1A9D4` | secondary text |
| `--line` | `#E4DEF7` | `#382F63` | row dividers, input borders |
| `--primary` | `#5A3CF0` | `#8C74FF` | primary button fill |
| `--on-primary` | `#FFFFFF` | `#120C33` | text on primary |
| `--primary-text` | `#5A3CF0` | `#A996FF` | links, ghost buttons |
| `--block` / `--on-block` | `#5A3CF0` / `#FFFFFF` | `#4B33D1` / `#FFFFFF` | the verdict block |
| `--on-block-muted` | `#E4DCFF` | `#E4DCFF` | small text in the verdict block |
| `--credit` / `--credit-text` | `#3DDC97` / `#05694A` | `#3DDC97` / `#5EE9AE` | *được nhận*, ĐÃ TRẢ, SẠCH NỢ |
| `--debt` / `--debt-text` | `#FF5C8A` / `#C2255C` | `#FF5C8A` / `#FF8FB0` | *cần trả*, errors |
| `--ai` | `#FFE14D` | `#FFE14D` | AI button and chip, focus ring |
| `--on-fill` | `#17132B` | `#0E0A1F` | text on mint, pink, yellow and avatar tints |
| `--edge` | `#FFFFFF` | `#F3F0FF` | sticker die-cut outline |
| `--sticker-shadow` | `#17132B` | `#6A52E8` | sticker and primary-button shadow |
| `--toast-bg` / `--toast-fg` / `--toast-action` | `#17132B` / `#FFFFFF` / `#FFE14D` | `#F3F0FF` / `#17132B` / `#5A3CF0` | toast |

**Avatar tints** (same in both themes): `#FFB5C9` `#FFD27A` `#B8F0D4` `#BFD8FF` `#D9C7FF` `#FFC9A8`
`#A8EDEA` `#E6F27A`. Initials use **`--on-fill`** (light `#17132B`, dark `#0E0A1F`), never `--ink`, which
is light in dark mode and gives 1.08–1.47:1 on these tints. A member's tint is chosen once and stays put:
take the members in id order; each one's preferred tint is `id mod 8`, and if an earlier member already
has it, the next free tint. Adding someone never recolours anyone; removing someone recolours only a
member who had been pushed off a taken tint. Houses of up to 8 never repeat a colour.

**Measured contrast** (WCAG 2.1, all text pairs ≥ 4.5:1): ink on bg 16.04 (light) / 16.96 (dark) · muted on surface-2 5.9 (light)
/ 7.0 (dark) · white on primary 6.3 · `#120C33` on dark primary 5.4 · credit text on surface-2 5.7 ·
debt text on surface-2 4.8 · white on the dark verdict block 7.8 · `#E4DCFF` on the light block 4.8 ·
`--on-fill` on the avatar tints ≥ 10.91 (light) / 11.74 (dark). Surface vs. bg is 1.12 (light) and 1.10 (dark), enough for borderless
sections on cheap screens. The dark sticker shadow is 3.6:1 against bg so stickers stay visible on OLED.

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
| **Buttons** | `primary` (taro, edge, hard shadow), `ai` (yellow, same), `secondary` (surface + line border), `ghost` (primary text), `danger` (debt text). Height 44, radius 12. Press: translate by the shadow, shadow to 0, 120 ms. Disabled: 60% opacity, no shadow |
| **Segmented** | Pill track on `--surface`, selected segment ink with `--bg` text; 44 px. Used for the household tabs and Chia đều / Chia riêng |
| **Fold row** | `--surface-2` row "**Hôm nay**, 21/10 · Đổi" / "**Chia đều cả nhà** (4 người) · Sửa"; shows exclusions ("Chia đều (3/4 người)"). Opens the full control in place |
| **Pick chips** | Radio group as avatar + short name pills (Ai trả?, Bạn là ai?); checked = ink border on `--surface-2`; long names ellipsize |
| **Section** | Title row (17 px 700 + optional 13 px muted note) above a borderless `--surface` panel with 1 px `--line` dividers between rows; rows ≥ 60 px |
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
List first, create second (returning users far outnumber new ones). Empty state: "Chưa có nhà nào. Tạo
nhà đầu tiên rồi thêm bạn cùng phòng."

**Shipped in T-42: the name only.** `GET /api/households` returns `{id, name, created_at}`; the second line
and the avatar stack would need one more request per house. If it is added later, one
`GET /households/{id}/balances` per row already has the names, the count and your net.

### 6.2 Khung một nhà + Tổng quan `/households/:id`

```
←  Fair·Share
Nhà trọ Q7                     (T)(M)(A)+1
[ Tổng quan | Chi tiêu | Thành viên ]
Bạn là Tiến                Không phải bạn?
╔══════════ taro block ═══════════╗
║ Tháng 10 · cả nhà đã chi 3.460.000đ ║
║ Bạn cần trả Minh                 ║
║ 120.000đ                         ║   ← 44 px
║ ┌ (T) Bạn trả Minh  120.000đ [Đã trả] ┐
║ └ (A) Anh trả Minh   80.000đ [Đã trả] ┘
║ [ Sao chép tin nhắn nhắc nợ ]    ║
╚═════════════════════════════════╝
[ + Ghi khoản chi ]
Số dư từng người         đã chi · cần trả hoặc được nhận
 (M) Minh   đã chi 1.065.000đ      +200.000đ  được nhận
 (T) Tiến bạn                      −120.000đ  cần trả
 (L) Lan                                  0đ  SẠCH NỢ
Lịch sử trả                      Ghi khoản trả khác
```
* **Identity ("Bạn là ai?").** Stored per household in `localStorage` (`fair-share:me:<householdId>`),
  never sent to the server. One line under the tabs, never in the way: "Bạn là ai trong nhà này? **Chọn**"
  until someone is chosen, then "Bạn là Tiến · **Không phải bạn?**"; either button opens the chooser (pick
  chips), Escape closes it. It powers "Bạn…" sentences and the default payer.
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

### 6.3 Chi tiêu `/households/:id/expenses`

```
╔ (✦) Gõ nhanh bằng AI ═══════════╗    ← composer: surface, 2 px ink ring (T-19)
║ lẩu 240k Minh trả chia đều cả nhà ║    ← 2-line auto-growing textarea, 300 chars
║ [ Điền giúp ]  AI điền form bên dưới… ║
╚══════════════════════════════════╝
Thêm khoản chi
Nội dung      [ Tiền điện tháng 10      ]
Số tiền       [ 240k                    ]  = 240.000đ
Ai trả?       ((T) Tiến (bạn)) ((M) Minh) ((A) Anh) ((L) Lan)
Ngày          Hôm nay, 21/10 ·······  Đổi
Cách chia     Chia đều cả nhà (4 người)  Sửa
[ Lưu khoản chi ]                          ← sticky to the bottom of the screen
Các khoản chi                 chạm để sửa hoặc xoá
Hôm qua, 20/10
 (T) Tiền điện tháng 10            450.000đ
     Tiến trả · chia đều 4 người
```
* **Defaults:** payer = you (else the last payer used on this device); date = today; split = equal
  between everyone. The 90% case needs only *Nội dung*, *Số tiền* and *Lưu*.
* **Errors** appear under the field (`aria-invalid`, `aria-describedby`) and the first invalid field gets
  focus; the server's message stays above the button.
* **Expense rows** are `<details>`: tap a row to reveal *Sửa* and *Xoá* (44 px). Deleting still asks
  first. AI-made expenses carry the `✦ AI` chip.
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

A list, not a card grid (it scales to 6 long names). Each row: large avatar, **full name**, "gọi là
*Anh*" (left out when it is the whole name), the net chip or SẠCH NỢ, the *bạn* chip for you, and two 44 px
buttons under the name, *Đổi tên* (opens the field in place) and *Xoá* (asks first). One tap fewer than a *Sửa* menu,
and both still fit at 360 px with long names. Removing someone who is in an expense shows a note under that row (API `member_in_use`). The add
field's hint: "App gọi mỗi người bằng tên cuối: Hương, Minh, Anh…". If two members share a last word,
both are shown by their last two words ("Duy Anh", "Tuấn Anh"); if those still match, by the full name.

### 6.5 States on every screen

Loading: skeleton rows in `--surface-2` (no spinners over 300 ms). Empty: one sentence that says what to
do next, with the action. Error: a note with the message from `lib/errors.ts` and *Thử lại*; nothing
already typed is lost.

## 7. Copy

| Use | Not |
|---|---|
| cần trả · được nhận · sạch nợ | đang nợ · nợ nần |
| Đã trả (button) → "Đã ghi: …" (toast) | Ghi nhận khoản này · Đã chuyển khoản |
| Ghi khoản chi · Lưu khoản chi | Thêm khoản chi mới · Submit |
| Số dư từng người | Ai nợ ai (for the per-person table) |
| Tin nhắn nhắc nợ | Đòi nợ |
| Không phải bạn? | Đăng xuất |

Numbers: `240.000đ` (dot thousands, no space, *đ*). Dates: "Hôm nay", "Hôm qua", "Thứ bảy, 18/10", full
`18/10/2026` only in history older than this year.

## 8. Accessibility checklist

- [ ] Every text pair ≥ 4.5:1 in both themes (table in §3); focus ring: 2 px ink + 5 px yellow halo
- [ ] Every control ≥ 44 × 44 px; inputs 16 px
- [ ] Money never relies on colour alone (sign or word)
- [ ] Headings in order: house name `h1`, sections `h2`
- [ ] Toasts and AI status in `aria-live="polite"`; the stamp has a text equivalent (the toast and the
      history row)
- [ ] Usable at 360 px and at 200% zoom; no horizontal scroll
- [ ] `prefers-reduced-motion`: stamp, progress bar and toast appear without movement
- [ ] Keyboard: every action reachable, Enter submits, Escape closes an open fold or chooser

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
