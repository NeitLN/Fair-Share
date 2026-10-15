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

### 3.3 Out of scope (deliberately)

User accounts and login, multi-currency, receipts/images, notifications, real-time updates, payments
of any kind. The brief warns against image processing, real-time sockets and payments; the free tiers
will not carry them and they add nothing to the assessed pipeline.

> **Known limitation, stated openly:** without login, anyone with the URL can edit any household. For a
> classroom demo this is acceptable; the report explains how we would add authentication
> (Supabase Auth or OAuth) and row-level ownership if the product went further.

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
| AI budget | Per-client limit (5 requests/min/IP) **and** a global budget below the project's Gemini quota (e.g. 10/min, 200/day); 10 s timeout; no automatic retries |
| Security | Secrets only in environment variables; CI secret scan (gitleaks); parameterised SQL only |
| Quality | Lint clean (ruff, ESLint); backend and frontend tests run on every PR; `main` always deployable |
| Accessibility | Labelled form fields, keyboard usable, readable on a 360 px wide phone |
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
| Supabase resumed from the dashboard if paused, one query run | Duy Anh |
| Clean clone rehearsed on a machine that never had the project | Hoàng Minh |
| Pipeline green on `main`, failing branch ready for the gate demo | Việt Tiến |
| No key / connection string / `.env` in files or history | Việt Tiến (audit), all (review) |
| Each member knows their presentation block and their commits | Everyone |
| Presentation rehearsed once with a timer | Everyone |
