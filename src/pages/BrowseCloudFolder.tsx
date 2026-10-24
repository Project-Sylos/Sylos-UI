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

  const providerId = searchParams.get("providerId") ?? "";
  const connectionId = searchParams.get("connectionId") ?? "";
  const serviceId = searchParams.get("serviceId") ?? "";
  const role = (searchParams.get("role") as "source" | "destination") || "source";

  const {
    services,
    migration,
    source,
    updateMigration,
    selectSource,
    selectDestination,
  } = useSelection();
  const rootInclude = useRootIncludeSelection();
  const [browseSort, setBrowseSort] = useState<BrowseSortState>(DEFAULT_BROWSE_SORT);
  const [includeSubmitting, setIncludeSubmitting] = useState(false);
  /** Locked destination root after Select; dual-list review is relative to this. */
  const [destAlignRootId, setDestAlignRootId] = useState<string | null>(null);

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
  const [loading, setLoading] = useState(true);
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

  /** Source browse include marks once we are inside a location. */
  const includeMode = role === "source" && !isRootPicker;
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
    role === "destination" && Boolean(migration.sourceRootPrepared);
  /** After picking a dest root: relative dual-list review before final confirm. */
  const destRootReviewMode =
    prepareDestinationRoot && Boolean(destAlignRootId) && !isRootPicker;

  const destRelativeSegments = useMemo(() => {
    if (!destAlignRootId || breadcrumbs.length === 0) return [] as string[];
    const idx = breadcrumbs.findIndex((b) => b.path === destAlignRootId);
    if (idx < 0) return [];
    return breadcrumbs.slice(idx + 1).map((b) => b.name);
  }, [breadcrumbs, destAlignRootId]);

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
    relativeSegments: destRelativeSegments,
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
      setDestAlignRootId(null);

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

    setLoading(true);
    setError(null);

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

    // In include mode the row is the checkbox. Delay plain folder toggles so a
    // double-click can open without ever marking (explore mode stays at zero
    // checks; onDoubleClick navigates).
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
        }, 150);
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
      }, 150);
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
      const alignIdx = destAlignRootId
        ? breadcrumbs.findIndex((b) => b.path === destAlignRootId)
        : -1;
      if (alignIdx >= 0 && breadcrumbs.length - 2 < alignIdx) {
        setDestAlignRootId(null);
      }
      setCurrentPage(0);
      void loadChildren(previous.path, activeRoot, trail, { page: 0 });
      return;
    }

    // Single-root accounts have no picker to return to.
    if (roots.length <= 1) {
      setDestAlignRootId(null);
      return;
    }

    if (activeRoot) {
      setDestAlignRootId(null);
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

    if (role === "source" && pagination && pagination.total === 0) {
      setError(
        "You cannot use an empty folder as the source root. There is nothing to migrate."
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
      await confirmSourceRoot(selectedFolder, currentIdentifier);
      return;
    }

    if (prepareDestinationRoot) {
      try {
        setLoading(true);
        setError(null);

        if (!destAlignRootId) {
          const children = await loadAllChildrenAt(currentIdentifier);
          if (children.length === 0) {
            await commitPreparedRoot(selectedFolder, []);
            return;
          }
          setDestAlignRootId(currentIdentifier);
          return;
        }

        const rootId = destAlignRootId;
        const rootFolder =
          rootId === currentIdentifier
            ? selectedFolder
            : folderFromBreadcrumbs(
                activeRoot,
                breadcrumbs.slice(
                  0,
                  breadcrumbs.findIndex((b) => b.path === rootId) + 1
                ),
                rootId
              );

        const names = migration.sourceRootChildNames;
        const children = await loadAllChildrenAt(rootId);
        await commitPreparedRoot(
          rootFolder,
          destinationRootChildrenPayload(children, names)
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to list root children.");
      } finally {
        setLoading(false);
      }
      return;
    }

    const destination = role === "destination" ? "/destination" : "/connect";
    navigate(destination, {
      state: {
        selectedFolder,
        serviceId,
        role,
        connectionId,
      },
    });
  };

  /** Current folder becomes the source root; checkbox state becomes its include tree. */
  const confirmSourceRoot = async (selectedFolder: Folder, rootId: string) => {
    try {
      setIncludeSubmitting(true);
      setError(null);

      const rootChildren = await loadAllChildrenAt(rootId);
      if (rootChildren.length === 0) {
        setError(
          "You cannot use an empty folder as the source root. There is nothing to migrate."
        );
        return;
      }
      rootInclude.recordChildren(rootId, rootChildren, { complete: true });

      // Folders the user pruned may only be partially listed; fill them in so
      // unvisited siblings are not silently dropped from the allowlist.
      for (const parentId of rootInclude.parentsNeedingFullListing()) {
        if (parentId === rootId) continue;
        const all = await loadAllChildrenAt(parentId);
        rootInclude.recordChildren(parentId, all, { complete: true });
      }

      // No explicit picks: include everything under the current folder/drive.
      if (rootInclude.includedCountUnder(rootId) < 1) {
        rootInclude.setAllForFolder(rootId, rootChildren, true);
      }

      const children = rootInclude.buildPayload(rootId, { role: "source" });
      await commitPreparedRoot(selectedFolder, children);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm source root.");
    } finally {
      setIncludeSubmitting(false);
    }
  };

  const commitPreparedRoot = async (
    rootFolder: Folder,
    children: MigrationRootChild[]
  ) => {
    const service = services.find((s) => s.id === serviceId);
    if (!service) {
      setError("Service not found.");
      return;
    }

    const stillValid = await recheckConnection();
    if (!stillValid) {
      setError("Your cloud connection expired. Reconnect to continue.");
      return;
    }

    try {
      setIncludeSubmitting(true);
      setError(null);
      const response = await setMigrationRoot({
        migrationId: migration.migrationId,
        role,
        serviceId: service.id,
        connectionId,
        root: folderToApiRoot(rootFolder),
        children,
        excludedIds:
          role === "source"
            ? children.filter((c) => c.excluded).map((c) => c.id)
            : undefined,
      });

      updateMigration({
        migrationId: response.migrationId,
        sourceConnectionId: response.sourceConnectionId,
        destinationConnectionId: response.destinationConnectionId,
        ready: response.ready,
        ...(role === "source"
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

      if (role === "source") {
        selectSource(service, rootFolder);
      } else {
        selectDestination(service, rootFolder);
      }
      rootInclude.reset();
      if (response.ready) {
        navigate("/summary");
      } else if (role === "source") {
        navigate("/destination");
      } else {
        navigate("/summary");
      }
    } catch (err) {
      updateMigration(clearAccountFields(role));
      setError(
        err instanceof Error ? err.message : "Failed to confirm root children."
      );
    } finally {
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
    <section className="browse-folder">
      <PageShell className="browse-folder__content">
        <PageBackButton
          onClick={() => navigate(returnPath)}
          title={
            role === "destination"
              ? "Back to destination service selection"
              : "Back to source service selection"
          }
          className="browse-folder__page-back"
        />

        <header className="browse-folder__header">
          <h1 className="browse-folder__title">
            {role === "source" ? (
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
          {includeMode ? (
            <p className="browse-folder__include-hint">
              Browse freely to the folder you want; Confirm uses this folder (or
              drive) as the source root. You can check folders and files. Leave
              items unchecked to include everything under it, or narrow the
              selection (double-click opens a folder). After you start checking,
              unselected branches show as skipped.
            </p>
          ) : !isRootPicker && role === "destination" ? (
            <p className="browse-folder__include-hint">
              {destRootReviewMode
                ? "Review how this destination lines up with your source root. Checks show names that already exist on source at the same relative path (read-only). Double-click opens a destination folder. Confirm when ready."
                : prepareDestinationRoot
                  ? "Browse to the destination folder that should receive your source root, then Select. If it already has contents, you will review relative matches next. An empty folder is confirmed immediately."
                  : "Select uses the folder you are in as the destination root. Open a location, then Select without picking children to use that root as-is (double-click opens a folder)."}
            </p>
          ) : null}
        </header>

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
                        const alignIdx = destAlignRootId
                          ? breadcrumbs.findIndex((b) => b.path === destAlignRootId)
                          : -1;
                        if (alignIdx >= 0 && index < alignIdx) {
                          setDestAlignRootId(null);
                        }
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
        <div className="browse-folder__list-container" style={densityStyle}>
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
                roots.map((root) => (
                  <button
                    key={root.id}
                    type="button"
                    className="browse-folder__item browse-folder__item--drive"
                    onClick={() => handleRootSelect(root)}
                  >
                    <div className="browse-folder__item-icon">
                      <Cloud size={32} />
                    </div>
                    <div className="browse-folder__item-info">
                      <div className="browse-folder__item-name">{root.displayName}</div>
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
                ))
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
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={() => void handleSelectRoot()}
                disabled={selectedRootForbidden || includeSubmitting}
                title={selectedRootForbidden ? forbiddenRootReason : undefined}
              >
                {selectedRootForbidden
                  ? "Select a folder inside"
                  : includeSubmitting
                    ? "Saving…"
                    : role === "source"
                      ? "Confirm"
                      : destRootReviewMode
                        ? "Confirm destination"
                        : "Select"}
              </button>
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
