type WithId = {
  id: string;
};

export const upsertById = <T extends WithId>(incoming: T[], base: T[]): T[] => {
  const byId = new Map<string, T>();
  for (const item of base) {
    byId.set(item.id, item);
  }
  for (const item of incoming) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
};
