import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  CircleAlert,
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
import { getStorageInfo, setMigrationRoot, StorageInfo } from "../api/services";
import { GlassSurfacePanel } from "../components/GlassSurfacePanel";
import PageBackButton from "../components/PageBackButton";
import BrowseDensityControl from "../components/BrowseDensityControl";
import BrowseFolderItemRow from "../components/BrowseFolderItemRow";
import BrowseSortControl from "../components/BrowseSortControl";
import ConfirmDialog from "../components/ConfirmDialog";
import NewFolderModal from "../components/NewFolderModal";
import BrowseContextMenu from "../components/BrowseContextMenu";
import FileBrowserPane, { BROWSE_SELECTION_HELP } from "../components/FileBrowserPane";
import StorageMeter from "../components/StorageMeter";
import { BrowseDensityProvider, useBrowseDensity } from "../contexts/BrowseDensityContext";
import { useSelection } from "../context/SelectionContext";
import { useAltTextSelect } from "../hooks/useAltTextSelect";
import { useCloudConnectionGuard } from "../hooks/useCloudConnectionGuard";
import { useRootIncludeSelection } from "../hooks/useRootIncludeSelection";
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
import { DST_ONLY_BROWSE_HINT } from "../utils/browseDstOnlyHint";
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
    updateMigration,
    selectSource,
    selectDestination,
  } = useSelection();
  const rootInclude = useRootIncludeSelection();
  const [browseSort, setBrowseSort] = useState<BrowseSortState>(DEFAULT_BROWSE_SORT);
  const [includeSubmitting, setIncludeSubmitting] = useState(false);
  const [pendingRootFolder, setPendingRootFolder] = useState<Folder | null>(null);

  const resumeFolder = (location.state as { resumeFolder?: Folder } | null)
    ?.resumeFolder;
  const resumeHandledRef = useRef(false);
  const hideFilesToggleInitializedRef = useRef(false);
  const rootsLoadedKeyRef = useRef<string | null>(null);

  const [roots, setRoots] = useState<CloudRoot[]>([]);
  const [activeRoot, setActiveRoot] = useState<CloudRoot | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<Folder[]>([]);
  const [hideFiles, setHideFiles] = useState(false);
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
    selectedCount,
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
      ...(hideFiles
        ? []
        : files.map((file) => ({
            id: file.ServiceID,
            type: "file" as const,
            name: file.name,
          }))),
    ],
    [folders, files, hideFiles]
  );

  const sortedListing = useMemo(() => {
    const sourceFolders = rootInclude.active ? rootInclude.items.filter((i) => i.type !== "file") : folders;
    const sourceFiles = rootInclude.active
      ? rootInclude.items.filter((i) => i.type === "file")
      : files;
    return sortBrowseFoldersAndFiles(
      sourceFolders,
      hideFiles ? [] : sourceFiles,
      browseSort
    );
  }, [rootInclude.active, rootInclude.items, folders, files, hideFiles, browseSort]);

  const sourceNameSet = useMemo(() => {
    const names = migration.sourceRootChildNames ?? [];
    return new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean));
  }, [migration.sourceRootChildNames]);

  const needsRootIncludeMode =
    role === "source" || (role === "destination" && Boolean(migration.sourceRootPrepared));

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
    if (!hideFilesToggleInitializedRef.current) {
      hideFilesToggleInitializedRef.current = true;
      return;
    }
    if (!currentIdentifier || !activeRoot || isRootPicker) {
      return;
    }
    void loadChildren(currentIdentifier, activeRoot, breadcrumbs, { page: currentPage });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideFiles]);

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

  const loadRoots = async () => {
    const loadKey = `${providerId}:${connectionId}`;
    setLoading(true);
    setError(null);

    try {
      const rootList = await listCloudRoots(providerId, connectionId);
      rootsLoadedKeyRef.current = loadKey;
      setRoots(rootList);
      setIsRootPicker(true);
      setActiveRoot(null);
      setFolders([]);
      setFiles([]);
      setBreadcrumbs([]);
      setCurrentIdentifier(null);
      setPagination(null);
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
          ...(hideFiles ? { foldersOnly: true } : {}),
          ...rootListOptions(folder.ServiceID, matchedRoot, trail),
        }
      );

      setActiveRoot(matchedRoot);
      setFolders(response.folders || []);
      setFiles(hideFiles ? [] : response.files || []);
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
          ...(hideFiles ? { foldersOnly: true } : {}),
          ...rootListOptions(identifier, root, trail),
        }
      );

      setFolders(response.folders || []);
      setFiles(hideFiles ? [] : response.files || []);
      clearSelection();
      setActiveRoot(root);
      setCurrentIdentifier(identifier);
      setIsRootPicker(false);
      setBreadcrumbs(trail);
      setPagination(response.pagination ?? null);
      if (options?.page !== undefined) {
        setCurrentPage(options.page);
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
    if (rootInclude.active) {
      return;
    }
    if (event && (isMultiSelectModifier(event) || event.altKey || altTextSelect)) {
      return;
    }
    if (!activeRoot) return;

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
    const targets = selectedCount > 0 ? selectedItems : contextMenu ? [contextMenu.item] : [];
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
    if (breadcrumbs.length > 1 && activeRoot) {
      const previous = breadcrumbs[breadcrumbs.length - 2];
      const trail = breadcrumbs.slice(0, -1);
      setCurrentPage(0);
      void loadChildren(previous.path, activeRoot, trail, { page: 0 });
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
  }, [serviceId, connectionId, isRootPicker, activeRoot?.rootType, activeRoot?.driveId, role]);

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

    if (needsRootIncludeMode) {
      try {
        setLoading(true);
        setError(null);
        const children = await loadAllChildrenAt(currentIdentifier);
        if (role === "source" && children.length === 0) {
          setError(
            "You cannot use an empty folder as the source root. There is nothing to migrate."
          );
          return;
        }
        setPendingRootFolder(selectedFolder);
        rootInclude.begin(children);
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

  const handleCancelInclude = () => {
    rootInclude.cancel();
    setPendingRootFolder(null);
  };

  const handleConfirmInclude = async () => {
    if (!pendingRootFolder) return;
    const service = services.find((s) => s.id === serviceId);
    if (!service) {
      setError("Service not found.");
      return;
    }
    if (role === "source" && rootInclude.includedCount < 1) {
      setError("Keep at least one item included.");
      return;
    }

    const stillValid = await recheckConnection();
    if (!stillValid) {
      setError("Your cloud connection expired. Reconnect to continue.");
      return;
    }

    const children = rootInclude.toChildrenPayload({
      role,
      sourceChildNames: migration.sourceRootChildNames,
    });

    try {
      setIncludeSubmitting(true);
      setError(null);
      const response = await setMigrationRoot({
        migrationId: migration.migrationId,
        role,
        serviceId: service.id,
        connectionId,
        root: folderToApiRoot(pendingRootFolder),
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
              sourceRootChildNames: children.map((c) => c.name),
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
        selectSource(service, pendingRootFolder);
      } else {
        selectDestination(service, pendingRootFolder);
      }
      rootInclude.cancel();
      setPendingRootFolder(null);
      navigate("/summary");
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

  const canGoBack = Boolean(activeRoot);
  const canSelect = !isRootPicker && Boolean(currentIdentifier);
  const selectedRootForbidden =
    breadcrumbs.length <= 1 && activeRoot?.migrationRootForbidden === true;
  const forbiddenRootReason =
    activeRoot?.migrationRootForbiddenReason ??
    "This virtual location cannot be used as a migration root. Select a folder inside it.";

  return (
    <section className="browse-folder">
      <GlassSurfacePanel className="browse-folder__content">
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
            {rootInclude.active ? (
              role === "source" ? (
                <>
                  Choose what to include from this{" "}
                  <span className="browse-folder__highlight--magenta">source</span>{" "}
                  root
                </>
              ) : (
                <>
                  Review{" "}
                  <span className="browse-folder__highlight--cyan">destination</span>{" "}
                  root children
                </>
              )
            ) : role === "source" ? (
              <>
                Select your{" "}
                <span className="browse-folder__highlight--magenta">source</span>{" "}
                folder
              </>
            ) : (
              <>
                Select your{" "}
                <span className="browse-folder__highlight--cyan">destination</span>{" "}
                folder
              </>
            )}
          </h1>
          {rootInclude.active && role === "source" && (
            <p className="browse-folder__include-hint">
              Everything is included by default. Uncheck folders to skip their
              subtrees, or uncheck files to leave them discovered but excluded from copy.
            </p>
          )}
          {rootInclude.active && role === "destination" && migration.sourceRootPrepared && (
            <p className="browse-folder__include-hint">
              Items that exist only on the destination are muted; their subtrees
              will not be traversed.
            </p>
          )}
        </header>

        {error && <div className="browse-folder__error">{error}</div>}

        {!checkingConnection && connectionValid === false && (
          <div className="cloud-connection-issues">
            <p className="cloud-connection-issues__message">
              This cloud account is disconnected or expired.
            </p>
            <button
              type="button"
              className="glass-button cloud-connection-issues__reconnect"
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
                      if (rootInclude.active || !activeRoot) return;
                      if (index < breadcrumbs.length - 1) {
                        const trail = breadcrumbs.slice(0, index + 1);
                        setCurrentPage(0);
                        void loadChildren(crumb.path, activeRoot, trail, { page: 0 });
                      }
                    }}
                    disabled={rootInclude.active || index === breadcrumbs.length - 1}
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
                rootInclude.active
                  ? null
                  : pagination && (pagination.total ?? 0) > 0
                    ? pagination
                    : null
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
                  {rootInclude.active && role === "source" && (
                    <label className="browse-folder__select-all">
                      <input
                        type="checkbox"
                        checked={
                          rootInclude.items.length > 0 &&
                          rootInclude.includedCount === rootInclude.items.length
                        }
                        onChange={(event) => rootInclude.setAll(event.target.checked)}
                        aria-label="Include all"
                      />
                      Include all
                    </label>
                  )}
                  {!rootInclude.active && (
                    <>
                  <button
                    type="button"
                    className="browse-folder__drive-toggle"
                    onClick={() => setShowNewFolderModal(true)}
                    disabled={!currentIdentifier || mutationLoading}
                  >
                    <FolderPlus size={16} />
                    New folder
                  </button>
                  <button
                    type="button"
                    className={`browse-folder__drive-toggle${
                      hideFiles ? " browse-folder__drive-toggle--active" : ""
                    }`}
                    onClick={() => setHideFiles((current) => !current)}
                  >
                    {hideFiles ? "Show files" : "Hide files"}
                  </button>
                  {selectedCount > 0 && (
                    <button
                      type="button"
                      className="browse-folder__drive-toggle browse-folder__drive-toggle--danger"
                      onClick={() => requestDelete(selectedItems)}
                      disabled={mutationLoading}
                    >
                      <Trash2 size={16} />
                      Delete ({selectedCount})
                    </button>
                  )}
                    </>
                  )}
                </>
              }
            >
              {sortedListing.folders.length === 0 &&
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
                    const dstOnly =
                      rootInclude.active &&
                      role === "destination" &&
                      sourceNameSet.size > 0 &&
                      !sourceNameSet.has((folder.name || "").toLowerCase());
                    const included = rootInclude.isIncluded(folder.ServiceID);
                    return (
                      <div
                        key={folder.ServiceID}
                        className={`browse-folder__item browse-folder__item--selectable${
                          isSelected(folder.ServiceID) ? " browse-folder__item--selected" : ""
                        }${
                          rootInclude.active && role === "source" && !included
                            ? " browse-folder__item--unchecked"
                            : ""
                        }${dstOnly ? " browse-folder__item--destination-only" : ""}`}
                        onClick={(event) => {
                          if (rootInclude.active) {
                            if (role === "source") {
                              rootInclude.toggle(folder.ServiceID);
                            }
                            return;
                          }
                          if (isMultiSelectModifier(event) || event.shiftKey) {
                            handleItemSelect(item, index, event);
                            return;
                          }
                          handleFolderClick(folder, event);
                        }}
                        onContextMenu={(event) => {
                          if (rootInclude.active) return;
                          handleItemContextMenu(event, item);
                        }}
                      >
                        {rootInclude.active && role === "source" && (
                          <input
                            type="checkbox"
                            className="browse-folder__include-checkbox"
                            checked={included}
                            onChange={() => rootInclude.toggle(folder.ServiceID)}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Include ${folder.name}`}
                          />
                        )}
                        {dstOnly && (
                          <span
                            className="browse-folder__dst-only-icon"
                            title={DST_ONLY_BROWSE_HINT}
                            aria-label={DST_ONLY_BROWSE_HINT}
                            role="img"
                          >
                            <CircleAlert size={16} aria-hidden="true" />
                          </span>
                        )}
                        <BrowseFolderItemRow
                          name={folder.name}
                          path={folder.ServiceID}
                          type="folder"
                          showArrow={!rootInclude.active}
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
                    const dstOnly =
                      rootInclude.active &&
                      role === "destination" &&
                      sourceNameSet.size > 0 &&
                      !sourceNameSet.has((file.name || "").toLowerCase());
                    const included = rootInclude.isIncluded(file.ServiceID);
                    return (
                      <div
                        key={file.ServiceID}
                        className={`browse-folder__item browse-folder__item--file browse-folder__item--selectable${
                          isSelected(file.ServiceID) ? " browse-folder__item--selected" : ""
                        }${
                          rootInclude.active && role === "source" && !included
                            ? " browse-folder__item--unchecked"
                            : ""
                        }${dstOnly ? " browse-folder__item--destination-only" : ""}`}
                        onClick={(event) => {
                          if (rootInclude.active) {
                            if (role === "source") {
                              rootInclude.toggle(file.ServiceID);
                            }
                            return;
                          }
                          if (isMultiSelectModifier(event) || event.shiftKey) {
                            handleItemSelect(item, index, event);
                          }
                        }}
                        onContextMenu={(event) => {
                          if (rootInclude.active) return;
                          handleItemContextMenu(event, item);
                        }}
                      >
                        {rootInclude.active && role === "source" && (
                          <input
                            type="checkbox"
                            className="browse-folder__include-checkbox"
                            checked={included}
                            onChange={() => rootInclude.toggle(file.ServiceID)}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Include ${file.name}`}
                          />
                        )}
                        {dstOnly && (
                          <span
                            className="browse-folder__dst-only-icon"
                            title={DST_ONLY_BROWSE_HINT}
                            aria-label={DST_ONLY_BROWSE_HINT}
                            role="img"
                          >
                            <CircleAlert size={16} aria-hidden="true" />
                          </span>
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
            {rootInclude.active ? (
              <>
                <button
                  type="button"
                  className="glass-button"
                  onClick={handleCancelInclude}
                  disabled={includeSubmitting}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="glass-button glass-button--progress-cta"
                  onClick={() => void handleConfirmInclude()}
                  disabled={
                    includeSubmitting ||
                    (role === "source" && rootInclude.includedCount < 1) ||
                    rootInclude.items.length === 0
                  }
                >
                  {includeSubmitting
                    ? "Saving…"
                    : role === "source"
                      ? `Confirm (${rootInclude.includedCount} included)`
                      : "Confirm"}
                </button>
              </>
            ) : (
              canSelect &&
              connectionValid === true && (
                <button
                  type="button"
                  className="glass-button glass-button--progress-cta"
                  onClick={() => void handleSelectRoot()}
                  disabled={selectedRootForbidden}
                  title={selectedRootForbidden ? forbiddenRootReason : undefined}
                >
                  {selectedRootForbidden ? "Select a folder inside" : "Select"}
                </button>
              )
            )}
          </div>
        </div>
      </GlassSurfacePanel>

      {contextMenu && (
        <BrowseContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label={
            selectedCount > 0
              ? `Delete ${selectedCount} selected`
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
