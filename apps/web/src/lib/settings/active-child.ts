export type ChildWithOptionalId = {
  id?: string | number | null;
};

export const normalizeChildId = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

export const selectActiveChild = <T extends ChildWithOptionalId>(
  children: T[],
  preferredId?: string | null,
  explicitId?: string | null,
): T | null => {
  const findById = (candidateId?: string | null): T | null => {
    const normalizedCandidate = normalizeChildId(candidateId);
    if (!normalizedCandidate) return null;
    return (
      children.find(
        (child) => normalizeChildId(child.id) === normalizedCandidate,
      ) ?? null
    );
  };

  return findById(preferredId) ?? findById(explicitId) ?? children[0] ?? null;
};
