# Boom

## Commands

- `npm run dev` — unified dev server (Express + Vite HMR), port 3000
- `npm run build` — `tsc -b && vite build`
- `npm start` — production server
- `npm test` / `npm run test:unit` — Playwright e2e / Vitest

## Type Checking

Use `npx tsc -b`, not `tsc --noEmit`. Root tsconfig uses project references with `"files": []`, so `--noEmit` checks nothing.

## Auth

GitHub OAuth. Requires `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BOOM_SESSION_SECRET` env vars.
Access control via `BOOM_ALLOWED_USERS` (comma-separated GitHub usernames) and/or `BOOM_ALLOWED_ORGS` (comma-separated org slugs). If both empty, no one can log in (fail closed).

## Worktrees

When working in a worktree, if `.env.local` doesn't exist, copy `.env.example` to `.env.local` and fill in the values.

## Notes

- `isDev` requires explicit `NODE_ENV=development` — unset defaults to production (CSP on, no Vite)
- Settings persist in localStorage: `boom-layout-mode`, `boom-screenshare-settings`, `boom-mic-enabled`, `boom-cam-enabled`
