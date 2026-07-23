# AGENTS.md

## Cursor Cloud specific instructions

Careerstack is a two-app monorepo for one product: a Next.js 14 frontend (`frontend/`)
and a FastAPI backend (`backend/`), backed by PostgreSQL. See `README.md` for the full
product/architecture overview and the standard run commands.

### Services

| Service | Dir | Dev command | Port |
|---------|-----|-------------|------|
| Backend API (FastAPI/Uvicorn) | `backend/` | `.venv/bin/uvicorn app.main:app --reload --port 8000` | 8000 |
| Frontend (Next.js) | `frontend/` | `npm run dev` | 3000 |
| PostgreSQL | — | see below | 5432 |

The frontend targets the backend via `NEXT_PUBLIC_API_BASE` (defaults to `http://localhost:8000`).

### Startup caveats (not handled by the update script)

- PostgreSQL does NOT auto-start on this VM. Start it each session with:
  `sudo pg_ctlcluster 16 main start`
  The dev database `careerstack` and role `postgres` (password `postgres`) already exist on the
  snapshot disk; the backend connects via `DATABASE_URL` in `backend/.env`.
- `backend/.env` is gitignored and already present on the snapshot. It is REQUIRED for the
  backend to boot: `DATABASE_URL`, `JWT_SECRET`, `BOARDY_EMAIL_ADDRESS`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` have no defaults. The Google/Boardy values
  are placeholders — real Gmail/Boardy features need a real Google Cloud OAuth client.
- Backend tables are auto-created on startup via SQLAlchemy `create_all` (no Alembic migrations run).

### Feature gating without API keys

- AI features (resume/LinkedIn parsing, resume rewrite, JD parsing, Boardy reply parsing) require
  at least one LLM provider key (e.g. `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`,
  `MISTRAL_API_KEY`, `COHERE_API_KEY`, `ANTHROPIC_API_KEY`) in `backend/.env`. Without a key these
  endpoints fail with a 503 by design.
- The GitHub onboarding import (`POST /onboarding/import-github`) needs NO key — it uses GitHub's
  public API — so it is the reliable end-to-end smoke test of backend + Postgres + frontend.

### Lint / typecheck / build

- Frontend has no dedicated lint script. Use `npx tsc --noEmit` for type checking and
  `npm run build` (which also runs Next's lint) from `frontend/`.
- There is no automated test suite in this repo.

### Gotchas

- A stale `frontend/.next` cache can cause a blank page with 404s for `layout.css`/`page.js`
  chunks. Fix: stop the dev server, remove `frontend/.next`, and re-run `npm run dev`.
