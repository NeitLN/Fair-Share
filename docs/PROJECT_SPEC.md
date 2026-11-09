# Fair-Share — Project Specification

> Final project for **72ITDS30103 Software Development Platforms**, Van Lang University, Semester 261.
> Team: Võ Việt Tiến (leader), Duy Anh, Hoàng Minh — see [TEAM.md](../TEAM.md). Assessed in **Session 20 — Thursday 12 November 2026**.

| Document | Purpose |
|---|---|
| **PROJECT_SPEC.md** (this file) | What we build, for whom, and what "done" means |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, data model, API, configuration and secrets |
| [ROADMAP.md](ROADMAP.md) | Milestones, weekly plan, who does what |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | How we work: branches, pull requests, reviews, Definition of Done |

---

## 1. Problem and users

Housemates share rent, groceries, electricity and dinners. Today they track it in a chat group and a
spreadsheet, and someone always forgets who paid for what. At the end of the month nobody knows who
owes whom.

**Fair-Share** is a small web application in which a household records its shared expenses, splits each
one between the members who took part, and sees at any time **who owes whom and a short list of transfers
that settles everything** (at most one fewer than the number of members).

**Primary user:** a student living with 2–5 housemates, on a phone, entering an expense in under
10 seconds right after paying.

## 2. The three questions the brief asks of every topic

| Question | Our answer |
|---|---|
| **What records does the application store?** | Households, their members, expenses (who paid, how much, when), each expense's shares (who owes what part of it), and settlements (a member paying another back). |
| **What is the one AI-assisted feature?** | **Quick add**: the user types a free-text sentence such as *"dinner 240k, Minh paid, split 3 ways"* or *"tiền điện 450k Tiến trả chia đều cả nhà"*. Our server sends it to the Google Gemini API, which returns structured fields. The form is **pre-filled for the user to confirm** — the AI never saves anything by itself. |
| **What does the user see when the AI call fails?** | A clear, non-blocking message (*"AI quick add is busy right now — fill in the form below"*), with their sentence **kept** and the normal manual form already open. Every expense can always be entered by hand; the AI is a shortcut, never a dependency. |

## 3. Scope

### 3.1 In scope (MVP — must ship by Week 8)

| ID | User story | Acceptance criteria |
|---|---|---|
| US-01 | As a user I can create a household and give it a name. | Household appears in the list; name 1–60 chars. |
| US-02 | As a user I can add, rename and remove members of a household. | Member names unique inside a household; a member referenced by an expense cannot be deleted (clear 409 message). |
| US-03 | As a user I can record an expense: description, amount (VND), payer, date, participants. | Saved and listed newest first; amount > 0; at least one participant. |
| US-04 | As a user I can split an expense **equally** or by **custom amounts**. | Equal split distributes the remainder đồng-by-đồng so shares always sum exactly to the amount; custom shares must sum to the amount (422 otherwise). |
| US-05 | As a user I can edit and delete an expense. | Balances update immediately. |
| US-06 | As a user I can see each member's balance (paid, owed, net). | Sum of all nets is exactly 0. |
| US-07 | As a user I can see **suggested settlements** — a short list of transfers that clears all debts. | At most *n − 1* transfers for *n* members with a non-zero balance; applying them makes every balance 0. |
| US-08 | As a user I can record a settlement (A paid B x đồng). | Balances reflect it; settlement can be deleted if entered by mistake. |
| US-09 | **AI quick add**: I type one sentence and get a pre-filled expense form. | Draft shown for confirmation; unknown names flagged; nothing saved until I press *Save*. |
| US-10 | When the AI is unavailable (429, timeout, no key) I can still add the expense. | Friendly message, text preserved, manual form usable; no error page, no stack trace. |

### 3.2 Platform requirements (what the brief actually assesses)

| ID | Requirement | Evidence in the demo |
|---|---|---|
| PR-01 | Public URL over HTTPS on a free platform | Live URL opened in class (Render) |
| PR-02 | `Dockerfile` builds the application into an image | `docker build` in CI and on Render |
| PR-03 | `docker compose up --build` starts the full stack from a clean clone | Live terminal run on a fresh machine |
| PR-04 | GitHub Actions lints, tests and builds on every PR, deploys on merge | Actions history, red PR blocked, merge → live |
| PR-05 | Managed cloud PostgreSQL attached by one environment variable | `DATABASE_URL` set on Render, Supabase dashboard |
| PR-06 | AI call from our own server, key out of the repository | `GEMINI_API_KEY` only in Render env and local `.env` |
| PR-07 | No key, connection string or `.env` in the files or the history | Repository search + gitleaks report in front of the room |

### 3.2.1 Interface additions (agreed 21/10, frontend only)

Part of the UI redesign in [DESIGN.md](DESIGN.md); no API change, so the MVP contract is untouched.

| ID | Addition | Acceptance criteria |
|---|---|---|
| UX-01 | "Bạn là ai?": the user picks which member they are, per household, on this device | Stored only in the browser; the dashboard says "Bạn cần trả Minh 120.000đ"; the expense form preselects you as payer; can be changed any time |
| UX-02 | Copy a reminder message with the open transfers for the group chat | One tap copies plain text (house, month, each transfer, link); if copying is blocked the text is shown to select by hand; no bank or payment data |
| UX-03 | Light and dark themes that follow the phone | Every text pair ≥ 4.5:1 in both; no colour defined for one theme only |

### 3.3 Out of scope (deliberately)

User accounts and login, multi-currency, receipts/images, notifications, real-time updates, payments
of any kind. The brief warns against image processing, real-time sockets and payments; the free tiers
will not carry them and they add nothing to the assessed pipeline.

> **Since 02/11 (docs/ACCOUNTS.md):** everyone signs in; a household is reached through its members'
> accounts, joined with an invite code the owner approves, with roles (owner, member). UX-01 below is
> now the name the account has in the household. Emails are not verified and there is no password
> reset yet.

> **Since 04/11 (UI review, approved by the owner):** a narrow in-app refresh, not notifications or
> sockets. While a page is open and in front, the app asks again every 30 s for what a housemate's step
> changes: the owner's requests to join, the "Tôi đã chuyển" notices, and on Tổng quan the balances and
> repayment history; on Nhà của bạn, the list while a request is waiting. A background tab sends
> nothing. A count on the Thành viên tab shows requests to approve, one on Tổng quan notices waiting
> for you. There is no push, no email and no "your request was answered" message.

> **Since 06/11 (approved by the owner):** recurring expenses
> ([specs/007](../specs/007-recurring-expenses/spec.md)). A house can mark an expense as repeating every
> month; when its day comes, Tổng quan suggests it and the add form opens filled, but a person always
> presses Lưu: the app records no money by itself, and there is no scheduler, notification or email.
> The database keeps at most one expense per item and month.

> **Since 09/11 (approved by the owner):** paying by VietQR ([specs/016](../specs/016-vietqr/spec.md)). A
> person may save one bank account to receive money; a housemate who owes them right now can open a VietQR
> code for the amount, made in the browser, and scan it in their own banking app. Fair-Share still moves,
> holds and requests no money, talks to no bank or payment service, and records nothing when a code is
> opened or scanned: "Tôi đã chuyển" and the receiver's confirmation stay the only way a repayment is
> recorded. Other housemates see only the bank and the last four digits. The reminder message (UX-02)
> still carries no bank data. Payments of any other kind stay out of scope.

> **Since 07/11 (approved by the owner):** profile photos ([specs/010](../specs/010-profile-page/spec.md)).
> A person may put a photo on their avatar; only their current housemates see it. The browser crops it to
> a small square and the server only checks it and saves its own 256 × 256 JPEG without metadata (at most
> 32 KiB each, 50 MB for all, 10 uploads an hour per account). That narrow check is the only image work;
> receipts and other images stay out of scope.

### 3.4 Stretch goals (only after every Week 8 milestone is green)

* Filter expenses by month and member; monthly total per member.
* Export a household's expenses as CSV.
* AI quick add understands custom splits (*"Tiến 100k, Minh 140k"*).
* Simple household passcode to stop casual edits.

## 4. Non-functional requirements

| Area | Target |
|---|---|
| Reliability of the demo | Clean clone → running stack with **one command**; live URL loads on mobile data |
| Performance | API p95 < 500 ms on a warm instance (free tier cold start ~50 s is documented, not fought) |
| AI budget | Per-client limit (5 requests/min/IP) **and** a global budget below the project's Gemini quota (10/min, 200/day); 20 s timeout; no retry except once after a fast Gemini 5xx, counted in the global budget |
| Security | Secrets only in environment variables; CI secret scan (gitleaks); parameterised SQL only |
| Quality | Lint clean (ruff, ESLint); backend and frontend tests run on every PR; `main` always deployable |
| Accessibility | Labelled form fields, keyboard usable, readable on a 360 px wide phone; text contrast ≥ 4.5:1 in light and dark; touch targets ≥ 44 px; reduced motion respected ([DESIGN.md §8](DESIGN.md#8-accessibility-checklist)) |
| Cost | **Zero.** No platform that requires a credit card. Fallbacks declared in ARCHITECTURE.md §7 |

## 5. Technology choices (summary — rationale in ARCHITECTURE.md)

| Tier | Choice |
|---|---|
| Presentation | React 19 + TypeScript + Vite SPA, served as a **Render Static Site** |
| Application | Python 3.12 + FastAPI in a Docker container on a **Render Web Service** (existing `fair-share-4bu9`) |
| Data | **Supabase** managed PostgreSQL 16 (production); `postgres:16-alpine` in Compose (local) |
| AI | **Google Gemini API** (free tier, structured JSON output), called only from the FastAPI server |
| CI/CD | **GitHub Actions** → Render deploy hooks |

## 6. Definition of "project done" (Session 20 checklist, mapped to owners)

| Brief checklist item | Owner |
|---|---|
| Report PDF, ≤ 12 pages, 8 sections | Việt Tiến (editor), each section owner |
| Contribution table signed by all, matches Git history | Việt Tiến |
| Live URL awake, loads over HTTPS on mobile data | Việt Tiến |
| Supabase resumed from the dashboard if paused, one query run | Hoàng Minh |
| Clean clone rehearsed on a machine that never had the project | Duy Anh |
| Pipeline green on `main`, failing branch ready for the gate demo | Việt Tiến |
| No key / connection string / `.env` in files or history | Việt Tiến (audit), all (review) |
| Each member knows their presentation block and their commits | Everyone |
| Presentation rehearsed once with a timer | Everyone |
