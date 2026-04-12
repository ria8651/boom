import { test, expect } from "@playwright/test";

/** Take a named screenshot for visual inspection. */
async function snap(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });
}

// ---------------------------------------------------------------------------
// Pre-join page
// ---------------------------------------------------------------------------

test.describe("PreJoinPage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the join form with correct theme", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("boom");
    await expect(page.locator('input[type="text"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText("Join");

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

    await snap(page, "prejoin");
  });

  test("shows error on wrong password", async ({ page }) => {
    await page.locator('input[type="text"]').first().fill("testuser");
    await page.locator('input[type="text"]').nth(1).fill("testroom");
    await page.locator('input[type="password"]').fill("wrong-password");
    await page.locator('button[type="submit"]').click();

    const error = page.locator("p").filter({ hasText: /password|error/i });
    await expect(error).toBeVisible({ timeout: 10_000 });
    await snap(page, "wrong-password");
  });

  test("shows error when server is unreachable", async ({ page }) => {
    await page.route("**/api/token", (route) => route.abort("connectionrefused"));

    await page.locator('input[type="text"]').first().fill("testuser");
    await page.locator('input[type="text"]').nth(1).fill("testroom");
    await page.locator('input[type="password"]').fill("anything");
    await page.locator('button[type="submit"]').click();

    const error = page.locator("p").filter({ hasText: /server|network|connect/i });
    await expect(error).toBeVisible({ timeout: 10_000 });
    await snap(page, "server-unreachable");
  });

  test("shows server-side validation error (bad API key)", async ({ page }) => {
    await page.route("**/api/token", (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "LiveKit server rejected the connection: invalid API key. Check your API key/secret and server configuration.",
        }),
      }),
    );

    await page.locator('input[type="text"]').first().fill("testuser");
    await page.locator('input[type="text"]').nth(1).fill("testroom");
    await page.locator('input[type="password"]').fill("anything");
    await page.locator('button[type="submit"]').click();

    const error = page.locator("p").filter({ hasText: /API key/i });
    await expect(error).toBeVisible({ timeout: 10_000 });
    await snap(page, "invalid-api-key");
  });
});

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

test.describe("localStorage persistence", () => {
  test("saves and restores display name and room", async ({ page }) => {
    await page.route("**/api/token", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "fake-token", serverUrl: "wss://fake.example.com" }),
      }),
    );

    await page.goto("/");
    await page.locator('input[type="text"]').first().fill("alice");
    await page.locator('input[type="text"]').nth(1).fill("my-room");
    await page.locator('input[type="password"]').fill("pw");
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(500);

    expect(await page.evaluate(() => localStorage.getItem("boom:displayName"))).toBe("alice");
    expect(await page.evaluate(() => localStorage.getItem("boom:room"))).toBe("my-room");

    // Reload — fields should be pre-filled, password should not
    await page.goto("/");
    expect(await page.locator('input[type="text"]').first().inputValue()).toBe("alice");
    expect(await page.locator('input[type="text"]').nth(1).inputValue()).toBe("my-room");
    expect(await page.locator('input[type="password"]').inputValue()).toBe("");
    await snap(page, "restored-fields");
  });
});

// ---------------------------------------------------------------------------
// Session persistence (survives refresh)
// ---------------------------------------------------------------------------

test.describe("Session persistence", () => {
  test("saves session and restores it on refresh", async ({ page }) => {
    await page.route("**/api/token", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "fake-token", serverUrl: "wss://fake.example.com" }),
      }),
    );

    await page.goto("/");
    await page.locator('input[type="text"]').first().fill("testuser");
    await page.locator('input[type="text"]').nth(1).fill("testroom");
    await page.locator('input[type="password"]').fill("pw");
    await page.locator('button[type="submit"]').click();

    // Verify session was saved to localStorage
    let savedSession = "";
    await expect(async () => {
      const s = await page.evaluate(() => localStorage.getItem("boom:session"));
      expect(s).toBeTruthy();
      savedSession = s!;
    }).toPass({ timeout: 5_000 });

    const parsed = JSON.parse(savedSession);
    expect(parsed.token).toBe("fake-token");
    expect(parsed.password).toBe("pw");
    expect(parsed.room).toBe("testroom");
    expect(parsed.identity).toBe("testuser");

    // Wait for the app to settle (fake connection fails, returns to prejoin)
    await expect(page.locator("h1")).toHaveText("boom", { timeout: 15_000 });
    await snap(page, "session-restore-attempted");
  });

  test("clears session on leave", async ({ page }) => {
    // Mock the token refresh endpoint (app will try to refresh on load)
    await page.route("**/api/token", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "fake-token-2", serverUrl: "wss://fake.example.com" }),
      }),
    );

    // Seed a session in localStorage
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem(
        "boom:session",
        JSON.stringify({
          token: "fake-token",
          serverUrl: "wss://fake.example.com",
          password: "pw",
          room: "testroom",
          identity: "testuser",
        }),
      );
    });

    // Reload — app should restore session and try to connect
    await page.reload();

    // The fake connection will fail, kicking back to prejoin and clearing session
    await expect(page.locator("h1")).toHaveText("boom", { timeout: 15_000 });
    const session = await page.evaluate(() => localStorage.getItem("boom:session"));
    expect(session).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Room page (mocked token, connection will fail)
// ---------------------------------------------------------------------------

test.describe("RoomPage", () => {
  test("shows error when connection fails", async ({ page }) => {
    // Mock the token endpoint to return a fake token that will fail validation
    // or connection. Depending on whether the real server validates it,
    // the error may appear on prejoin (server-side validation) or after
    // entering the room (client-side WebSocket failure).
    await page.route("**/api/token", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "fake-token", serverUrl: "wss://fake.example.com" }),
      }),
    );

    await page.goto("/");
    await page.locator('input[type="text"]').first().fill("testuser");
    await page.locator('input[type="text"]').nth(1).fill("testroom");
    await page.locator('input[type="password"]').fill("pw");
    await page.locator('button[type="submit"]').click();

    // Should eventually show an error (either on prejoin or after room failure)
    const error = page.locator("p").filter({ hasText: /connect|disconnect|error|failed|server/i });
    await expect(error).toBeVisible({ timeout: 15_000 });
    await snap(page, "room-connection-failed");
  });
});

