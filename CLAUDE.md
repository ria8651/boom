# Boom

## Commands

- `npm run dev` — unified dev server (Express + Vite HMR), port 3000
- `npm run build` — `tsc -b && vite build`
- `npm start` — production server
- `npm test` / `npm run test:unit` — Playwright e2e / Vitest

## Type Checking

Use `npx tsc -b`, not `tsc --noEmit`. Root tsconfig uses project references with `"files": []`, so `--noEmit` checks nothing.

## Notes

- `isDev` requires explicit `NODE_ENV=development` — unset defaults to production (CSP on, no Vite)
- Settings persist in localStorage: `boom-layout-mode`, `boom-screenshare-settings`, `boom-mic-enabled`, `boom-cam-enabled`
