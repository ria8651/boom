# Boom

## Commands

- `npm run dev` — unified dev server (Express + Vite HMR), port 3000
- `npm run build` — `tsc -b && vite build`
- `npm start` — production server
- `npm test` / `npm run test:unit` — Playwright e2e / Vitest

## Type Checking

Use `npx tsc -b`, not `tsc --noEmit`. Root tsconfig uses project references with `"files": []`, so `--noEmit` checks nothing.

## Auth

Bastion SSO (../bastion). Set `BASTION_ORIGIN` to the bastion service URL (e.g. `https://auth.example.com`); `BASTION_SERVICE_SLUG` defaults to `boom`. Register boom at `<bastion>/admin/services` with Return URL = `<this host>/api/auth/bastion`. Requires `BOOM_SESSION_SECRET` for the local session cookie. Bastion grants are the access gate.

When `BASTION_ORIGIN` is unset, auth is disabled and a default `dev` identity is injected into every request — fine for local hacking, never expose unconfigured.

## Worktrees

When working in a worktree, if `.env` doesn't exist, copy `.env.example` to `.env` and fill in the values. Both `npm run dev` and `docker compose` read from `.env`.

## Notes

- `isDev` requires explicit `NODE_ENV=development` — unset defaults to production (CSP on, no Vite)
- Settings persist in localStorage: `boom-layout-mode`, `boom-screenshare-settings`, `boom-mic-enabled`, `boom-cam-enabled`

## Semantic HTML

Prefer semantic HTML elements over generic `<div>` or JS-managed equivalents. Use landmarks (`<main>`, `<header>`, `<nav>`, `<section>`, `<footer>`) for page structure, and native primitives (`<dialog>`, `<details>`, `<form>`, `<button>`) for interactive widgets. Only reach for a `<div>` when no semantic element fits.
