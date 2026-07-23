# CareerOS Marketing Site

A tiny, dependency-free static site for CareerOS. Landing page markup is composed
from small ESM component modules and rendered to `dist/index.html` at build time.

## Structure

- `src/app/page.js` — the landing route, composes the page from components
- `src/components/landing/*` — landing sections (Hero, Features, CTA)
- `src/components/ui/*` — reusable UI primitives (Button)
- `src/lib/tokens.js` — shared design tokens (colors, radius, font)
- `app/api/*` — backend API handlers (do not touch from marketing changes)
- `auth/*` — session/auth logic (do not touch)
- `db/*` — database schema (do not touch)

## Commands

- `npm run lint` — style checks (no console.log, no trailing whitespace)
- `npm run typecheck` — syntax-checks every source module with `node --check`
- `npm test` — runs the test suite with Node's built-in test runner
- `npm run build` — renders the site to `dist/`
