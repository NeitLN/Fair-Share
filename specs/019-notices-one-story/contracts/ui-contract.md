# UI contract: Notices tell one story

Vietnamese lines as shown; English equivalents are required. Placeholders: `{d}` debtor's short name, `{r}` receiver's short name, `{a}` amount, `{s}` suggestion, `{e}` excess, `{max}` fill amount.

## Cards and lines

| Who sees | Notice | Line | Actions |
|---|---|---|---|
| Receiver | unmatched, sent | "{d} đã báo chuyển {a} cho bạn, nhưng lúc này {d} không cần trả bạn nữa." (+ " (cả nhà đã sạch nợ)" when all nets are 0) | primary "Không ghi khoản này"; secondary "Vẫn ghi đã nhận" |
| Receiver | over, sent | spec 014 line: "{d} báo đã chuyển {a} · lúc này {d} cần trả bạn {s}" | "Xác nhận đã nhận {a}" (warns first), "Nhận số khác", "Chưa nhận được" |
| Receiver, warning (unmatched) | | "Lúc này {d} không cần trả bạn; ghi {a} thì số dư cả nhà sẽ tính lại." | "Ghi", "Thôi" |
| Receiver, warning (over) | | "Lúc này {d} cần trả bạn {s}; ghi {a} là nhiều hơn {e}, số dư cả nhà sẽ tính lại." | "Ghi", "Thôi" |
| Debtor | unmatched, sent | "Bạn đã báo chuyển {a} cho {r}; lúc này bạn không cần trả {r} nữa, {r} chưa trả lời." | "Huỷ thông báo" |
| Debtor | unmatched, declined | "{r} không ghi {a} vì lúc này bạn không cần trả {r}." | "Huỷ thông báo" |
| Others | unmatched | "{d} đã báo chuyển {a} cho {r}" | none |
| Debtor row | partial | "Đã báo {told}, còn thiếu {missing}, chờ {r} xác nhận" | (block holds the action) |

## History delete dialog (repayment that took notice money)

| Pair's notice on screen | Dialog |
|---|---|
| sent, loaded | "Xoá khoản {d} trả {r} {x}? {x} {d} đã báo sẽ trở lại thành tiền đã báo (thành {total}), chờ {r} xác nhận lại." |
| declined, loaded | "…sẽ trở lại thành tiền đã báo, và {declined} {r} đã báo chưa nhận được cũng sẽ chờ {r} xác nhận lại." |
| none or not loaded | "Xoá khoản {d} trả {r} {x}? {x} {d} đã báo sẽ trở lại thành tiền đã báo, chờ {r} xác nhận lại." |

## Debtor block

- One "Vì sao ra số này?".
- No repeated row when the debtor has one suggestion.
- Busy label "Đang báo…".
- The "{r} chưa thêm tài khoản nhận tiền." line in regular weight, muted.

## Fill button (debtor steps)

| Step | Cap | Line | Button |
|---|---|---|---|
| Chuyển số khác | min(s, 10¹²) | "Bạn chỉ cần trả {r} {max}." | "Báo {max}" |
| Báo thêm | min(s − told, 10¹² − told) | "Chỉ cần báo thêm {max}." | "Báo thêm {max}" |
| either, the 10¹² cap binds | | today's limit message | none |
| either, max ≤ 0 | | "Bạn đã báo đủ số cần trả." | none |

## Guard and race lines

- **Guard:** one busy set per directed pair. While the pair is busy, every notice control of that pair ignores presses: send, step submits, take back, decline, "Không ghi", confirm, "Nhận số khác", "Ghi", and the card's undo.
- **Race lines:** after a 409 and a fresh read of notices and repayments, the line is the first that matches:
  1. **Declined:** "{r} đã báo chưa nhận được {a}." On an unmatched pair, the FR-004a line instead.
  2. **Confirmed:** "{r} đã xác nhận {a}." when a new repayment debtor→receiver with notice money appeared (id not in the snapshot).
  3. **Taken back:** "Thông báo này đã được huỷ."
  4. **Generic:** "Số liệu vừa thay đổi, đã tải lại."
  5. **Read failed:** "Số liệu vừa thay đổi; chưa tải lại được." with "Thử lại".

  The line clears on the next action of the pair, or after 10 s.
