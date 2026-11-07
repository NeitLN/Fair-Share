# UI contract: quick add fills a custom split

## `ExpenseForm.fill(values)`

`FormFill` gains `split?: DraftSplit` (the draft's union). `member_ids` stays for the equal kind.

| Draft split | Split untouched, form total/payer match (B5) | Otherwise |
|---|---|---|
| `equal` | as today | as today (kept) |
| `custom` | *Tự chia* with `shares`; fold opens; note "Còn lại {amount} tính cho {name}{ (người trả)}" when `rest_amount > 0` | shares not applied; split kept; block `form_differs` |
| `blocked` | *Tự chia* with `preview`; fold opens; block = the reason's message | split kept; block = the reason's message |

B5 = the amount the form will hold equals `draft.amount`, and, when `rest_to_payer`, the payer it will hold equals `draft.payer_id`.

The split counts as filled for undo when it was changed; `splitBlock` is saved in `lastFill.before` and restored by `undoFill()`.

## Block rules

- While `splitBlock` is set, `validate()` reports it on the split field and Lưu does nothing else; the fold opens and the field gets focus, as for any split error.
- Editing the split (mode, a person, an amount) clears the block; editing description, total, payer or date does not.
- The live "Chưa chia: X" / "Vượt quá: X" line keeps working on the preview amounts.
- After a custom fill whose rest went to the payer, picking another payer drops the rest note and sets the block
  `ai.payerChanged` (the same mismatch `fill()` refuses as `form_differs`); a new total drops the rest note, and
  the shares then stop adding up (#220 review).

## Strings (vi / en)

| Key | Vietnamese | English |
|---|---|---|
| `ai.splitCustom(n)` | tự chia {n} người | split by amount, {n} people |
| `form.restTo(amount, name)` | Còn lại {amount} tính cho {name} | The other {amount} goes to {name} |
| `form.restToPayer(amount, name)` | Còn lại {amount} tính cho {name} (người trả) | The other {amount} goes to {name} (paid) |
| `ai.overTotal(sum, total)` | Các phần đã nêu cộng lại {sum}, hơn tổng {total}. Sửa lại cách chia rồi mới lưu được. | The amounts you named add up to {sum}, more than the total {total}. Fix the split to save. |
| `ai.ambiguousMember(name)` | "{name}" trùng tên nhiều người trong nhà. Tự chia giúp nhé. | "{name}" could be more than one person here. Please split it yourself. |
| `ai.duplicateMember(name)` | {name} được nêu hai số tiền. Tự chia giúp nhé. | {name} is given two amounts. Please split it yourself. |
| `ai.noRestTaker(rest)` | Còn {rest} chưa biết tính cho ai. Chọn người trả hoặc tự chia. | {rest} is left with nobody to take it. Pick who paid or split it yourself. |
| `ai.nobodyForEqualRest(rest)` | Còn {rest} để chia đều nhưng ai cũng đã có phần. Tự chia giúp nhé. | {rest} is left to share equally but everyone already has an amount. Please split it yourself. |
| `ai.noTotal` | Nhập tổng số tiền rồi chia lại. | Type the total, then set the split. |
| `ai.fractionOrPercent` | Chưa đọc được phần chia theo phân số hay phần trăm. Tự chia giúp nhé. | Fractions and percentages can't be read yet. Please split it yourself. |
| `ai.severalPayers` | Câu có nhiều người trả, app chỉ ghi một người trả. Tự chia giúp nhé. | More than one person paid; an expense has one payer. Please split it yourself. |
| `ai.paidAmount` | Có số tiền là tiền ai đó đã trả, không phải phần phải chịu. Tự chia giúp nhé. | An amount is what someone paid, not what they owe. Please split it yourself. |
| `ai.payerNotSharing` | Người trả không chia phần, nên phần còn lại chưa biết tính cho ai. Tự chia giúp nhé. | The payer isn't sharing, so the rest has nobody to take it. Please split it yourself. |
| `ai.unreadableShares` | Chưa đọc được các phần chia. Tự chia giúp nhé. | Couldn't read the shares. Please split it yourself. |
| `ai.formDiffers` | Số tiền hoặc người trả trong form khác câu vừa gõ, nên chưa điền phần chia. Tự chia giúp nhé. | The total or payer in the form differs from your sentence, so the split wasn't filled. Please split it yourself. |

Unknown names reuse today's `ai.unknownMember(name)`. Final wording follows DESIGN §7 and is reviewed in the PR.
