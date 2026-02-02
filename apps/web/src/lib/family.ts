import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8001";

export const ACTIVE_FAMILY_COOKIE_NAME = "havi_active_family_id";

type FamilyMembership = {
  family_id: string;
  is_primary?: boolean | null;
  created_at?: string | null;
};

type FamilyResolution =
  | { status: "unauthenticated" }
  | { status: "multiple" }
  | { status: "single"; familyId: string }
  | { status: "created"; familyId: string };

const buildFamilyName = (user: { user_metadata?: Record<string, unknown> }): string => {
  const name = user.user_metadata?.full_name;
  if (typeof name === "string" && name.trim().length > 0) {
    const first = name.trim().split(" ")[0];
    return `${first}'s Family`;
  }
  return "My Family";
};

export const persistActiveFamilyId = (familyId: string): void => {
  if (typeof window === "undefined") return;
  void fetch("/api/active-family", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ familyId }),
  });
};

export const resolveFamilyForCurrentUser = async (): Promise<FamilyResolution> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user ?? null;
  if (userError || !user) {
    return { status: "unauthenticated" };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("family_members")
    .select("family_id,is_primary,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (membershipError) {
    throw membershipError;
  }

  if (!memberships || memberships.length === 0) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      throw new Error("Unable to create family without a session.");
    }

    const response = await apiFetch(`${API_BASE_URL}/api/v1/families`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: buildFamilyName(user) }),
    });

    if (!response.ok) {
      throw new Error("Unable to create family");
    }

    const payload = (await response.json().catch(() => null)) as
      | { id?: string }
      | null;
    if (!payload?.id) {
      throw new Error("Unable to create family");
    }

    return { status: "created", familyId: payload.id };
  }

  if (memberships.length === 1) {
    return { status: "single", familyId: memberships[0].family_id };
  }

  return { status: "multiple" };
};
