import { extractChildrenFromSettings } from "@/lib/settings/settings-payload";

type TestChild = {
  id?: string | number | null;
  first_name?: string;
};

describe("extractChildrenFromSettings", () => {
  it("uses children array when present", () => {
    const payload = {
      children: [
        { id: "1", first_name: "Noah" },
        { id: "2", first_name: "Lev" },
      ] as TestChild[],
      child: { id: "2", first_name: "Lev" } as TestChild,
    };
    const result = extractChildrenFromSettings(payload);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("1");
  });

  it("falls back to single child when children array is absent", () => {
    const payload = {
      child: { id: "3", first_name: "June" } as TestChild,
    };
    const result = extractChildrenFromSettings(payload);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("3");
  });

  it("returns empty when payload is nullish or missing child data", () => {
    expect(extractChildrenFromSettings<TestChild>(null)).toEqual([]);
    expect(extractChildrenFromSettings<TestChild>(undefined)).toEqual([]);
    expect(extractChildrenFromSettings<TestChild>({})).toEqual([]);
  });
});
