import { decideFamilyGuard } from "@/lib/guards/family-guard";

describe("decideFamilyGuard", () => {
  it("redirects unauthenticated users to /auth/sign-in", () => {
    const decision = decideFamilyGuard({
      isAuthenticated: false,
      memberships: [],
      activeFamilyId: null,
      childCount: null,
    });

    expect(decision).toEqual({ type: "redirect", to: "/auth/sign-in" });
  });

  it("redirects users with no families to /app/onboarding/family", () => {
    const decision = decideFamilyGuard({
      isAuthenticated: true,
      memberships: [],
      activeFamilyId: null,
      childCount: null,
    });

    expect(decision).toEqual({ type: "redirect", to: "/app/onboarding/family" });
  });

  it("auto-selects when there is exactly one family and no cookie", () => {
    const decision = decideFamilyGuard({
      isAuthenticated: true,
      memberships: ["family-1"],
      activeFamilyId: null,
      childCount: null,
    });

    expect(decision).toEqual({ type: "autoSelect", familyId: "family-1" });
  });

  it("redirects to /app/select-family when there are multiple families and no cookie", () => {
    const decision = decideFamilyGuard({
      isAuthenticated: true,
      memberships: ["family-1", "family-2"],
      activeFamilyId: null,
      childCount: null,
    });

    expect(decision).toEqual({ type: "redirect", to: "/app/select-family" });
  });

  it("clears invalid cookie and redirects to /app/select-family", () => {
    const decision = decideFamilyGuard({
      isAuthenticated: true,
      memberships: ["family-1"],
      activeFamilyId: "family-2",
      childCount: null,
    });

    expect(decision).toEqual({ type: "clearCookie", to: "/app/select-family" });
  });

  it("redirects to /app/onboarding/child when active family has no children", () => {
    const decision = decideFamilyGuard({
      isAuthenticated: true,
      memberships: ["family-1"],
      activeFamilyId: "family-1",
      childCount: 0,
    });

    expect(decision).toEqual({ type: "redirect", to: "/app/onboarding/child" });
  });

  it("allows access when active family has at least one child", () => {
    const decision = decideFamilyGuard({
      isAuthenticated: true,
      memberships: ["family-1"],
      activeFamilyId: "family-1",
      childCount: 2,
    });

    expect(decision).toEqual({ type: "allow" });
  });
});
