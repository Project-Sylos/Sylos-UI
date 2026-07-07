import { useCallback, useState } from "react";

export type BrowseSelectableItem = {
  id: string;
  type: "file" | "folder";
  name: string;
};

export type BrowseSelectModifiers = {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

export function isMultiSelectModifier(modifiers: BrowseSelectModifiers): boolean {
  return modifiers.ctrlKey || modifiers.metaKey;
}

export function useBrowseSelection() {
  const [selected, setSelected] = useState<Map<string, BrowseSelectableItem>>(new Map());
  const [lastIndex, setLastIndex] = useState<number | null>(null);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const select = useCallback(
    (
      item: BrowseSelectableItem,
      index: number,
      modifiers: BrowseSelectModifiers,
      visibleItems: BrowseSelectableItem[]
    ) => {
      const multi = isMultiSelectModifier(modifiers);
      const range = modifiers.shiftKey;

      setSelected((prev) => {
        if (range && lastIndex != null) {
          const next = multi ? new Map(prev) : new Map<string, BrowseSelectableItem>();
          const start = Math.min(lastIndex, index);
          const end = Math.max(lastIndex, index);
          for (let i = start; i <= end; i++) {
            const entry = visibleItems[i];
            if (entry) {
              next.set(entry.id, entry);
            }
          }
          return next;
        }

        if (multi) {
          const next = new Map(prev);
          if (next.has(item.id)) {
            next.delete(item.id);
          } else {
            next.set(item.id, item);
          }
          return next;
        }

        return new Map([[item.id, item]]);
      });
      setLastIndex(index);
    },
    [lastIndex]
  );

  const clear = useCallback(() => {
    setSelected(new Map());
    setLastIndex(null);
  }, []);

  const selectedItems = Array.from(selected.values());

  return {
    selected,
    selectedCount: selected.size,
    selectedItems,
    isSelected,
    select,
    clear,
  };
}

export function buildDeleteConfirmMessage(items: BrowseSelectableItem[]): {
  title: string;
  message: string;
} {
  if (items.length === 0) {
    return { title: "Delete items", message: "No items selected." };
  }

  if (items.length === 1) {
    const item = items[0];
    const kind = item.type === "folder" ? "folder" : "file";
    return {
      title: "Delete item",
      message: `Are you sure you want to delete the ${kind} "${item.name}"?`,
    };
  }

  const folderCount = items.filter((item) => item.type === "folder").length;
  const fileCount = items.filter((item) => item.type === "file").length;

  let detail: string;
  if (folderCount > 0 && fileCount === 0) {
    detail = folderCount === 1 ? "1 folder" : `${folderCount} folders`;
  } else if (fileCount > 0 && folderCount === 0) {
    detail = fileCount === 1 ? "1 file" : `${fileCount} files`;
  } else {
    detail = `${folderCount} folder${folderCount === 1 ? "" : "s"}, ${fileCount} file${fileCount === 1 ? "" : "s"}`;
  }

  return {
    title: "Delete items",
    message: `Are you sure you want to delete ${items.length} items (${detail})?`,
  };
}

export function formatDeleteErrors(
  errors: { id: string; message: string }[]
): string {
  if (errors.length === 0) {
    return "";
  }
  return errors.map((entry) => `${entry.id}: ${entry.message}`).join("\n");
}
