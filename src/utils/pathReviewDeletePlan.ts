import type { DiffItem } from "../api/services";
import { skipNodeDelete, unskipNodeDelete } from "../api/services";

export function isDeleteExcludePending(deleteStatus: string | undefined): boolean {
  const status = deleteStatus || "";
  return status === "pending" || status === "";
}

export function isPathUnderAncestor(itemPath: string, ancestorPath: string): boolean {
  if (itemPath === ancestorPath) return true;
  if (ancestorPath === "/") return itemPath.startsWith("/");
  return itemPath.startsWith(`${ancestorPath}/`);
}

/** True when ancestorPath is a strict parent of childPath. */
export function isStrictAncestorPath(childPath: string, ancestorPath: string): boolean {
  if (!childPath || !ancestorPath || ancestorPath === "/" || childPath === ancestorPath) {
    return false;
  }
  return childPath.startsWith(`${ancestorPath}/`);
}

/** Apply delete_status to one item: folders also update descendants; skips also update ancestors. */
export function applyDeleteStatusInItems(
  items: DiffItem[],
  anchor: DiffItem,
  deleteStatus: "pending" | "skipped"
): DiffItem[] {
  const propagateDown = anchor.type === "folder";
  const propagateUp = deleteStatus === "skipped";
  return items.map((item) => {
    if (!item.src) return item;
    const isSelf = item.id === anchor.id;
    const isDescendant =
      propagateDown && isPathUnderAncestor(item.locationPath, anchor.locationPath);
    const isAncestor =
      propagateUp && isStrictAncestorPath(anchor.locationPath, item.locationPath);
    if (!isSelf && !isDescendant && !isAncestor) {
      return item;
    }
    return {
      ...item,
      src: { ...item.src, deleteStatus },
    };
  });
}

export async function toggleDeleteExclude(
  migrationId: string,
  item: DiffItem
): Promise<{
  success: boolean;
  error?: string;
  deltas?: Record<string, number>;
  isExcluding: boolean;
}> {
  const srcId = item.src?.id;
  if (!srcId) {
    return { success: false, error: "No source node available for this item.", isExcluding: false };
  }
  const isExcluding = isDeleteExcludePending(item.src?.deleteStatus);
  const result = isExcluding
    ? await skipNodeDelete(migrationId, srcId)
    : await unskipNodeDelete(migrationId, srcId);
  return { ...result, isExcluding };
}
