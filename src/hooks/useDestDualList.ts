import { useCallback, useEffect, useRef, useState } from "react";

import type { Folder } from "../types/services";
import {
  mergeRelativeListings,
  type DestDualRow,
} from "../utils/destDualList";

export type SourceChildrenLister = (
  folderId: string,
  opts?: { foldersOnly?: boolean }
) => Promise<{ folders: Folder[]; files: Folder[] }>;

type UseDestDualListArgs = {
  enabled: boolean;
  /** List children on the source endpoint at a folder id. */
  listSourceChildren: SourceChildrenLister | null;
  sourceRootId: string | undefined;
  destFolderId: string | null;
  destFolders: Folder[];
  destFiles: Folder[];
  relativeSegments: string[];
};

/**
 * Lazy dual-list: given dest listing + relative path under aligned roots,
 * fetch the matching source folder listing and merge by basename.
 */
export function useDestDualList({
  enabled,
  listSourceChildren,
  sourceRootId,
  destFolderId,
  destFolders,
  destFiles,
  relativeSegments,
}: UseDestDualListArgs): {
  rows: DestDualRow[];
  sourceParentId: string | null;
  loading: boolean;
  error: string | null;
} {
  const [sourceItems, setSourceItems] = useState<Folder[]>([]);
  const [sourceParentId, setSourceParentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchGen = useRef(0);

  const resolveAndFetch = useCallback(async () => {
    if (!enabled || !listSourceChildren || !sourceRootId || !destFolderId) {
      setSourceItems([]);
      setSourceParentId(null);
      setError(null);
      return;
    }

    const gen = ++fetchGen.current;
    setLoading(true);
    setError(null);

    try {
      let parentId = sourceRootId;
      for (const segment of relativeSegments) {
        const page = await listSourceChildren(parentId, { foldersOnly: true });
        if (gen !== fetchGen.current) return;
        const kids = [...(page.folders || []), ...(page.files || [])];
        const match = kids.find(
          (k) =>
            (k.name || "").toLowerCase() === segment.toLowerCase() &&
            k.type !== "file"
        );
        if (!match) {
          setSourceItems([]);
          setSourceParentId(null);
          setError(null);
          setLoading(false);
          return;
        }
        parentId = match.ServiceID || match.Id;
      }

      const listing = await listSourceChildren(parentId);
      if (gen !== fetchGen.current) return;
      setSourceParentId(parentId);
      setSourceItems([...(listing.folders || []), ...(listing.files || [])]);
    } catch (err) {
      if (gen !== fetchGen.current) return;
      setSourceItems([]);
      setSourceParentId(null);
      setError(
        err instanceof Error ? err.message : "Failed to list source counterpart."
      );
    } finally {
      if (gen === fetchGen.current) setLoading(false);
    }
  }, [
    enabled,
    listSourceChildren,
    sourceRootId,
    destFolderId,
    relativeSegments,
  ]);

  useEffect(() => {
    void resolveAndFetch();
  }, [resolveAndFetch, destFolders, destFiles]);

  const rows =
    enabled && destFolderId
      ? mergeRelativeListings(sourceItems, [...destFolders, ...destFiles])
      : [];

  return { rows, sourceParentId, loading, error };
}
