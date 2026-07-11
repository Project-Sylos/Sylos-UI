import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { ChevronRight, ArrowLeft, HardDrive, Network, Loader2, CircleAlert, Copy, Check, FolderPlus, Trash2 } from "lucide-react";

import "../App.css";
import { listDrives, listChildren, mountDrive as mountDriveApi, createBrowseFolder, deleteBrowseNodes } from "../api/services";
import { Drive, Folder, PaginationInfo } from "../types/services";
import { GlassSurfacePanel } from "../components/GlassSurfacePanel";
import PageBackButton from "../components/PageBackButton";
import BrowseDensityControl from "../components/BrowseDensityControl";
import BrowseFolderItemRow from "../components/BrowseFolderItemRow";
import ConfirmDialog from "../components/ConfirmDialog";
import NewFolderModal from "../components/NewFolderModal";
import BrowseContextMenu from "../components/BrowseContextMenu";
import FileBrowserPane, { BROWSE_SELECTION_HELP } from "../components/FileBrowserPane";
import { BrowseDensityProvider, useBrowseDensity } from "../contexts/BrowseDensityContext";
import { useAltTextSelect } from "../hooks/useAltTextSelect";
import { formatBytes } from "../utils/formatBytes";
import { getBrowseTrailFromFolder } from "../utils/migrationRoots";
import {
  buildDeleteConfirmMessage,
  BrowseSelectableItem,
  formatDeleteErrors,
  isMultiSelectModifier,
  useBrowseSelection,
} from "../hooks/useBrowseSelection";
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
  if (!isDriveMounted(drive)) {
    if (drive.totalBytes == null || drive.totalBytes <= 0) {
      return null;
    }
    return (
      <div className="browse-folder__drive-storage">
        <div className="browse-folder__drive-stats">
          {formatBytes(drive.totalBytes)} total capacity
        </div>
      </div>
    );
  }

  const total = drive.totalBytes ?? 0;
  if (total <= 0) return null;

  const free = drive.freeBytes ?? 0;
  const used = drive.usedBytes ?? Math.max(0, total - free);
  const usedPct = Math.min(100, Math.max(0, (used / total) * 100));

  return (
    <div className="browse-folder__drive-storage">
      <div className="browse-folder__drive-meter" role="presentation" aria-hidden="true">
        <div
          className="browse-folder__drive-meter-fill"
          style={{ width: `${usedPct}%` }}
        />
      </div>
      <div className="browse-folder__drive-stats">
        <span>{formatBytes(free)} free</span>
        <span className="browse-folder__drive-stats-sep" aria-hidden="true">·</span>
        <span>{formatBytes(used)} used</span>
        <span className="browse-folder__drive-stats-sep" aria-hidden="true">·</span>
        <span>{formatBytes(total)} total</span>
      </div>
    </div>
  );
}

function BrowseFolderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const serviceIdentifier = searchParams.get("serviceId") || "";
  const role = (searchParams.get("role") as "source" | "destination") || "source";
  const { densityStyle } = useBrowseDensity();

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
  const hideFilesToggleInitializedRef = useRef(false);
  const {
    selectedCount,
    selectedItems,
    isSelected,
    select: selectItem,
    clear: clearSelection,
  } = useBrowseSelection();

  const resumeFolder = (location.state as { resumeFolder?: Folder } | null)
    ?.resumeFolder;

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

    if (!resumeFolder) {
      resumeHandledRef.current = false;
      loadDrives();
    }
  }, [serviceIdentifier, resumeFolder]);

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

    // Build locationPath from breadcrumbs
    // Drive root is "/", each child is "/{childName}"
    let locationPath = "/";
    if (breadcrumbs.length > 1) {
      // Skip the first breadcrumb (drive), build path from children
      const childBreadcrumbs = breadcrumbs.slice(1);
      locationPath = "/" + childBreadcrumbs.map(c => c.name).join("/");
    } else if (breadcrumbs.length === 1) {
      // We're at the drive root, locationPath is "/"
      locationPath = "/";
    }

    // Normalize path to OS-native format (Windows uses backslashes)
    // If the path starts with a drive letter (e.g., "C:"), it's a Windows path
    // and should use backslashes instead of forward slashes
    let normalizedId = currentPath;
    if (normalizedId && /^[A-Za-z]:/.test(normalizedId)) {
      // Windows path - convert forward slashes to backslashes
      normalizedId = normalizedId.replace(/\//g, "\\");
    }

    // Normalize parent paths too
    let normalizedParentId: string | undefined = undefined;
    let normalizedParentPath: string | undefined = undefined;
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

    // Create folder object from current path
    // normalizedId is the absolute path in OS-native format (e.g., "C:\Users\golde\Documents")
    // This comes from the folder.ServiceID or drive.path from the API
    const currentBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
    const selectedFolder: Folder = {
      ServiceID: normalizedId, // Absolute path in OS-native format (e.g., "C:\Users\golde\Documents" or "C:\")
      Id: normalizedId,
      name: currentBreadcrumb.name,
      locationPath: locationPath, // Relative path (e.g., "/Users/golde/Documents" or "/" for drive root)
      parentId: normalizedParentId,
      parentPath: normalizedParentPath,
      lastUpdated: new Date().toISOString(),
      depthLevel: breadcrumbs.length - 1, // Depth from drive (drive is 0)
      type: "folder",
      browseTrail: breadcrumbs,
    };

    // Return to the matching service picker; it saves the root and returns to setup.
    if (role === "source") {
      navigate("/connect", {
        state: { selectedFolder, serviceId: serviceIdentifier, role: "source" },
      });
    } else if (role === "destination") {
      navigate("/destination", {
        state: { selectedFolder, serviceId: serviceIdentifier, role: "destination" },
      });
    } else {
      console.warn("Unknown role, navigating back:", role);
      navigate(-1 as any, { state: { selectedFolder, serviceId: serviceIdentifier, role } });
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
              pagination={pagination && pagination.total > 0 ? pagination : null}
              currentPage={currentPage}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
              listClassName={altTextSelect ? "browse-folder__list--text-select" : ""}
              helpTooltip={BROWSE_SELECTION_HELP}
              toolbarLeft={
                <>
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
              {folders.length === 0 && (hideFiles || files.length === 0) ? (
                <div className="path-review-list__empty">This folder is empty.</div>
              ) : (
                <>
                  {folders.map((folder, index) => {
                    const item: BrowseSelectableItem = {
                      id: folder.ServiceID,
                      type: "folder",
                      name: folder.name,
                    };
                    return (
                      <div
                        key={folder.ServiceID}
                        className={`browse-folder__item browse-folder__item--selectable${
                          isSelected(folder.ServiceID) ? " browse-folder__item--selected" : ""
                        }`}
                        onClick={(event) => {
                          if (isMultiSelectModifier(event) || event.shiftKey) {
                            handleItemSelect(item, index, event);
                            return;
                          }
                          handleFolderClick(folder, event);
                        }}
                        onContextMenu={(event) => handleItemContextMenu(event, item)}
                      >
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
                  {!hideFiles &&
                    files.map((file, fileIndex) => {
                    const index = folders.length + fileIndex;
                    const item: BrowseSelectableItem = {
                      id: file.ServiceID,
                      type: "file",
                      name: file.name,
                    };
                    return (
                      <div
                        key={file.ServiceID}
                        className={`browse-folder__item browse-folder__item--file browse-folder__item--selectable${
                          isSelected(file.ServiceID) ? " browse-folder__item--selected" : ""
                        }`}
                        onClick={(event) => {
                          if (isMultiSelectModifier(event) || event.shiftKey) {
                            handleItemSelect(item, index, event);
                          }
                        }}
                        onContextMenu={(event) => handleItemContextMenu(event, item)}
                      >
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
                className="glass-button"
                onClick={handleSelectRoot}
              >
                Select
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

