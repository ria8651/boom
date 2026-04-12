import { test, expect } from "@playwright/test";

const PASSWORD = process.env.BOOM_PASSWORD;

test.describe("Live room join", () => {
  test.skip(!PASSWORD, "Skipped: BOOM_PASSWORD not set in .env.local");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("joins a room and shows video conference UI", async ({ page }) => {
    await page.locator('input[type="text"]').first().fill("playwright-test");
    await page.locator('input[type="text"]').nth(1).fill("e2e-test-room");
    await page.locator('input[type="password"]').fill(PASSWORD!);
    await page.locator('button[type="submit"]').click();

    // Should leave prejoin
    await expect(page.locator("h1")).not.toBeVisible({ timeout: 15_000 });

    // Wait for the room to fully connect
    const controlBar = page.locator(".lk-control-bar");
    await expect(controlBar).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Connecting")).not.toBeVisible({ timeout: 10_000 });

    // Wait for participant tiles to render
    await page.waitForTimeout(1_000);

    await page.screenshot({
      path: "e2e/screenshots/live-room.png",
      fullPage: true,
    });

    // Open chat panel
    const chatButton = page.locator("button").filter({ hasText: "Chat" });
    await chatButton.click();
    await expect(page.locator(".lk-chat")).toBeVisible({ timeout: 5_000 });

    // Send a test message
    const chatInput = page.locator(".lk-chat-form-input");
    await chatInput.fill("Hello from Playwright!");
    await chatInput.press("Enter");
    await page.waitForTimeout(500);

    await page.screenshot({
      path: "e2e/screenshots/live-chat.png",
      fullPage: true,
    });

    // Close chat
    const closeChat = page.locator(".lk-chat-header .lk-close-button");
    await closeChat.click();

    // Leave
    const leaveButton = page.locator(".lk-disconnect-button");
    await expect(leaveButton).toBeVisible();
    await leaveButton.click();
    await expect(page.locator("h1")).toHaveText("boom", { timeout: 5_000 });

    await page.screenshot({
      path: "e2e/screenshots/live-after-leave.png",
      fullPage: true,
    });
  });
});
