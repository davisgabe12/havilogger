import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const proofDir = process.env.GREEN_PROOF_DIR
  ? path.resolve(process.env.GREEN_PROOF_DIR)
  : path.resolve(__dirname, "../../../docs/green-proof");

const ensureProofDir = () => {
  fs.mkdirSync(proofDir, { recursive: true });
};

const screenshot = async (page: any, name: string) => {
  await page.screenshot({
    path: path.join(proofDir, name),
    fullPage: true,
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
  if (
    errorText.includes("net::ERR_ABORTED") &&
    method === "POST" &&
    url.includes("/auth/v1/logout?scope=global")
  ) {
    return true;
  }
  return false;
};

const shouldIgnoreConsoleError = (text: string) => {
  if (text.includes("Failed to load resource: the server responded with a status of 401")) {
    return true;
  }
  if (text.includes('[apiFetch] request failed {status: 401')) {
    return true;
  }
  if (text.includes("Failed to load resource: the server responded with a status of 400")) {
    return true;
  }
  return false;
};

const trackConsoleErrors = (page: any, bucket: string[], label: string) => {
  page.on("pageerror", (err: Error) => {
    const details = err?.stack ? `${err.message}\n${err.stack}` : err.message;
    bucket.push(`[${label}] pageerror: ${details}`);
  });
  page.on("console", (msg: any) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (shouldIgnoreConsoleError(text)) {
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

test("Full flow end-to-end", async ({ page, browser }, testInfo) => {
  ensureProofDir();
  const consoleErrors: string[] = [];
  trackConsoleErrors(page, consoleErrors, "user1");
  let currentStep = "init";

  const mark = (step: string) => {
    currentStep = step;
  };

  const writeFailure = async (error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    const failurePath = path.join(proofDir, "failure.txt");
    const failureBody = [
      `step: ${currentStep}`,
      `url: ${page.url()}`,
      `error: ${reason}`,
    ].join("\n");
    fs.writeFileSync(failurePath, failureBody);
    await screenshot(page, "failure.png");
  };

  const timestamp = Date.now();
  const user1Email = `green.${timestamp}@example.com`;
  const user1Password = "Lev2025!";

  const fallbackEmail = process.env.GREEN_EXISTING_EMAIL ?? "";
  const fallbackPassword = process.env.GREEN_EXISTING_PASSWORD ?? "";

  const inviteeEmail = `green.invitee.${timestamp}@example.com`;
  const inviteePassword = "Lev2025!";
  const inviteeFallbackEmail = process.env.GREEN_INVITEE_EMAIL ?? "";
  const inviteeFallbackPassword = process.env.GREEN_INVITEE_PASSWORD ?? "";

  try {
    mark("marketing");
    await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await screenshot(page, "01-marketing.png");

    mark("auth-sign-in");
  await page.goto("/auth/sign-in");
  await page.waitForLoadState("domcontentloaded");
  await screenshot(page, "02-auth-sign-in.png");

    mark("auth-sign-up");
  await page.goto("/auth/sign-up");
  await page.waitForLoadState("domcontentloaded");
  await screenshot(page, "03-auth-sign-up.png");

    mark("sign-up-submit");
  await page.fill('input[type="email"]', user1Email);
  await page.fill('input[type="password"]', user1Password);
  await page.getByRole("button", { name: /continue/i }).click();

  let signedIn = true;
  try {
    await page.waitForURL(/\/app/, { timeout: 12_000 });
  } catch {
    signedIn = false;
  }

  if (!signedIn) {
    const errorBanner = page.locator("p.text-destructive");
    const noticeBanner = page.locator("p.text-emerald-200");
    if (await errorBanner.isVisible()) {
      throw new Error(`Signup error: ${(await errorBanner.innerText()).trim()}`);
    }
    if (await noticeBanner.isVisible()) {
      await screenshot(page, "03b-sign-up-confirmation.png");
    }
    if (!fallbackEmail || !fallbackPassword) {
      throw new Error(
        "Email confirmation required. Set GREEN_EXISTING_EMAIL and GREEN_EXISTING_PASSWORD to continue.",
      );
    }
    mark("sign-in-fallback");
    await page.goto("/auth/sign-in");
    await page.fill('input[type="email"]', fallbackEmail);
    await page.fill('input[type="password"]', fallbackPassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
  }

  const completeOnboardingIfNeeded = async (targetPage: any) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await targetPage.waitForLoadState("domcontentloaded");
      const currentUrl = targetPage.url();

      if (currentUrl.includes("/app/onboarding/family")) {
        await targetPage.getByTestId("onboarding-family-name").waitFor();
        await screenshot(targetPage, "04-onboarding-family.png");
        await targetPage.getByTestId("onboarding-family-name").fill("Green Family");
        await targetPage.getByTestId("onboarding-create-family").click();
        await targetPage.waitForURL(/\/app\/onboarding\/profile|\/app(\?|$)/, {
          timeout: 20_000,
        });
        continue;
      }

      if (
        currentUrl.includes("/app/onboarding/profile") ||
        currentUrl.includes("/app/onboarding/child")
      ) {
        await screenshot(targetPage, "05-onboarding-profile.png");
        const childStepStartVisible = await targetPage
          .getByTestId("onboarding-profile-child")
          .isVisible()
          .catch(() => false);
        if (childStepStartVisible) {
          const backButton = targetPage.getByTestId("onboarding-profile-back");
          if (await backButton.isVisible().catch(() => false)) {
            await backButton.click();
          }
        }
        await targetPage.getByTestId("onboarding-profile-caregiver").waitFor({
          timeout: 15_000,
        });
        await targetPage
          .getByTestId("onboarding-profile-caregiver-first-name")
          .fill("Gabe");
        await targetPage
          .getByTestId("onboarding-profile-caregiver-last-name")
          .fill("Davis");
        await targetPage
          .getByTestId("onboarding-profile-caregiver-email")
          .fill("green.owner@example.com");
        await targetPage
          .getByTestId("onboarding-profile-caregiver-phone")
          .fill("5551234567");
        await targetPage.getByTestId("onboarding-profile-continue").click();
        await targetPage.getByTestId("onboarding-profile-child").waitFor({
          timeout: 15_000,
        });
        await targetPage.getByTestId("onboarding-profile-child-name").fill("River");
        await targetPage.getByTestId("onboarding-profile-child-dob").fill("2024-01-15");
        await targetPage
          .getByTestId("onboarding-profile-child-birth-weight")
          .fill("7.5");
        await targetPage
          .getByTestId("onboarding-profile-child-last-known-weight")
          .fill("12.3");
        await targetPage
          .getByTestId("onboarding-profile-child-timezone")
          .selectOption("America/Los_Angeles");
        await targetPage.getByTestId("onboarding-profile-submit").click();
        try {
          await targetPage.waitForURL(/\/app(\?|$)/, { timeout: 8_000 });
        } catch {
          // Retry loop handles transient submit races and validation stalls.
        }
        continue;
      }

      if (currentUrl.includes("/app/select-family")) {
        const familyButtons = targetPage.locator('[data-testid^="select-family-"]');
        if ((await familyButtons.count()) > 0) {
          await familyButtons.first().click();
          await targetPage.waitForURL(/\/app(\?|$)/, { timeout: 20_000 });
          continue;
        }
      }

      if (/\/app(\?|$)/.test(currentUrl)) {
        return;
      }

      await targetPage.waitForTimeout(500);
    }

    throw new Error(`Onboarding did not complete. Current URL: ${targetPage.url()}`);
  };

  const waitForAppCoreReady = async (
    targetPage: any,
    timeout = 20_000,
  ) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await targetPage.waitForLoadState("domcontentloaded");
      const currentUrl = targetPage.url();

      if (
        currentUrl.includes("/app/onboarding/") ||
        currentUrl.includes("/app/select-family")
      ) {
        await completeOnboardingIfNeeded(targetPage);
        continue;
      }

      if (!/\/app(\?|$)/.test(currentUrl)) {
        await targetPage.waitForTimeout(400);
        continue;
      }

      const profileLock = targetPage.getByTestId("profile-lock-modal");
      if (await profileLock.isVisible().catch(() => false)) {
        try {
          await targetPage.getByTestId("complete-profile").click({
            timeout: 2_000,
          });
        } catch {
          // Profile lock can re-render while routing to onboarding. Retry loop handles it.
        }
        await targetPage.waitForTimeout(300);
        continue;
      }

      const appReady = targetPage.getByTestId("app-ready");
      const readyVisible = await appReady.isVisible().catch(() => false);
      if (!readyVisible) {
        await targetPage.waitForTimeout(400);
        continue;
      }

      const settingsReady = await appReady.getAttribute("data-settings-ready");
      const childReady = await appReady.getAttribute("data-active-child-ready");
      if (settingsReady === "1" && childReady === "1") {
        await targetPage.getByTestId("active-child-select").waitFor({
          timeout: Math.max(1_000, deadline - Date.now()),
        });
        await targetPage.getByTestId("chat-input").waitFor({
          timeout: Math.max(1_000, deadline - Date.now()),
        });
        return;
      }
      await targetPage.waitForTimeout(400);
    }
    throw new Error(`App core not ready. Current URL: ${targetPage.url()}`);
  };

    mark("onboarding");
    await completeOnboardingIfNeeded(page);

  await waitForAppCoreReady(page);
  await expect(page.getByTestId("profile-lock-modal")).toHaveCount(0);
  await screenshot(page, "06-app-before-ready.png");
  try {
    await waitForAppCoreReady(page);
  } catch (err) {
    await screenshot(page, "06-app-crash.png");
    const logPath = path.join(proofDir, "console-errors.log");
    fs.writeFileSync(logPath, consoleErrors.join("\n") || "none");
    await testInfo.attach("console-errors", {
      path: logPath,
      contentType: "text/plain",
    });
    throw err;
  }
  await screenshot(page, "06-app-loaded.png");

  const chatMessages = page.getByTestId("chat-message");
  const assistantMessages = page.locator(
    '[data-testid="chat-message"][data-sender="assistant"]',
  );
  const matchesActivityRequest = (res: any, text: string) => {
    if (res.request().method() !== "POST") return false;
    if (!res.url().includes("/api/v1/activities")) return false;
    try {
      const req = res.request();
      let payload: any = null;
      if (typeof req.postDataJSON === "function") {
        try {
          payload = req.postDataJSON();
        } catch {
          payload = null;
        }
      }
      if (!payload) {
        const raw = req.postData();
        if (raw) payload = JSON.parse(raw);
      }
      return payload?.message === text;
    } catch {
      return false;
    }
  };
  const sendMessage = async (text: string, attempt = 0): Promise<void> => {
    const assistantCountBefore = await assistantMessages.count();
    const activityResponse = page.waitForResponse(
      (res) => matchesActivityRequest(res, text),
    );
    await page.getByTestId("chat-input").fill(text);
    await expect(page.getByTestId("chat-send")).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId("chat-send").click();
    const activityResult = await activityResponse;
    if (activityResult.status() === 404 && attempt < 3) {
      await page.getByTestId("nav-history").click();
      await page.getByRole("button", { name: /new chat/i }).first().click();
      await page.getByTestId("nav-havi").click();
      await page.waitForTimeout(250);
      await expect(page.getByTestId("chat-input")).toBeEnabled({
        timeout: 20_000,
      });
      await sendMessage(text, attempt + 1);
      return;
    }
    expect(activityResult.status()).toBe(200);
    await expect
      .poll(
        async () => (await assistantMessages.count()) > assistantCountBefore,
        {
          timeout: 20_000,
        },
      )
      .toBeTruthy();
    await expect(chatMessages.last()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("chat-input")).toBeEnabled({ timeout: 20_000 });
  };

    mark("chat");
    await sendMessage("Baby woke up at 3pm and had a bottle");
  await sendMessage("River likes baths");
  await sendMessage("River prefers tummy time");
  await sendMessage("save this: River loves stroller walks");
  await sendMessage("remember this: River calms with white noise");

  await screenshot(page, "07-chat-messages.png");

  await sendMessage("What is normal for naps?");
  const lastAssistant = page
    .locator('[data-testid="chat-message"][data-sender="assistant"]')
    .last();
  await expect(lastAssistant).toContainText(/wake windows|feeds|routine/i);

    mark("timeline");
    const eventsResponsePromise = page.waitForResponse((res) =>
    res.url().includes("/events?") && res.request().method() === "GET",
  );
  await page.getByTestId("nav-timeline").click();
  await page.getByTestId("timeline-panel").waitFor();
  const eventsResponse = await eventsResponsePromise;
  const events = (await eventsResponse.json()) as Array<{
    start: string;
    title: string;
    type?: string;
    detail?: string;
  }>;
  expect(events.some((entry) => entry.type === "sleep")).toBeTruthy();
  expect(events.some((entry) => entry.type === "bottle")).toBeTruthy();
  const sleepEvent =
    events.find((entry) => (entry.detail ?? "").includes("woke up")) ||
    events.find((entry) => entry.type === "sleep");
  expect(sleepEvent).toBeTruthy();
  if (sleepEvent) {
    expect(sleepEvent.start).toMatch(/Z|[+-]\d{2}:\d{2}/);
    const localTime = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Los_Angeles",
    }).format(new Date(sleepEvent.start));
    expect(localTime).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
  }
  const timelineEventCount = await page.getByTestId("timeline-event").count();
  expect(timelineEventCount).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("timeline-timezone")).toBeVisible();
  await screenshot(page, "08-timeline-event.png");

    mark("tasks");
  await page.getByTestId("nav-tasks").click();
  await page.getByTestId("tasks-view-all").click();
  const createTaskAResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/api/v1/tasks"),
  );
  await page.getByTestId("task-input").fill("Buy diapers A");
  await expect(page.getByTestId("task-add")).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId("task-add").click();
  const taskAResponse = await createTaskAResponse;
  expect(taskAResponse.status()).toBe(200);
  const taskAJson = (await taskAResponse.json()) as { title?: string };
  expect(taskAJson.title ?? "").toContain("Buy diapers A");
  await screenshot(page, "09-task-created.png");

  await page.getByTestId("nav-settings").click();
  await page.getByTestId("caregiver-edit-toggle").first().click();
  await page.getByTestId("caregiver-first-name").fill("Green");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("caregiver-first-name")).toHaveValue("Green");
  await screenshot(page, "10-settings-updated.png");

  await page.getByTestId("add-child").click();
  await page.fill("#new-child-first-name", "June");
  await page.selectOption("#new-child-gender", "unknown");
  await page.fill("#new-child-due-date", "2026-03-01");
  await page.selectOption("#new-child-timezone", "America/Los_Angeles");
  await page.locator("#new-child-save").click();
  await expect(
    page.locator('[data-testid="active-child-select"] option').filter({ hasText: "June" }),
  ).toHaveCount(1);
  await screenshot(page, "11-child-added.png");

  await page.selectOption('[data-testid="active-child-select"]', { label: "June" });
  await page.getByTestId("nav-havi").click();
  await sendMessage("June took a nap at 1pm");

  await page.getByTestId("nav-tasks").click();
  await page.getByTestId("tasks-view-all").click();
  const createTaskBResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/api/v1/tasks"),
  );
  await page.getByTestId("task-input").fill("Buy diapers B");
  await expect(page.getByTestId("task-add")).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId("task-add").click();
  const taskBResponse = await createTaskBResponse;
  expect(taskBResponse.status()).toBe(200);
  await expect(page.getByTestId("task-title").filter({ hasText: "Buy diapers B" })).toBeVisible();

  await page.getByTestId("nav-timeline").click();
  await expect(
    page.getByTestId("timeline-event-title").filter({ hasText: /Sleep/i }).first(),
  ).toBeVisible();

  await page.selectOption('[data-testid="active-child-select"]', { label: "River" });
  await page.getByTestId("nav-tasks").click();
  await page.getByTestId("tasks-view-all").click();
  await expect(page.getByTestId("task-title").filter({ hasText: "Buy diapers A" })).toBeVisible();
  await expect(page.getByTestId("task-title").filter({ hasText: "Buy diapers B" })).toBeVisible();

  await page.reload();
  await waitForAppCoreReady(page);
  await page.selectOption('[data-testid="active-child-select"]', { label: "River" });
  await page.getByTestId("nav-tasks").click();
  await page.getByTestId("tasks-view-all").click();
  await expect(page.getByTestId("task-title").filter({ hasText: "Buy diapers A" })).toBeVisible();
  await screenshot(page, "12-task-persisted.png");

  mark("timeline-persist");
  await page.getByTestId("nav-timeline").click();
  await page.getByTestId("timeline-panel").waitFor();
  const timelineTitles = page.getByTestId("timeline-event-title");
  await expect(timelineTitles.first()).toBeVisible();
  const titleTexts = await timelineTitles.allTextContents();
  expect(titleTexts.some((text) => /Sleep|Bottle/i.test(text))).toBeTruthy();
  await expect(page.getByTestId("timeline-event-time").first()).toContainText(
    /\d{1,2}:\d{2}/,
  );
  await screenshot(page, "12b-timeline-persisted.png");

  await page.getByTestId("nav-settings").click();
  await page.getByTestId("caregiver-edit-toggle").first().click();
  await expect(page.getByTestId("caregiver-first-name")).toHaveValue("Green");
  await screenshot(page, "13-settings-persisted.png");

  mark("memory");
  await page.getByTestId("nav-knowledge").click();
  await page.getByTestId("memory-suggestions").waitFor();
  const suggestionCards = page.locator('[data-testid^="memory-suggestion-"]');
  const suggestionIds = await suggestionCards.evaluateAll((nodes) =>
    nodes
      .map((node) => node.getAttribute("data-testid"))
      .filter((value): value is string => Boolean(value)),
  );
  let rejectId: string | null = null;
  if (suggestionIds.length >= 2) {
    const confirmId = suggestionIds[0]!;
    rejectId = suggestionIds[1]!;
    await page
      .getByTestId(confirmId)
      .getByRole("button", { name: /yes, generally/i })
      .click();
    await page
      .getByTestId(rejectId)
      .getByRole("button", { name: /not really/i })
      .click();
  }
  await expect(page.locator('[data-testid^="memory-saved-"]').first()).toBeVisible();
  await expect(page.getByTestId("memory-saved")).toContainText(/stroller walks/i);
  await expect(page.getByTestId("memory-saved")).toContainText(/white noise/i);
  await screenshot(page, "14-memory-saved.png");

  await page.reload();
  await waitForAppCoreReady(page);
  await page.getByTestId("nav-knowledge").click();
  await page.getByTestId("memory-suggestions").waitFor();
  if (rejectId) {
    await expect(page.getByTestId(rejectId)).toHaveCount(0);
  }
  await expect(page.getByTestId("memory-saved")).toContainText(/stroller walks/i);
  await expect(page.getByTestId("memory-saved")).toContainText(/white noise/i);
  await screenshot(page, "14b-memory-persisted.png");

  mark("sharing");
  await page.getByTestId("memory-share").first().click();
  await page.getByTestId("memory-share-link").waitFor();
  const memoryShareLink = (await page.getByTestId("memory-share-link").innerText()).trim();

  await page.getByTestId("nav-havi").click();
  await page.getByTestId("share-conversation").click();
  await page.getByTestId("share-link").waitFor();
  const conversationShareLink = (await page.getByTestId("share-link").innerText()).trim();

  const shareContext = await browser.newContext();
  const sharePage = await shareContext.newPage();
  await sharePage.goto(conversationShareLink);
  await expect(sharePage.getByTestId("shared-conversation")).toBeVisible();
  await screenshot(sharePage, "15-share-conversation.png");

  const memorySharePage = await shareContext.newPage();
  await memorySharePage.goto(memoryShareLink);
  await expect(memorySharePage.getByTestId("shared-memory")).toBeVisible();
  await screenshot(memorySharePage, "16-share-memory.png");

  mark("invite");
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("open-invite").click();
  await page.fill("#invite-email", inviteeEmail);
  await page.getByRole("button", { name: /create invite/i }).click();
  await expect(page.getByTestId("invite-link")).toBeVisible();
  const inviteLink = (await page.getByTestId("invite-link").innerText()).trim();
  await screenshot(page, "17-invite-link.png");
  await page.getByRole("button", { name: /close/i }).click();

  await page.getByTestId("sign-out").click();
  await page.waitForURL(/\/auth\/sign-in/, { timeout: 10_000 });

  mark("sign-in-again");
  await page.fill('input[type="email"]', signedIn ? user1Email : fallbackEmail);
  await page.fill('input[type="password"]', signedIn ? user1Password : fallbackPassword);
  await page.getByRole("button", { name: /sign in/i }).click();
  await waitForAppCoreReady(page);

  await page.getByTestId("nav-settings").click();
  await page.getByTestId("sign-out").click();
  await page.waitForURL(/\/auth\/sign-in/, { timeout: 10_000 });

  mark("invitee-signup");
  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  trackConsoleErrors(inviteePage, consoleErrors, "user2");

  await inviteePage.goto("/auth/sign-up");
  await inviteePage.fill('input[type="email"]', inviteeEmail);
  await inviteePage.fill('input[type="password"]', inviteePassword);
  await inviteePage.getByRole("button", { name: /continue/i }).click();

  let inviteeSignedIn = true;
  try {
    await inviteePage.waitForURL(/\/app/, { timeout: 12_000 });
  } catch {
    inviteeSignedIn = false;
  }

  if (!inviteeSignedIn) {
    const inviteeError = inviteePage.locator("p.text-destructive");
    const inviteeNotice = inviteePage.locator("p.text-emerald-200");
    if (await inviteeError.isVisible()) {
      throw new Error(
        `Invitee signup error: ${(await inviteeError.innerText()).trim()}`,
      );
    }
    if (await inviteeNotice.isVisible()) {
      await screenshot(inviteePage, "18-invitee-confirmation.png");
    }
    if (!inviteeFallbackEmail || !inviteeFallbackPassword) {
      throw new Error(
        "Email confirmation required for invitee. Set GREEN_INVITEE_EMAIL and GREEN_INVITEE_PASSWORD to continue.",
      );
    }
    mark("invitee-signin");
    await inviteePage.goto("/auth/sign-in");
    await inviteePage.fill('input[type="email"]', inviteeFallbackEmail);
    await inviteePage.fill('input[type="password"]', inviteeFallbackPassword);
    await inviteePage.getByRole("button", { name: /sign in/i }).click();
    await inviteePage.waitForURL(/\/app/, { timeout: 15_000 });
  }

  await inviteePage.goto(inviteLink);
  await waitForAppCoreReady(inviteePage);
  await expect(inviteePage.getByTestId("profile-lock-modal")).toHaveCount(0);
  await screenshot(inviteePage, "18-invite-accepted.png");

  mark("invitee-verify");
  await inviteePage.selectOption('[data-testid="active-child-select"]', { label: "River" });
  await inviteePage.getByTestId("nav-timeline").click();
  await expect(inviteePage.getByTestId("timeline-event").first()).toBeVisible();

  mark("invitee-signout");
  await inviteePage.getByTestId("nav-settings").click();
  await inviteePage.getByTestId("sign-out").click();
  await inviteePage.waitForURL(/\/auth\/sign-in/, { timeout: 10_000 });

  mark("forgot-password");
  await page.goto("/auth/forgot-password");
  await page.fill('input[type="email"]', signedIn ? user1Email : fallbackEmail);
  await page.getByRole("button", { name: /send reset link/i }).click();
  await expect(page.locator("p.text-emerald-200, p.text-destructive").first()).toBeVisible();
  await screenshot(page, "19-forgot-password.png");

  const logPath = path.join(proofDir, "console-errors.log");
  fs.writeFileSync(logPath, consoleErrors.join("\n") || "none");
  await testInfo.attach("console-errors", {
    path: logPath,
    contentType: "text/plain",
  });
  expect(consoleErrors).toEqual([]);
  } catch (error) {
    await writeFailure(error);
    const logPath = path.join(proofDir, "console-errors.log");
    fs.writeFileSync(logPath, consoleErrors.join("\n") || "none");
    await testInfo.attach("console-errors", {
      path: logPath,
      contentType: "text/plain",
    });
    throw error;
  }
});
