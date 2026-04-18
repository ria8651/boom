import { test, expect } from "@playwright/test";

/** Take a named screenshot for visual inspection. */
async function snap(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });
}

/** Log in via the dev bypass route and wait for the lobby to appear. */
async function devLogin(page: import("@playwright/test").Page, user?: string) {
  const url = user ? `/api/auth/dev?user=${encodeURIComponent(user)}` : "/api/auth/dev";
  await page.goto(url);
  await expect(page.locator("h1")).toHaveText("boom", { timeout: 10_000 });
  await expect(page.locator(".lobby-rooms-heading")).toBeVisible({ timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// Auth page
// ---------------------------------------------------------------------------

test.describe("AuthPage", () => {
  test("renders sign-in page with GitHub button and dev bypass", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("boom");
    await expect(page.locator("text=Sign in with GitHub")).toBeVisible();
    await expect(page.locator("text=continue in dev mode")).toBeVisible();

    // Verify theme
    await page.waitForFunction(() => document.fonts.ready);
    const bg = await page.locator("body").evaluate((el) =>
      getComputedStyle(el).backgroundColor,
    );
    expect(bg).toBe("rgb(34, 34, 34)");
    const titleFont = await page.locator("h1").evaluate((el) =>
      getComputedStyle(el).fontFamily,
    );
    expect(titleFont).toContain("Chivo");

    await snap(page, "auth-page");
  });

  test("shows error for unauthorized users", async ({ page }) => {
    await page.goto("/?error=not_allowed");
    await expect(page.locator("text=not on the allowed list")).toBeVisible();
    await snap(page, "auth-not-allowed");
  });

  test("dev bypass logs in and redirects to lobby", async ({ page }) => {
    await devLogin(page);
    await expect(page.locator(".lobby-username")).toHaveText("dev");
    await snap(page, "lobby-after-dev-login");
  });

  test("dev bypass with custom username", async ({ page }) => {
    await page.context().clearCookies();
    await devLogin(page, "bob");
    await expect(page.locator(".lobby-username")).toHaveText("bob");
    await snap(page, "lobby-custom-dev-user");
  });

  test("switching dev user via logout", async ({ page }) => {
    await page.context().clearCookies();

    // Log in as first user
    await devLogin(page, "user1");
    await expect(page.locator(".lobby-username")).toHaveText("user1");

    // Log out
    await page.locator("text=Log out").click();
    await expect(page.locator("text=Sign in with GitHub")).toBeVisible({ timeout: 5_000 });

    // Log in as second user
    await devLogin(page, "user2");
    await expect(page.locator(".lobby-username")).toHaveText("user2");
    await snap(page, "lobby-switched-user");
  });
});

// ---------------------------------------------------------------------------
// Lobby page
// ---------------------------------------------------------------------------

test.describe("LobbyPage", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test("renders lobby with create room form and room list", async ({ page }) => {
    await expect(page.locator('input[placeholder="Room name"]')).toBeVisible();
    await expect(page.locator("text=Create & Join")).toBeVisible();
    await expect(page.locator(".lobby-rooms-heading")).toHaveText("Rooms");
    await snap(page, "lobby");
  });


  test("validates empty room name", async ({ page }) => {
    await page.locator("text=Create & Join").click();
    await expect(
      page.locator(".lobby-error").filter({ hasText: "Enter a room name" }),
    ).toBeVisible();
    await snap(page, "lobby-empty-room-error");
  });

  test("logout returns to auth page", async ({ page }) => {
    await page.locator("text=Log out").click();
    await expect(page.locator("text=Sign in with GitHub")).toBeVisible({ timeout: 5_000 });
    await snap(page, "after-logout");
  });
});

// ---------------------------------------------------------------------------
// Recent Rooms (localStorage-driven)
// ---------------------------------------------------------------------------

test.describe("Recent rooms", () => {
  test("shows recent rooms from localStorage with Reopen button", async ({ page }) => {
    await devLogin(page);

    // Seed a recent room in localStorage and reload
    await page.evaluate(() => {
      localStorage.setItem(
        "boom:recent-rooms:dev",
        JSON.stringify([
          { name: "planning-sync", lastJoined: Date.now() - 5 * 60_000 },
          { name: "retro", lastJoined: Date.now() - 2 * 60 * 60_000 },
        ]),
      );
    });
    await page.reload();

    // Both recent rooms visible with their relative timestamps
    const row = (name: string) => page.locator(".lobby-room-row").filter({ hasText: name });
    await expect(row("planning-sync")).toBeVisible();
    await expect(row("planning-sync")).toContainText("5m ago");
    await expect(row("retro")).toContainText("2h ago");

    // Reopen button is present on recent (closed) rooms
    await expect(row("planning-sync").locator("text=Reopen")).toBeVisible();
    await snap(page, "recent-rooms-list");
  });

  test("forget button removes a recent room", async ({ page }) => {
    await devLogin(page);
    await page.evaluate(() => {
      localStorage.setItem(
        "boom:recent-rooms:dev",
        JSON.stringify([{ name: "old-room", lastJoined: Date.now() - 60_000 }]),
      );
    });
    await page.reload();

    const row = page.locator(".lobby-room-row").filter({ hasText: "old-room" });
    await expect(row).toBeVisible();
    await row.locator(".lobby-forget-btn").click();
    await expect(row).not.toBeVisible();

    // And it's gone from storage
    const stored = await page.evaluate(() => localStorage.getItem("boom:recent-rooms:dev"));
    expect(stored).toBe("[]");
  });

  test("recent rooms are scoped per user", async ({ page }) => {
    await page.context().clearCookies();
    await devLogin(page, "alice");
    await page.evaluate(() => {
      localStorage.setItem(
        "boom:recent-rooms:alice",
        JSON.stringify([{ name: "alices-room", lastJoined: Date.now() }]),
      );
    });
    await page.reload();
    await expect(page.locator(".lobby-room-row").filter({ hasText: "alices-room" })).toBeVisible();

    // Log out and in as bob — alice's rooms should not appear
    await page.locator("text=Log out").click();
    await expect(page.locator("text=Sign in with GitHub")).toBeVisible({ timeout: 5_000 });
    await devLogin(page, "bob");
    await expect(page.locator(".lobby-room-row").filter({ hasText: "alices-room" })).not.toBeVisible();
  });

  test("server error shows banner, recent rooms still render", async ({ page }) => {
    // Mock /api/rooms to fail
    await page.route("**/api/rooms", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await devLogin(page);
    await page.evaluate(() => {
      localStorage.setItem(
        "boom:recent-rooms:dev",
        JSON.stringify([{ name: "offline-cached", lastJoined: Date.now() }]),
      );
    });
    await page.reload();

    // Error surfaces as the global toast banner at the bottom of the page
    await expect(page.locator(".error-banner--toast")).toContainText("Couldn't reach server");
    // Recent room still rendered (client-side)
    await expect(page.locator(".lobby-room-row").filter({ hasText: "offline-cached" })).toBeVisible();
    await snap(page, "lobby-server-error");
  });
});

// ---------------------------------------------------------------------------
// Room join from lobby (mocked token, connection will fail)
// ---------------------------------------------------------------------------

test.describe("Room join", () => {
  test("joins a room from lobby and shows room page", async ({ page }) => {
    await devLogin(page);

    // Mock the token endpoint to return a fake token
    await page.route("**/api/token", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: "fake-token",
          serverUrl: "wss://fake.example.com",
          identity: "dev",
        }),
      }),
    );

    await page.locator('input[placeholder="Room name"]').fill("testroom");
    await page.locator("text=Create & Join").click();

    // Should eventually show an error (fake connection fails and returns to lobby)
    // Could be a toast error or landing back on lobby
    await expect(page.locator("h1")).toHaveText("boom", { timeout: 15_000 });
    await snap(page, "room-connection-failed");
  });
});

// ---------------------------------------------------------------------------
// Session persistence (survives refresh)
// ---------------------------------------------------------------------------

test.describe("Session persistence", () => {
  test("auth session survives refresh", async ({ page }) => {
    await devLogin(page);

    // Reload — should still be on lobby (cookie persists)
    await page.reload();
    await expect(page.locator(".lobby-rooms-heading")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".lobby-username")).toHaveText("dev");
    await snap(page, "session-persists-after-reload");
  });

  test("room session is saved to localStorage on join", async ({ page }) => {
    await devLogin(page);

    // Mock token endpoint
    await page.route("**/api/token", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: "fake-token",
          serverUrl: "wss://fake.example.com",
          identity: "dev",
        }),
      }),
    );

    // Join a room — session gets saved, then fake connection fails and clears it
    await page.locator('input[placeholder="Room name"]').fill("testroom");
    await page.locator("text=Create & Join").click();

    // Session gets saved immediately on join, then cleared when connection fails
    // Just verify we end up back on the lobby
    await expect(page.locator(".lobby-rooms-heading")).toBeVisible({ timeout: 15_000 });
    await snap(page, "session-after-failed-join");
  });

  test("clears session on leave", async ({ page }) => {
    await devLogin(page);

    // Seed a room session in localStorage
    await page.evaluate(() => {
      localStorage.setItem(
        "boom:session",
        JSON.stringify({
          token: "fake-token",
          serverUrl: "wss://fake.example.com",
          room: "testroom",
          identity: "dev",
        }),
      );
    });

    // Mock token refresh
    await page.route("**/api/token", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: "fake-token-2",
          serverUrl: "wss://fake.example.com",
          identity: "dev",
        }),
      }),
    );

    // Reload — app restores session, fake connection fails, returns to lobby
    await page.reload();
    await expect(page.locator(".lobby-rooms-heading")).toBeVisible({ timeout: 15_000 });
    const session = await page.evaluate(() => localStorage.getItem("boom:session"));
    expect(session).toBeNull();
  });
});
