import { test, expect } from "@playwright/test";

test.describe("Live room join", () => {
  test.beforeEach(async ({ page }) => {
    // Log in via dev bypass
    await page.goto("/api/auth/dev");
    await expect(page.locator("text=Active Rooms")).toBeVisible({ timeout: 10_000 });
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
    await expect(page.locator("text=Active Rooms")).toBeVisible({ timeout: 5_000 });

    await page.screenshot({
      path: "e2e/screenshots/live-after-leave.png",
      fullPage: true,
    });
  });
});
