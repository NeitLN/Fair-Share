# Quickstart: checking the house list and profile redesign

## Setup

- Local stack: `podman machine start` (after a reboot), then `podman compose -p fsdemo up --build -d`; the app is at `http://172.21.33.10:3000`.
- Unit tests: `cd frontend; npx vitest run`; types and lint: `npx tsc -b`, `npm run lint`.
- E2E: `E2E_BASE_URL=http://172.21.33.10:3000 E2E_API_URL=http://172.21.33.10:8000 npx playwright test` (clear the sign-up limit first if needed: `podman exec fsdemo-db-1 psql -U app -d appdb -qc "DELETE FROM rate_limits"`).
- Data: an account in three houses (one owing, one owed, one settled, one with a waiting item), with a status and a saved receiving account; on live the test house *Nhà trọ VLU* with `tien123@gmail.com`, `minh123@gmail.com`, `anh123@gmail.com`.

## By hand, after PR 1 (`/`)

1. 1440 px: the houses are rows in one panel; the three amounts end on one right edge; *Thêm nhà* stands beside the list (gap ≤ 48 px); no help paragraphs.
2. 1024 and 1279 px: *Thêm nhà* comes after the list and the wait, full width.
3. 360 and 320 px, Vietnamese and English: long names wrap, the money line drops under the name, no sideways scroll.
4. Keyboard only: Tab goes list → wait → *Nhập mã mời*; Enter opens it, the focus is in the code field, the title still shows; Escape closes it and focuses the title. Same for *+ Tạo nhà mới*, whose open fold shows the invite hint.
5. Open `/join/<code>` while in a house: the code fold is open, scrolled to and focused.
6. Dark theme and Windows high contrast: the open fold, the badge and the focus ring are visible.
7. The browser tab reads *Nhà của bạn · Fair-Share*.

## By hand, after PR 2 (`/account`)

1. From the account menu, *Hồ sơ của bạn*: the focus is on the page title; the link is marked current.
2. 1440 px: the card on the left with avatar, name, status, the receiving hint and the email; the parts on the right in order; everything within 1.5 screens.
3. Type in the status: *Chưa lưu* shows by *Lưu trạng thái*; save it: the mark goes, the card shows the new status.
4. Walk every row of research R6 with the keyboard: the focus never lands on the page body.
5. Make the status too long: the error shows under the field and the 0/60 counter stays.
6. Screen reader: six different save names; each region announced by its heading.
7. 320 px and 200% zoom: no sideways scroll, every button at least 44 px.

## By hand, after PR 3 (header)

1. Without a photo the account button shows the initial on the personal tint; with one, the photo.
2. Change the photo on `/account`: the button changes without a reload.

## After each merge

- The deploy job and the live smoke run are green (`gh run watch`), and live `/api/version` shows the merged commit.
