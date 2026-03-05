import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import { decideFamilyGuard } from "@/lib/guards/family-guard";

type GuardStatus = "loading" | "ready" | "redirecting" | "error";

type GuardState = {
  status: GuardStatus;
  error: string | null;
};

const fetchActiveFamilyId = async (
  debugEnabled: boolean,
): Promise<string | null> => {
  const response = await fetch("/api/active-family", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  const data = (await response
    .json()
    .catch(() => ({ familyId: null }))) as { familyId?: string | null };
  if (debugEnabled) {
    // eslint-disable-next-line no-console
    console.info("[family-guard] cookie", {
      status: response.status,
      data,
    });
  }
  if (!response.ok) return null;
  return typeof data.familyId === "string" && data.familyId.length > 0
    ? data.familyId
    : null;
};

const setActiveFamilyId = async (familyId: string): Promise<boolean> => {
  const response = await fetch("/api/active-family", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ familyId }),
  });
  return response.ok;
};

const clearActiveFamilyId = async (): Promise<void> => {
  await fetch("/api/active-family", {
    method: "DELETE",
    credentials: "include",
  });
};

export const useFamilyGuard = (options?: {
  allowUnauthed?: boolean;
}): GuardState => {
  const router = useRouter();
  const allowUnauthed = options?.allowUnauthed ?? false;
  const [state, setState] = useState<GuardState>({
    status: "loading",
    error: null,
  });

  useEffect(() => {
    let isMounted = true;
    const debugEnabled = process.env.NEXT_PUBLIC_DEBUG_GUARD === "1";
    const maxAttempts = 3;
    const retryDelayMs = 450;
    const sessionRetryDelayMs = 250;
    const failOpenTimeoutMs = 8000;
    let activeRunToken = 0;
    const retryTimers = new Set<ReturnType<typeof setTimeout>>();
    const log = (...args: unknown[]) => {
      if (!debugEnabled) return;
      // eslint-disable-next-line no-console
      console.info("[family-guard]", ...args);
    };

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const clearFailOpenTimer = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const failOpen = (message: string, runToken: number) => {
      if (!isMounted || runToken !== activeRunToken) return;
      clearFailOpenTimer();
      setState({ status: "ready", error: message });
    };

    const scheduleRetry = (
      nextAttempt: number,
      runToken: number,
      reason: string,
    ) => {
      const timer = setTimeout(() => {
        retryTimers.delete(timer);
        if (!isMounted || runToken !== activeRunToken) return;
        log("retry", { nextAttempt, reason });
        void runGuard(nextAttempt, runToken);
      }, retryDelayMs);
      retryTimers.add(timer);
    };

    const runGuard = async (attempt: number, runToken: number) => {
      if (!isMounted || runToken !== activeRunToken) return;
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      let session = sessionData?.session ?? null;
      if (!session) {
        await new Promise((resolve) => setTimeout(resolve, sessionRetryDelayMs));
        const retry = await supabase.auth.getSession();
        session = retry.data?.session ?? null;
      }
      if (!isMounted || runToken !== activeRunToken) return;
      log("session", {
        hasSession: Boolean(session),
        error: sessionError?.message ?? null,
      });
      if (!session || sessionError) {
        if (allowUnauthed) {
          clearFailOpenTimer();
          setState({ status: "ready", error: null });
          return;
        }
        router.replace("/auth/sign-in");
        setState({ status: "redirecting", error: null });
        clearFailOpenTimer();
        return;
      }

      const userId = session.user.id;
      const { data: membershipsData, error: membershipsError, status } = await supabase
        .from("family_members")
        .select("family_id")
        .eq("user_id", userId);
      log("memberships", {
        status,
        error: membershipsError?.message ?? null,
        details: membershipsError?.details ?? null,
        code: membershipsError?.code ?? null,
        count: membershipsData?.length ?? 0,
      });

      if (membershipsError) {
        log("memberships-error", {
          message: membershipsError.message,
          details: membershipsError.details,
          code: membershipsError.code,
          attempt,
        });
        if (attempt + 1 < maxAttempts) {
          scheduleRetry(attempt + 1, runToken, "memberships-error");
          return;
        }
        failOpen("We couldn’t verify your family yet. Some data may be missing.", runToken);
        return;
      }

      const memberships = (membershipsData ?? []).map((row) =>
        String(row.family_id),
      );
      if (memberships.length === 0 && attempt + 1 < maxAttempts) {
        scheduleRetry(attempt + 1, runToken, "zero-memberships-race");
        return;
      }
      const activeFamilyId = await fetchActiveFamilyId(debugEnabled);
      if (!isMounted || runToken !== activeRunToken) return;
      log("decision-inputs", {
        memberships,
        activeFamilyId,
      });
      const initialDecision = decideFamilyGuard({
        isAuthenticated: true,
        memberships,
        activeFamilyId,
        childCount: null,
      });

      if (initialDecision.type === "redirect") {
        if (!isMounted || runToken !== activeRunToken) return;
        router.replace(initialDecision.to);
        setState({ status: "redirecting", error: null });
        clearFailOpenTimer();
        return;
      }

      if (initialDecision.type === "clearCookie") {
        await clearActiveFamilyId();
        if (!isMounted || runToken !== activeRunToken) return;
        router.replace(initialDecision.to);
        setState({ status: "redirecting", error: null });
        clearFailOpenTimer();
        return;
      }

      let resolvedFamilyId: string | null = activeFamilyId;
      if (initialDecision.type === "autoSelect") {
        const ok = await setActiveFamilyId(initialDecision.familyId);
        if (!isMounted || runToken !== activeRunToken) return;
        if (!ok) {
          if (attempt + 1 < maxAttempts) {
            scheduleRetry(attempt + 1, runToken, "auto-select-cookie");
            return;
          }
          failOpen("We couldn’t select your family. Some data may be missing.", runToken);
          return;
        }
        resolvedFamilyId = initialDecision.familyId;
      } else if (initialDecision.type === "needsChildCheck") {
        resolvedFamilyId = initialDecision.familyId;
      }

      if (!resolvedFamilyId) {
        if (!isMounted || runToken !== activeRunToken) return;
        router.replace("/app/select-family");
        setState({ status: "redirecting", error: null });
        clearFailOpenTimer();
        return;
      }

      const { count, error: childError, status: childStatus } = await supabase
        .from("children")
        .select("id", { count: "exact", head: true })
        .eq("family_id", resolvedFamilyId);
      if (!isMounted || runToken !== activeRunToken) return;
      log("children-count", {
        status: childStatus,
        error: childError?.message ?? null,
        details: childError?.details ?? null,
        code: childError?.code ?? null,
        count,
      });

      if (childError) {
        if (attempt + 1 < maxAttempts) {
          scheduleRetry(attempt + 1, runToken, "children-count-error");
          return;
        }
        failOpen("We couldn’t load your child profile. Some data may be missing.", runToken);
        return;
      }

      const finalDecision = decideFamilyGuard({
        isAuthenticated: true,
        memberships,
        activeFamilyId: resolvedFamilyId,
        childCount: count ?? 0,
      });

      if (finalDecision.type === "redirect") {
        if (
          finalDecision.to === "/app/onboarding/profile" &&
          (count ?? 0) === 0 &&
          attempt + 1 < maxAttempts
        ) {
          scheduleRetry(attempt + 1, runToken, "zero-child-race");
          return;
        }
        if (!isMounted || runToken !== activeRunToken) return;
        router.replace(finalDecision.to);
        setState({ status: "redirecting", error: null });
        clearFailOpenTimer();
        return;
      }

      if (!isMounted || runToken !== activeRunToken) return;
      clearFailOpenTimer();
      setState({ status: "ready", error: null });
    };

    activeRunToken += 1;
    const initialRunToken = activeRunToken;
    timeoutId = setTimeout(() => {
      failOpen(
        "We couldn’t verify your family yet. Some data may be missing.",
        initialRunToken,
      );
    }, failOpenTimeoutMs);
    void runGuard(0, initialRunToken);

    return () => {
      isMounted = false;
      activeRunToken += 1;
      for (const retryTimer of retryTimers) {
        clearTimeout(retryTimer);
      }
      retryTimers.clear();
      clearFailOpenTimer();
    };
  }, [allowUnauthed, router]);

  return state;
};
