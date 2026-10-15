# Contributing to Fair-Share

How the three of us work. Short on purpose — if a rule here is not followed, the lecturer will see it in
the Git history.

## 1. The flow for every change

1. **Pick an issue** on the [project board](https://github.com/NeitLN/Fair-Share/projects). No issue, no
   work — create one first. Assign yourself and move it to *In progress*.
2. **Branch from an up-to-date `main`:**
   ```bash
   git switch main && git pull
   git switch -c feat/18-gemini-client
   ```
   Branch name: `<type>/<issue-number>-<short-name>`, type is one of `feat`, `fix`, `chore`, `docs`,
   `test`, `ci`.
3. **Commit small, explain why.** Use [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat(api): add balances endpoint

   Net balance = paid - owed + sent - received; sum is asserted to be 0.
   Refs #15
   ```
   Commit with **your own** Git identity (`git config user.name` / `user.email`) — the contribution
   table is checked against it.
4. **Run the checks locally before pushing:**
   ```bash
   ruff check . && pytest -q                                  # backend
   cd frontend && npm run lint && npm test && npm run build   # frontend
   docker compose up --build                                  # the whole stack
   ```
5. **Open a pull request** using the template. Write `Closes #<issue>` so the issue closes on merge.
   Request a review from the reviewer named in [docs/ROADMAP.md](docs/ROADMAP.md).
6. **Review:** the reviewer reads the code, runs it if needed, and either approves or requests changes
   with concrete comments. Review within 24 h.
7. **Merge** with *Squash and merge* (or *Merge commit* for multi-author branches) once checks are green
   and another member has approved. The author merges after that approval; nobody merges an unreviewed PR.
8. Merge to `main` deploys automatically. **Check the live URL** after the deploy job finishes.

## 2. Rules

* Nobody pushes to `main`. Branch protection enforces it, administrators included.
* Never commit `.env`, keys, connection strings or screenshots containing them. If it happens, tell the
  leader immediately and follow the runbook in [docs/ARCHITECTURE.md §8](docs/ARCHITECTURE.md#8-configuration-and-secrets).
* AI coding assistants are allowed, but **you must be able to explain every line of your PR**. Code you
  cannot explain does not count as your contribution.
* A PR that changes the topology, a Dockerfile, the workflow or an environment variable updates
  `docs/ARCHITECTURE.md` in the same PR.
* Keep PRs small: ideally under ~300 changed lines, one issue per PR.

## 3. Definition of Done

An issue is *Done* only when **all** of these are true:

- [ ] Merged to `main` through a reviewed PR with green checks
- [ ] Tests added or updated for the behaviour (or a sentence in the PR explaining why none)
- [ ] Works on the live URL (for user-facing changes) and with `docker compose up --build`
- [ ] Failure path handled (what does the user see when it goes wrong?)
- [ ] Docs updated if configuration, topology or API changed
- [ ] No secrets in the diff

## 4. Labels

| Label | Meaning |
|---|---|
| `area:backend` `area:frontend` `area:db` `area:ai` `area:devops` `area:docs` | Which part of the system |
| `type:feature` `type:bug` `type:chore` `type:docs` | Kind of work |
| `P0` `P1` `P2` | Needed to pass · needed for a strong grade · nice to have |
| `peer-review` | Found during the Week 9 peer review |
