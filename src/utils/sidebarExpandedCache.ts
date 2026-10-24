const keyFor = (userId: string) => `sylos.sidebar.expandedIds.${userId}`;

export function readSidebarExpandedIds(userId: string | null | undefined): Set<string> {
  if (!userId || typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0));
  } catch {
    return new Set();
  }
}

export function writeSidebarExpandedIds(
  userId: string | null | undefined,
  ids: ReadonlySet<string>
): void {
  if (!userId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify([...ids]));
  } catch {
    // Quota / private mode: ignore.
  }
}
