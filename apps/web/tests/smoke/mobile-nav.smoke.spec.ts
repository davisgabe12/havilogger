import { test, expect } from "@playwright/test";
import {
  completeOnboardingIfNeeded,
  signInOrSignUpForSmoke,
  waitForAppCoreReady,
} from "./helpers/app-bootstrap";

test("Mobile side tray is visible and navigable in app shell", async ({ page }) => {
  test.setTimeout(180_000);

  await signInOrSignUpForSmoke(page);
  await completeOnboardingIfNeeded(page);
  await waitForAppCoreReady(page);
  await expect(page.getByTestId("app-ready")).toBeVisible();

  const menuButton = page.getByRole("button", { name: "Menu" }).first();
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  const overlayClose = page.getByLabel("Close navigation overlay");
  const mobileTray = page.locator("div.fixed.inset-0.z-50 aside");
  await expect(overlayClose).toBeVisible();
  await expect(mobileTray).toBeVisible();
  await expect(mobileTray.getByTestId("mobile-side-sign-out")).toBeVisible();

  await page.screenshot({
    path: `test-results/mobile-nav-tray-open-${Date.now()}.png`,
    fullPage: true,
  });

  const settingsNavButton = mobileTray.getByTestId("nav-settings");
  await expect(settingsNavButton).toBeVisible();
  await settingsNavButton.click();

  await expect(overlayClose).toHaveCount(0);
  await expect(page.getByTestId("open-invite")).toBeVisible();
  await expect(page.getByTestId("app-ready")).toBeVisible();

  await page.screenshot({
    path: `test-results/mobile-nav-settings-active-${Date.now()}.png`,
    fullPage: true,
  });

  await menuButton.click();
  await expect(overlayClose).toBeVisible();
  await overlayClose.click();
  await expect(overlayClose).toHaveCount(0);
  await expect(page.getByTestId("app-ready")).toBeVisible();
});
