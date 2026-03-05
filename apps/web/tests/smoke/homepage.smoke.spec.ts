import { test, expect } from "@playwright/test";

test("Homepage renders value story and routes CTA to sign-up", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Parenthood moves fast. Stay ahead and present with Havi.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Havi captures what happens, remembers it, and keeps your care team aligned so you can focus on your child.",
    ),
  ).toBeVisible();
  await expect(page.getByTestId("home-hero-object")).toBeVisible();

  const primaryHero = page.getByTestId("home-cta-primary-hero");
  await expect(primaryHero).toHaveAttribute("href", "/auth/sign-up");
  await primaryHero.click();
  await page.waitForURL(/\/auth\/sign-up/);
});

test("Homepage keeps the same narrative hierarchy on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Parenthood moves fast. Stay ahead and present with Havi.",
    }),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", {
      level: 3,
      name: "Capture moments in conversation",
    }),
  ).toBeVisible();

  await page.getByRole("heading", {
    level: 3,
    name: "Coordinate care with less back-and-forth",
  }).scrollIntoViewIfNeeded();

  const proofCta = page.getByTestId("home-cta-primary-proof");
  await expect(proofCta).toHaveAttribute("href", "/auth/sign-up");

  await expect(
    page.getByRole("heading", {
      level: 3,
      name: "Coordinate care with less back-and-forth",
    }),
  ).toBeVisible();
});
