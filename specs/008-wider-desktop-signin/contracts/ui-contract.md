# UI contract: Wider desktop frame and a composed sign-in page

What each screen must show, by width. "Today" means the screen as on `main` before this feature.

## Every signed-in page

| Width | Content width (header included) | Side gutter |
|---|---|---|
| < 1024 | today | today |
| 1024–1599 | viewport − 2 × gutter | `clamp(32px, 2.8vw, 40px)` (32–40 px) |
| ≥ 1600 | 1520 px, centred | (viewport − 1520) / 2, e.g. 200 px at 1920, 520 px at 2560 |

## Tổng quan (≥ 1280 px)

- Right column panels keep their full-width edge.
- Inside them, at most 640 px wide and centred: each `li` of the month list, of Số dư and of Khoản chi
  gần đây; the head, list and "Xem thêm" of Mới ghi. An expanded "Vì sao" explanation follows its row.
- Month section: title left, "Báo cáo tháng" right on the same line; it wraps under the title when the
  line is too short.
- Transfer cards (every width): "Xác nhận đã nhận …đ", the payer's "Tôi đã chuyển" and the simple
  card's pay button are outlined (`btn-secondary`): surface, ink, 2 px control line, 44 px, same words,
  same `aria-describedby`, same disabled rule. "+ Ghi khoản chi" and the verdict block unchanged.

## Chi tiêu (≥ 1280 px)

- Columns: form 380–420 px | table, the rest.
- Filters Tháng, Người, Danh mục on one row of three equal columns; "Xoá bộ lọc" on its own row.
- Table: Người trả column about 250 px; the split line under the payer may wrap (every width); the
  amount never wraps.

## Sign-in, signed out

| Width | Layout |
|---|---|
| < 1024 | today: header with the wordmark, then the form card with title, intro or invited note, tabs, fields, submit; then EN/VI and theme |
| ≥ 1024 | no header; one block, max 980 px, centred both ways (scrolls when taller than the screen): |

Wide block, in DOM and reading order:

1. `.auth-intro` (no control): wordmark (300 px, accessible name "Fair-Share"), tagline paragraph,
   intro paragraph, four overlapping 56 px avatars hidden from assistive technology.
2. `.auth-form-column`: the form card (its `h1` is the page's only `h1`; the invited note when invited;
   no intro hint, since the intro is on the left), then `footer.app-footer` with EN/VI and the theme
   switch, 16 px below the card.

Tab order on a wide screen: tabs → email → (name) → password → submit → EN → VI → Tự động → Sáng → Tối.
