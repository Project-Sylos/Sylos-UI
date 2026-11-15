import type { Folder } from "../types/services";

/** Collect ids/paths that can identify the migration's previous root in browse lists. */
export function previousRootMatchIds(
  root: Folder | null | undefined
): Set<string> {
  const ids = new Set<string>();
  if (!root) return ids;
  for (const value of [
    root.ServiceID,
    root.Id,
    root.parentId,
    root.parentPath,
    root.locationPath,
  ]) {
    const trimmed = (value || "").trim();
    if (trimmed) ids.add(trimmed);
  }
  return ids;
}

export function matchesPreviousRoot(
  candidate: string | undefined | null,
  matchIds: Set<string>
): boolean {
  const id = (candidate || "").trim();
  return Boolean(id) && matchIds.has(id);
}

export type OriginalRootField = {
  label: string;
  value: string;
};

/** Breakdown fields for the original-root card (skips empty). */
export function originalRootFields(
  root: Folder | null | undefined
): OriginalRootField[] {
  if (!root) return [];
  const fields: OriginalRootField[] = [];
  const push = (label: string, value: string | undefined) => {
    const trimmed = (value || "").trim();
    if (trimmed) fields.push({ label, value: trimmed });
  };
  push("Name", root.name);
  push("Path", root.locationPath);
  push("Folder ID", root.ServiceID || root.Id);
  push("Drive / parent ID", root.parentId);
  push("Parent path", root.parentPath);
  push("Type", root.type);
  return fields;
}
