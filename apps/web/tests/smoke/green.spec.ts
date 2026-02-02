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

const trackConsoleErrors = (page: any, bucket: string[], label: string) => {
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
    bucket.push(
      `[${label}] requestfailed: ${request.method()} ${request.url()} (${errorText})`,
    );
  });
};

test("GREEN flow end-to-end", async ({ page, browser }, testInfo) => {
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
  const user1Email = `green+${timestamp}@example.com`;
  const user1Password = "Lev2025!";

  const fallbackEmail = process.env.GREEN_EXISTING_EMAIL ?? "";
  const fallbackPassword = process.env.GREEN_EXISTING_PASSWORD ?? "";

  const inviteeEmail = `green.invitee+${timestamp}@example.com`;
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
    await expect(page.getByText(/check your email/i)).toBeVisible();
    await screenshot(page, "03b-sign-up-confirmation.png");
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

  const completeOnboardingIfNeeded = async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await page.waitForLoadState("domcontentloaded");
      const currentUrl = page.url();

      if (currentUrl.includes("/app/onboarding/family")) {
        await page.getByTestId("onboarding-family-name").waitFor();
        await screenshot(page, "04-onboarding-family.png");
        await page.getByTestId("onboarding-family-name").fill("Green Family");
        await page.getByTestId("onboarding-create-family").click();
        await page.waitForURL(/\/app\/onboarding\/child|\/app(\?|$)/, {
          timeout: 20_000,
        });
        continue;
      }

      if (currentUrl.includes("/app/onboarding/child")) {
        await page.getByTestId("onboarding-child-name").waitFor();
        await screenshot(page, "05-onboarding-child.png");
        await page.getByTestId("onboarding-child-name").fill("River");
        await page.getByTestId("onboarding-child-dob").fill("2024-01-15");
        await page.getByTestId("onboarding-child-gender").selectOption("girl");
        await page.getByTestId("onboarding-child-birth-weight").fill("7.5");
        await page.getByTestId("onboarding-save-child").click();
        await page.waitForURL(/\/app(\?|$)/, { timeout: 20_000 });
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

    mark("onboarding");
    await completeOnboardingIfNeeded();

  await page.waitForURL(/\/app(\?|$)/, { timeout: 20_000 });
  consoleErrors.push(`[pre-app-ready] url=${page.url()}`);
  await screenshot(page, "06-app-before-ready.png");
  if (page.url().includes("/app/onboarding/")) {
    throw new Error(`Blocked on onboarding route: ${page.url()}`);
  }
  try {
    await page.getByTestId("app-ready").waitFor({ timeout: 15_000 });
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
  const sendMessage = async (text: string) => {
    const before = await chatMessages.count();
    await page.getByTestId("chat-input").fill(text);
    await page.getByTestId("chat-send").click();
    await expect(chatMessages).toHaveCount(before + 2);
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
      expect(localTime).toContain("3:00");
  }
  const timelineEventCount = await page.getByTestId("timeline-event").count();
  expect(timelineEventCount).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("timeline-timezone")).toBeVisible();
  await screenshot(page, "08-timeline-event.png");

    mark("tasks");
  await page.getByTestId("nav-tasks").click();
  await page.getByTestId("tasks-view-all").click();
  await page.getByTestId("task-input").fill("Buy diapers A");
  await page.getByTestId("task-add").click();
  await expect(page.getByTestId("task-item").first()).toBeVisible();
  await screenshot(page, "09-task-created.png");

  await page.getByTestId("task-item").first().click();
  await page.getByTestId("task-detail-title").fill("Buy diapers A (updated)");
  await page.getByTestId("task-detail-save").click();
  await page.getByTestId("task-detail-toggle").click();
  await page.getByTestId("tasks-view-all").click();
  await expect(page.getByTestId("task-title").first()).toContainText("updated");

  await page.getByTestId("nav-settings").click();
  await page.getByTestId("caregiver-edit-toggle").click();
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
  await expect(page.getByTestId("active-child-select")).toContainText(/June/);
  await screenshot(page, "11-child-added.png");

  await page.selectOption('[data-testid="active-child-select"]', { label: "June" });
  await page.getByTestId("nav-havi").click();
  await sendMessage("June took a nap at 1pm");

  await page.getByTestId("nav-tasks").click();
  await page.getByTestId("tasks-view-all").click();
  await page.getByTestId("task-input").fill("Buy diapers B");
  await page.getByTestId("task-add").click();
  await expect(page.getByTestId("task-title").filter({ hasText: "Buy diapers B" })).toBeVisible();

  await page.getByTestId("nav-timeline").click();
  await expect(page.getByTestId("timeline-event-title")).toContainText("Sleep");

  await page.selectOption('[data-testid="active-child-select"]', { label: "River" });
  await page.getByTestId("nav-tasks").click();
  await page.getByTestId("tasks-view-all").click();
  await expect(page.getByTestId("task-title").filter({ hasText: "Buy diapers A" })).toBeVisible();
  await expect(page.getByTestId("task-title").filter({ hasText: "Buy diapers B" })).toHaveCount(0);

  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("app-ready").waitFor();
  await page.selectOption('[data-testid="active-child-select"]', { label: "River" });
  await page.getByTestId("nav-tasks").click();
  await page.getByTestId("tasks-view-all").click();
  await expect(page.getByTestId("task-title").filter({ hasText: "Buy diapers A" })).toBeVisible();
  await screenshot(page, "12-task-persisted.png");

  mark("timeline-persist");
  await page.getByTestId("nav-timeline").click();
  await page.getByTestId("timeline-panel").waitFor();
  await expect(page.getByTestId("timeline-event-title")).toContainText(/Sleep|Bottle/i);
  await expect(page.getByTestId("timeline-event-time").first()).toContainText("3:00");
  await screenshot(page, "12b-timeline-persisted.png");

  await page.getByTestId("nav-settings").click();
  await page.getByTestId("caregiver-edit-toggle").click();
  await expect(page.getByTestId("caregiver-first-name")).toHaveValue("Green");
  await screenshot(page, "13-settings-persisted.png");

  mark("memory");
  await page.getByTestId("nav-knowledge").click();
  await page.getByTestId("memory-suggestions").waitFor();
  const suggestionCards = page.locator('[data-testid^="memory-suggestion-"]');
  await expect(suggestionCards.first()).toBeVisible();
  const suggestionIds = await suggestionCards.evaluateAll((nodes) =>
    nodes
      .map((node) => node.getAttribute("data-testid"))
      .filter((value): value is string => Boolean(value)),
  );
  expect(suggestionIds.length).toBeGreaterThanOrEqual(2);
  const confirmId = suggestionIds[0]!;
  const rejectId = suggestionIds[1]!;
  await page.getByTestId(confirmId).getByRole("button", { name: /yes, generally/i }).click();
  await page.getByTestId(rejectId).getByRole("button", { name: /not really/i }).click();
  await expect(page.locator('[data-testid^="memory-saved-"]').first()).toBeVisible();
  await expect(page.getByTestId("memory-saved")).toContainText(/stroller walks/i);
  await expect(page.getByTestId("memory-saved")).toContainText(/white noise/i);
  await screenshot(page, "14-memory-saved.png");

  await page.reload();
  await page.getByTestId("app-ready").waitFor();
  await page.getByTestId("nav-knowledge").click();
  await page.getByTestId("memory-suggestions").waitFor();
  await expect(page.getByTestId(rejectId)).toHaveCount(0);
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
  await page.waitForURL(/\/app/, { timeout: 15_000 });

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
    await expect(inviteePage.getByText(/check your email/i)).toBeVisible();
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
  await inviteePage.waitForURL(/\/app/, { timeout: 15_000 });
  await expect(inviteePage.getByTestId("app-ready")).toBeVisible();
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
  await expect(page.getByText(/check your email/i)).toBeVisible();
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
