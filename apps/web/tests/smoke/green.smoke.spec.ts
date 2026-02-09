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
    const url = request.url();
    if (shouldIgnoreRequestFailure(url, errorText)) {
      return;
    }
    bucket.push(
      `[${label}] requestfailed: ${request.method()} ${url} (${errorText})`,
    );
  });
};

const shouldIgnoreRequestFailure = (url: string, errorText: string) => {
  if (url.endsWith("/favicon.ico")) return true;
  if (url.includes("/manifest.json")) return true;
  if (errorText.includes("net::ERR_ABORTED") && url.includes("/favicon")) {
    return true;
  }
  return false;
};

const completeOnboardingIfNeeded = async (page: any) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.waitForLoadState("domcontentloaded");
    const currentUrl = page.url();

    if (currentUrl.includes("/app/onboarding/family")) {
      await page.getByTestId("onboarding-family-name").waitFor();
      await page.getByTestId("onboarding-family-name").fill("Green Family");
      await page.getByTestId("onboarding-create-family").click();
      await page.waitForURL(/\/app\/onboarding\/child|\/app(\?|$)/, {
        timeout: 20_000,
      });
      continue;
    }

    if (currentUrl.includes("/app/onboarding/child")) {
      await page.getByTestId("onboarding-child-name").waitFor();
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

const completeSetupModalIfNeeded = async (page: any) => {
  const modal = page.getByTestId("setup-required-modal");
  const visible = await modal.isVisible().catch(() => false);
  if (!visible) {
    return;
  }

  await page.getByTestId("finish-setup").click();
  await page.getByTestId("settings-save").waitFor({ timeout: 15_000 });

  const editButton = page.getByTestId("settings-child-edit");
  if (await editButton.isVisible().catch(() => false)) {
    await editButton.click();
  }

  const bornButton = page.getByTestId("settings-child-born");
  if (await bornButton.isVisible().catch(() => false)) {
    await bornButton.click();
  }

  const dobField = page.getByTestId("settings-child-dob");
  if (await dobField.isVisible().catch(() => false)) {
    await dobField.fill("09-23-2025");
  }

  const genderSelect = page.getByTestId("settings-child-gender");
  if (await genderSelect.isVisible().catch(() => false)) {
    await genderSelect.selectOption("girl");
  }

  const birthWeightField = page.getByTestId("settings-child-birth-weight");
  if (await birthWeightField.isVisible().catch(() => false)) {
    await birthWeightField.fill("7.5");
  }

  page.once("dialog", (dialog: any) => dialog.accept());
  await page.getByTestId("settings-save").click();
  await page.getByRole("button", { name: /back to chat/i }).click();
  await expect(page.getByTestId("setup-required-modal")).toHaveCount(0);
};

test("GREEN smoke", async ({ page }) => {
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
  const userEmail = `green+${timestamp}@example.com`;
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
  const knowledgeResponsePromise = page.waitForResponse((res: any) => {
    const url = res.url?.() ?? "";
    return url.includes("/api/v1/knowledge") && res.request().method() === "GET";
  });
  await page.waitForURL(/\/app(\?|$)/, { timeout: 20_000 });
  await completeSetupModalIfNeeded(page);
  await page.getByTestId("chat-input").waitFor({ timeout: 15_000 });
  const knowledgeResponse = await knowledgeResponsePromise;
  expect(knowledgeResponse.status()).toBe(200);

  const chatMessages = page.getByTestId("chat-message");
  const sendMessage = async (text: string) => {
    const before = await chatMessages.count();
    await page.getByTestId("chat-input").fill(text);
    await page.getByTestId("chat-send").click();
    await expect(chatMessages).toHaveCount(before + 2);
  };

  const chatText = `Green chat ${timestamp}`;
  await sendMessage(chatText);
  await expect(page.getByText(chatText)).toBeVisible();

  await page.getByTestId("nav-tasks").click();
  await page.getByTestId("tasks-view-all").click();
  const taskTitle = `Green task ${timestamp}`;
  await page.getByTestId("task-input").fill(taskTitle);
  await page.getByTestId("task-add").click();
  await expect(
    page.getByTestId("task-title").filter({ hasText: taskTitle }),
  ).toBeVisible();

  await page.getByTestId("nav-knowledge").click();
  await page.getByTestId("memory-suggestions").waitFor();
  await page.getByTestId("memory-saved").waitFor();
  await expect(page.getByTestId("memory-suggestions")).toBeVisible();
  await expect(page.getByTestId("memory-saved")).toBeVisible();

  await page.reload();
  await page.getByTestId("chat-input").waitFor({ timeout: 15_000 });
  await page.getByTestId("nav-havi").click();
  await expect(page.getByText(chatText)).toBeVisible();

  await page.getByTestId("nav-tasks").click();
  await page.getByTestId("tasks-view-all").click();
  await expect(
    page.getByTestId("task-title").filter({ hasText: taskTitle }),
  ).toBeVisible();

  await page.waitForTimeout(30_000);
  expect(badKnowledgeResponses).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
