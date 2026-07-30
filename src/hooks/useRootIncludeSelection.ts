import { useCallback, useMemo, useState } from "react";
import { Folder } from "../types/services";
import { MigrationRootChild } from "../types/migrations";

/** Include-mode selection for root children (checked = migrate). */
export function useRootIncludeSelection() {
  const [active, setActive] = useState(false);
  /** id -> included */
  const [includedById, setIncludedById] = useState<Record<string, boolean>>({});
  const [items, setItems] = useState<Folder[]>([]);

  const begin = useCallback((children: Folder[]) => {
    const next: Record<string, boolean> = {};
    for (const child of children) {
      const id = child.ServiceID || child.Id;
      if (id) next[id] = true;
    }
    setItems(children);
    setIncludedById(next);
    setActive(true);
  }, []);

  const cancel = useCallback(() => {
    setActive(false);
    setIncludedById({});
    setItems([]);
  }, []);

  const toggle = useCallback((id: string) => {
    setIncludedById((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const setAll = useCallback(
    (included: boolean) => {
      setIncludedById((prev) => {
        const next: Record<string, boolean> = {};
        for (const id of Object.keys(prev)) {
          next[id] = included;
        }
        return next;
      });
    },
    []
  );

  const includedCount = useMemo(
    () => Object.values(includedById).filter(Boolean).length,
    [includedById]
  );

  const isIncluded = useCallback(
    (id: string) => includedById[id] !== false,
    [includedById]
  );

  const toChildrenPayload = useCallback(
    (opts?: {
      role?: "source" | "destination";
      sourceChildNames?: string[];
    }): MigrationRootChild[] => {
      const role = opts?.role ?? "source";
      const sourceNames = new Set(
        (opts?.sourceChildNames ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean)
      );
      return items.map((item) => {
        const id = item.ServiceID || item.Id;
        const name = item.name?.trim() || "Untitled";
        const type = item.type === "file" ? "file" : "folder";
        const included = includedById[id] !== false;
        const dstOnly =
          role === "destination" &&
          sourceNames.size > 0 &&
          !sourceNames.has(name.toLowerCase());
        return {
          id,
          name,
          type,
          size: item.size,
          mtime: item.lastUpdated,
          excluded: role === "source" ? !included : false,
          dstOnly,
        };
      });
    },
    [items, includedById]
  );

  return {
    active,
    items,
    includedCount,
    begin,
    cancel,
    toggle,
    setAll,
    isIncluded,
    toChildrenPayload,
  };
}
