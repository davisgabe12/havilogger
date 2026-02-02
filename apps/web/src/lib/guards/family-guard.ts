export type FamilyGuardDecision =
  | { type: "allow" }
  | { type: "redirect"; to: string }
  | { type: "autoSelect"; familyId: string }
  | { type: "clearCookie"; to: string }
  | { type: "needsChildCheck"; familyId: string };

export type FamilyGuardInput = {
  isAuthenticated: boolean;
  memberships: string[];
  activeFamilyId: string | null;
  childCount: number | null;
};

export const decideFamilyGuard = ({
  isAuthenticated,
  memberships,
  activeFamilyId,
  childCount,
}: FamilyGuardInput): FamilyGuardDecision => {
  if (!isAuthenticated) {
    return { type: "redirect", to: "/auth/sign-in" };
  }

  if (memberships.length === 0) {
    return { type: "redirect", to: "/app/onboarding/family" };
  }

  if (activeFamilyId && !memberships.includes(activeFamilyId)) {
    return {
      type: "clearCookie",
      to:
        memberships.length === 0
          ? "/app/onboarding/family"
          : "/app/select-family",
    };
  }

  if (!activeFamilyId) {
    if (memberships.length === 1) {
      return { type: "autoSelect", familyId: memberships[0] };
    }
    return { type: "redirect", to: "/app/select-family" };
  }

  if (childCount == null) {
    return { type: "needsChildCheck", familyId: activeFamilyId };
  }

  if (childCount === 0) {
    return { type: "redirect", to: "/app/onboarding/child" };
  }

  return { type: "allow" };
};
