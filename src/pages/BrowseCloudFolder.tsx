import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ChevronRight,
  Cloud,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  FolderPlus,
  Trash2,
} from "lucide-react";

import "../App.css";
import {
  listCloudChildren,
  listCloudRoots,
  createCloudBrowseFolder,
  deleteCloudBrowseNodes,
} from "../api/providers";
import {
  getStorageInfo,
  listChildren,
  setMigrationRoot,
  StorageInfo,
  getMigrationStatus,
} from "../api/services";
import { parentCascadeReasons } from "../utils/browseFilterPreview";
import {
  ROOT_INCLUDE_PARENT,
  destinationRootChildrenPayload,
  includedSourceChildNames,
  useRootIncludeSelection,
} from "../hooks/useRootIncludeSelection";
import { MigrationRootChild } from "../types/migrations";
import { PageShell } from "../components/PageShell";
import PageBackButton from "../components/PageBackButton";
import BrowseDensityControl from "../components/BrowseDensityControl";
import BrowseFolderItemRow from "../components/BrowseFolderItemRow";
import BrowseSortControl from "../components/BrowseSortControl";
import BrowseIncludeControl, {
  BrowseParentExclusionBanner,
} from "../components/browse/BrowseIncludeControl";
import DestDualListRows from "../components/browse/DestDualListRows";
import ConfirmDialog from "../components/ConfirmDialog";
import NewFolderModal from "../components/NewFolderModal";
import BrowseContextMenu from "../components/BrowseContextMenu";
import FileBrowserPane, { BROWSE_SELECTION_HELP } from "../components/FileBrowserPane";
import OriginalRootCard, {
  PreviousRootBadge,
} from "../components/OriginalRootCard";
import StorageMeter from "../components/StorageMeter";
import { BrowseDensityProvider, useBrowseDensity } from "../contexts/BrowseDensityContext";
import { useSelection } from "../context/SelectionContext";
import { useAltTextSelect } from "../hooks/useAltTextSelect";
import { useCloudConnectionGuard } from "../hooks/useCloudConnectionGuard";
import { useDestDualList } from "../hooks/useDestDualList";
import type { DestDualRow } from "../utils/destDualList";
import {
  buildDeleteConfirmMessage,
  BrowseSelectableItem,
  FOLDER_SELECT_BOUNCE_MS,
  formatDeleteErrors,
  isMultiSelectModifier,
  useBrowseSelection,
} from "../hooks/useBrowseSelection";
import { CloudRoot } from "../types/providers";
import { Folder, PaginationInfo } from "../types/services";
import {
  DEFAULT_BROWSE_SORT,
  BrowseSortState,
  sortBrowseFoldersAndFiles,
} from "../utils/browseSort";
import { buildCloudConnectPath } from "../utils/cloudConnections";
import {
  clearAccountFields,
  clearEndpointCloudState,
} from "../utils/cloudAccountLabel";
import {
  matchesPreviousRoot,
  previousRootMatchIds,
} from "../utils/previousRoot";
import { isCloudServiceType } from "../utils/cloudProviders";
import { folderToApiRoot, getBrowseTrailFromFolder } from "../utils/migrationRoots";
import "./BrowseFolder.css";

interface BreadcrumbItem {
  path: string;
  name: string;
  /** Namespace/drive override after entering a Dropbox shared/team folder. */
  driveId?: string;
}

function effectiveDriveId(root: CloudRoot, trail: BreadcrumbItem[]): string | undefined {
  for (let i = trail.length - 1; i >= 0; i -= 1) {
    if (trail[i].driveId) {
      return trail[i].driveId;
    }
  }
  return root.driveId;
}

/** Pass rootType only when opening a virtual root; always keep driveId for namespaced roots. */
function rootListOptions(
  identifier: string,
  root: CloudRoot,
  trail: BreadcrumbItem[] = []
) {
  const atRoot = identifier === root.id;
  const namespaced =
    root.rootType === "shared_drive" ||
    root.rootType === "shared_with_me" ||
    root.rootType === "team_space" ||
    root.rootType === "team_folder" ||
    root.rootType === "shared_folder" ||
    root.rootType === "user_root" ||
    root.rootType === "sharepoint_site" ||
    root.rootType === "sharepoint_drive" ||
    root.rootType === "my_drive";

  if (!atRoot && !namespaced) {
    return {};
  }

  const driveId = effectiveDriveId(root, trail);

  return {
    // Nested listings omit rootType so the API does not re-map child ids as virtual roots.
    ...(atRoot && root.rootType ? { rootType: root.rootType } : {}),
    ...(driveId ? { driveId } : {}),
  };
}

function rootTypeLabel(rootType: string): string {
  switch (rootType) {
    case "my_drive":
      return "My Drive";
    case "shared_with_me":
      return "Shared with me";
    case "shared_drive":
      return "Shared drive";
    case "user_root":
      return "My Dropbox";
    case "team_space":
      return "Team space";
    case "team_folder":
      return "Team folder";
    case "shared_folder":
      return "Shared folder";
    case "sharepoint_site":
      return "SharePoint site";
    case "sharepoint_drive":
      return "Document library";
    default:
      return rootType.replace(/_/g, " ");
  }
}

/** Browse roots that typically live outside personal storage (confirm as destination). */
function isExternallyOwnedBrowseRoot(rootType: string | undefined): boolean {
  switch (rootType) {
    case "shared_with_me":
    case "shared_folder":
    case "shared_drive":
    case "team_folder":
      return true;
    default:
      return false;
  }
}

/** Mirrors Sylos-FS cloud.ReportsOwnedStorageQuota: skip meters for virtual/non-owned listings. */
function reportsOwnedStorageQuota(rootType: string | undefined): boolean {
  switch (rootType) {
    case "shared_with_me":
    case "sharepoint_site":
    case "team_space":
      return false;
    default:
      return true;
  }
}

function isNamespacedCloudRoot(root: CloudRoot): boolean {
  return (
    root.rootType === "shared_drive" ||
    root.rootType === "shared_with_me" ||
    root.rootType === "team_space" ||
    root.rootType === "team_folder" ||
    root.rootType === "shared_folder" ||
    root.rootType === "sharepoint_site" ||
    root.rootType === "sharepoint_drive" ||
    root.rootType === "my_drive" ||
    root.rootType === "user_root"
  );
}

function folderFromCloudRoot(root: CloudRoot): Folder {
  const namespaced = isNamespacedCloudRoot(root);
  const isSharedDrive = root.rootType === "shared_drive";
  const isSharedWithMe = root.rootType === "shared_with_me";

  return {
    ServiceID: root.id,
    Id: root.id,
    name: root.displayName,
    locationPath: "/",
    parentId: namespaced && !root.driveId ? undefined : root.driveId ?? "root",
    parentPath: namespaced && !root.driveId ? undefined : "/",
    type: isSharedDrive
      ? "shared_drive"
      : isSharedWithMe
        ? "shared_with_me"
        : root.rootType === "team_folder"
          ? "team_folder"
          : root.rootType === "shared_folder"
            ? "shared_folder"
            : root.rootType === "team_space"
              ? "team_space"
              : root.rootType === "sharepoint_site"
                ? "sharepoint_site"
                : root.rootType === "sharepoint_drive"
                  ? "sharepoint_drive"
                  : root.rootType === "my_drive"
                    ? "my_drive"
                    : root.rootType === "user_root"
                      ? "user_root"
                      : "folder",
    browseTrail: [{ path: root.id, name: root.displayName }],
  };
}

function folderFromBreadcrumbs(
  activeRoot: CloudRoot,
  breadcrumbs: BreadcrumbItem[],
  currentIdentifier: string
): Folder {
  if (breadcrumbs.length <= 1) {
    return folderFromCloudRoot(activeRoot);
  }

  const currentName = breadcrumbs[breadcrumbs.length - 1].name;
  const childNames = breadcrumbs.slice(1).map((item) => item.name);

  // For Dropbox/GDrive namespaced roots, parentId carries Path-Root / drive namespace
  // metadata (not the browse parent folder id).
  const parentId =
    isNamespacedCloudRoot(activeRoot) && effectiveDriveId(activeRoot, breadcrumbs)
      ? effectiveDriveId(activeRoot, breadcrumbs)
      : breadcrumbs[breadcrumbs.length - 2].path;

  const nsType =
    activeRoot.rootType === "team_folder" ||
    activeRoot.rootType === "shared_folder" ||
    activeRoot.rootType === "sharepoint_drive"
      ? activeRoot.rootType
      : activeRoot.rootType === "team_space"
        ? "team_folder"
        : "folder";

  return {
    ServiceID: currentIdentifier,
    Id: currentIdentifier,
    name: currentName,
    locationPath: childNames.length ? `/${childNames.join("/")}` : "/",
    parentId,
    parentPath:
      childNames.length > 1 ? `/${childNames.slice(0, -1).join("/")}` : "/",
    type: nsType,
    browseTrail: breadcrumbs,
  };
}

function BrowseCloudFolderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { densityStyle } = useBrowseDensity();
  const browseRootRef = useRef<HTMLElement>(null);
  const scrollBrowseListToTop = () => {
    const root = browseRootRef.current;
    if (!root) return;
    root
      .querySelectorAll<HTMLElement>(".browse-folder__items, .browse-folder__list")
      .forEach((node) => {
        node.scrollTop = 0;
      });
  };

  const providerId = searchParams.get("providerId") ?? "";
  const connectionId = searchParams.get("connectionId") ?? "";
  const serviceId = searchParams.get("serviceId") ?? "";
  const role = (searchParams.get("role") as "source" | "destination") || "source";
  const reauthRoot = searchParams.get("reauthRoot") === "1";

  const {
    services,
    migration,
    source,
    destination,
    updateMigration,
    persistSelections,
    selectSource,
    selectDestination,
  } = useSelection();
  const rootInclude = useRootIncludeSelection();
  const [browseSort, setBrowseSort] = useState<BrowseSortState>(DEFAULT_BROWSE_SORT);
  const [includeSubmitting, setIncludeSubmitting] = useState(false);
  /**
   * Set-as-root anchor for this browse session. Source: include/exclude under it.
   * Destination: locked pair root (Done commits this folder, not a deeper browse).
   */
  const [anchor, setAnchor] = useState<{ id: string; folder: Folder } | null>(null);

  const resumeFolder = (location.state as { resumeFolder?: Folder } | null)
    ?.resumeFolder;
  const reconfirmSourceInclude = Boolean(
    (location.state as { reconfirmSourceInclude?: boolean } | null)
      ?.reconfirmSourceInclude
  );
  const resumeHandledRef = useRef(false);
  const reconfirmHandledRef = useRef(false);
  const rootsLoadedKeyRef = useRef<string | null>(null);
  const folderClickTimerRef = useRef<number | null>(null);
  /** Plain folder click gesture: used so opening a checked folder does not leave it unchecked. */
  const folderIncludeGestureRef = useRef<{
    id: string;
    parentId: string;
    ancestorChain: string[];
    wasIncluded: boolean;
  } | null>(null);

  const [roots, setRoots] = useState<CloudRoot[]>([]);
  const [activeRoot, setActiveRoot] = useState<CloudRoot | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<Folder[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [currentIdentifier, setCurrentIdentifier] = useState<string | null>(null);
  const [isRootPicker, setIsRootPicker] = useState(true);
  const previousRoot = useMemo(() => {
    if (!reauthRoot) return undefined;
    return (
      resumeFolder ??
      (role === "source" ? source?.root : destination?.root)
    );
  }, [reauthRoot, resumeFolder, role, source?.root, destination?.root]);
  const previousRootIds = useMemo(
    () => previousRootMatchIds(previousRoot),
    [previousRoot]
  );
  const viewingOriginalRoot =
    reauthRoot &&
    !isRootPicker &&
    matchesPreviousRoot(currentIdentifier, previousRootIds);
  const [loading, setLoading] = useState(true);
  /** Folder-to-folder nav: keep showing the previous listing while the next loads. */
  const [listingPending, setListingPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSharedDestConfirm, setShowSharedDestConfirm] = useState(false);
  const [pendingDeleteItems, setPendingDeleteItems] = useState<BrowseSelectableItem[]>([]);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [mutationLoading, setMutationLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: BrowseSelectableItem;
  } | null>(null);
  const [pathCopied, setPathCopied] = useState(false);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [rootStorageById, setRootStorageById] = useState<Record<string, StorageInfo>>({});
  const altTextSelect = useAltTextSelect();

  const {
    selectedItems,
    isSelected,
    select: selectItem,
    clear: clearSelection,
  } = useBrowseSelection();

  const returnPath = role === "destination" ? "/destination" : "/connect";

  const {
    checking: checkingConnection,
    valid: connectionValid,
    recheck: recheckConnection,
  } = useCloudConnectionGuard({
    providerId,
    connectionId,
    enabled: Boolean(providerId && connectionId),
  });

  const visibleItems = useMemo(
    () => [
      ...folders.map((folder) => ({
        id: folder.ServiceID,
        type: "folder" as const,
        name: folder.name,
      })),
      ...files.map((file) => ({
        id: file.ServiceID,
        type: "file" as const,
        name: file.name,
      })),
    ],
    [folders, files]
  );

  /** True when browsing at or under the Set-as-root anchor. */
  const atOrUnderAnchor = Boolean(
    anchor &&
      currentIdentifier &&
      (currentIdentifier === anchor.id ||
        breadcrumbs.some((crumb) => crumb.path === anchor.id))
  );
  /** Include/exclude checkboxes only after Set as root, and only under the anchor. */
  const includeMode =
    !reauthRoot && role === "source" && !isRootPicker && atOrUnderAnchor;
  /** Single click opens a folder. Source include mode uses the checkbox instead. */
  const folderNavOnly =
    !reauthRoot && !isRootPicker && (role === "destination" || !includeMode);
  const parentKey = currentIdentifier ?? ROOT_INCLUDE_PARENT;
  const ancestorChain = useMemo(
    () => breadcrumbs.map((crumb) => crumb.path),
    [breadcrumbs]
  );
  const sortedListing = useMemo(
    () => sortBrowseFoldersAndFiles(folders, files, browseSort),
    [folders, files, browseSort]
  );

  const allVisibleIncluded = useMemo(() => {
    const visible = [...sortedListing.folders, ...sortedListing.files];
    return (
      visible.length > 0 &&
      visible.every((item) =>
        rootInclude.isIncluded(parentKey, item.ServiceID || item.Id)
      )
    );
  }, [sortedListing, rootInclude, parentKey]);

  /** What Delete acts on: the checked rows in include mode, the highlighted rows otherwise. */
  const deleteTargetItems = useMemo(
    () =>
      includeMode
        ? visibleItems.filter((item) =>
            rootInclude.isIncluded(parentKey, item.id)
          )
        : selectedItems,
    [includeMode, visibleItems, rootInclude, parentKey, selectedItems]
  );

  const cascadePreviewKey = useMemo(() => {
    const ids = [...sortedListing.folders, ...sortedListing.files]
      .map((item) => item.ServiceID || item.Id || "")
      .join("\0");
    return `${parentKey}::${ids}`;
  }, [parentKey, sortedListing]);

  const cascadePreviewKeyRef = useRef("");

  const prepareDestinationRoot =
    !reauthRoot && role === "destination" && Boolean(migration.sourceRootPrepared);
  /** At the locked dest anchor: top-level name match preview vs source root. */
  const destRootReviewMode =
    prepareDestinationRoot &&
    Boolean(anchor) &&
    !isRootPicker &&
    currentIdentifier === anchor?.id;

  const sourceRootId = source?.root?.ServiceID || source?.root?.Id;
  const sourceServiceId = source?.service?.id;

  const listSourceChildren = useMemo(() => {
    if (!sourceServiceId || !sourceRootId) return null;
    const srcCloud = isCloudServiceType(source?.service?.type || "");
    const srcConn = migration.sourceConnectionId;
    const srcProviderId = source?.service?.id;
    if (srcCloud && srcConn && srcProviderId) {
      return async (folderId: string, opts?: { foldersOnly?: boolean }) => {
        const response = await listCloudChildren(srcProviderId, srcConn, folderId, {
          offset: 0,
          limit: 500,
          foldersOnly: opts?.foldersOnly,
        });
        return {
          folders: response.folders || [],
          files: response.files || [],
        };
      };
    }
    return async (folderId: string, opts?: { foldersOnly?: boolean }) => {
      const response = await listChildren(sourceServiceId, folderId, "source", {
        offset: 0,
        limit: 500,
        foldersOnly: opts?.foldersOnly,
      });
      return {
        folders: response.folders || [],
        files: response.files || [],
      };
    };
  }, [
    sourceServiceId,
    sourceRootId,
    source?.service?.type,
    source?.service?.id,
    migration.sourceConnectionId,
  ]);

  const destDual = useDestDualList({
    enabled: destRootReviewMode && Boolean(currentIdentifier),
    listSourceChildren,
    sourceRootId,
    destFolderId: currentIdentifier,
    destFolders: folders,
    destFiles: files,
    relativeSegments: [],
  });

  const deleteConfirmCopy = useMemo(
    () => buildDeleteConfirmMessage(pendingDeleteItems),
    [pendingDeleteItems]
  );

  const cloudMutationContext = () => ({
    role,
    rootType: activeRoot?.rootType,
    driveId: activeRoot
      ? effectiveDriveId(activeRoot, breadcrumbs)
      : undefined,
  });

  const loadAllChildrenAt = async (identifier: string): Promise<Folder[]> => {
    if (!activeRoot) {
      return [];
    }
    const pageSize = 200;
    const all: Folder[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const response = await listCloudChildren(
        providerId,
        connectionId,
        identifier,
        {
          offset,
          limit: pageSize,
          ...rootListOptions(identifier, activeRoot, breadcrumbs),
        }
      );
      all.push(...(response.folders || []), ...(response.files || []));
      hasMore = Boolean(response.pagination?.hasMore);
      offset += pageSize;
      if (!response.pagination) break;
    }
    return all;
  };

  useEffect(() => {
    rootsLoadedKeyRef.current = null;
    resumeHandledRef.current = false;
  }, [providerId, connectionId]);

  useEffect(() => {
    if (!providerId || !connectionId || !serviceId) {
      setError("Missing cloud connection parameters.");
      setLoading(false);
      return;
    }

    if (connectionValid === false) {
      setLoading(false);
      return;
    }

    if (connectionValid !== true) {
      return;
    }

    const loadKey = `${providerId}:${connectionId}`;
    if (rootsLoadedKeyRef.current === loadKey) {
      return;
    }

    if (resumeFolder && !resumeHandledRef.current) {
      resumeHandledRef.current = true;
      // Mark loaded so clearing resume state does not call loadRoots.
      rootsLoadedKeyRef.current = loadKey;
      void resumeAtFolder(resumeFolder);
      window.history.replaceState({}, document.title);
      return;
    }

    void loadRoots();
    // Guard already verified the connection; do not call recheck here. That
    // toggles checkingConnection and would re-trigger this effect in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, connectionId, serviceId, resumeFolder, connectionValid]);

  useEffect(() => {
    if (!reconfirmSourceInclude || reconfirmHandledRef.current) {
      return;
    }
    if (connectionValid !== true) {
      return;
    }
    reconfirmHandledRef.current = true;
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const migId = migration.migrationId;
        if (!migId || !source?.root) {
          setError("Missing migration or source root for reconfirm.");
          return;
        }
        const status = await getMigrationStatus(migId);
        const tree =
          status.sourceRootChildren ??
          migration.sourceRootChildren ??
          [];
        if (tree.length === 0) {
          setError("No saved source selection to reconfirm.");
          return;
        }
        const rootFolder = source.root;
        const trail = getBrowseTrailFromFolder(rootFolder);
        const matchedRoot =
          roots.find((r) => r.id === trail[0]?.path) ?? roots[0];
        const rootId = rootFolder.ServiceID || matchedRoot?.id || "";
        rootInclude.restore(tree as MigrationRootChild[], rootId);
        setAnchor({ id: rootId, folder: rootFolder });

        if (matchedRoot) {
          setActiveRoot(matchedRoot);
          setIsRootPicker(false);
          setBreadcrumbs([{ path: matchedRoot.id, name: matchedRoot.displayName }]);
          setCurrentIdentifier(rootId);
        }

        const children = (tree as MigrationRootChild[]).map(
          (c) =>
            ({
              ServiceID: c.id,
              Id: c.id,
              name: c.name,
              type: c.type === "file" ? "file" : "folder",
              size: c.size,
              lastUpdated: c.mtime,
            }) as Folder
        );
        setFolders(children.filter((c) => c.type !== "file"));
        setFiles(children.filter((c) => c.type === "file"));

        updateMigration({
          sourceRootPrepared: true,
          sourceRootChildNames: includedSourceChildNames(tree as MigrationRootChild[]),
          sourceRootChildren: tree,
        });
        window.history.replaceState({}, document.title);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to restore source selection."
        );
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconfirmSourceInclude, connectionValid, migration.migrationId]);

  /** Cascade red-X hints when browsing under an unchecked parent folder. */
  useEffect(() => {
    if (!includeMode || reconfirmSourceInclude) return;
    const items = [...sortedListing.folders, ...sortedListing.files];
    if (items.length === 0) return;
    if (cascadePreviewKeyRef.current === cascadePreviewKey) return;
    cascadePreviewKeyRef.current = cascadePreviewKey;
    if (rootInclude.shouldCascadeParentExclusion(parentKey)) {
      rootInclude.applyFilterPreview(parentKey, parentCascadeReasons(items));
    } else {
      rootInclude.applyFilterPreview(parentKey, {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeMode, reconfirmSourceInclude, cascadePreviewKey]);

  const loadRoots = async () => {
    scrollBrowseListToTop();
    const loadKey = `${providerId}:${connectionId}`;
    setLoading(true);
    setError(null);

    try {
      const rootList = await listCloudRoots(providerId, connectionId);
      rootsLoadedKeyRef.current = loadKey;
      setRoots(rootList);
      setActiveRoot(null);
      setFolders([]);
      setFiles([]);
      setBreadcrumbs([]);
      setCurrentIdentifier(null);
      setPagination(null);

      // Only auto-enter when Dropbox has a single personal root; otherwise show the
      // picker so team space / shared folders remain selectable.
      if (providerId === "dropbox" && rootList.length === 1) {
        const autoRoot = rootList[0];
        const trail = [{ path: autoRoot.id, name: autoRoot.displayName }];
        await loadChildren(autoRoot.id, autoRoot, trail, { page: 0 });
        return;
      }

      setIsRootPicker(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cloud locations.");
    } finally {
      setLoading(false);
    }
  };

  const resumeAtFolder = async (folder: Folder) => {
    const loadKey = `${providerId}:${connectionId}`;
    setLoading(true);
    setError(null);

    try {
      const rootList = await listCloudRoots(providerId, connectionId);
      rootsLoadedKeyRef.current = loadKey;
      setRoots(rootList);

      const trail = getBrowseTrailFromFolder(folder);
      const rootCrumb = trail[0];
      const matchedRoot =
        rootList.find((root) => root.id === rootCrumb?.path) ??
        rootList.find((root) => root.id === folder.parentId) ??
        rootList[0];

      if (!matchedRoot) {
        setError("Could not determine cloud root for this folder.");
        await loadRoots();
        return;
      }

      const response = await listCloudChildren(
        providerId,
        connectionId,
        folder.ServiceID,
        {
          offset: 0,
          limit: itemsPerPage,
          ...rootListOptions(folder.ServiceID, matchedRoot, trail),
        }
      );

      setActiveRoot(matchedRoot);
      setFolders(response.folders || []);
      setFiles(response.files || []);
      setBreadcrumbs(trail);
      setCurrentIdentifier(folder.ServiceID);
      setIsRootPicker(false);
      setPagination(response.pagination ?? null);
      setCurrentPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume folder location.");
      await loadRoots();
    } finally {
      setLoading(false);
    }
  };

  const loadChildren = async (
    identifier: string,
    root: CloudRoot,
    trail: BreadcrumbItem[],
    options?: { page?: number; limit?: number }
  ) => {
    const page = options?.page ?? currentPage;
    const limit = options?.limit ?? itemsPerPage;
    const offset = page * limit;
    scrollBrowseListToTop();
    const soft = !isRootPicker && (folders.length > 0 || files.length > 0);

    setError(null);
    if (soft) {
      setListingPending(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await listCloudChildren(
        providerId,
        connectionId,
        identifier,
        {
          offset,
          limit,
          ...rootListOptions(identifier, root, trail),
        }
      );

      setFolders(response.folders || []);
      setFiles(response.files || []);
      clearSelection();
      setActiveRoot(root);
      setCurrentIdentifier(identifier);
      setIsRootPicker(false);
      setBreadcrumbs(trail);
      setPagination(response.pagination ?? null);
      if (options?.page !== undefined) {
        setCurrentPage(options.page);
      }
      if (role === "source") {
        rootInclude.recordChildren(
          identifier,
          [...(response.folders || []), ...(response.files || [])],
          { complete: !response.pagination?.hasMore }
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load folders.");
    } finally {
      setLoading(false);
      setListingPending(false);
    }
  };

  const reloadCurrentFolder = (page = currentPage, limit = itemsPerPage) => {
    if (!activeRoot || !currentIdentifier) {
      return;
    }
    void loadChildren(currentIdentifier, activeRoot, breadcrumbs, { page, limit });
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    reloadCurrentFolder(page);
  };

  const handleItemsPerPageChange = (nextItemsPerPage: number) => {
    setItemsPerPage(nextItemsPerPage);
    setCurrentPage(0);
    reloadCurrentFolder(0, nextItemsPerPage);
  };

  const handleRootSelect = (root: CloudRoot) => {
    const trail = [{ path: root.id, name: root.displayName }];
    setCurrentPage(0);
    void loadChildren(root.id, root, trail, { page: 0 });
  };

  const handleFolderClick = (folder: Folder, event?: React.MouseEvent) => {
    if (event && (isMultiSelectModifier(event) || event.altKey || altTextSelect)) {
      return;
    }
    if (!activeRoot) return;

    if (folderClickTimerRef.current != null) {
      window.clearTimeout(folderClickTimerRef.current);
      folderClickTimerRef.current = null;
    }
    // Double-click open cancels a pending row toggle. If that toggle already
    // unchecked a folder that was included when the gesture started, put it back.
    const gesture = folderIncludeGestureRef.current;
    folderIncludeGestureRef.current = null;
    if (
      includeMode &&
      gesture &&
      gesture.id === folder.ServiceID &&
      gesture.wasIncluded &&
      !rootInclude.isIncluded(gesture.parentId, gesture.id)
    ) {
      rootInclude.includeWithAncestors(
        gesture.parentId,
        gesture.id,
        gesture.ancestorChain,
        { fullSubtree: true }
      );
    }
    clearSelection();

    // Navigating into a SharePoint subsite: treat it as a new browse-only root.
    if (folder.type === "sharepoint_site") {
      handleRootSelect({
        id: folder.ServiceID,
        displayName: folder.name,
        rootType: "sharepoint_site",
        migrationRootForbidden: true,
        migrationRootForbiddenReason:
          "Select a document library or folder inside this site. The site itself cannot be a migration root.",
      });
      return;
    }

    // Dropbox shared/team folders and SharePoint libraries are their own drive namespaces.
    // OneDrive "Shared" items live on foreign drives. ParentId carries that drive id.
    const nsDriveId =
      folder.parentId &&
      (folder.parentId === folder.ServiceID ||
        folder.type === "team_folder" ||
        folder.type === "shared_folder" ||
        folder.type === "sharepoint_drive" ||
        activeRoot.rootType === "shared_with_me")
        ? folder.parentId
        : undefined;

    const trail = [
      ...breadcrumbs,
      {
        path: folder.ServiceID,
        name: folder.name,
        ...(nsDriveId ? { driveId: nsDriveId } : {}),
      },
    ];
    setCurrentPage(0);
    void loadChildren(folder.ServiceID, activeRoot, trail, { page: 0 });
  };

  const handleItemSelect = (
    item: BrowseSelectableItem,
    index: number,
    event: React.MouseEvent
  ) => {
    if (event.altKey || altTextSelect) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    // Before include mode, folder clicks only navigate (source and destination).
    if (folderNavOnly && item.type === "folder") {
      const folder = folders.find((f) => f.ServiceID === item.id);
      if (folder) {
        handleFolderClick(folder, event);
      }
      return;
    }

    // After Set as root, the row is the checkbox. Delay plain folder toggles so a
    // double-click can open without also marking.
    if (includeMode) {
      const isPlainFolderClick =
        item.type === "folder" &&
        !event.shiftKey &&
        !isMultiSelectModifier(event);

      if (isPlainFolderClick && event.detail > 1) {
        if (folderClickTimerRef.current != null) {
          window.clearTimeout(folderClickTimerRef.current);
          folderClickTimerRef.current = null;
        }
        return;
      }

      if (isPlainFolderClick) {
        if (folderClickTimerRef.current != null) {
          window.clearTimeout(folderClickTimerRef.current);
        }
        folderIncludeGestureRef.current = {
          id: item.id,
          parentId: parentKey,
          ancestorChain: [...ancestorChain],
          wasIncluded: rootInclude.isIncluded(parentKey, item.id),
        };
        folderClickTimerRef.current = window.setTimeout(() => {
          folderClickTimerRef.current = null;
          rootInclude.toggleRow(
            parentKey,
            item,
            index,
            false,
            visibleItems,
            ancestorChain
          );
        }, FOLDER_SELECT_BOUNCE_MS);
        return;
      }

      rootInclude.toggleRow(
        parentKey,
        item,
        index,
        event.shiftKey,
        visibleItems,
        ancestorChain
      );
      return;
    }

    const runSelect = () => {
      selectItem(
        item,
        index,
        {
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        },
        visibleItems
      );
    };

    // Destination browse: delay plain folder select so double-click can open
    // without toggling the highlight off first.
    const isPlainFolderClick =
      item.type === "folder" &&
      !event.shiftKey &&
      !isMultiSelectModifier(event);
    if (isPlainFolderClick) {
      if (folderClickTimerRef.current != null) {
        window.clearTimeout(folderClickTimerRef.current);
      }
      folderClickTimerRef.current = window.setTimeout(() => {
        folderClickTimerRef.current = null;
        runSelect();
      }, FOLDER_SELECT_BOUNCE_MS);
      return;
    }

    if (folderClickTimerRef.current != null) {
      window.clearTimeout(folderClickTimerRef.current);
      folderClickTimerRef.current = null;
    }
    runSelect();
  };

  const handleItemContextMenu = (
    event: React.MouseEvent,
    item: BrowseSelectableItem
  ) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, item });
  };

  const requestDelete = (items: BrowseSelectableItem[]) => {
    if (items.length === 0) {
      return;
    }
    setPendingDeleteItems(items);
    setShowDeleteConfirm(true);
  };

  const handleContextDelete = () => {
    const targets =
      deleteTargetItems.length > 0
        ? deleteTargetItems
        : contextMenu
          ? [contextMenu.item]
          : [];
    requestDelete(targets);
  };

  const handleCopyPath = async () => {
    if (!currentIdentifier) return;
    try {
      await navigator.clipboard.writeText(currentIdentifier);
      setPathCopied(true);
      window.setTimeout(() => setPathCopied(false), 1500);
    } catch {
      setError("Could not copy path to clipboard.");
    }
  };

  const handleBack = () => {
    clearSelection();
    if (breadcrumbs.length > 1 && activeRoot) {
      const previous = breadcrumbs[breadcrumbs.length - 2];
      const trail = breadcrumbs.slice(0, -1);
      setCurrentPage(0);
      void loadChildren(previous.path, activeRoot, trail, { page: 0 });
      return;
    }

    // Single-root accounts have no picker to return to.
    if (roots.length <= 1) {
      return;
    }

    if (activeRoot) {
      setIsRootPicker(true);
      setActiveRoot(null);
      setFolders([]);
      setFiles([]);
      setBreadcrumbs([]);
      setCurrentIdentifier(null);
      setPagination(null);
      setCurrentPage(0);
    }
  };

  useEffect(() => {
    if (!serviceId || !connectionId || roots.length === 0) {
      setRootStorageById({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        roots.map(async (root) => {
          if (!reportsOwnedStorageQuota(root.rootType)) {
            return [root.id, { available: false } as StorageInfo] as const;
          }
          try {
            const info = await getStorageInfo(serviceId, {
              connectionId,
              rootType: root.rootType,
              driveId: root.driveId,
              role,
            });
            return [root.id, info] as const;
          } catch {
            return [root.id, { available: false } as StorageInfo] as const;
          }
        })
      );
      if (!cancelled) {
        setRootStorageById(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceId, connectionId, roots, role]);

  useEffect(() => {
    if (!serviceId || !connectionId || isRootPicker || !activeRoot) {
      setStorageInfo(null);
      return;
    }
    if (!reportsOwnedStorageQuota(activeRoot.rootType)) {
      setStorageInfo({ available: false });
      return;
    }
    const cached = rootStorageById[activeRoot.id];
    if (cached) {
      setStorageInfo(cached);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const info = await getStorageInfo(serviceId, {
          connectionId,
          rootType: activeRoot.rootType,
          driveId: activeRoot.driveId,
          role,
        });
        if (!cancelled) setStorageInfo(info);
      } catch {
        if (!cancelled) setStorageInfo({ available: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    serviceId,
    connectionId,
    isRootPicker,
    activeRoot?.id,
    activeRoot?.rootType,
    activeRoot?.driveId,
    role,
    rootStorageById,
  ]);

  const refreshCurrentFolder = () => {
    reloadCurrentFolder();
  };

  const clearAnchor = () => {
    setAnchor(null);
    rootInclude.reset();
    clearSelection();
  };

  /** Anchor the folder you are in; include everything inside (source) or lock dest. */
  const handleSetAsRoot = async () => {
    if (isRootPicker || !activeRoot || !currentIdentifier) {
      setError("Choose a cloud location and folder first.");
      return;
    }
    if (breadcrumbs.length <= 1 && activeRoot.migrationRootForbidden) {
      setError(
        activeRoot.migrationRootForbiddenReason ??
          "This virtual location cannot be used as a migration root. Select a folder inside it."
      );
      return;
    }

    const stillValid = await recheckConnection();
    if (!stillValid) {
      setError("Your cloud connection expired. Reconnect to continue.");
      return;
    }

    const selectedFolder = folderFromBreadcrumbs(
      activeRoot,
      breadcrumbs,
      currentIdentifier
    );
    selectedFolder.browseTrail =
      selectedFolder.browseTrail ?? getBrowseTrailFromFolder(selectedFolder);

    if (role === "source") {
      try {
        setIncludeSubmitting(true);
        setError(null);
        const rootChildren = await loadAllChildrenAt(currentIdentifier);
        if (rootChildren.length === 0) {
          setError(
            "You cannot use an empty folder as the source root. There is nothing to migrate."
          );
          return;
        }
        rootInclude.reset();
        rootInclude.recordChildren(currentIdentifier, rootChildren, {
          complete: true,
        });
        rootInclude.setAllForFolder(currentIdentifier, rootChildren, true);
        setAnchor({ id: currentIdentifier, folder: selectedFolder });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to set source root."
        );
      } finally {
        setIncludeSubmitting(false);
      }
      return;
    }

    setAnchor({ id: currentIdentifier, folder: selectedFolder });
    setError(null);
  };

  const commitSelectedRoot = async () => {
    if (isRootPicker || !activeRoot || !currentIdentifier) {
      setError("Choose a cloud location and folder first.");
      return;
    }

    if (breadcrumbs.length <= 1 && activeRoot.migrationRootForbidden) {
      setError(
        activeRoot.migrationRootForbiddenReason ??
          "This virtual location cannot be used as a migration root. Select a folder inside it."
      );
      return;
    }

    const stillValid = await recheckConnection();
    if (!stillValid) {
      setError("Your cloud connection expired. Reconnect to continue.");
      return;
    }

    const selectedFolder = folderFromBreadcrumbs(
      activeRoot,
      breadcrumbs,
      currentIdentifier
    );
    selectedFolder.browseTrail =
      selectedFolder.browseTrail ?? getBrowseTrailFromFolder(selectedFolder);

    if (reauthRoot) {
      if (role === "source") {
        const rootChildren = await loadAllChildrenAt(currentIdentifier);
        if (rootChildren.length === 0) {
          setError(
            "You cannot use an empty folder as the source root. There is nothing to migrate."
          );
          return;
        }
      }
      await commitPreparedRoot(selectedFolder, [], { reauth: true });
      return;
    }

    if (!anchor) {
      await handleSetAsRoot();
      return;
    }

    if (role === "source") {
      await confirmSourceRoot(anchor.folder, anchor.id);
      return;
    }

    if (role === "destination") {
      try {
        setIncludeSubmitting(true);
        setError(null);
        const names = migration.sourceRootChildNames;
        const children = await loadAllChildrenAt(anchor.id);
        await commitPreparedRoot(
          anchor.folder,
          destinationRootChildrenPayload(children, names)
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to list root children.");
        setIncludeSubmitting(false);
      }
      return;
    }

    navigate("/summary");
  };

  /** Commit the anchored source root and its include tree, then leave browse. */
  const confirmSourceRoot = async (selectedFolder: Folder, rootId: string) => {
    try {
      setIncludeSubmitting(true);
      setError(null);

      // Folders the user pruned may only be partially listed; fill them in so
      // unvisited siblings are not silently dropped from the allowlist.
      for (const parentId of rootInclude.parentsNeedingFullListing()) {
        if (parentId === rootId) continue;
        const all = await loadAllChildrenAt(parentId);
        rootInclude.recordChildren(parentId, all, { complete: true });
      }

      let children = rootInclude.buildPayload(rootId, { role: "source" });
      // No listing yet (should be rare after Set as root): load and include all.
      if (children.length === 0) {
        const rootChildren = await loadAllChildrenAt(rootId);
        if (rootChildren.length === 0) {
          setError(
            "You cannot use an empty folder as the source root. There is nothing to migrate."
          );
          setIncludeSubmitting(false);
          return;
        }
        rootInclude.recordChildren(rootId, rootChildren, { complete: true });
        rootInclude.setAllForFolder(rootId, rootChildren, true);
        children = rootInclude.buildPayload(rootId, { role: "source" });
      }

      await commitPreparedRoot(selectedFolder, children);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm source root.");
      setIncludeSubmitting(false);
    }
  };

  const commitPreparedRoot = async (
    rootFolder: Folder,
    children: MigrationRootChild[],
    opts?: { reauth?: boolean }
  ) => {
    const service = services.find((s) => s.id === serviceId);
    if (!service) {
      setError("Service not found.");
      setIncludeSubmitting(false);
      return;
    }

    const stillValid = await recheckConnection();
    if (!stillValid) {
      setError("Your cloud connection expired. Reconnect to continue.");
      setIncludeSubmitting(false);
      return;
    }

    const quietReauth = Boolean(opts?.reauth);
    try {
      setIncludeSubmitting(true);
      setError(null);
      const response = await setMigrationRoot({
        migrationId: migration.migrationId,
        role,
        serviceId: service.id,
        connectionId,
        root: folderToApiRoot(rootFolder),
        ...(quietReauth
          ? { reauth: true }
          : {
              children,
              excludedIds:
                role === "source"
                  ? children.filter((c) => c.excluded).map((c) => c.id)
                  : undefined,
            }),
      });

      const boundConnectionId =
        (role === "source"
          ? response.sourceConnectionId
          : response.destinationConnectionId) || connectionId;
      updateMigration({
        migrationId: response.migrationId,
        sourceConnectionId:
          role === "source"
            ? boundConnectionId
            : response.sourceConnectionId || migration.sourceConnectionId,
        destinationConnectionId:
          role === "destination"
            ? boundConnectionId
            : response.destinationConnectionId ||
              migration.destinationConnectionId,
        ready: response.ready,
        ...(quietReauth
          ? {}
          : role === "source"
            ? {
                sourceRootPrepared: true,
                sourceRootChildNames: includedSourceChildNames(children),
                sourceRootChildren: children,
                ...(isCloudServiceType(service.type)
                  ? {}
                  : clearEndpointCloudState("source")),
              }
            : {
                destinationRootPrepared: true,
                ...(isCloudServiceType(service.type)
                  ? {}
                  : clearEndpointCloudState("destination")),
              }),
      });
      persistSelections({
        migrationId: response.migrationId,
        sourceConnectionId:
          role === "source"
            ? boundConnectionId
            : response.sourceConnectionId || migration.sourceConnectionId,
        destinationConnectionId:
          role === "destination"
            ? boundConnectionId
            : response.destinationConnectionId ||
              migration.destinationConnectionId,
      });

      if (role === "source") {
        selectSource(service, rootFolder);
      } else {
        selectDestination(service, rootFolder);
      }
      navigate("/summary");
    } catch (err) {
      if (!quietReauth) {
        updateMigration(clearAccountFields(role));
      }
      setError(
        err instanceof Error ? err.message : "Failed to confirm root children."
      );
      setIncludeSubmitting(false);
    }
  };

  const handleSelectRoot = async () => {
    if (
      role === "destination" &&
      activeRoot &&
      isExternallyOwnedBrowseRoot(activeRoot.rootType)
    ) {
      setShowSharedDestConfirm(true);
      return;
    }
    await commitSelectedRoot();
  };

  const handleCreateFolder = async (name: string) => {
    if (!currentIdentifier || !activeRoot) {
      return;
    }
    setMutationLoading(true);
    setError(null);
    try {
      await createCloudBrowseFolder(providerId, connectionId, {
        parentId: currentIdentifier,
        name,
        ...cloudMutationContext(),
      });
      setShowNewFolderModal(false);
      refreshCurrentFolder();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder.");
    } finally {
      setMutationLoading(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!currentIdentifier || pendingDeleteItems.length === 0) {
      return;
    }
    setMutationLoading(true);
    setError(null);
    try {
      const result = await deleteCloudBrowseNodes(providerId, connectionId, {
        contextId: currentIdentifier,
        nodes: pendingDeleteItems.map((item) => ({ id: item.id, type: item.type })),
        ...cloudMutationContext(),
      });
      setShowDeleteConfirm(false);
      setPendingDeleteItems([]);

      if (result.deleted.length > 0) {
        clearSelection();
        refreshCurrentFolder();
      }

      if (result.errors.length > 0) {
        const errorText = formatDeleteErrors(result.errors);
        const successNote =
          result.deleted.length > 0
            ? `${result.deleted.length} item(s) deleted successfully.`
            : "No items were deleted.";
        setError(`${successNote}\n${errorText}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete items.");
    } finally {
      setMutationLoading(false);
    }
  };

  const canGoBack =
    Boolean(activeRoot) &&
    (breadcrumbs.length > 1 || (providerId !== "dropbox" && roots.length > 1));
  const canSelect = !isRootPicker && Boolean(currentIdentifier);
  const selectedRootForbidden =
    breadcrumbs.length <= 1 && activeRoot?.migrationRootForbidden === true;
  const forbiddenRootReason =
    activeRoot?.migrationRootForbiddenReason ??
    "This virtual location cannot be used as a migration root. Select a folder inside it.";
  return (
    <section className="browse-folder" ref={browseRootRef}>
      <PageShell className="browse-folder__content">
        <PageBackButton
          onClick={() => navigate(reauthRoot ? "/summary" : returnPath)}
          title={
            reauthRoot
              ? "Back to setup"
              : role === "destination"
                ? "Back to destination service selection"
                : "Back to source service selection"
          }
          className="browse-folder__page-back"
        />

        <header className="browse-folder__header">
          <h1 className="browse-folder__title">
            {reauthRoot ? (
              <>
                Confirm your{" "}
                <span
                  className={
                    role === "source"
                      ? "browse-folder__highlight--magenta"
                      : "browse-folder__highlight--cyan"
                  }
                >
                  {role}
                </span>{" "}
                root
              </>
            ) : role === "source" ? (
              <>
                Choose your{" "}
                <span className="browse-folder__highlight--magenta">source</span>{" "}
                folder and contents
              </>
            ) : (
              <>
                Select your{" "}
                <span className="browse-folder__highlight--cyan">destination</span>{" "}
                folder
              </>
            )}
          </h1>
          {reauthRoot ? (
            <p className="browse-folder__include-hint browse-folder__include-hint--reauth">
              Re-authentication only: open the same root folder used for this
              migration, then Confirm. No include checkboxes or extra review
              steps on this pass.
            </p>
          ) : role === "source" && !isRootPicker ? (
            <p className="browse-folder__include-hint">
              {anchor
                ? "This folder is your source root. Uncheck items to leave them out. Open folders to refine deeper. Done saves the root and your selection."
                : "Open folders to navigate. Set as root when you are in the folder you want to migrate from. Everything inside starts included; you can uncheck after."}
            </p>
          ) : !isRootPicker && role === "destination" ? (
            <p className="browse-folder__include-hint">
              {destRootReviewMode
                ? "This folder is your destination root. Checks show names that already exist on the source root (read-only). Open folders to look around; Done still uses this root."
                : anchor
                  ? "Destination root is set. Browse freely to look around; Done still uses the root you set. Use Change root to pick a different folder."
                  : prepareDestinationRoot
                    ? "Open folders to navigate. Set as root on the destination folder that should receive your source. You can review top-level matches before Done."
                    : "Open folders to navigate. Set as root on the folder you want as the destination."}
            </p>
          ) : null}
        </header>

        {reauthRoot && (
          <OriginalRootCard
            root={previousRoot}
            viewingOriginal={Boolean(viewingOriginalRoot)}
          />
        )}

        {error && <div className="browse-folder__error">{error}</div>}

        {!checkingConnection && connectionValid === false && (
          <div className="cloud-connection-issues">
            <p className="cloud-connection-issues__message">
              This cloud account is disconnected or expired.
            </p>
            <button
              type="button"
              className="action-button cloud-connection-issues__reconnect"
              onClick={() =>
                navigate(
                  buildCloudConnectPath({
                    role,
                    serviceId,
                    providerId,
                    connectionId,
                    reconnect: true,
                  })
                )
              }
            >
              <RefreshCw size={16} aria-hidden="true" />
              Reconnect
            </button>
          </div>
        )}

        <div className="browse-folder__breadcrumbs-container">
          {canGoBack && (
            <button
              type="button"
              className="page-back-button browse-folder__back-button"
              onClick={handleBack}
              title="Go back"
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          {!isRootPicker && breadcrumbs.length > 0 && (
            <div className="browse-folder__breadcrumbs">
              {breadcrumbs.map((crumb, index) => (
                <div key={`${crumb.path}-${index}`} className="browse-folder__breadcrumb">
                  <button
                    type="button"
                    className="browse-folder__breadcrumb-link"
                    onClick={() => {
                      if (!activeRoot) return;
                      if (index < breadcrumbs.length - 1) {
                        clearSelection();
                        const trail = breadcrumbs.slice(0, index + 1);
                        setCurrentPage(0);
                        void loadChildren(crumb.path, activeRoot, trail, { page: 0 });
                      }
                    }}
                    disabled={index === breadcrumbs.length - 1}
                  >
                    {crumb.name}
                  </button>
                  {index < breadcrumbs.length - 1 && (
                    <ChevronRight
                      size={16}
                      className="browse-folder__breadcrumb-separator"
                      aria-hidden="true"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {!isRootPicker && currentIdentifier && (
            <button
              type="button"
              className="browse-folder__breadcrumb-copy"
              onClick={() => void handleCopyPath()}
              title="Copy folder id to clipboard"
              aria-label="Copy folder id to clipboard"
            >
              {pathCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          )}
        </div>

        {includeMode && (
          <BrowseParentExclusionBanner
            visible={rootInclude.shouldCascadeParentExclusion(parentKey)}
          />
        )}
        <div
          className={`browse-folder__list-container${
            listingPending ? " browse-folder__list-container--pending" : ""
          }`}
          style={densityStyle}
          aria-busy={listingPending || loading}
        >
          {loading || checkingConnection ? (
            <div className="browse-folder__empty">Loading…</div>
          ) : connectionValid === false ? (
            <div className="browse-folder__empty">
              Reconnect your cloud account to browse folders.
            </div>
          ) : isRootPicker ? (
            <div className="browse-folder__list">
              {roots.length === 0 ? (
                <div className="browse-folder__empty">No cloud locations found.</div>
              ) : (
                roots.map((root) => {
                  const isPrevious =
                    reauthRoot &&
                    (matchesPreviousRoot(root.id, previousRootIds) ||
                      matchesPreviousRoot(root.driveId, previousRootIds));
                  return (
                  <button
                    key={root.id}
                    type="button"
                    className={`browse-folder__item browse-folder__item--drive${
                      isPrevious ? " browse-folder__item--previous-root" : ""
                    }`}
                    onClick={() => handleRootSelect(root)}
                  >
                    <div className="browse-folder__item-icon">
                      <Cloud size={32} />
                    </div>
                    <div className="browse-folder__item-info">
                      <div className="browse-folder__item-name">
                        {root.displayName}
                        {isPrevious ? <PreviousRootBadge /> : null}
                      </div>
                      <div className="browse-folder__item-meta">
                        {rootTypeLabel(root.rootType)}
                        {root.migrationRootForbidden ? " · Browse only" : ""}
                      </div>
                      {rootStorageById[root.id] ? (
                        <StorageMeter {...rootStorageById[root.id]} />
                      ) : null}
                    </div>
                    <div
                      className="browse-folder__item-path-col browse-folder__item-path-col--drive"
                      title={root.id}
                    >
                      {root.id}
                    </div>
                    <ChevronRight size={20} className="browse-folder__item-arrow" />
                  </button>
                  );
                })
              )}
            </div>
          ) : (
            <FileBrowserPane
              pagination={
                pagination && (pagination.total ?? 0) > 0 ? pagination : null
              }
              currentPage={currentPage}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
              listClassName={altTextSelect ? "browse-folder__list--text-select" : ""}
              helpTooltip={BROWSE_SELECTION_HELP}
              toolbarLeft={
                <>
                  <BrowseSortControl sort={browseSort} onChange={setBrowseSort} />
                  {includeMode && (
                    <label className="browse-folder__select-all">
                      <input
                        type="checkbox"
                        checked={allVisibleIncluded}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          void (async () => {
                            if (!currentIdentifier) return;
                            try {
                              setLoading(true);
                              const all = await loadAllChildrenAt(currentIdentifier);
                              rootInclude.setAllForFolder(
                                currentIdentifier,
                                all,
                                checked
                              );
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : "Failed to list all children for select-all."
                              );
                            } finally {
                              setLoading(false);
                            }
                          })();
                        }}
                        aria-label="Select or deselect all in this folder"
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    className="browse-folder__drive-toggle"
                    onClick={() => setShowNewFolderModal(true)}
                    disabled={!currentIdentifier || mutationLoading}
                    title="New folder"
                    aria-label="New folder"
                  >
                    <FolderPlus size={16} />
                  </button>
                  {deleteTargetItems.length > 0 && (
                    <button
                      type="button"
                      className="browse-folder__drive-toggle browse-folder__drive-toggle--danger"
                      onClick={() => requestDelete(deleteTargetItems)}
                      disabled={mutationLoading}
                      title={`Delete ${deleteTargetItems.length} selected`}
                      aria-label={`Delete ${deleteTargetItems.length} selected`}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </>
              }
            >
              {destRootReviewMode ? (
                destDual.loading && destDual.rows.length === 0 ? (
                  <div className="browse-folder__empty">Comparing with source…</div>
                ) : (
                  <DestDualListRows
                    rows={destDual.rows}
                    readOnlyChecks
                    onOpenFolder={(row: DestDualRow) => {
                      if (!row.dst || !activeRoot) return;
                      const trail = [
                        ...breadcrumbs,
                        { path: row.dst.ServiceID, name: row.name },
                      ];
                      void loadChildren(row.dst.ServiceID, activeRoot, trail, {
                        page: 0,
                      });
                    }}
                  />
                )
              ) : sortedListing.folders.length === 0 &&
                sortedListing.files.length === 0 ? (
                <div className="path-review-list__empty">This folder is empty.</div>
              ) : (
                <>
                  {sortedListing.folders.map((folder, index) => {
                    const item: BrowseSelectableItem = {
                      id: folder.ServiceID,
                      type: "folder",
                      name: folder.name,
                    };
                    const included = rootInclude.isIncluded(
                      parentKey,
                      folder.ServiceID
                    );
                    const filterReason = rootInclude.filterReason(folder.ServiceID);
                    const isPrevious =
                      reauthRoot &&
                      matchesPreviousRoot(folder.ServiceID, previousRootIds);
                    return (
                      <div
                        key={folder.ServiceID}
                        className={`browse-folder__item browse-folder__item--selectable${
                          (includeMode ? included : isSelected(folder.ServiceID))
                            ? " browse-folder__item--selected"
                            : ""
                        }${
                          includeMode && !included
                            ? " browse-folder__item--unchecked"
                            : ""
                        }${
                          filterReason && !included
                            ? " browse-folder__item--filter-excluded"
                            : ""
                        }${
                          isPrevious ? " browse-folder__item--previous-root" : ""
                        }`}
                        onClick={(event) => {
                          if (
                            (event.target as HTMLElement).closest(
                              'input[type="checkbox"], .browse-folder__filter-x'
                            )
                          ) {
                            return;
                          }
                          handleItemSelect(item, index, event);
                        }}
                        onDoubleClick={(event) => {
                          if (
                            (event.target as HTMLElement).closest(
                              'input[type="checkbox"], .browse-folder__filter-x'
                            )
                          ) {
                            return;
                          }
                          handleFolderClick(folder, event);
                        }}
                        onContextMenu={(event) => {
                          handleItemContextMenu(event, item);
                        }}
                      >
                        {includeMode && (
                          <BrowseIncludeControl
                            included={included}
                            filterReason={filterReason}
                            onToggle={() =>
                              rootInclude.toggle(
                                parentKey,
                                folder.ServiceID,
                                ancestorChain,
                                { fullSubtree: true }
                              )
                            }
                          />
                        )}
                        <BrowseFolderItemRow
                          name={folder.name}
                          path={folder.ServiceID}
                          type="folder"
                          showArrow
                          lastUpdated={folder.lastUpdated}
                          badge={isPrevious ? <PreviousRootBadge /> : null}
                        />
                      </div>
                    );
                  })}
                  {sortedListing.files.map((file, fileIndex) => {
                    const index = sortedListing.folders.length + fileIndex;
                    const item: BrowseSelectableItem = {
                      id: file.ServiceID,
                      type: "file",
                      name: file.name,
                    };
                    const included = rootInclude.isIncluded(
                      parentKey,
                      file.ServiceID
                    );
                    const filterReason = rootInclude.filterReason(file.ServiceID);
                    return (
                      <div
                        key={file.ServiceID}
                        className={`browse-folder__item browse-folder__item--file browse-folder__item--selectable${
                          (includeMode ? included : isSelected(file.ServiceID))
                            ? " browse-folder__item--selected"
                            : ""
                        }${
                          includeMode && !included
                            ? " browse-folder__item--unchecked"
                            : ""
                        }${
                          filterReason && !included
                            ? " browse-folder__item--filter-excluded"
                            : ""
                        }`}
                        onClick={(event) => {
                          if (
                            (event.target as HTMLElement).closest(
                              'input[type="checkbox"], .browse-folder__filter-x'
                            )
                          ) {
                            return;
                          }
                          handleItemSelect(item, index, event);
                        }}
                        onContextMenu={(event) => {
                          handleItemContextMenu(event, item);
                        }}
                      >
                        {includeMode && (
                          <BrowseIncludeControl
                            included={included}
                            filterReason={filterReason}
                            onToggle={() =>
                              rootInclude.toggle(
                                parentKey,
                                file.ServiceID,
                                ancestorChain,
                                { fullSubtree: false }
                              )
                            }
                          />
                        )}
                        <BrowseFolderItemRow
                          name={file.name}
                          path={file.ServiceID}
                          type="file"
                          lastUpdated={file.lastUpdated}
                          size={file.size}
                        />
                      </div>
                    );
                  })}
                </>
              )}
            </FileBrowserPane>
          )}
        </div>

        <div className="browse-folder__footer">
          <BrowseDensityControl />
          {!isRootPicker && storageInfo?.available ? (
            <StorageMeter className="storage-meter--footer" {...storageInfo} />
          ) : null}
          <div className="browse-folder__footer-actions">
            {canSelect && connectionValid === true && (
              <>
                {anchor && !reauthRoot ? (
                  <button
                    type="button"
                    className="action-button"
                    onClick={clearAnchor}
                    disabled={includeSubmitting || loading}
                  >
                    Change root
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`action-button action-button--primary${
                    reauthRoot ? " browse-folder__confirm--reauth" : ""
                  }`}
                  onClick={() => void handleSelectRoot()}
                  disabled={selectedRootForbidden || includeSubmitting || loading}
                  title={selectedRootForbidden ? forbiddenRootReason : undefined}
                >
                  {selectedRootForbidden
                    ? "Select a folder inside"
                    : includeSubmitting
                      ? "Saving…"
                      : reauthRoot
                        ? "Confirm root"
                        : anchor
                          ? "Done"
                          : "Set as root"}
                </button>
              </>
            )}
          </div>
        </div>
      </PageShell>

      {contextMenu && (
        <BrowseContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label={
            deleteTargetItems.length > 0
              ? `Delete ${deleteTargetItems.length} selected`
              : `Delete "${contextMenu.item.name}"`
          }
          onDelete={handleContextDelete}
          onClose={() => setContextMenu(null)}
        />
      )}

      {showNewFolderModal && (
        <NewFolderModal
          onConfirm={handleCreateFolder}
          onCancel={() => setShowNewFolderModal(false)}
          submitting={mutationLoading}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title={deleteConfirmCopy.title}
          message={deleteConfirmCopy.message}
          confirmLabel={mutationLoading ? "Deleting…" : "Delete"}
          onConfirm={() => void handleDeleteConfirmed()}
          onCancel={() => {
            setShowDeleteConfirm(false);
            setPendingDeleteItems([]);
          }}
        />
      )}

      {showSharedDestConfirm && (
        <ConfirmDialog
          title="Confirm shared destination"
          message="This location appears to be outside your personal cloud storage. Content here typically belongs to another account or a shared workspace. Are you sure you want to use it as the migration destination?"
          confirmLabel="Use this destination"
          cancelLabel="Go back"
          onConfirm={() => {
            setShowSharedDestConfirm(false);
            void commitSelectedRoot();
          }}
          onCancel={() => setShowSharedDestConfirm(false)}
        />
      )}
    </section>
  );
}

export default function BrowseCloudFolder() {
  return (
    <BrowseDensityProvider>
      <BrowseCloudFolderPage />
    </BrowseDensityProvider>
  );
}
