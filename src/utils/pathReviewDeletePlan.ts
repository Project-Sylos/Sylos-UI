import type { DiffItem } from "../api/services";
import { skipNodeDelete, unskipNodeDelete } from "../api/services";

/** True when delete_status means scheduled for source removal (explicit or inherited). */
export function isDeleteExcludePending(deleteStatus: string | undefined): boolean {
  const status = deleteStatus || "";
  return status === "" || status === "pending_explicit" || status === "pending_inherited";
}

/** True when this row is a delete-forest root the user can toggle (not covered by an ancestor). */
export function isDeletePendingExplicit(deleteStatus: string | undefined): boolean {
  const status = deleteStatus || "";
  return status === "" || status === "pending_explicit";
}

/** Covered by an ancestor recursive delete; shown as pending but not primary-toggleable. */
export function isDeletePendingInherited(deleteStatus: string | undefined): boolean {
  return (deleteStatus || "") === "pending_inherited";
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

/**
 * Apply delete_status optimistically: folders set explicit on the anchor and inherited on
 * descendants; skips also mark ancestors skipped (engine promotes sibling forests).
 */
export function applyDeleteStatusInItems(
  items: DiffItem[],
  anchor: DiffItem,
  deleteStatus: "pending_explicit" | "pending_inherited" | "skipped"
): DiffItem[] {
  const scheduleRemoval = deleteStatus !== "skipped";
  const propagateDown = anchor.type === "folder";
  const propagateUp = deleteStatus === "skipped";
  return items.map((item) => {
    if (!item.src) return item;
    const isSelf = item.id === anchor.id;
    const isDescendant =
      propagateDown && isPathUnderAncestor(item.locationPath, anchor.locationPath) && !isSelf;
    const isAncestor =
      propagateUp && isStrictAncestorPath(anchor.locationPath, item.locationPath);
    if (!isSelf && !isDescendant && !isAncestor) {
      return item;
    }
    let next: string = deleteStatus;
    if (scheduleRemoval) {
      if (isSelf) {
        next = "pending_explicit";
      } else if (isDescendant) {
        next = "pending_inherited";
      }
    }
    return {
      ...item,
      src: { ...item.src, deleteStatus: next },
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
