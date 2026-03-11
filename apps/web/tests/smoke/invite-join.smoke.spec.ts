import { test, expect } from "@playwright/test";

const trackConsoleErrors = (page: any, bucket: string[], label: string) => {
  page.on("pageerror", (err: Error) => {
    const details = err?.stack ? `${err.message}\n${err.stack}` : err.message;
    bucket.push(`[${label}] pageerror: ${details}`);
  });
  page.on("console", (msg: any) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (text.includes("Failed to load resource: the server responded with a status of 400")) {
        return;
      }
      bucket.push(`[${label}] console: ${text}`);
    }
  });
};

const completeOnboardingIfNeeded = async (page: any) => {
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

    if (currentUrl.includes("/app/onboarding/care-member")) {
      await page.getByTestId("care-member-first-name").fill("Green");
      await page.getByTestId("care-member-last-name").fill("Invitee");
      const currentEmail = await page
        .getByTestId("care-member-email")
        .inputValue()
        .catch(() => "");
      if (!currentEmail) {
        await page.getByTestId("care-member-email").fill(`green.invitee.${Date.now()}@example.com`);
      }
      await page.getByTestId("care-member-phone").fill("5551234567");
      await page.getByTestId("care-member-submit").click();
      try {
        await page.waitForURL(/\/app(\?|$)/, { timeout: 12_000 });
      } catch {
        // Retry loop handles transient saves and route races.
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

const waitForAppCoreReady = async (page: any, timeout = 20_000) => {
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
        // Retry loop handles profile-lock route transitions.
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
      await page.getByTestId("active-child-select").waitFor({
        timeout: Math.max(1_000, deadline - Date.now()),
      });
      await page.getByTestId("chat-input").waitFor({
        timeout: Math.max(1_000, deadline - Date.now()),
      });
      return;
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`App core not ready. Current URL: ${page.url()}`);
};

const conversationIdFromUrl = (url: string): string => {
  const parsed = new URL(url);
  const conversationId = parsed.searchParams.get("conversationId");
  if (!conversationId) {
    throw new Error(`Missing conversationId in URL: ${url}`);
  }
  return conversationId;
};

const initialsFromDisplayName = (name: string): string => {
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "CT";
  if (parts.length === 1) {
    return (parts[0].slice(0, 2) || "CT").toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const sendChatAndWaitForAssistant = async (page: any, text: string) => {
  await page.getByTestId("nav-havi").click();
  await page.getByTestId("chat-input").fill(text);
  const assistantMessages = page.locator('[data-testid="chat-message"][data-sender="assistant"]');
  const assistantBefore = await assistantMessages.count();
  await page.getByTestId("chat-send").click();
  await expect(page.getByText(text)).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => assistantMessages.count(), { timeout: 45_000 })
    .toBeGreaterThan(assistantBefore);
};

test("Invite join smoke", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const consoleErrors: string[] = [];
  trackConsoleErrors(page, consoleErrors, "owner");

  const timestamp = Date.now();
  const ownerEmail = process.env.GREEN_EXISTING_EMAIL ?? `green.owner.${timestamp}@example.com`;
  const ownerPassword = process.env.GREEN_EXISTING_PASSWORD ?? "Lev2025!";
  const ownerHasExistingCreds = Boolean(
    process.env.GREEN_EXISTING_EMAIL && process.env.GREEN_EXISTING_PASSWORD,
  );
  const inviteeEmail =
    process.env.GREEN_INVITEE_EMAIL ?? `green.invitee.${timestamp}@example.com`;
  const inviteePassword = process.env.GREEN_INVITEE_PASSWORD ?? "Lev2025!";
  const hasInviteeCreds = Boolean(
    process.env.GREEN_INVITEE_EMAIL && process.env.GREEN_INVITEE_PASSWORD,
  );

  if (ownerHasExistingCreds) {
    await page.goto("/auth/sign-in");
    await page.fill('input[type="email"]', ownerEmail);
    await page.fill('input[type="password"]', ownerPassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
  } else {
    await page.goto("/auth/sign-up");
    await page.fill('input[type="email"]', ownerEmail);
    await page.fill('input[type="password"]', ownerPassword);
    await page.getByRole("button", { name: /continue/i }).click();

    let ownerSignedIn = true;
    try {
      await page.waitForURL(/\/app/, { timeout: 12_000 });
    } catch {
      ownerSignedIn = false;
    }

    if (!ownerSignedIn) {
      const error = page.locator(".havi-notice-banner-danger");
      const notice = page.locator(".havi-notice-banner-info");
      if (await error.isVisible()) {
        throw new Error(`Owner signup error: ${(await error.innerText()).trim()}`);
      }
      if (await notice.isVisible()) {
        throw new Error(
          "Owner signup requires email confirmation. Set GREEN_EXISTING_EMAIL and GREEN_EXISTING_PASSWORD.",
        );
      }
      throw new Error("Owner signup did not complete.");
    }
  }

  await completeOnboardingIfNeeded(page);
  await waitForAppCoreReady(page);
  await expect(page.getByTestId("profile-lock-modal")).toHaveCount(0);

  await page.getByTestId("nav-settings").click();
  await page.getByTestId("open-invite").click();
  await page.fill("#invite-email", inviteeEmail);
  await page.getByRole("button", { name: /(send|create) invite/i }).click();
  await expect(page.getByTestId("invite-link")).toBeVisible({ timeout: 20_000 });
  const inviteLink = (await page.getByTestId("invite-link").innerText()).trim();
  await page.getByRole("button", { name: /close/i }).click();

  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  trackConsoleErrors(inviteePage, consoleErrors, "invitee");
  await inviteePage.goto(inviteLink);

  let inviteeNeedsAuth = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const currentUrl = inviteePage.url();
    if (currentUrl.includes("/auth/sign-in")) {
      inviteeNeedsAuth = true;
      break;
    }
    if (/\/app(\?|$)/.test(currentUrl)) {
      break;
    }
    await inviteePage.waitForTimeout(500);
  }

  if (inviteeNeedsAuth) {
    await inviteePage.fill('input[type="email"]', inviteeEmail);
    await inviteePage.fill('input[type="password"]', inviteePassword);
    await inviteePage.getByRole("button", { name: /sign in/i }).click();

    let inviteeSignedIn = true;
    try {
      await inviteePage.waitForURL(/\/app/, { timeout: 12_000 });
    } catch {
      inviteeSignedIn = false;
    }

    if (!inviteeSignedIn && !hasInviteeCreds) {
      await inviteePage.getByRole("link", { name: /create account/i }).click();
      await inviteePage.fill('input[type="email"]', inviteeEmail);
      await inviteePage.fill('input[type="password"]', inviteePassword);
      await inviteePage.getByRole("button", { name: /continue/i }).click();
      try {
        await inviteePage.waitForURL(/\/app/, { timeout: 12_000 });
      } catch {
        const inviteeError = inviteePage.locator(".havi-notice-banner-danger");
        const inviteeNotice = inviteePage.locator(".havi-notice-banner-info");
        if (await inviteeError.isVisible()) {
          throw new Error(`Invitee signup error: ${(await inviteeError.innerText()).trim()}`);
        }
        if (await inviteeNotice.isVisible()) {
          throw new Error(
            "Invitee signup requires email confirmation. Set GREEN_INVITEE_EMAIL and GREEN_INVITEE_PASSWORD.",
          );
        }
        const signInButton = inviteePage.getByRole("button", { name: /sign in/i });
        if (await signInButton.isVisible().catch(() => false)) {
          await inviteePage.fill('input[type="email"]', inviteeEmail);
          await inviteePage.fill('input[type="password"]', inviteePassword);
          await signInButton.click();
          await inviteePage.waitForURL(/\/app/, { timeout: 12_000 });
        } else {
          throw new Error(`Invitee signup did not complete. Current URL: ${inviteePage.url()}`);
        }
      }
    } else if (!inviteeSignedIn && hasInviteeCreds) {
      throw new Error("Invitee sign-in failed with configured GREEN_INVITEE credentials.");
    }
  }

  await waitForAppCoreReady(inviteePage);
  await expect(inviteePage.getByTestId("profile-lock-modal")).toHaveCount(0);

  const marker = Date.now();
  const ownerSharedMessage = `owner-shared-thread-${marker}`;
  const inviteeLogMessage = `green invitee logged bottle 4 oz marker ${marker}`;
  const crossAssignedTaskTitle = `Care-team task ${marker}`;
  const inviteeMarkerText = `marker ${marker}`;

  await sendChatAndWaitForAssistant(page, ownerSharedMessage);
  const sharedConversationId = conversationIdFromUrl(page.url());

  await inviteePage.goto(`/app?conversationId=${encodeURIComponent(sharedConversationId)}`);
  await waitForAppCoreReady(inviteePage);
  await inviteePage.getByTestId("nav-havi").click();
  await expect
    .poll(async () => (await inviteePage.locator("body").innerText()).includes(ownerSharedMessage), {
      timeout: 60_000,
    })
    .toBe(true);
  await expect
    .poll(() => {
      try {
        return conversationIdFromUrl(inviteePage.url());
      } catch {
        return "";
      }
    })
    .toBe(sharedConversationId);
  await sendChatAndWaitForAssistant(inviteePage, inviteeLogMessage);
  await expect
    .poll(() => {
      try {
        return conversationIdFromUrl(inviteePage.url());
      } catch {
        return "";
      }
    })
    .toBe(sharedConversationId);

  await page.goto(`/app?conversationId=${encodeURIComponent(sharedConversationId)}`);
  await waitForAppCoreReady(page);
  await page.getByTestId("nav-havi").click();
  await page.getByTestId("nav-tasks").click();
  const assigneeOptions = await page
    .getByTestId("task-assignee")
    .locator("option")
    .allInnerTexts();
  const inviteeOptionLabel = assigneeOptions
    .map((label) => label.trim())
    .find((label) => label && !label.includes("(Me)"));
  if (!inviteeOptionLabel) {
    throw new Error("Invitee assignee option not found in owner task assignee select.");
  }
  const inviteeDisplayName = inviteeOptionLabel.replace(/\s+\(Me\)\s*$/, "").trim();
  const inviteeInitials = initialsFromDisplayName(inviteeDisplayName);

  await expect
    .poll(
      async () =>
        page
          .locator('[data-testid="chat-message"]')
          .filter({ hasText: inviteeMarkerText })
          .count(),
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        page
          .locator('[data-testid="chat-message"][data-sender="caregiver"]')
          .filter({ hasText: inviteeMarkerText })
          .count(),
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0);
  const caregiverRow = page
    .locator('[data-testid="chat-message"][data-sender="caregiver"]')
    .filter({ hasText: inviteeMarkerText })
    .first();
  await expect(caregiverRow).toBeVisible();
  await expect(caregiverRow.getByText(inviteeDisplayName)).toBeVisible();
  await expect(caregiverRow.getByText(inviteeInitials)).toBeVisible();

  await page.getByTestId("nav-timeline").click();
  await expect(page.getByTestId("timeline-panel")).toBeVisible();
  await expect(
    page.getByText(new RegExp(`Logged by\\s+${inviteeDisplayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i")),
  ).toBeVisible({ timeout: 60_000 });

  await page.getByTestId("task-input").fill(crossAssignedTaskTitle);
  await page.getByTestId("task-assignee").selectOption({ label: inviteeOptionLabel });
  await page.getByTestId("task-add").click();
  await expect(page.getByText(crossAssignedTaskTitle)).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText(
      new RegExp(`Assigned to\\s+${inviteeDisplayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
    ),
  ).toBeVisible({ timeout: 20_000 });

  await inviteePage.goto("/app");
  await waitForAppCoreReady(inviteePage);
  await inviteePage.getByTestId("nav-tasks").click();
  await expect(inviteePage.getByText(crossAssignedTaskTitle)).toBeVisible({ timeout: 20_000 });
  await expect(
    inviteePage.getByText(
      new RegExp(
        `Assigned to\\s+${inviteeDisplayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+\\(Me\\)`,
        "i",
      ),
    ),
  ).toBeVisible({ timeout: 20_000 });

  await inviteeContext.close();
  expect(consoleErrors).toEqual([]);
});
