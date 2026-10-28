# Demo-day runbook (T-38)

What to do before and during the live demo on **Thu 12/11 (Session 20)**, so a sleeping service or a slow
network does not eat the four minutes. The demo runs on Việt Tiến's laptop (Windows, **Podman** with
the Compose provider), on the school wifi with a phone hotspot as backup. Commands are for PowerShell.

| | |
|---|---|
| Web app | https://fair-share-web.onrender.com |
| API | https://fair-share-4bu9.onrender.com (`/health`, `/health/db`, `/api/version`, `/docs`) |
| Red-gate PR | [#113](https://github.com/NeitLN/Fair-Share/pull/113), branch `demo/red-gate`, **never merged** (T-35) |
| Clean-clone steps | [CLEAN_CLONE.md](CLEAN_CLONE.md) |
| Past outages and what they looked like | [OUTAGES.md](OUTAGES.md) |

**Never on the projector:** the Render *Environment* tab, the Supabase connection string or password,
the AI Studio key page, a `.env` file. Open those only on a screen nobody else sees.

## 1. The day before (Wed 11/11): one full run

Do every step of §3 once, with the stopwatch, and fix what fails today rather than tomorrow.

| # | Step | How | Expected |
|---|---|---|---|
| 1 | Supabase is awake | Supabase dashboard → the project. If it says *Paused*, press *Resume* and wait | Project *Active* |
| 2 | API reaches the database | `curl.exe -s https://fair-share-4bu9.onrender.com/health/db` (the first call may take ~50 s: cold start) | `{"db":"ok","schema":…}` |
| 3 | The keep-alive is green | GitHub → Actions → *Keep-alive*: the 08:00 runs of the last days | ✅ every day |
| 3b | **Decide how the browser reaches the containers.** On 28/10 this laptop's Podman machine was *rootful*, and a published port answered on the machine's IP but **not on `localhost`** | Either keep rootful and use the machine's IP (§3: `podman machine ssh -- "ip -4 -o addr show eth0"` → e.g. `172.21.33.10`; it changes when the machine restarts), or switch now, before step 4: `podman machine stop`, `podman machine set --rootful=false`, `podman machine start`. Rootless has its **own** images and volumes, so everything below is pulled again after the switch | `curl.exe http://<host>:3000/api/version` answers in step 9 below |
| 4 | Base images are on the laptop (clean clone then takes ~30 s, not 6 min) | `podman pull python:3.12-slim node:22-alpine nginxinc/nginx-unprivileged:1.29-alpine postgres:16-alpine ghcr.io/gitleaks/gitleaks:v8.30.1` | Five images in `podman images` |
| 5 | The red gate is still red against today's `main` | Open #113 → *Checks* | `backend` ❌, merge blocked. If it went green or conflicts, ask Hoàng Minh to rebase it |
| 6 | A harmless PR is ready for "merge → live" | A one-line docs change (e.g. the date of the last run in §5 below), approved by a teammate the day before, CI green | *Ready to merge*, not merged |
| 7 | Quick add answers | Web app → a household → Chi tiêu → "lẩu 240k chia đều cả nhà" | The form is filled. If you get 429 or 503, that is fine: the fallback is part of the demo |
| 8 | Hotspot works | Laptop on the phone's hotspot: open the web app, `git ls-remote https://github.com/NeitLN/Fair-Share.git` | Both answer |
| 9 | The clean clone works on this laptop | §3 *Clean clone* and *Open the demo household*, in a scratch folder, then §5 cleanup | The demo household opens; note the time |

## 2. One hour before

1. Laptop on power. Close chat apps and notifications; Windows *Focus*/*Do not disturb* on.
2. `podman machine start` (if `podman machine list` does not say *Currently running*).
3. Ports free: `netstat -ano | findstr ":3000 :8000"` prints nothing.
4. No leftovers from the rehearsal: no `C:\demo\Fair-Share` folder,
   `podman volume rm fair-share_pgdata` (an error that it does not exist is fine),
   and no `fair-share-*` image in `podman images` (remove them with `podman rmi`).
   Keep the five base images from §1.
5. **Wake the live services** (Render free instances sleep after 15 minutes without traffic):
   open the web app and run `curl.exe -s https://fair-share-4bu9.onrender.com/health/db`.
   Do it again 10 minutes before the demo.
6. Browser tabs, in demo order: the web app on a household with expenses · GitHub PR #113 ·
   the harmless PR · GitHub Actions · a terminal in `C:\demo`.

## 3. During the demo

| Step | Do | Show |
|---|---|---|
| Live app | Web app: Tổng quan, Chi tiêu, Quick add with one sentence | The draft fills the form, nothing is saved until you press Lưu. On 429/503: the message, the sentence kept, the manual form |
| Clean clone | In `C:\demo`: `git clone https://github.com/NeitLN/Fair-Share.git`, `cd Fair-Share`, `podman compose up --build -d --wait` | `http://<host>:3000/api/version` answers in ~30 s (`<host>` from §1 step 3b: `localhost`, or the machine's IP if it stayed rootful) |
| Open the demo household | `podman compose logs api \| Select-String "demo household"` and open the `/households/…#k=…` path it prints on `http://<host>:3000` | Nhà trọ demo with its expenses (households open only with their invite link, #132) |
| Red gate | PR #113 → Checks | `backend` red: a test caught the split bug; the merge button is blocked |
| Merge → live | Merge the harmless PR, open its run in Actions | Four checks, then `deploy`, then `smoke`, about 2–3 minutes in all; `/api/version` → `commit` is the merge's SHA |
| No keys in the repo | `podman run --rm -v "${PWD}:/repo" ghcr.io/gitleaks/gitleaks:v8.30.1 git /repo --config /repo/.gitleaks.toml --log-opts="--all" --redact` | `no leaks found` over every commit; then say where the keys live: Render env vars and Actions secrets (do not open them) |

## 4. If something goes wrong

| Symptom | Likely cause | Do |
|---|---|---|
| Web app spins, API takes ~50 s | Render cold start | Keep talking; it answers. Next time wake it closer to the demo (§2.5) |
| `/health/db` → 503 `database_unavailable` | Supabase paused or unreachable ([OUTAGES.md](OUTAGES.md)) | Supabase dashboard → *Resume*. The API backs off for 20 s, then reconnects by itself (#127) |
| Quick add → 429 / 503 | Gemini quota or outage | Show the fallback: the sentence stays and the manual form is right there. That is the designed behaviour |
| `compose up` fails at once | Podman machine not running | `podman machine start`, run it again |
| `localhost:3000` does not answer but the containers are up | Rootful Podman machine not reachable on localhost | Use the machine's IP: `podman machine ssh -- "ip -4 -o addr show eth0"`, then `http://<that IP>:3000`. Do **not** switch to rootless now: it has its own images and volumes, so the stack would have to be pulled and built again ([README Troubleshooting](../README.md#troubleshooting)) |
| `port is already allocated` | Something else on 3000/8000 | `netstat -ano \| findstr ":3000 :8000"`, stop that process |
| Clone or image pull is very slow | School wifi | Switch to the hotspot; the base images are already pulled, so only the ~2 MB clone and our two builds need the network |
| The merge run is slow | GitHub Actions queue | Show the red gate meanwhile and come back to the run |
| Nothing works (no network, Render down) | — | Switch to the team's fallback recording and say what failed |

## 5. Afterwards

```powershell
cd C:\demo\Fair-Share
podman compose down -v --rmi local    # the stack, its volume and our two images
```

Leave #113 open and **never merge it**.

| Run | Date | Result | Notes |
|---|---|---|---|
| Rehearsal | Wed 11/11 | | |
| Demo | Thu 12/11 | | |
