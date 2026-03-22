const readEnv = (name: string): string => {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
};

export const gotoAuthWithRetry = async (
  page: any,
  path: "/auth/sign-in" | "/auth/sign-up",
) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retriable =
        message.includes("net::ERR_ABORTED") || message.includes("frame was detached");
      if (!retriable || attempt === 1) {
        throw error;
      }
      await page.waitForTimeout(750);
    }
  }
};

export const signInOrSignUpForSmoke = async (page: any) => {
  const timestamp = Date.now();
  const userEmail = `green.mobile.${timestamp}@example.com`;
  const userPassword = "Lev2025!";

  const fallbackEmail = readEnv("GREEN_EXISTING_EMAIL");
  const fallbackPassword = readEnv("GREEN_EXISTING_PASSWORD");
  const hasFallbackCreds = Boolean(fallbackEmail && fallbackPassword);

  if (hasFallbackCreds) {
    await gotoAuthWithRetry(page, "/auth/sign-in");
    await page.fill('input[type="email"]', fallbackEmail);
    await page.fill('input[type="password"]', fallbackPassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 20_000 });
    return;
  }

  await gotoAuthWithRetry(page, "/auth/sign-up");
  await page.fill('input[type="email"]', userEmail);
  await page.fill('input[type="password"]', userPassword);
  await page.getByRole("button", { name: /continue/i }).click();

  let signedIn = true;
  try {
    await page.waitForURL(/\/app/, { timeout: 15_000 });
  } catch {
    signedIn = false;
  }

  if (!signedIn) {
    const error = page.locator(".havi-notice-banner-danger");
    const notice = page.locator(".havi-notice-banner-info");
    if (await error.isVisible()) {
      throw new Error(`Signup error: ${(await error.innerText()).trim()}`);
    }
    if (await notice.isVisible()) {
      throw new Error(
        "Signup requires email confirmation. Set GREEN_EXISTING_EMAIL and GREEN_EXISTING_PASSWORD.",
      );
    }
    throw new Error("Signup did not complete and no confirmation UI detected.");
  }
};

export const completeOnboardingIfNeeded = async (page: any) => {
  const onboardingCaregiverEmail = `green.owner.${Date.now()}@example.com`;
  const ensureCaregiverValues = async () => {
    const firstName = page.getByTestId("onboarding-profile-caregiver-first-name");
    const lastName = page.getByTestId("onboarding-profile-caregiver-last-name");
    const email = page.getByTestId("onboarding-profile-caregiver-email");
    const phone = page.getByTestId("onboarding-profile-caregiver-phone");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await firstName.fill("Gabe");
      await lastName.fill("Davis");
      await email.fill(onboardingCaregiverEmail);
      await phone.fill("5551234567");
      await page.waitForTimeout(150);
      const values = await Promise.all([
        firstName.inputValue().catch(() => ""),
        lastName.inputValue().catch(() => ""),
        email.inputValue().catch(() => ""),
        phone.inputValue().catch(() => ""),
      ]);
      if (
        values[0] === "Gabe" &&
        values[1] === "Davis" &&
        values[2] === onboardingCaregiverEmail &&
        values[3] === "5551234567"
      ) {
        return;
      }
    }
    throw new Error("Unable to stabilize caregiver onboarding field values.");
  };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.waitForLoadState("domcontentloaded");
    const currentUrl = page.url();

    if (currentUrl.includes("/app/onboarding/family")) {
      await page.getByTestId("onboarding-family-name").waitFor();
      await page.getByTestId("onboarding-family-name").fill("Green Family");
      await page.getByTestId("onboarding-create-family").click();
      await page.waitForURL(/\/app\/onboarding\/profile|\/app(\?|$)/, {
        timeout: 20_000,
      });
      continue;
    }

    if (
      currentUrl.includes("/app/onboarding/profile") ||
      currentUrl.includes("/app/onboarding/child")
    ) {
      const childStepStartVisible = await page
        .getByTestId("onboarding-profile-child")
        .isVisible()
        .catch(() => false);
      if (childStepStartVisible) {
        const backButton = page.getByTestId("onboarding-profile-back");
        if (await backButton.isVisible().catch(() => false)) {
          await backButton.click();
        }
      }
      await page.getByTestId("onboarding-profile-caregiver").waitFor({
        timeout: 15_000,
      });
      await ensureCaregiverValues();
      for (let childStepAttempt = 0; childStepAttempt < 3; childStepAttempt += 1) {
        await page.getByTestId("onboarding-profile-continue").click();
        const childVisible = await page
          .getByTestId("onboarding-profile-child")
          .isVisible()
          .catch(() => false);
        if (childVisible) break;
        const caregiverVisible = await page
          .getByTestId("onboarding-profile-caregiver")
          .isVisible()
          .catch(() => false);
        if (caregiverVisible) {
          await ensureCaregiverValues();
        }
        await page.waitForTimeout(500);
      }
      await page.getByTestId("onboarding-profile-child").waitFor({ timeout: 15_000 });
      await page.getByTestId("onboarding-profile-child-name").fill("River");
      await page.getByTestId("onboarding-profile-child-dob").fill("2024-01-15");
      await page
        .getByTestId("onboarding-profile-child-birth-weight")
        .fill("7.5");
      await page
        .getByTestId("onboarding-profile-child-last-known-weight")
        .fill("12.3");
      await page
        .getByTestId("onboarding-profile-child-timezone")
        .selectOption("America/Los_Angeles");
      await page.getByTestId("onboarding-profile-submit").click();
      try {
        await page.waitForURL(/\/app(\?|$)/, { timeout: 8_000 });
      } catch {
        // Retry loop handles transient submit races and validation stalls.
      }
      continue;
    }

    if (currentUrl.includes("/app/select-family")) {
      const familyButtons = page.locator('[data-testid^="select-family-"]');
      if ((await familyButtons.count()) > 0) {
        await familyButtons.first().click();
        await page.waitForURL(/\/app(\?|$)/, { timeout: 20_000 });
        continue;
      }
    }

    if (/\/app(\?|$)/.test(currentUrl)) {
      return;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`Onboarding did not complete. Current URL: ${page.url()}`);
};

export const waitForAppCoreReady = async (page: any, timeout = 20_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await page.waitForLoadState("domcontentloaded");
    const currentUrl = page.url();

    if (
      currentUrl.includes("/app/onboarding/") ||
      currentUrl.includes("/app/select-family")
    ) {
      await completeOnboardingIfNeeded(page);
      continue;
    }

    if (!/\/app(\?|$)/.test(currentUrl)) {
      await page.waitForTimeout(400);
      continue;
    }

    const profileLock = page.getByTestId("profile-lock-modal");
    if (await profileLock.isVisible().catch(() => false)) {
      try {
        await page.getByTestId("complete-profile").click({ timeout: 2_000 });
      } catch {
        // Profile lock can re-render while routing to onboarding. Retry loop handles it.
      }
      await page.waitForTimeout(300);
      continue;
    }

    const appReady = page.getByTestId("app-ready");
    const readyVisible = await appReady.isVisible().catch(() => false);
    if (!readyVisible) {
      await page.waitForTimeout(400);
      continue;
    }

    const settingsReady = await appReady.getAttribute("data-settings-ready");
    const childReady = await appReady.getAttribute("data-active-child-ready");
    if (settingsReady === "1" && childReady === "1") {
      const timeout = Math.max(1_000, deadline - Date.now());
      const pill = page.getByTestId("active-child-pill");
      const select = page.getByTestId("active-child-select");
      await Promise.any([
        pill.waitFor({ timeout }),
        select.waitFor({ timeout }),
      ]);
      await page.getByTestId("chat-input").waitFor({
        timeout,
      });
      return;
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`App core not ready. Current URL: ${page.url()}`);
};
