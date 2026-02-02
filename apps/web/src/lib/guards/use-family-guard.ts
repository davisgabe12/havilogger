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
    const log = (...args: unknown[]) => {
      if (!debugEnabled) return;
      // eslint-disable-next-line no-console
      console.info("[family-guard]", ...args);
    };

    const runGuard = async () => {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      const session = sessionData?.session ?? null;
      log("session", {
        hasSession: Boolean(session),
        error: sessionError?.message ?? null,
      });
      if (!session || sessionError) {
        if (allowUnauthed) {
          if (isMounted) {
            setState({ status: "ready", error: null });
          }
          return;
        }
        router.replace("/auth/sign-in");
        if (isMounted) {
          setState({ status: "redirecting", error: null });
        }
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
        });
        router.replace("/app/onboarding/family");
        if (isMounted) {
          setState({ status: "redirecting", error: null });
        }
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
        return;
      }

      if (initialDecision.type === "clearCookie") {
        await clearActiveFamilyId();
        router.replace(initialDecision.to);
        if (isMounted) {
          setState({ status: "redirecting", error: null });
        }
        return;
      }

      let resolvedFamilyId: string | null = activeFamilyId;
      if (initialDecision.type === "autoSelect") {
        const ok = await setActiveFamilyId(initialDecision.familyId);
        if (!ok) {
          if (isMounted) {
            setState({
              status: "error",
              error: "We couldn’t select your family. Please try again.",
            });
          }
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
        if (isMounted) {
          setState({
            status: "error",
            error: "We couldn’t load your child profile. Try again in a moment.",
          });
        }
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
        return;
      }

      if (isMounted) {
        setState({ status: "ready", error: null });
      }
    };

    void runGuard();

    return () => {
      isMounted = false;
    };
  }, [allowUnauthed, router]);

  return state;
};
