# Quickstart: checking Safe saves

## Prerequisites

- **Local stack:**
  - `podman compose -p fsdemo build web`, then `podman compose -p fsdemo up -d --force-recreate web`.
  - The web app is then at http://172.21.33.10:3000 (the API sits behind `/api`).
- **Clean rate limits:** `podman exec fsdemo-db-1 psql -U app -d appdb -qc "DELETE FROM rate_limits"`.
- **Unit tests:** run from `frontend/` with `npm test`. Use fake timers for the 3 s, 90 s and 10/30 s checks.

## Automated

```powershell
cd frontend
npm test -- client queryClient saveOutcome useSaveLock Toast ExpenseForm NoticeAmountStep VerdictBlock
$env:E2E_BASE_URL='http://172.21.33.10:3000'; $env:E2E_API_URL='http://172.21.33.10:3000'; npx playwright test safe-saves form notices quick-add security
```

`e2e/safe-saves.spec.ts` covers the following. If a run goes red, keep `frontend/test-results/` before rerunning.

1. **Offline:** `context.setOffline(true)`, fill an expense, press Lưu. The A1 offline line shows within 3 s and no POST is seen. Back online, then wait 30 s and go to Tổng quan: still 0 POSTs.
2. **Dropped answer:** `route.fetch()` then `route.abort('connectionreset')` on POST `/expenses`. The A1 unknown line shows, without "Chưa lưu được:". The list shows the new expense within 35 s, with no reload.
3. **Lock:** delay POST by 9 s. Typing into Nội dung changes nothing. The saved description equals the one at press time.
4. **Toasts at 360 px:**
   - Two saves, then a Tự chia mismatch. Never more than one `.toast` is visible, none overlaps `.form-actions` (bounding boxes), and none is visible while the summary shows.
   - Tab into "Hoàn tác" and wait 15 s: it is still there.
5. **"Nhận số khác" offline:** the step stays open with the amount and the A5 offline line inside it.
6. **axe** on the expense form while locked: 0 violations.

## By hand (phone, 360 px)

| Check | Expected |
|---|---|
| Offline (DevTools offline) for each of A1–A7 | The action's "not done" line within 3 s; nothing sent later (Network tab) |
| Throttle to make a save 9 s, then type during it | Fields look locked, nothing changes, focus stays put |
| Quick add during a slow save | "Điền giúp" inactive; text kept |
| Scroll the form under the sticky bar, light and dark | A visible top edge |
| On-screen keyboard open with a toast due | The toast sits above the bar, or at the top, never over the bar |
| A6 unknown (block the undo request) | Sticky toast with "Đóng"; stays past 7 s |

## Done when

- **SC-001 to SC-007:** met in the automated run.
- **E2E smoke:** live smoke stays green after the merge.
- **DESIGN.md:** §5 updated.
