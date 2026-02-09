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
    const maxAttempts = 2;
    const retryDelayMs = 600;
    const sessionRetryDelayMs = 250;
    const failOpenTimeoutMs = 8000;
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

    const failOpen = (message: string) => {
      clearFailOpenTimer();
      if (isMounted) {
        setState({ status: "ready", error: message });
      }
    };

    const runGuard = async (attempt: number) => {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      let session = sessionData?.session ?? null;
      if (!session) {
        await new Promise((resolve) => setTimeout(resolve, sessionRetryDelayMs));
        const retry = await supabase.auth.getSession();
        session = retry.data?.session ?? null;
      }
      log("session", {
        hasSession: Boolean(session),
        error: sessionError?.message ?? null,
      });
      if (!session || sessionError) {
        if (allowUnauthed) {
          clearFailOpenTimer();
          if (isMounted) {
            setState({ status: "ready", error: null });
          }
          return;
        }
        router.replace("/auth/sign-in");
        if (isMounted) {
          setState({ status: "redirecting", error: null });
        }
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
          setTimeout(() => {
            if (isMounted) void runGuard(attempt + 1);
          }, retryDelayMs);
          return;
        }
        failOpen("We couldn’t verify your family yet. Some data may be missing.");
        return;
      }

      const memberships = (membershipsData ?? []).map((row) =>
        String(row.family_id),
      );
      const activeFamilyId = await fetchActiveFamilyId(debugEnabled);
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
        router.replace(initialDecision.to);
        if (isMounted) {
          setState({ status: "redirecting", error: null });
        }
        clearFailOpenTimer();
        return;
      }

      if (initialDecision.type === "clearCookie") {
        await clearActiveFamilyId();
        router.replace(initialDecision.to);
        if (isMounted) {
          setState({ status: "redirecting", error: null });
        }
        clearFailOpenTimer();
        return;
      }

      let resolvedFamilyId: string | null = activeFamilyId;
      if (initialDecision.type === "autoSelect") {
        const ok = await setActiveFamilyId(initialDecision.familyId);
        if (!ok) {
          if (attempt + 1 < maxAttempts) {
            setTimeout(() => {
              if (isMounted) void runGuard(attempt + 1);
            }, retryDelayMs);
            return;
          }
          failOpen("We couldn’t select your family. Some data may be missing.");
          return;
        }
        resolvedFamilyId = initialDecision.familyId;
      } else if (initialDecision.type === "needsChildCheck") {
        resolvedFamilyId = initialDecision.familyId;
      }

      if (!resolvedFamilyId) {
        router.replace("/app/select-family");
        if (isMounted) {
          setState({ status: "redirecting", error: null });
        }
        clearFailOpenTimer();
        return;
      }

      const { count, error: childError, status: childStatus } = await supabase
        .from("children")
        .select("id", { count: "exact", head: true })
        .eq("family_id", resolvedFamilyId);
      log("children-count", {
        status: childStatus,
        error: childError?.message ?? null,
        details: childError?.details ?? null,
        code: childError?.code ?? null,
        count,
      });

      if (childError) {
        if (attempt + 1 < maxAttempts) {
          setTimeout(() => {
            if (isMounted) void runGuard(attempt + 1);
          }, retryDelayMs);
          return;
        }
        failOpen("We couldn’t load your child profile. Some data may be missing.");
        return;
      }

      const finalDecision = decideFamilyGuard({
        isAuthenticated: true,
        memberships,
        activeFamilyId: resolvedFamilyId,
        childCount: count ?? 0,
      });

      if (finalDecision.type === "redirect") {
        router.replace(finalDecision.to);
        if (isMounted) {
          setState({ status: "redirecting", error: null });
        }
        clearFailOpenTimer();
        return;
      }

      if (isMounted) {
        clearFailOpenTimer();
        setState({ status: "ready", error: null });
      }
    };

    timeoutId = setTimeout(() => {
      failOpen("We couldn’t verify your family yet. Some data may be missing.");
    }, failOpenTimeoutMs);

    void runGuard(0);

    return () => {
      isMounted = false;
      clearFailOpenTimer();
    };
  }, [allowUnauthed, router]);

  return state;
};
