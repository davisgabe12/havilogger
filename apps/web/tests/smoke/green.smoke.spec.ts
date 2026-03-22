import { test, expect } from "@playwright/test";
import { completeInviteLinkFlow, createInviteLinkFromSettings } from "./helpers/invite-flow";

const trackConsoleErrors = (
  page: any,
  bucket: string[],
  label: string,
) => {
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
  page.on("requestfailed", (request: any) => {
    const failure = request.failure?.();
    const errorText = failure?.errorText ?? "unknown error";
    const method = request.method?.() ?? "GET";
    const url = request.url();
    if (shouldIgnoreRequestFailure(url, errorText, method)) {
      return;
    }
    bucket.push(
      `[${label}] requestfailed: ${method} ${url} (${errorText})`,
    );
  });
};

const shouldIgnoreRequestFailure = (
  url: string,
  errorText: string,
  method: string,
) => {
  if (url.endsWith("/favicon.ico")) return true;
  if (url.includes("/manifest.json")) return true;
  if (
    errorText.includes("net::ERR_ABORTED") &&
    (method === "GET" || method === "HEAD")
  ) {
    return true;
  }
  return false;
};

const readRequestPayload = (request: any): any => {
  let payload: any = null;
  if (typeof request.postDataJSON === "function") {
    try {
      payload = request.postDataJSON();
    } catch {
      payload = null;
    }
  }
  if (!payload) {
    const raw = request.postData();
    if (raw) payload = JSON.parse(raw);
  }
  return payload;
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

type ActivityRouteMetadata = {
  route_kind?: string;
  classifier_intent?: string;
  decision_source?: string;
  confidence?: number;
};

type ActivityResponsePayload = {
  actions?: unknown[];
  assistant_message?: string;
  assistant_message_id?: string;
  conversation_id?: string;
  intent?: string;
  route_metadata?: ActivityRouteMetadata;
};

const readSectionCount = async (section: any, label: "pending" | "saved") => {
  const text = (await section.innerText()).toLowerCase();
  const match = text.match(new RegExp(`(\\d+)\\s+${label}`));
  return match ? Number(match[1]) : 0;
};

const gotoAuthWithRetry = async (page: any, path: "/auth/sign-in" | "/auth/sign-up") => {
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

const readEnv = (name: string): string => {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
};

test("GREEN smoke", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  trackConsoleErrors(page, consoleErrors, "green");
  const badKnowledgeResponses: string[] = [];
  page.on("response", (res: any) => {
    const url = res.url?.() ?? "";
    if (url.includes("/api/v1/knowledge")) {
      const status = res.status?.() ?? 0;
      if (status === 401 || status === 400) {
        badKnowledgeResponses.push(`${status} ${url}`);
      }
    }
  });

  const timestamp = Date.now();
  const userEmail = `green.${timestamp}@example.com`;
  const userPassword = "Lev2025!";
  const inviteeEmailSeed = readEnv("GREEN_INVITEE_EMAIL");
  const inviteePasswordSeed = readEnv("GREEN_INVITEE_PASSWORD");
  const inviteeEmail = inviteeEmailSeed || `green.invitee.${timestamp}@example.com`;
  const inviteePassword = inviteePasswordSeed || "Lev2025!";
  const hasInviteeCreds = Boolean(inviteeEmailSeed && inviteePasswordSeed);

  const fallbackEmail = readEnv("GREEN_EXISTING_EMAIL");
  const fallbackPassword = readEnv("GREEN_EXISTING_PASSWORD");
  const hasFallbackCreds = Boolean(fallbackEmail && fallbackPassword);

  if (hasFallbackCreds) {
    await gotoAuthWithRetry(page, "/auth/sign-in");
    await page.fill('input[type="email"]', fallbackEmail);
    await page.fill('input[type="password"]', fallbackPassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
  } else {
    await gotoAuthWithRetry(page, "/auth/sign-up");
    await page.fill('input[type="email"]', userEmail);
    await page.fill('input[type="password"]', userPassword);
    await page.getByRole("button", { name: /continue/i }).click();

    let signedIn = true;
    try {
      await page.waitForURL(/\/app/, { timeout: 12_000 });
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
  }

  await completeOnboardingIfNeeded(page);
  await waitForAppCoreReady(page);
  await expect(page.getByTestId("profile-lock-modal")).toHaveCount(0);

  const chatMessages = page.getByTestId("chat-message");
  const assistantMessages = page.locator(
    '[data-testid="chat-message"][data-sender="assistant"]',
  );
  const matchesActivityRequest = (res: any, text: string) => {
    const method = res.request().method();
    const url = res.url?.() ?? "";
    if (method !== "POST" || !url.includes("/api/v1/activities")) {
      return false;
    }
    try {
      const req = res.request();
      const payload = readRequestPayload(req);
      return payload?.message === text;
    } catch {
      return false;
    }
  };
  const matchesFeedbackRequest = (
    res: any,
    expectedMessageId: string,
    expectedRating: "up" | "down",
    expectedFeedbackText?: string,
  ) => {
    const method = res.request().method();
    const url = res.url?.() ?? "";
    if (method !== "POST" || !url.includes("/api/v1/messages/feedback")) {
      return false;
    }
    try {
      const req = res.request();
      const payload = readRequestPayload(req);
      const feedbackText = payload?.feedback_text;
      return (
        payload?.message_id === expectedMessageId &&
        payload?.rating === expectedRating &&
        (expectedFeedbackText === undefined
          ? true
          : String(feedbackText ?? "") === expectedFeedbackText)
      );
    } catch {
      return false;
    }
  };
  const submitFeedbackWithRetryAwareness = async ({
    messageId,
    rating,
    feedbackText,
    trigger,
    maxAttempts = 3,
  }: {
    messageId: string;
    rating: "up" | "down";
    feedbackText?: string;
    trigger: () => Promise<void>;
    maxAttempts?: number;
  }) => {
    const statuses: number[] = [];
    const waitForNext = () =>
      page.waitForResponse(
        (res: any) =>
          matchesFeedbackRequest(res, messageId, rating, feedbackText),
        { timeout: 25_000 },
      );
    let pendingResponse = waitForNext();
    await trigger();

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let response: any;
      try {
        response = await pendingResponse;
      } catch {
        break;
      }
      const status = response.status();
      statuses.push(status);
      const payload = readRequestPayload(response.request());
      if (status === 200) {
        return { status, payload, statuses };
      }
      if (attempt < maxAttempts - 1) {
        pendingResponse = waitForNext();
      }
    }

    throw new Error(
      `Feedback ${rating} did not return 200 after ${maxAttempts} attempts. statuses=[${statuses.join(", ")}]`,
    );
  };
  const sendMessage = async (
    text: string,
    attempt = 0,
  ): Promise<ActivityResponsePayload> => {
    const assistantCountBefore = await assistantMessages.count();
    const activityResponse = page.waitForResponse((res: any) => matchesActivityRequest(res, text), {
      timeout: 45_000,
    });
    await page.getByTestId("chat-input").fill(text);
    await expect(page.getByTestId("chat-send")).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId("chat-send").click();
    let activityResult: any;
    try {
      activityResult = await activityResponse;
    } catch (error) {
      if (attempt < 1) {
        await page.waitForTimeout(750);
        return sendMessage(text, attempt + 1);
      }
      throw error;
    }
    expect(activityResult.status()).toBe(200);
    const payload = (await activityResult.json()) as ActivityResponsePayload;
    const assistantMessageId = payload.assistant_message_id
      ? String(payload.assistant_message_id)
      : "";
    await expect
      .poll(
        async () => {
          if (assistantMessageId) {
            const byIdCount = await page
              .locator(`[data-message-id="${assistantMessageId}"]`)
              .count();
            if (byIdCount > 0) {
              return true;
            }
          }
          return (await assistantMessages.count()) > assistantCountBefore;
        },
        { timeout: 45_000 },
      )
      .toBeTruthy();
    await expect(chatMessages.last()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("chat-input")).toBeEnabled({ timeout: 20_000 });
    return payload;
  };

  const logPayload = await sendMessage("baby pooped at 3pm");
  expect(logPayload.route_metadata?.route_kind).toBe("log");
  expect(Array.isArray(logPayload.actions)).toBeTruthy();
  expect((logPayload.actions ?? []).length).toBeGreaterThan(0);

  const askPayload = await sendMessage("my child is hitting, what should i do?");
  expect(askPayload.route_metadata?.route_kind).toBe("ask");
  expect((askPayload.actions ?? []).length).toBe(0);

  const rollingPayload = await sendMessage(
    "my baby is not rolling over, what do you recommend?",
  );
  expect(rollingPayload.route_metadata?.route_kind).toBe("ask");
  const rollingAssistant = String(rollingPayload.assistant_message ?? "").toLowerCase();
  expect(rollingAssistant).not.toContain("i'm not sure i caught that");
  expect(rollingAssistant).not.toContain("i’m not sure i caught that");

  const mixedPayload = await sendMessage(
    "baby pooped at 4pm, what should i do if he keeps waking at night?",
  );
  expect(mixedPayload.route_metadata?.route_kind).toBe("mixed");
  expect((mixedPayload.actions ?? []).length).toBeGreaterThan(0);
  expect(mixedPayload.assistant_message_id).toBeTruthy();
  const mixedAssistantMessageId = String(mixedPayload.assistant_message_id);

  const mixedAssistantWrapper = page
    .locator('[data-testid="message-bubble-wrapper"]')
    .filter({
      has: page.locator(`[data-message-id="${mixedAssistantMessageId}"]`),
    })
    .first();
  await expect(mixedAssistantWrapper).toBeVisible({ timeout: 20_000 });

  const thumbsUpButton = mixedAssistantWrapper.getByRole("button", {
    name: "Thumbs up",
  });
  const thumbsUpResult = await submitFeedbackWithRetryAwareness({
    messageId: mixedAssistantMessageId,
    rating: "up",
    trigger: async () => {
      await thumbsUpButton.click({ force: true });
    },
  });
  expect(thumbsUpResult.status).toBe(200);
  await expect(thumbsUpButton).toHaveAttribute("aria-pressed", "true");
  expect(thumbsUpResult.payload?.model_version).toBeTruthy();
  expect(
    thumbsUpResult.payload?.response_metadata?.route_metadata?.route_kind,
  ).toBe("mixed");

  const thumbsDownButton = mixedAssistantWrapper.getByRole("button", {
    name: "Thumbs down",
  });
  const thumbsDownResult = await submitFeedbackWithRetryAwareness({
    messageId: mixedAssistantMessageId,
    rating: "down",
    feedbackText: "Too generic",
    trigger: async () => {
      await thumbsDownButton.click({ force: true });
      await expect(thumbsDownButton).toHaveAttribute("aria-pressed", "true");
      const feedbackInput = mixedAssistantWrapper.getByPlaceholder(
        "What didn’t work? (optional)",
      );
      await feedbackInput.fill("Too generic");
      await feedbackInput.press("Enter");
    },
  });
  expect(thumbsDownResult.status).toBe(200);
  expect(thumbsDownResult.payload?.feedback_text).toBe("Too generic");
  expect(thumbsDownResult.payload?.model_version).toBeTruthy();
  expect(
    thumbsDownResult.payload?.response_metadata?.route_metadata?.route_kind,
  ).toBe("mixed");

  const explicitMemoryPayload = await sendMessage(
    `save this: River prefers a longer second nap ${timestamp}`,
  );
  expect(explicitMemoryPayload.intent).toBe("memory");
  expect(explicitMemoryPayload.assistant_message_id).toBeTruthy();

  const inferredMemoryPayload = await sendMessage(
    `River likes a longer second nap and napped from 1pm to 2:30pm ${timestamp}`,
  );
  const inferredRouteKind = String(inferredMemoryPayload.route_metadata?.route_kind ?? "");
  expect(["log", "mixed", "MEMORY_INFERRED"]).toContain(inferredRouteKind);
  if (inferredRouteKind === "MEMORY_INFERRED") {
    expect((inferredMemoryPayload.actions ?? []).length).toBe(0);
  } else {
    expect((inferredMemoryPayload.actions ?? []).length).toBeGreaterThan(0);
  }

  const timedTaskPayload = await sendMessage(
    "remind me to call my doctor tomorrow at 4pm",
  );
  expect(timedTaskPayload.route_metadata?.route_kind).toBe("task");
  const timedTaskAssistant = String(timedTaskPayload.assistant_message ?? "");
  expect(timedTaskAssistant).toMatch(/4:00 PM/i);

  await page.getByTestId("nav-tasks").click();
  await page.getByTestId("tasks-view-all").click();
  const taskTitle = `Green task ${timestamp}`;
  const createTaskResponse = page.waitForResponse(
    (res: any) =>
      res.request().method() === "POST" &&
      res.url?.().includes("/api/v1/tasks"),
  );
  await page.getByTestId("task-input").fill(taskTitle);
  await expect(page.getByTestId("task-add")).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId("task-add").click();
  const taskResponse = await createTaskResponse;
  expect(taskResponse.status()).toBe(200);
  await expect(
    page.getByTestId("task-title").filter({ hasText: taskTitle }),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("nav-knowledge").click();
  const memorySuggestions = page.getByTestId("memory-suggestions");
  const memorySaved = page.getByTestId("memory-saved");
  await memorySuggestions.waitFor();
  await memorySaved.waitFor();
  await expect(memorySuggestions).toBeVisible();
  await expect(memorySaved).toBeVisible();
  const pendingCount = await readSectionCount(memorySuggestions, "pending");
  const savedCount = await readSectionCount(memorySaved, "saved");
  expect(pendingCount).toBeGreaterThanOrEqual(0);
  expect(savedCount).toBeGreaterThanOrEqual(0);

  await page.reload();
  await waitForAppCoreReady(page);
  await page.getByTestId("nav-havi").click();
  await expect(chatMessages.last()).toBeVisible();

  await page.getByTestId("nav-tasks").click();
  await page.getByTestId("tasks-view-all").click();
  await expect(
    page.getByTestId("task-title").filter({ hasText: taskTitle }),
  ).toBeVisible();

  await page.getByTestId("nav-settings").click();
  const inviteLink = await createInviteLinkFromSettings(page, inviteeEmail);
  await page.getByRole("button", { name: /close/i }).click();

  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  trackConsoleErrors(inviteePage, consoleErrors, "invitee");
  await inviteePage.goto(inviteLink);
  await completeInviteLinkFlow(inviteePage, {
    inviteeEmail,
    inviteePassword,
    hasInviteeCreds,
  });

  await waitForAppCoreReady(inviteePage);
  await expect(inviteePage.getByTestId("profile-lock-modal")).toHaveCount(0);
  await inviteeContext.close();

  await page.waitForTimeout(5_000);
  expect(badKnowledgeResponses).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
