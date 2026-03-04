import { upsertById } from "@/lib/tasks/task-state";

type TestItem = {
  id: string;
  value: string;
};

describe("upsertById", () => {
  it("replaces existing records when ids match", () => {
    const base: TestItem[] = [
      { id: "1", value: "old" },
      { id: "2", value: "keep" },
    ];
    const incoming: TestItem[] = [{ id: "1", value: "new" }];

    const result = upsertById(incoming, base);

    expect(result).toEqual([
      { id: "1", value: "new" },
      { id: "2", value: "keep" },
    ]);
  });

  it("adds new records when ids do not exist", () => {
    const base: TestItem[] = [{ id: "1", value: "a" }];
    const incoming: TestItem[] = [{ id: "2", value: "b" }];

    const result = upsertById(incoming, base);

    expect(result).toEqual([
      { id: "1", value: "a" },
      { id: "2", value: "b" },
    ]);
  });
});
