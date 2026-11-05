# Quickstart: check the desktop look

## Automated

```bash
cd frontend
npm run lint && npm test && npm run build
E2E_BASE_URL=http://localhost:3000 E2E_API_URL=http://localhost:3000 npx playwright test
python -I contrast.py palette.json   # the R1 script, every pair ≥ its threshold
```

## By hand, on `docker compose up --build` (fresh volume), as `minh@demo.local`

| # | Do | Expect |
|---|---|---|
| 1 | Open the five screens in light, then dark (forced and by the system) | Cream / warm charcoal ground, near-white / warm grey panels with a visible 1 px edge, taro block unchanged |
| 2 | Tổng quan with two open transfers | Taro block: sentence, 1.890.000đ, "Vì sao ra số này?" only; a white panel under it with both cards, both "Xác nhận đã nhận …" buttons and Sao chép tin nhắn nhắc nợ |
| 3 | Press Xác nhận đã nhận, then Hoàn tác | Same stamp, toast and undo as before, inside the panel |
| 4 | Sign in as someone in a settled house | Taro block with its sentence, no empty panel |
| 5 | Width 1920 | Content and header ≤ 1320 px, centred |
| 6 | Width 1440, then 360 | Dates and hints 14 px on 1440, 13 px on 360 |
| 7 | Chi tiêu at 1440 and ~1100, open Mì gói và trứng | Share amounts end exactly under the Số tiền column; tab to a description: the ring does not cover the line under it |
| 8 | 320 and 360, both themes, 200% zoom | No sideways scroll, every control ≥ 44 px |
