import { normalizeChildId, selectActiveChild } from "@/lib/settings/active-child";

type TestChild = {
  id?: string | number | null;
  first_name?: string;
};

describe("active-child helpers", () => {
  it("normalizes ids from string and number values", () => {
    expect(normalizeChildId(" abc ")).toBe("abc");
    expect(normalizeChildId(42)).toBe("42");
    expect(normalizeChildId("")).toBeNull();
    expect(normalizeChildId(null)).toBeNull();
  });

  it("prefers stored id over explicit id", () => {
    const children: TestChild[] = [
      { id: "1", first_name: "Noah" },
      { id: "2", first_name: "Lev" },
    ];
    const selected = selectActiveChild(children, "2", "1");
    expect(selected?.id).toBe("2");
  });

  it("supports mixed id types when selecting active child", () => {
    const children: TestChild[] = [
      { id: 1, first_name: "Noah" },
      { id: 2, first_name: "Lev" },
    ];
    const selected = selectActiveChild(children, "2", null);
    expect(selected?.first_name).toBe("Lev");
  });

  it("falls back to first child when no ids match", () => {
    const children: TestChild[] = [
      { id: "1", first_name: "Noah" },
      { id: "2", first_name: "Lev" },
    ];
    const selected = selectActiveChild(children, "99", null);
    expect(selected?.id).toBe("1");
  });

  it("returns null when there are no children", () => {
    expect(selectActiveChild([], null, null)).toBeNull();
  });
});
