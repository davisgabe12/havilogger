import { supabase } from "@/lib/supabase/client";

export const ACTIVE_FAMILY_STORAGE_KEY = "havi_active_family_id";

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
  window.localStorage.setItem(ACTIVE_FAMILY_STORAGE_KEY, familyId);
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
    const { data: family, error: familyError } = await supabase
      .from("families")
      .insert({ name: buildFamilyName(user) })
      .select("id")
      .single();

    if (familyError || !family) {
      throw familyError ?? new Error("Unable to create family");
    }

    const { error: memberError } = await supabase.from("family_members").insert({
      family_id: family.id,
      user_id: user.id,
      role: "owner",
      is_primary: true,
    });

    if (memberError) {
      throw memberError;
    }

    return { status: "created", familyId: family.id };
  }

  if (memberships.length === 1) {
    return { status: "single", familyId: memberships[0].family_id };
  }

  return { status: "multiple" };
};
