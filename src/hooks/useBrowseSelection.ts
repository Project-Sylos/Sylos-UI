import { useCallback, useRef, useState } from "react";

/** Delay plain folder select so a double-click can navigate first (root browse). */
export const FOLDER_SELECT_BOUNCE_MS = 150;

/** Path Review dual/merged tree: slightly longer so navigate-vs-inspector is clearer. */
export const PATH_REVIEW_FOLDER_SELECT_BOUNCE_MS = 250;

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

export type FolderSelectBounceTimer = { current: number | null };

export function isMultiSelectModifier(modifiers: BrowseSelectModifiers): boolean {
  return modifiers.ctrlKey || modifiers.metaKey;
}

export function clearFolderSelectBounce(timerRef: FolderSelectBounceTimer): void {
  if (timerRef.current != null) {
    globalThis.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

/**
 * Run select immediately, or after bounceMs for a plain folder click so a
 * double-click can navigate first (second click cancels the timer).
 * Default delay is root-browse FOLDER_SELECT_BOUNCE_MS.
 */
export function runWithFolderSelectBounce(
  timerRef: FolderSelectBounceTimer,
  itemType: "file" | "folder",
  event: BrowseSelectModifiers & { detail: number },
  runSelect: () => void,
  bounceMs: number = FOLDER_SELECT_BOUNCE_MS
): void {
  const isPlainFolderClick =
    itemType === "folder" &&
    !event.shiftKey &&
    !isMultiSelectModifier(event);
  if (isPlainFolderClick && event.detail > 1) {
    clearFolderSelectBounce(timerRef);
    return;
  }
  if (isPlainFolderClick) {
    clearFolderSelectBounce(timerRef);
    timerRef.current = globalThis.setTimeout(() => {
      timerRef.current = null;
      runSelect();
    }, bounceMs) as unknown as number;
    return;
  }
  clearFolderSelectBounce(timerRef);
  runSelect();
}

function nextSelection(
  prev: Map<string, BrowseSelectableItem>,
  lastIndex: number | null,
  item: BrowseSelectableItem,
  index: number,
  modifiers: BrowseSelectModifiers,
  visibleItems: BrowseSelectableItem[]
): Map<string, BrowseSelectableItem> {
  const multi = isMultiSelectModifier(modifiers);
  const range = modifiers.shiftKey;

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

  // Plain click: exclusive select, or deselect when this is already the only
  // selection. Ctrl/Cmd still toggles; Shift still ranges. Callers delay plain
  // folder clicks (FOLDER_SELECT_BOUNCE_MS) so a double-click can navigate.
  if (prev.has(item.id)) {
    if (prev.size === 1) {
      return new Map();
    }
    const next = new Map(prev);
    next.delete(item.id);
    return next;
  }

  return new Map([[item.id, item]]);
}

export function useBrowseSelection() {
  const [selected, setSelected] = useState<Map<string, BrowseSelectableItem>>(new Map());
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const selectedRef = useRef(selected);
  const lastIndexRef = useRef(lastIndex);
  selectedRef.current = selected;
  lastIndexRef.current = lastIndex;

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const select = useCallback(
    (
      item: BrowseSelectableItem,
      index: number,
      modifiers: BrowseSelectModifiers,
      visibleItems: BrowseSelectableItem[]
    ): {
      prev: Map<string, BrowseSelectableItem>;
      next: Map<string, BrowseSelectableItem>;
      multi: boolean;
    } => {
      const prev = selectedRef.current;
      const next = nextSelection(
        prev,
        lastIndexRef.current,
        item,
        index,
        modifiers,
        visibleItems
      );
      selectedRef.current = next;
      lastIndexRef.current = index;
      setSelected(next);
      setLastIndex(index);
      return {
        prev,
        next,
        multi: isMultiSelectModifier(modifiers),
      };
    },
    []
  );

  const clear = useCallback(() => {
    selectedRef.current = new Map();
    lastIndexRef.current = null;
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
