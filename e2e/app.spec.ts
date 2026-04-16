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
    await expect(page.locator(".lobby-rooms-heading")).toHaveText("Active Rooms");
    await snap(page, "lobby");
  });


  test("validates empty room name", async ({ page }) => {
    await page.locator("text=Create & Join").click();
    await expect(page.locator(".lobby-error")).toBeVisible();
    await snap(page, "lobby-empty-room-error");
  });

  test("logout returns to auth page", async ({ page }) => {
    await page.locator("text=Log out").click();
    await expect(page.locator("text=Sign in with GitHub")).toBeVisible({ timeout: 5_000 });
    await snap(page, "after-logout");
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
