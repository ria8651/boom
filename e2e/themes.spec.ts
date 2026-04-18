import { test, expect } from "@playwright/test";

test.describe("Themes", () => {
  test("terminal theme renders the room in green phosphor", async ({ page }) => {
    // Log in via dev bypass, then create a room
    await page.goto("/api/auth/dev");
    await expect(page.locator("text=Active Rooms")).toBeVisible({ timeout: 10_000 });
    await page.locator('input[placeholder="Room name"]').fill("theme-terminal");
    await page.locator("text=Create & Join").click();

    // Wait for the room UI
    await expect(page.locator(".control-bar")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1_000);

    // Open Settings and switch to Terminal theme
    await page.locator("button").filter({ hasText: "Settings" }).click();
    const settingsDialog = page.locator("dialog.settings-dialog");
    await expect(settingsDialog).toBeVisible();
    await settingsDialog.locator('input[value="terminal"]').check();

    // Close the settings dialog via the Done button
    await settingsDialog.getByRole("button", { name: "Done" }).click();
    await expect(settingsDialog).toBeHidden();
    await page.waitForTimeout(300);

    // Theme should be applied to <html data-theme="terminal">
    await expect(page.locator("html")).toHaveAttribute("data-theme", "terminal");

    await page.screenshot({
      path: "e2e/screenshots/theme-terminal-room.png",
      fullPage: true,
    });

    // Also capture the lobby in terminal theme
    const leaveButton = page.locator(".control-btn--danger");
    await leaveButton.click();
    await page.locator("dialog").getByRole("button", { name: "Leave" }).click();
    await expect(page.locator("text=Active Rooms")).toBeVisible({ timeout: 5_000 });

    await page.screenshot({
      path: "e2e/screenshots/theme-terminal-lobby.png",
      fullPage: true,
    });
  });
});
