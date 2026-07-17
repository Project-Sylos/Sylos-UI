import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
import { useCloudConnectionGuard } from "../hooks/useCloudConnectionGuard";
import {
  buildDeleteConfirmMessage,
  BrowseSelectableItem,
  formatDeleteErrors,
  isMultiSelectModifier,
  useBrowseSelection,
} from "../hooks/useBrowseSelection";
import { CloudRoot } from "../types/providers";

/** Pass rootType/driveId only when listing a virtual root from /roots. */
function rootListOptions(identifier: string, root: CloudRoot) {
  if (identifier !== root.id) {
    return {};
  }
  return {
    ...(root.rootType ? { rootType: root.rootType } : {}),
    ...(root.driveId ? { driveId: root.driveId } : {}),
  };
}
import { Folder, PaginationInfo } from "../types/services";
import { buildCloudConnectPath } from "../utils/cloudConnections";
import { getBrowseTrailFromFolder } from "../utils/migrationRoots";
import "./BrowseFolder.css";

interface BreadcrumbItem {
  path: string;
  name: string;
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
    default:
      return rootType.replace(/_/g, " ");
  }
}

function isNamespacedCloudRoot(root: CloudRoot): boolean {
  return (
    root.rootType === "shared_drive" ||
    root.rootType === "shared_with_me" ||
    root.rootType === "team_space" ||
    root.rootType === "team_folder" ||
    root.rootType === "shared_folder"
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

  return {
    ServiceID: currentIdentifier,
    Id: currentIdentifier,
    name: currentName,
    locationPath: childNames.length ? `/${childNames.join("/")}` : "/",
    parentId: breadcrumbs[breadcrumbs.length - 2].path,
    parentPath:
      childNames.length > 1 ? `/${childNames.slice(0, -1).join("/")}` : "/",
    type: "folder",
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

  const deleteConfirmCopy = useMemo(
    () => buildDeleteConfirmMessage(pendingDeleteItems),
    [pendingDeleteItems]
  );

  const cloudMutationContext = () => ({
    role,
    rootType: breadcrumbs.length <= 1 ? activeRoot?.rootType : undefined,
    driveId: activeRoot?.driveId,
  });

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
          ...rootListOptions(folder.ServiceID, matchedRoot),
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
          ...rootListOptions(identifier, root),
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
    if (event && (isMultiSelectModifier(event) || event.altKey || altTextSelect)) {
      return;
    }
    if (!activeRoot) return;

    const trail = [
      ...breadcrumbs,
      { path: folder.ServiceID, name: folder.name },
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

  const refreshCurrentFolder = () => {
    reloadCurrentFolder();
  };

  const handleSelectRoot = async () => {
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
            {canSelect && connectionValid === true && (
              <button
                type="button"
                className="glass-button glass-button--progress-cta"
                onClick={() => void handleSelectRoot()}
                disabled={selectedRootForbidden}
                title={selectedRootForbidden ? forbiddenRootReason : undefined}
              >
                {selectedRootForbidden ? "Select a folder inside" : "Select"}
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

export default function BrowseCloudFolder() {
  return (
    <BrowseDensityProvider>
      <BrowseCloudFolderPage />
    </BrowseDensityProvider>
  );
}
