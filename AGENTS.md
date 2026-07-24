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

### Configuration (injected secrets)

The backend's required config is provided as OS environment variables (Cursor secrets):
`DATABASE_URL`, `JWT_SECRET`, `BOARDY_EMAIL_ADDRESS`, `CORS_ALLOWED_ORIGINS`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and LLM provider keys
(`GROQ_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `COHERE_API_KEY`).
pydantic-settings gives these OS env vars precedence over `backend/.env`, so they are the source
of truth. `backend/.env` only holds non-secret local fallbacks (`DEBUG`, `CORS_ALLOWED_ORIGINS`).
These vars have no code defaults, so the backend will not boot without them.

### Startup caveats (not handled by the update script)

- PostgreSQL does NOT auto-start on this VM. Start it each session with:
  `sudo pg_ctlcluster 16 main start`
- The Postgres role and database must match `DATABASE_URL` (currently role/db `careeros`). They
  already exist on the snapshot disk. If the `DATABASE_URL` secret's password ever changes, re-sync
  the role password (run from a shell where `DATABASE_URL` is set):
  ```bash
  python3 - <<'PY'
  import os, urllib.parse as up, subprocess
  u = up.urlparse(os.environ["DATABASE_URL"])
  subprocess.run(["sudo","-u","postgres","psql","-c",
      f"ALTER ROLE {u.username} LOGIN PASSWORD '{u.password}';"])
  subprocess.run(["sudo","-u","postgres","psql","-tc",
      f"SELECT 1 FROM pg_database WHERE datname='{u.path.lstrip('/')}'"])
  PY
  ```
- Backend tables are auto-created on startup via SQLAlchemy `create_all` (no Alembic migrations run).
- Uvicorn `--reload` only reacts to `.py` changes; after editing `backend/.env` or changing secrets,
  restart the backend process to pick them up.

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

### Build Workspace IDE (`/build`)

- A single-page, Cursor-style AI coding IDE with a safety layer (scoped change plans, protected-path
  blocking, branch isolation, real verification). Frontend: `frontend/app/build/page.tsx` +
  `frontend/components/build/ide/*` (CodeMirror via `@uiw/react-codemirror` and `@codemirror/merge`
  for the side-by-side diff; both dynamically imported with `ssr:false`). The older
  `/build/new` and `/build/requests/[id]` pages still exist but the IDE is the primary entry.
- Backend lives in `app/services/build_workspace/` — the package is named `build_workspace` (not
  `build`) deliberately, because the repo's `.gitignore` has a generic `build/` rule; the frontend
  `frontend/app/build/` and `frontend/components/build/` dirs are tracked only via explicit `!`
  negations in `.gitignore` (keep those if you move files).
- Protected paths have a severity: `blocked` (auth/billing/db/secrets — never editable, even via
  expanded approval) vs `restricted` (API routes — editable only with explicit user approval).
  Secret files (`.env*`) are never served to the editor or the AI.
- Runtime working copies of the demo repo (real git branches + agent edits + `merge`) live under
  `backend/.build_workspace/` (gitignored), provisioned from `backend/app/build_demo/sample_repo/`
  and re-provisioned automatically if wiped. "Merge to main" does a real `git merge --no-ff` in the
  working copy; branch/PR remains a labeled **simulation** (no GitHub write access).
- The demo repo's verification (`lint`/`typecheck`/`test`/`build`) uses only Node built-ins (no
  `npm install`), so runs are fast and real. Execution needs an LLM key (brief + edits) and `git`.
- If `bw_*` table columns change, they are NOT auto-migrated (`create_all` only creates missing
  tables). Drop the `bw_*` tables and restart to recreate, or `ALTER TABLE`.
