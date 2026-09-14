import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router";
import { ChevronRight, ArrowLeft, HardDrive, Network, Loader2, CircleAlert, Copy, Check, FolderPlus, Trash2 } from "lucide-react";

import "../App.css";
import {
  listDrives,
  listChildren,
  mountDrive as mountDriveApi,
  createBrowseFolder,
  deleteBrowseNodes,
  setMigrationRoot,
  getHomeFolder,
  getMigrationStatus,
} from "../api/services";
import { Drive, Folder, PaginationInfo } from "../types/services";
import { MigrationRootChild } from "../types/migrations";
import { GlassSurfacePanel } from "../components/GlassSurfacePanel";
import PageBackButton from "../components/PageBackButton";
import BrowseDensityControl from "../components/BrowseDensityControl";
import BrowseFolderItemRow from "../components/BrowseFolderItemRow";
import BrowseSortControl from "../components/BrowseSortControl";
import BrowseIncludeControl, {
  BrowseParentExclusionBanner,
} from "../components/browse/BrowseIncludeControl";
import ConfirmDialog from "../components/ConfirmDialog";
import NewFolderModal from "../components/NewFolderModal";
import BrowseContextMenu from "../components/BrowseContextMenu";
import FileBrowserPane, { BROWSE_SELECTION_HELP } from "../components/FileBrowserPane";
import { BrowseDensityProvider, useBrowseDensity } from "../contexts/BrowseDensityContext";
import { useSelection } from "../context/SelectionContext";
import { useAltTextSelect } from "../hooks/useAltTextSelect";
import {
  ROOT_INCLUDE_PARENT,
  destinationRootChildrenPayload,
  includedSourceChildNames,
  useRootIncludeSelection,
} from "../hooks/useRootIncludeSelection";
import { parentCascadeReasons } from "../utils/browseFilterPreview";
import { getBrowseTrailFromFolder, folderToApiRoot } from "../utils/migrationRoots";
import {
  DEFAULT_BROWSE_SORT,
  BrowseSortState,
  sortBrowseFoldersAndFiles,
} from "../utils/browseSort";
import {
  clearAccountFields,
  clearEndpointCloudState,
} from "../utils/cloudAccountLabel";
import { isCloudServiceType } from "../utils/cloudProviders";
import {
  buildDeleteConfirmMessage,
  BrowseSelectableItem,
  formatDeleteErrors,
  isMultiSelectModifier,
  useBrowseSelection,
} from "../hooks/useBrowseSelection";
import StorageMeter from "../components/StorageMeter";
import "./BrowseFolder.css";

interface BreadcrumbItem {
  path: string;
  name: string;
}

function DriveTypeIcon({ driveType }: { driveType?: string }) {
  if (driveType === "network") {
    return <Network size={32} />;
  }
  return <HardDrive size={32} />;
}

function isDriveMounted(drive: Drive): boolean {
  return drive.mounted !== false;
}

function getDriveDisplayName(drive: Drive): string {
  const raw = drive.displayName ?? drive.name;
  return raw.replace(/\s*\(unmounted\)\s*/i, "").trim() || drive.path;
}

/** Label for the volume-root breadcrumb covering an absolute local path. */
function volumeRootLabel(absPath: string, drives: Drive[]): string | null {
  const normalized = absPath.replace(/\\/g, "/");
  if (/^[A-Za-z]:/.test(normalized)) {
    const letter = normalized.slice(0, 2).toLowerCase();
    const drive = drives.find((d) => {
      const p = (d.path || "").replace(/\\/g, "/").toLowerCase();
      return p === `${letter}/` || p === letter || p.startsWith(`${letter}/`);
    });
    return drive ? getDriveDisplayName(drive) : null;
  }
  const root = drives.find((d) => {
    const p = (d.mountPoint || d.path || "").replace(/\\/g, "/");
    return p === "/";
  });
  return root ? getDriveDisplayName(root) : null;
}

function getDriveSubtitle(drive: Drive): string {
  const displayName = getDriveDisplayName(drive);
  const parts: string[] = [];
  if (drive.label && drive.label !== displayName) parts.push(drive.label);
  if (drive.fileSystem) parts.push(drive.fileSystem);
  if (drive.mountPoint && drive.mountPoint !== drive.path) {
    parts.push(drive.mountPoint);
  }
  if (drive.device) parts.push(drive.device);
  return parts.join(" · ") || drive.path;
}

function DriveStorageInfo({ drive }: { drive: Drive }) {
  return (
    <StorageMeter
      available
      mounted={isDriveMounted(drive)}
      totalBytes={drive.totalBytes}
      freeBytes={drive.freeBytes}
      usedBytes={drive.usedBytes}
    />
  );
}

function BrowseFolderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const serviceIdentifier = searchParams.get("serviceId") || "";
  const role = (searchParams.get("role") as "source" | "destination") || "source";
  const { densityStyle } = useBrowseDensity();
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

  const [drives, setDrives] = useState<Drive[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<Folder[]>([]);
  const [hideFiles, setHideFiles] = useState(false);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDriveView, setIsDriveView] = useState(true);
  const [showUnmountedDrives, setShowUnmountedDrives] = useState(false);
  const [mountingDrive, setMountingDrive] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteItems, setPendingDeleteItems] = useState<BrowseSelectableItem[]>([]);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [mutationLoading, setMutationLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: BrowseSelectableItem;
  } | null>(null);
  const [pathCopied, setPathCopied] = useState(false);
  const altTextSelect = useAltTextSelect();
  const resumeHandledRef = useRef(false);
  const reconfirmHandledRef = useRef(false);
  const hideFilesToggleInitializedRef = useRef(false);

  const resumeFolder = (location.state as { resumeFolder?: Folder } | null)
    ?.resumeFolder;
  const reconfirmSourceInclude = Boolean(
    (location.state as { reconfirmSourceInclude?: boolean } | null)
      ?.reconfirmSourceInclude
  );
  const {
    selectedCount,
    selectedItems,
    isSelected,
    select: selectItem,
    clear: clearSelection,
  } = useBrowseSelection();

  const unmountedDriveCount = useMemo(
    () => drives.filter((drive) => drive.mounted === false).length,
    [drives]
  );

  const visibleDrives = useMemo(
    () =>
      showUnmountedDrives
        ? drives
        : drives.filter((drive) => isDriveMounted(drive)),
    [drives, showUnmountedDrives]
  );

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

  /** Source browse always shows include checkboxes once we are inside a folder. */
  const includeMode = role === "source" && !isDriveView;
  const parentKey = currentPath ?? ROOT_INCLUDE_PARENT;

  const sortedListing = useMemo(
    () =>
      sortBrowseFoldersAndFiles(
        folders,
        hideFiles ? [] : files,
        browseSort
      ),
    [folders, files, hideFiles, browseSort]
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

  const cascadePreviewKey = useMemo(() => {
    const ids = [...sortedListing.folders, ...sortedListing.files]
      .map((item) => item.ServiceID || item.Id || "")
      .join("\0");
    return `${parentKey}::${ids}`;
  }, [parentKey, sortedListing]);

  const cascadePreviewKeyRef = useRef("");

  const prepareDestinationRoot =
    role === "destination" && Boolean(migration.sourceRootPrepared);

  const loadAllChildrenAt = async (folderId: string): Promise<Folder[]> => {
    const pageSize = 200;
    const all: Folder[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const response = await listChildren(serviceIdentifier, folderId, role, {
        offset,
        limit: pageSize,
      });
      all.push(...(response.folders || []), ...(response.files || []));
      hasMore = Boolean(response.pagination?.hasMore);
      offset += pageSize;
      if (!response.pagination) break;
    }
    return all;
  };

  const deleteConfirmCopy = useMemo(
    () => buildDeleteConfirmMessage(pendingDeleteItems),
    [pendingDeleteItems]
  );

  useEffect(() => {
    if (!serviceIdentifier) {
      setError("Service ID is required");
      setLoading(false);
      return;
    }

    if (resumeFolder && !resumeHandledRef.current) {
      resumeHandledRef.current = true;
      void openAtFolder(resumeFolder);
      window.history.replaceState({}, document.title);
      return;
    }

    if (!resumeFolder && !reconfirmSourceInclude) {
      resumeHandledRef.current = false;
      void openAtHomeOrDrives();
    }
  }, [serviceIdentifier, resumeFolder, reconfirmSourceInclude]);

  useEffect(() => {
    if (!reconfirmSourceInclude || reconfirmHandledRef.current) {
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
        const rootId = rootFolder.ServiceID;
        rootInclude.restore(tree as MigrationRootChild[], rootId);

        const trail = getBrowseTrailFromFolder(rootFolder);
        setIsDriveView(false);
        setBreadcrumbs(trail);
        setCurrentPath(rootId);

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
  }, [reconfirmSourceInclude, migration.migrationId]);

  /** Cascade red-X hints when browsing under an unchecked parent folder. */
  useEffect(() => {
    if (!includeMode || reconfirmSourceInclude) return;
    const items = [...sortedListing.folders, ...sortedListing.files];
    if (items.length === 0) return;
    if (cascadePreviewKeyRef.current === cascadePreviewKey) return;
    cascadePreviewKeyRef.current = cascadePreviewKey;
    if (rootInclude.isFolderSkipped(parentKey)) {
      rootInclude.applyFilterPreview(parentKey, parentCascadeReasons(items));
    } else {
      rootInclude.applyFilterPreview(parentKey, {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeMode, reconfirmSourceInclude, cascadePreviewKey]);

  useEffect(() => {
    if (!hideFilesToggleInitializedRef.current) {
      hideFilesToggleInitializedRef.current = true;
      return;
    }
    if (!currentPath || breadcrumbs.length === 0 || isDriveView) {
      return;
    }
    const currentBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
    void loadChildren(currentBreadcrumb.path, currentBreadcrumb.name, {
      page: currentPage,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideFiles]);

  const openAtHomeOrDrives = async () => {
    try {
      const home = await getHomeFolder(serviceIdentifier);
      let folder: Folder = home;
      try {
        const drivesList = await listDrives(serviceIdentifier);
        setDrives(drivesList);
        const rootLabel = volumeRootLabel(home.ServiceID, drivesList);
        if (rootLabel) {
          const trail = getBrowseTrailFromFolder(home);
          if (trail.length > 0) {
            trail[0] = { ...trail[0], name: rootLabel };
            folder = { ...home, browseTrail: trail };
          }
        }
      } catch {
        // Drive labels are optional; open home anyway.
      }
      await openAtFolder(folder);
    } catch {
      await loadDrives();
    }
  };

  const openAtFolder = async (folder: Folder) => {
    setLoading(true);
    setError(null);

    try {
      const breadcrumbsTrail = getBrowseTrailFromFolder(folder);
      const response = await listChildren(serviceIdentifier, folder.ServiceID, role, {
        offset: 0,
        limit: itemsPerPage,
        ...(hideFiles ? { foldersOnly: true } : {}),
      });

      setFolders(response.folders || []);
      setFiles(hideFiles ? [] : response.files || []);
      setCurrentPath(folder.ServiceID);
      setIsDriveView(false);
      setBreadcrumbs(breadcrumbsTrail);
      setPagination(response.pagination ?? null);
      setCurrentPage(0);
      if (role === "source") {
        rootInclude.recordChildren(
          folder.ServiceID,
          [...(response.folders || []), ...(response.files || [])],
          { complete: !response.pagination?.hasMore }
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to resume folder location."
      );
      await loadDrives();
    } finally {
      setLoading(false);
    }
  };

  const loadDrives = async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const drivesList = await listDrives(serviceIdentifier);
      setDrives(drivesList);
      setIsDriveView(true);
      setCurrentPath(null);
      setBreadcrumbs([]);
      setFolders([]);
      setFiles([]);
      setPagination(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load drives."
      );
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  };

  const loadChildren = async (
    path: string,
    name: string,
    options?: { page?: number; limit?: number }
  ) => {
    const page = options?.page ?? currentPage;
    const limit = options?.limit ?? itemsPerPage;
    const offset = page * limit;

    setLoading(true);
    setError(null);

    try {
      const response = await listChildren(serviceIdentifier, path, role, {
        offset,
        limit,
        ...(hideFiles ? { foldersOnly: true } : {}),
      });

      setFolders(response.folders || []);
      setFiles(hideFiles ? [] : response.files || []);
      setCurrentPath(path);
      setIsDriveView(false);
      clearSelection();

      const newBreadcrumb: BreadcrumbItem = { path, name };
      setBreadcrumbs((prev) => {
        const index = prev.findIndex((b) => b.path === path);
        if (index >= 0) {
          return prev.slice(0, index + 1);
        }
        return [...prev, newBreadcrumb];
      });

      if (response.pagination) {
        setPagination(response.pagination);
      }
      if (options?.page !== undefined) {
        setCurrentPage(options.page);
      }
      if (role === "source") {
        rootInclude.recordChildren(
          path,
          [...(response.folders || []), ...(response.files || [])],
          { complete: !response.pagination?.hasMore }
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load folder contents."
      );
    } finally {
      setLoading(false);
    }
  };

  const reloadCurrentFolder = (page = currentPage, limit = itemsPerPage) => {
    if (!currentPath || breadcrumbs.length === 0) {
      return;
    }
    const currentBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
    void loadChildren(currentBreadcrumb.path, currentBreadcrumb.name, { page, limit });
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

  const handleDriveSelect = (drive: Drive) => {
    if (!isDriveMounted(drive)) return;
    setCurrentPage(0);
    loadChildren(drive.path, drive.name, { page: 0 });
  };

  const handleMountDrive = async (drive: Drive) => {
    const device = drive.device || drive.path;
    setMountingDrive(device);
    setError(null);
    try {
      await mountDriveApi(serviceIdentifier, device);
      await loadDrives({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mount drive.");
    } finally {
      setMountingDrive(null);
    }
  };

  const handleFolderClick = (folder: Folder, event?: React.MouseEvent) => {
    if (event && (isMultiSelectModifier(event) || event.altKey || altTextSelect)) {
      return;
    }
    if (folder.type === "file") {
      return;
    }

    setCurrentPage(0);
    loadChildren(folder.ServiceID, folder.name, { page: 0 });
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

  const handleBack = () => {
    if (breadcrumbs.length > 1) {
      const previous = breadcrumbs[breadcrumbs.length - 2];
      setCurrentPage(0);
      loadChildren(previous.path, previous.name, { page: 0 });
    } else if (breadcrumbs.length === 1) {
      loadDrives();
    }
  };

  const handleCopyPath = async () => {
    if (!currentPath) return;
    try {
      await navigator.clipboard.writeText(currentPath);
      setPathCopied(true);
      window.setTimeout(() => setPathCopied(false), 1500);
    } catch {
      setError("Could not copy path to clipboard.");
    }
  };

  const handlePageBack = () => {
    navigate(role === "destination" ? "/destination" : "/connect");
  };

  const refreshCurrentFolder = () => {
    reloadCurrentFolder();
  };

  const handleCreateFolder = async (name: string) => {
    if (!currentPath) {
      return;
    }
    setMutationLoading(true);
    setError(null);
    try {
      await createBrowseFolder(serviceIdentifier, {
        parentId: currentPath,
        name,
        role,
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
    if (!currentPath || pendingDeleteItems.length === 0) {
      return;
    }
    setMutationLoading(true);
    setError(null);
    try {
      const result = await deleteBrowseNodes(serviceIdentifier, {
        contextId: currentPath,
        role,
        nodes: pendingDeleteItems.map((item) => ({ id: item.id, type: item.type })),
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

  const buildSelectedFolder = (): Folder | null => {
    if (isDriveView || !currentPath || breadcrumbs.length === 0) {
      return null;
    }

    let locationPath = "/";
    if (breadcrumbs.length > 1) {
      const childBreadcrumbs = breadcrumbs.slice(1);
      locationPath = "/" + childBreadcrumbs.map((c) => c.name).join("/");
    }

    let normalizedId = currentPath;
    if (normalizedId && /^[A-Za-z]:/.test(normalizedId)) {
      normalizedId = normalizedId.replace(/\//g, "\\");
    }

    let normalizedParentId: string | undefined;
    let normalizedParentPath: string | undefined;
    if (breadcrumbs.length > 1) {
      const parentPath = breadcrumbs[breadcrumbs.length - 2].path;
      if (parentPath && /^[A-Za-z]:/.test(parentPath)) {
        normalizedParentId = parentPath.replace(/\//g, "\\");
        normalizedParentPath = normalizedParentId;
      } else {
        normalizedParentId = parentPath;
        normalizedParentPath = parentPath;
      }
    }

    const currentBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
    return {
      ServiceID: normalizedId,
      Id: normalizedId,
      name: currentBreadcrumb.name,
      locationPath,
      parentId: normalizedParentId,
      parentPath: normalizedParentPath,
      lastUpdated: new Date().toISOString(),
      depthLevel: breadcrumbs.length - 1,
      type: "folder",
      browseTrail: breadcrumbs,
    };
  };

  const handleSelectRoot = async () => {
    if (isDriveView) {
      setError("Please select a drive first.");
      return;
    }
    if (!currentPath) {
      setError("No path selected.");
      return;
    }
    if (breadcrumbs.length === 0) {
      setError("No folder selected.");
      return;
    }
    if (role === "source" && pagination && pagination.total === 0) {
      setError(
        "You cannot use an empty folder as the source root. There is nothing to migrate."
      );
      return;
    }

    const selectedFolder = buildSelectedFolder();
    if (!selectedFolder) {
      setError("No folder selected.");
      return;
    }

    if (role === "source") {
      // Key on currentPath: buildSelectedFolder may normalize separators.
      await confirmSourceRoot(selectedFolder, currentPath);
      return;
    }

    if (prepareDestinationRoot) {
      try {
        setLoading(true);
        setError(null);
        const children = await loadAllChildrenAt(selectedFolder.ServiceID);
        // Match intentional source includes by basename; non-matches are dstOnly.
        await commitPreparedRoot(
          selectedFolder,
          destinationRootChildrenPayload(children, migration.sourceRootChildNames)
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to list root children.");
      } finally {
        setLoading(false);
      }
      return;
    }

    navigate("/destination", {
      state: { selectedFolder, serviceId: serviceIdentifier, role: "destination" },
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

      if (rootInclude.includedCountUnder(rootId) < 1) {
        setError("Select at least one item to migrate.");
        return;
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
    const service = services.find((s) => s.id === serviceIdentifier);
    if (!service) {
      setError("Service not found.");
      return;
    }

    try {
      setIncludeSubmitting(true);
      setError(null);
      const response = await setMigrationRoot({
        migrationId: migration.migrationId,
        role,
        serviceId: service.id,
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

  const canGoBack = breadcrumbs.length > 0;

  return (
    <section className="browse-folder">
      <GlassSurfacePanel className="browse-folder__content">
        <PageBackButton
          onClick={handlePageBack}
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
          {includeMode && (
            <p className="browse-folder__include-hint">
              Check what you want to migrate. Selecting a folder includes everything
              under it until you open it and uncheck items. Confirm uses the folder
              you are in as the source root.
            </p>
          )}
        </header>

        {error && (
          <div className="browse-folder__error">{error}</div>
        )}

        {/* Breadcrumbs with back button */}
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
          {breadcrumbs.length > 0 && (
            <div className="browse-folder__breadcrumbs">
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.path} className="browse-folder__breadcrumb">
                  <button
                    type="button"
                    className="browse-folder__breadcrumb-link"
                    onClick={() => {
                      if (index < breadcrumbs.length - 1) {
                        setCurrentPage(0);
                        loadChildren(crumb.path, crumb.name, { page: 0 });
                      }
                    }}
                    disabled={index === breadcrumbs.length - 1}
                  >
                    {crumb.name}
                  </button>
                  {index < breadcrumbs.length - 1 && (
                    <ChevronRight size={16} className="browse-folder__breadcrumb-separator" />
                  )}
                </div>
              ))}
            </div>
          )}
          {!isDriveView && currentPath && (
            <button
              type="button"
              className="browse-folder__breadcrumb-copy"
              onClick={() => void handleCopyPath()}
              title="Copy path to clipboard"
              aria-label="Copy path to clipboard"
            >
              {pathCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          )}
        </div>

        {/* Content area */}
        {includeMode && (
          <BrowseParentExclusionBanner
            visible={rootInclude.isFolderSkipped(parentKey)}
          />
        )}
        <div className="browse-folder__list-container" style={densityStyle}>
          {isDriveView && !loading && unmountedDriveCount > 0 && (
            <div className="browse-folder__drive-toolbar browse-folder__drive-toolbar--left">
              <button
                type="button"
                className="browse-folder__drive-toggle"
                onClick={() => setShowUnmountedDrives((current) => !current)}
              >
                {showUnmountedDrives
                  ? `Hide unmounted drives (${unmountedDriveCount})`
                  : `Show unmounted drives (${unmountedDriveCount})`}
              </button>
            </div>
          )}

          {loading ? (
            <div className="browse-folder__empty">Loading...</div>
          ) : isDriveView ? (
            <div className="browse-folder__list">
              {drives.length === 0 ? (
                <div className="browse-folder__empty">No drives available.</div>
              ) : visibleDrives.length === 0 ? (
                <div className="browse-folder__empty">
                  No mounted drives available.
                  {unmountedDriveCount > 0
                    ? ` Show unmounted drives (${unmountedDriveCount}) to mount one.`
                    : null}
                </div>
              ) : (
                visibleDrives.map((drive) => {
                  const mounted = isDriveMounted(drive);
                  const device = drive.device || drive.path;
                  const isMounting = mountingDrive === device;

                  if (mounted) {
                    return (
                      <button
                        key={drive.path}
                        type="button"
                        className="browse-folder__item browse-folder__item--drive"
                        onClick={() => handleDriveSelect(drive)}
                      >
                        <div className="browse-folder__item-icon">
                          <DriveTypeIcon driveType={drive.type} />
                        </div>
                        <div className="browse-folder__item-info">
                          <div className="browse-folder__item-name">{getDriveDisplayName(drive)}</div>
                          <div className="browse-folder__item-meta">{getDriveSubtitle(drive)}</div>
                          <DriveStorageInfo drive={drive} />
                        </div>
                        <div
                          className="browse-folder__item-path-col browse-folder__item-path-col--drive"
                          title={drive.path}
                        >
                          {drive.path}
                        </div>
                        <ChevronRight size={20} className="browse-folder__item-arrow" />
                      </button>
                    );
                  }

                  return (
                    <div
                      key={drive.path}
                      className="browse-folder__item browse-folder__item--drive browse-folder__item--unmounted"
                    >
                      <span
                        className="browse-folder__drive-unmounted-indicator"
                        title="This drive is not mounted"
                        aria-label="This drive is not mounted"
                      >
                        <CircleAlert size={18} strokeWidth={2.25} />
                      </span>
                      <div className="browse-folder__item-icon">
                        <DriveTypeIcon driveType={drive.type} />
                      </div>
                      <div className="browse-folder__item-info">
                        <div className="browse-folder__item-name">{getDriveDisplayName(drive)}</div>
                        <div className="browse-folder__item-meta">{getDriveSubtitle(drive)}</div>
                        <DriveStorageInfo drive={drive} />
                      </div>
                      <div
                        className="browse-folder__item-path-col browse-folder__item-path-col--drive"
                        title={drive.path}
                      >
                        {drive.path}
                      </div>
                      <button
                        type="button"
                        className="browse-folder__drive-mount"
                        onClick={() => void handleMountDrive(drive)}
                        disabled={isMounting}
                        title="Mount this drive"
                      >
                        {isMounting ? (
                          <Loader2 size={18} className="browse-folder__spin" />
                        ) : (
                          "Mount"
                        )}
                      </button>
                    </div>
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
                            if (!currentPath) return;
                            try {
                              setLoading(true);
                              const all = await loadAllChildrenAt(currentPath);
                              rootInclude.setAllForFolder(currentPath, all, checked);
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
                    disabled={!currentPath || mutationLoading}
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
                    const included = rootInclude.isIncluded(
                      parentKey,
                      folder.ServiceID
                    );
                    const filterReason = rootInclude.filterReason(folder.ServiceID);
                    return (
                      <div
                        key={folder.ServiceID}
                        className={`browse-folder__item browse-folder__item--selectable${
                          isSelected(folder.ServiceID) ? " browse-folder__item--selected" : ""
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
                          if (isMultiSelectModifier(event) || event.shiftKey) {
                            handleItemSelect(item, index, event);
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
                              rootInclude.toggle(parentKey, folder.ServiceID)
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
                          isSelected(file.ServiceID) ? " browse-folder__item--selected" : ""
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
                          if (isMultiSelectModifier(event) || event.shiftKey) {
                            handleItemSelect(item, index, event);
                            return;
                          }
                          if (
                            includeMode &&
                            !(event.target as HTMLElement).closest(
                              'input[type="checkbox"], .browse-folder__filter-x'
                            )
                          ) {
                            rootInclude.toggle(parentKey, file.ServiceID);
                          }
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
                              rootInclude.toggle(parentKey, file.ServiceID)
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
          <div className="browse-folder__footer-actions">
            {!isDriveView && currentPath && (
              <button
                type="button"
                className="glass-button glass-button--progress-cta"
                onClick={() => void handleSelectRoot()}
                disabled={includeSubmitting}
              >
                {includeSubmitting
                  ? "Saving…"
                  : role === "source"
                    ? "Confirm"
                    : "Select"}
              </button>
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
    </section>
  );
}

export default function BrowseFolder() {
  return (
    <BrowseDensityProvider>
      <BrowseFolderPage />
    </BrowseDensityProvider>
  );
}

