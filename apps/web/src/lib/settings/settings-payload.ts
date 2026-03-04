type SettingsChildLike = {
  id?: string | number | null;
};

type SettingsPayloadLike<T extends SettingsChildLike> = {
  child?: T | null;
  children?: T[] | null;
} | null | undefined;

export const extractChildrenFromSettings = <T extends SettingsChildLike>(
  data: SettingsPayloadLike<T>,
): T[] => {
  if (!data) return [];
  if (Array.isArray(data.children)) {
    return data.children;
  }
  if (data.child) {
    return [data.child];
  }
  return [];
};
