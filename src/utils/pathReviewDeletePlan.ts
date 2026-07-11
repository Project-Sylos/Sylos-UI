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

/** Apply delete_status to one item, or a folder and any visible descendants in the list. */
export function applyDeleteStatusInItems(
  items: DiffItem[],
  anchor: DiffItem,
  deleteStatus: "pending" | "skipped"
): DiffItem[] {
  const propagate = anchor.type === "folder";
  return items.map((item) => {
    if (!item.src) return item;
    if (!propagate) {
      if (item.id !== anchor.id) return item;
    } else if (!isPathUnderAncestor(item.locationPath, anchor.locationPath)) {
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
