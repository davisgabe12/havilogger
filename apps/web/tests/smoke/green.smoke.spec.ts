import { test, expect } from "@playwright/test";

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
      bucket.push(`[${label}] console: ${msg.text()}`);
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
      await page.getByTestId("complete-profile").click();
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

test("GREEN smoke", async ({ page }) => {
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

  const fallbackEmail = process.env.GREEN_EXISTING_EMAIL ?? "";
  const fallbackPassword = process.env.GREEN_EXISTING_PASSWORD ?? "";
  const hasFallbackCreds = Boolean(fallbackEmail && fallbackPassword);

  if (hasFallbackCreds) {
    await page.goto("/auth/sign-in");
    await page.fill('input[type="email"]', fallbackEmail);
    await page.fill('input[type="password"]', fallbackPassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
  } else {
    await page.goto("/auth/sign-up");
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
      const error = page.locator("p.text-destructive");
      const notice = page.locator("p.text-emerald-200");
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
  ) => {
    const method = res.request().method();
    const url = res.url?.() ?? "";
    if (method !== "POST" || !url.includes("/api/v1/messages/feedback")) {
      return false;
    }
    try {
      const req = res.request();
      const payload = readRequestPayload(req);
      return (
        payload?.message_id === expectedMessageId &&
        payload?.rating === expectedRating
      );
    } catch {
      return false;
    }
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
    await expect
      .poll(
        async () => (await assistantMessages.count()) > assistantCountBefore,
        { timeout: 20_000 },
      )
      .toBeTruthy();
    await expect(chatMessages.last()).toBeVisible({ timeout: 20_000 });
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

  const thumbsUpResponse = page.waitForResponse((res: any) =>
    matchesFeedbackRequest(res, mixedAssistantMessageId, "up"),
  );
  await mixedAssistantWrapper.getByRole("button", { name: "Thumbs up" }).click();
  const thumbsUpRes = await thumbsUpResponse;
  const thumbsUpStatus = thumbsUpRes.status();
  const thumbsUpPayload = readRequestPayload(thumbsUpRes.request());
  expect(thumbsUpStatus).toBe(200);
  expect(thumbsUpPayload?.model_version).toBeTruthy();
  expect(
    thumbsUpPayload?.response_metadata?.route_metadata?.route_kind,
  ).toBe("mixed");

  const thumbsDownResponse = page.waitForResponse((res: any) =>
    matchesFeedbackRequest(res, mixedAssistantMessageId, "down"),
  );
  await mixedAssistantWrapper.getByRole("button", { name: "Thumbs down" }).click();
  await mixedAssistantWrapper
    .getByPlaceholder("What didn’t work? (optional)")
    .fill("Too generic");
  const thumbsDownRes = await thumbsDownResponse;
  const thumbsDownStatus = thumbsDownRes.status();
  const thumbsDownPayload = readRequestPayload(thumbsDownRes.request());
  expect(thumbsDownStatus).toBe(200);
  expect(thumbsDownPayload?.model_version).toBeTruthy();
  expect(
    thumbsDownPayload?.response_metadata?.route_metadata?.route_kind,
  ).toBe("mixed");

  const explicitMemoryPayload = await sendMessage(
    `save this: River prefers a longer second nap ${timestamp}`,
  );
  expect(explicitMemoryPayload.intent).toBe("memory");
  expect(explicitMemoryPayload.assistant_message_id).toBeTruthy();

  const inferredMemoryPayload = await sendMessage(
    `River likes a longer second nap and napped from 1pm to 2:30pm ${timestamp}`,
  );
  expect(["log", "mixed"]).toContain(
    inferredMemoryPayload.route_metadata?.route_kind,
  );
  expect((inferredMemoryPayload.actions ?? []).length).toBeGreaterThan(0);

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

  await page.waitForTimeout(5_000);
  expect(badKnowledgeResponses).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
