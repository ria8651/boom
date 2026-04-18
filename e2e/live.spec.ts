import { test, expect } from "@playwright/test";

test.describe("Live room join", () => {
  test.beforeEach(async ({ page }) => {
    // Log in via dev bypass
    await page.goto("/api/auth/dev");
    await expect(page.locator(".lobby-rooms-heading")).toBeVisible({ timeout: 10_000 });
  });

  test("joins a room and shows video conference UI", async ({ page }) => {
    await page.locator('input[placeholder="Room name"]').fill("e2e-test-room");
    await page.locator("text=Create & Join").click();

    // Should leave lobby — control bar appears when room connects
    const controlBar = page.locator(".control-bar");
    await expect(controlBar).toBeVisible({ timeout: 15_000 });

    // Wait for participant tiles to render
    await page.waitForTimeout(1_000);

    await page.screenshot({
      path: "e2e/screenshots/live-room.png",
      fullPage: true,
    });

    // Open chat panel
    const chatButton = page.locator("button").filter({ hasText: "Chat" });
    await chatButton.click();
    await expect(page.locator(".chat-panel")).toBeVisible({ timeout: 5_000 });

    // Send a test message
    const chatInput = page.locator(".chat-input");
    await chatInput.fill("Hello from Playwright!");
    await chatInput.press("Enter");
    await page.waitForTimeout(500);

    await page.screenshot({
      path: "e2e/screenshots/live-chat.png",
      fullPage: true,
    });

    // Close chat
    await page.locator(".chat-close").click();

    // Leave — confirm the leave dialog, then return to lobby
    const leaveButton = page.locator(".control-btn--danger");
    await expect(leaveButton).toBeVisible();
    await leaveButton.click();
    // Confirm the leave dialog
    await page.locator("dialog").getByRole("button", { name: "Leave" }).click();
    await expect(page.locator(".lobby-rooms-heading")).toBeVisible({ timeout: 5_000 });

    await page.screenshot({
      path: "e2e/screenshots/live-after-leave.png",
      fullPage: true,
    });
  });

  test("start/stop recording toggles banner and button state", async ({ page }) => {
    // Mock the recording endpoints so this test doesn't require the full
    // egress + redis stack — we only care that the UI wires up correctly.
    await page.route("**/api/recordings/start", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ egressId: "EG_test_123" }),
      });
    });
    await page.route("**/api/recordings/stop", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    // Join a room
    await page.locator('input[placeholder="Room name"]').fill("rec-e2e-test");
    await page.locator("text=Create & Join").click();
    await expect(page.locator(".control-bar")).toBeVisible({ timeout: 15_000 });

    // Initial state: Record button shows "Record", no banner
    const recordBtn = page.locator(".control-btn").filter({ hasText: "Record" });
    await expect(recordBtn).toBeVisible();
    await expect(page.locator(".recording-banner")).not.toBeVisible();

    // Click Record — note the metadata round-trip through LiveKit can take a moment
    await recordBtn.click();

    // Banner + button state change when LiveKit propagates the metadata update
    await expect(page.locator(".recording-banner")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".recording-dot")).toBeVisible();
    const stopBtn = page.locator(".control-btn--recording");
    await expect(stopBtn).toBeVisible();
    await expect(stopBtn).toContainText("Stop rec");

    await page.screenshot({
      path: "e2e/screenshots/live-recording-active.png",
      fullPage: true,
    });

    // Stop recording — banner disappears, button reverts
    await stopBtn.click();
    await expect(page.locator(".recording-banner")).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".control-btn--recording")).not.toBeVisible();
  });

  test("recent rooms list populated after joining", async ({ page }) => {
    await page.locator('input[placeholder="Room name"]').fill("recent-test-room");
    await page.locator("text=Create & Join").click();
    await expect(page.locator(".control-bar")).toBeVisible({ timeout: 15_000 });

    // Leave
    await page.locator(".control-btn--danger").click();
    await page.locator(".leave-dialog-btn--danger").click();
    await expect(page.locator(".lobby-rooms-heading")).toBeVisible({ timeout: 5_000 });

    // Room should appear in recent rooms (either active if still alive, or recent)
    const row = page.locator(".lobby-room-row").filter({ hasText: "recent-test-room" });
    await expect(row).toBeVisible({ timeout: 5_000 });
  });
});
