# Fair-Share
A three-tier web app for housemates to track shared expenses, split costs, and reconcile balances, with AI-assisted expense entry. Final project for Software Development Platforms (72ITDS30103), Van Lang University.
## Run locally

Requirements: Docker Desktop (or Podman 4+ with a compose provider).

1. git clone git@github.com:NeitLN/Fair-Share.git
2. cd Fair-Share
3. cp .env.example .env   # then set DB_PASSWORD (letters and digits only)
4. docker compose up --build
5. Open http://localhost:3000 — database check: http://localhost:3000/health/db

Stop: docker compose down
Reset the database (data lost): docker compose down -v