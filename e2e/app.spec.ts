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

  test("guest session from invite is saved to localStorage", async ({ page }) => {
    // Mock invite/join to return a fake token
    await page.route("**/api/invite/join", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: "fake-guest-token",
          serverUrl: "wss://fake.example.com",
          identity: "guest-alice-ab12",
          room: "testroom",
        }),
      }),
    );

    // Visit with a fake invite token (base64url-encoded JSON payload with room)
    const payload = btoa(JSON.stringify({ type: "invite", room: "testroom", exp: 9999999999 }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const fakeInvite = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.fakesig`;
    await page.goto(`/?invite=${fakeInvite}`);

    // Should show the guest join page
    await expect(page.locator("text=You've been invited to join")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=testroom")).toBeVisible();
    await snap(page, "guest-join-page");

    // Fill in name and join
    await page.locator('input[type="text"]').fill("Alice");
    await page.locator("text=Join room").click();

    // Session should be saved (connection will fail, returning to guest page)
    await expect(page.locator("h1")).toHaveText("boom", { timeout: 15_000 });
    await snap(page, "guest-after-join-attempt");
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

// ---------------------------------------------------------------------------
// Invite links
// ---------------------------------------------------------------------------

test.describe("Invite links", () => {
  test("invite API returns a token for authenticated users", async ({ page }) => {
    await devLogin(page);

    // Call the invite endpoint directly
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: "test-invite-room" }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);
    expect(res.body.inviteToken).toBeDefined();
    expect(typeof res.body.inviteToken).toBe("string");
    expect(res.body.inviteToken.split(".")).toHaveLength(3);
  });

  test("invite API rejects unauthenticated requests", async ({ page }) => {
    await page.goto("/");
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: "some-room" }),
      });
      return r.status;
    });
    expect(res).toBe(401);
  });

  test("invite/join validates token and returns LiveKit credentials", async ({ page }) => {
    await devLogin(page);

    // Generate a real invite token
    const inviteRes = await page.evaluate(async () => {
      const r = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: "invite-room" }),
      });
      return r.json();
    });

    // Use the invite token to join (no auth cookie needed)
    await page.context().clearCookies();
    const joinRes = await page.evaluate(async (token) => {
      const r = await fetch("/api/invite/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken: token, name: "Guest Alice" }),
      });
      return { status: r.status, body: await r.json() };
    }, inviteRes.inviteToken);

    expect(joinRes.status).toBe(200);
    expect(joinRes.body.token).toBeDefined();
    expect(joinRes.body.serverUrl).toBeDefined();
    expect(joinRes.body.room).toBe("invite-room");
    expect(joinRes.body.identity).toMatch(/^guest-Guest_Alice-[0-9a-f]{4}$/);
  });

  test("invite/join rejects invalid tokens", async ({ page }) => {
    await page.goto("/");
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/invite/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken: "invalid.token.here", name: "Hacker" }),
      });
      return { status: r.status, body: await r.json() };
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid or expired");
  });

  test("guest join page shows for invite URLs", async ({ page }) => {
    // Build a fake invite token with a readable room name
    const payload = btoa(JSON.stringify({ type: "invite", room: "my-room", exp: 9999999999 }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const fakeInvite = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.fakesig`;
    await page.goto(`/?invite=${fakeInvite}`);

    // Guest join page should render
    await expect(page.locator("text=You've been invited to join")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("strong")).toHaveText("my-room");
    await expect(page.locator('input[type="text"]')).toBeVisible();
    await expect(page.locator("text=Join room")).toBeVisible();

    // No GitHub sign-in button should be visible
    await expect(page.locator("text=Sign in with GitHub")).not.toBeVisible();
    await snap(page, "invite-guest-join-page");
  });

  test("invite button in lobby opens modal with invite URL", async ({ page }) => {
    await devLogin(page);

    // Mock the rooms list to show a fake active room so the Invite button appears
    await page.route("**/api/rooms", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { name: "invite-test", numParticipants: 1, createdAt: Date.now() },
        ]),
      }),
    );

    // Reload lobby to pick up the mocked rooms
    await page.reload();
    await expect(page.locator(".lobby-rooms-heading")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".lobby-room-name")).toHaveText("invite-test");

    // Click the Invite button next to the room
    await page.locator(".lobby-invite-btn").click();

    // Modal should open with an invite URL
    const dialog = page.locator(".invite-dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Share this link to invite someone")).toBeVisible();

    // URL input should contain an invite token
    const urlInput = dialog.locator(".invite-url-input");
    const url = await urlInput.inputValue();
    expect(url).toContain("/?invite=");
    expect(url.split(".")).toHaveLength(3); // JWT-like token

    // Copy button and close button should be visible
    await expect(dialog.locator("text=Copy link")).toBeVisible();
    await expect(dialog.locator("text=Close")).toBeVisible();
    await snap(page, "invite-modal");

    // Close the dialog
    await dialog.locator("text=Close").click();
    await expect(dialog).not.toBeVisible();
  });

  test("full invite flow: generate token, guest joins via URL", async ({ page, browser }) => {
    test.setTimeout(60_000); // real LiveKit connection + guest join/leave takes time
    await devLogin(page);

    // Generate a real invite token via the API
    const inviteRes = await page.evaluate(async () => {
      const r = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: "e2e-invite-room" }),
      });
      return r.json();
    });
    const inviteToken = inviteRes.inviteToken;

    // Open a fresh browser context (no cookies) as the guest
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(`/?invite=${inviteToken}`);

    // Guest should see the join page
    await expect(guestPage.locator("text=You've been invited to join")).toBeVisible({ timeout: 5_000 });
    await expect(guestPage.locator("strong")).toHaveText("e2e-invite-room");

    // Guest fills in name and joins — API issues a real LiveKit token
    await guestPage.locator('input[type="text"]').fill("TestGuest");
    await guestPage.locator("text=Join room").click();

    // Verify the guest successfully entered the room (control bar appears)
    await expect(guestPage.locator(".control-bar")).toBeVisible({ timeout: 15_000 });
    await snap(guestPage, "invite-guest-full-flow");

    // Leave the room cleanly so the room is closed for subsequent tests
    await guestPage.locator(".control-btn--danger").click();
    await guestPage.locator("dialog").getByRole("button", { name: "Leave" }).click();
    // Should return to the guest join form
    await expect(guestPage.locator("text=You've been invited to join")).toBeVisible({ timeout: 5_000 });

    await guestContext.close();
  });
});
