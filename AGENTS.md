# boom — agent notes

This file is for agent-specific notes that don't belong in `README.md` (for humans) or `CLAUDE.md` (for everyday Claude Code instructions).

## Updating README screenshots

The screenshots referenced from `README.md` live in `docs/`. They're produced by the Playwright e2e tests and then copied into `docs/` by the `screenshots` npm script.

**Prerequisites:** the dev server must already be running on port 3000 (`npm run dev` in another terminal) because Playwright connects to the live app.

```bash
npm run screenshots
```

What it does:
1. Runs the full Playwright suite (which writes PNGs to `e2e/screenshots/`).
2. Copies the canonical ones into `docs/` — `auth.png`, `lobby.png`, `live-room.png`, `live-chat.png`, `theme-terminal.png`.

If you add a new screenshot to the README, add the corresponding `cp` to the `screenshots` script so it stays reproducible.
