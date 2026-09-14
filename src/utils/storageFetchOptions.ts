/** Cloud browse root types that own a real quota / drive namespace. */
const KNOWN_CLOUD_ROOT_TYPES = new Set([
  "my_drive",
  "shared_with_me",
  "shared_drive",
  "user_root",
  "team_space",
  "team_folder",
  "shared_folder",
  "sharepoint_site",
  "sharepoint_drive",
]);

export type StorageFetchRoot = {
  locationPath?: string;
  nativePath?: string;
  type?: string;
  /** Graph / cloud namespace id (Folder.parentId on browse roots). */
  parentId?: string;
  connectionId?: string;
};

/**
 * Query options for getStorageInfo. Matches browse/summary: only pass known cloud
 * rootType values (never NodeType "folder"), and pass parentId as driveId when set.
 */
export function storageFetchOptions(
  role: "source" | "destination",
  root: StorageFetchRoot | null | undefined,
  connectionIdFallback?: string
): {
  path?: string;
  connectionId?: string;
  role: string;
  rootType?: string;
  driveId?: string;
} {
  const path = root?.nativePath || root?.locationPath || "";
  const type = root?.type?.trim() || "";
  const knownRootType = KNOWN_CLOUD_ROOT_TYPES.has(type);
  const connectionId = root?.connectionId || connectionIdFallback;
  return {
    path: path || undefined,
    connectionId: connectionId || undefined,
    role,
    ...(knownRootType
      ? {
          rootType: type,
          ...(root?.parentId ? { driveId: root.parentId } : {}),
        }
      : {}),
  };
}
