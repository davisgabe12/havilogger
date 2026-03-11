type InviteFlowOptions = {
  inviteeEmail: string;
  inviteePassword: string;
  hasInviteeCreds: boolean;
  timeoutMs?: number;
};

const isVisible = async (locator: any): Promise<boolean> =>
  locator.isVisible().catch(() => false);

const clickContinueToAppIfShown = async (page: any): Promise<boolean> => {
  const continueSignedIn = page.getByRole("button", { name: /continue to app/i });
  if (!(await isVisible(continueSignedIn))) return false;
  await continueSignedIn.click();
  try {
    await page.waitForURL(/\/app(\?|$)/, { timeout: 20_000 });
  } catch {
    // Retry loop handles transitional auth redirects.
  }
  return true;
};

const collectInviteFlowDiagnostics = async (page: any): Promise<string> => {
  const signupVisible = await isVisible(page.getByTestId("invite-signup-submit"));
  const continueToAppVisible = await isVisible(
    page.getByRole("button", { name: /continue to app/i }),
  );
  const signInVisible = await isVisible(
    page.getByRole("button", { name: /sign in/i }),
  );
  const signUpContinueVisible = await isVisible(
    page.getByRole("button", { name: /^continue$/i }),
  );
  const createAccountVisible = await isVisible(
    page.getByRole("link", { name: /create account/i }).first(),
  );
  const inviteSignInLinkVisible = await isVisible(page.getByTestId("invite-signup-sign-in"));
  const bodyText = (await page.locator("body").innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  return [
    `url=${page.url()}`,
    `inviteSignupVisible=${signupVisible}`,
    `continueToAppVisible=${continueToAppVisible}`,
    `signInVisible=${signInVisible}`,
    `signUpContinueVisible=${signUpContinueVisible}`,
    `createAccountVisible=${createAccountVisible}`,
    `inviteSignInLinkVisible=${inviteSignInLinkVisible}`,
    `body="${bodyText}"`,
  ].join(" ");
};

export const completeInviteSignupIfShown = async (
  page: any,
  inviteeEmail: string,
  inviteePassword: string,
) => {
  const submit = page.getByTestId("invite-signup-submit");
  const visible = await isVisible(submit);
  if (!visible) return false;
  const disabled = await submit.isDisabled().catch(() => false);
  if (disabled) {
    await page.waitForTimeout(1_000);
    return false;
  }
  await page.getByTestId("invite-signup-first-name").fill("Green");
  await page.getByTestId("invite-signup-last-name").fill("Invitee");
  await page.getByTestId("invite-signup-phone").fill("5551234567");
  await page.getByTestId("invite-signup-password").fill(inviteePassword);
  const inviteEmailField = page.getByTestId("invite-signup-email");
  const currentInviteEmail = await inviteEmailField.inputValue().catch(() => "");
  if (currentInviteEmail.toLowerCase() !== inviteeEmail.toLowerCase()) {
    throw new Error(
      `Invite signup email mismatch. Expected ${inviteeEmail}, got ${currentInviteEmail || "<empty>"}.`,
    );
  }
  await submit.click();
  try {
    await page.waitForURL(/\/app(\?|$)/, { timeout: 45_000 });
    return true;
  } catch {
    return false;
  }
};

export const completeInviteLinkFlow = async (
  page: any,
  options: InviteFlowOptions,
) => {
  const { inviteeEmail, inviteePassword, hasInviteeCreds, timeoutMs = 120_000 } = options;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const currentUrl = page.url();
    if (/\/app(\?|$)/.test(currentUrl)) {
      return;
    }

    if (currentUrl.includes("/app/invite")) {
      if (await completeInviteSignupIfShown(page, inviteeEmail, inviteePassword)) {
        continue;
      }
      const inviteJoinError = page.locator(".havi-notice-banner-danger");
      if (await isVisible(inviteJoinError)) {
        throw new Error(`Invite join error: ${(await inviteJoinError.innerText()).trim()}`);
      }
      const signInFromInvite = page.getByTestId("invite-signup-sign-in");
      if (hasInviteeCreds && (await isVisible(signInFromInvite))) {
        await signInFromInvite.click();
      } else {
        await page.waitForTimeout(800);
      }
      continue;
    }

    if (currentUrl.includes("/auth/sign-in")) {
      if (await clickContinueToAppIfShown(page)) {
        continue;
      }

      const signInButton = page.getByRole("button", { name: /sign in/i });
      if (!(await isVisible(signInButton))) {
        await page.waitForTimeout(800);
        continue;
      }
      await page.fill('input[type="email"]', inviteeEmail);
      await page.fill('input[type="password"]', inviteePassword);
      await signInButton.click();
      try {
        await page.waitForURL(/\/app(\?|$)|\/auth\/sign-in/, { timeout: 20_000 });
      } catch {
        // Retry loop handles transient auth delays.
      }
      if (page.url().includes("/auth/sign-in") && !hasInviteeCreds) {
        const createAccountLink = page.getByRole("link", { name: /create account/i }).first();
        if (await isVisible(createAccountLink)) {
          await createAccountLink.click();
        }
      }
      continue;
    }

    if (currentUrl.includes("/auth/sign-up")) {
      if (await clickContinueToAppIfShown(page)) {
        continue;
      }

      const continueButton = page.getByRole("button", { name: /^continue$/i });
      if (!(await isVisible(continueButton))) {
        await page.waitForTimeout(800);
        continue;
      }
      await page.fill('input[type="email"]', inviteeEmail);
      await page.fill('input[type="password"]', inviteePassword);
      await continueButton.click();
      try {
        await page.waitForURL(/\/app(\?|$)|\/auth\/sign-in/, { timeout: 20_000 });
      } catch {
        const inviteeError = page.locator(".havi-notice-banner-danger");
        const inviteeNotice = page.locator(".havi-notice-banner-info");
        if (await isVisible(inviteeError)) {
          throw new Error(`Invitee signup error: ${(await inviteeError.innerText()).trim()}`);
        }
        if (await isVisible(inviteeNotice)) {
          throw new Error(
            "Invitee signup requires email confirmation. Set GREEN_INVITEE_EMAIL and GREEN_INVITEE_PASSWORD.",
          );
        }
      }
      continue;
    }

    await page.waitForTimeout(500);
  }

  let screenshotPath = "";
  try {
    screenshotPath = `test-results/invite-flow-timeout-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch {
    screenshotPath = "";
  }
  const diagnostics = await collectInviteFlowDiagnostics(page);
  throw new Error(
    `Invite flow did not reach app. ${diagnostics} screenshot=${screenshotPath || "<none>"}`,
  );
};
