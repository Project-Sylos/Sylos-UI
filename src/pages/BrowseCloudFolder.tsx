import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  Cloud,
  File,
  FolderOpen,
  Loader2,
  RefreshCw,
} from "lucide-react";

import "../App.css";
import {
  listCloudChildren,
  listCloudRoots,
} from "../api/providers";
import { GlassSurfacePanel } from "../components/GlassSurfacePanel";
import PageBackButton from "../components/PageBackButton";
import ZoomControl from "../components/ZoomControl";
import { useZoom } from "../contexts/ZoomContext";
import { useCloudConnectionGuard } from "../hooks/useCloudConnectionGuard";
import { CloudRoot } from "../types/providers";
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
    default:
      return rootType.replace(/_/g, " ");
  }
}

function folderFromCloudRoot(root: CloudRoot): Folder {
  const isSharedDrive = root.rootType === "shared_drive";
  const isSharedWithMe = root.rootType === "shared_with_me";

  return {
    ServiceID: root.id,
    Id: root.id,
    name: root.displayName,
    locationPath: "/",
    parentId: isSharedDrive || isSharedWithMe ? undefined : "root",
    parentPath: isSharedDrive || isSharedWithMe ? undefined : "/",
    type: isSharedDrive
      ? "shared_drive"
      : isSharedWithMe
        ? "shared_with_me"
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

export default function BrowseCloudFolder() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { zoomLevel } = useZoom();

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);

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
    // Guard already verified the connection; do not call recheck here — that
    // toggles checkingConnection and would re-trigger this effect in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, connectionId, serviceId, resumeFolder, connectionValid]);

  useEffect(() => {
    if (!hideFilesToggleInitializedRef.current) {
      hideFilesToggleInitializedRef.current = true;
      return;
    }
    if (isRootPicker || !activeRoot || !currentIdentifier || breadcrumbs.length === 0) {
      return;
    }
    void loadChildren(currentIdentifier, activeRoot, breadcrumbs, false, { hideFiles });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideFiles]);

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
          limit: 100,
          ...(hideFiles ? { foldersOnly: true } : {}),
        }
      );

      setActiveRoot(matchedRoot);
      setFolders(response.folders || []);
      setFiles(hideFiles ? [] : response.files || []);
      setBreadcrumbs(trail);
      setCurrentIdentifier(folder.ServiceID);
      setIsRootPicker(false);
      setPagination(response.pagination ?? null);
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
    append = false,
    options?: { hideFiles?: boolean }
  ) => {
    const omitFiles = options?.hideFiles ?? hideFiles;

    if (!append) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const nextOffset = append
        ? (pagination?.offset ?? 0) + (pagination?.limit ?? 100)
        : 0;

      const response = await listCloudChildren(providerId, connectionId, identifier, {
        offset: nextOffset,
        limit: 100,
        ...(omitFiles ? { foldersOnly: true } : {}),
      });

      if (append) {
        setFolders((prev) => [...prev, ...(response.folders || [])]);
        if (!omitFiles) {
          setFiles((prev) => [...prev, ...(response.files || [])]);
        }
      } else {
        setFolders(response.folders || []);
        setFiles(omitFiles ? [] : response.files || []);
      }
      setActiveRoot(root);
      setCurrentIdentifier(identifier);
      setIsRootPicker(false);
      setBreadcrumbs(trail);
      setPagination(response.pagination ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load folders.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleRootSelect = (root: CloudRoot) => {
    const trail = [{ path: root.id, name: root.displayName }];
    void loadChildren(root.id, root, trail);
  };

  const handleFolderClick = (folder: Folder) => {
    if (!activeRoot) return;

    const trail = [
      ...breadcrumbs,
      { path: folder.ServiceID, name: folder.name },
    ];
    void loadChildren(folder.ServiceID, activeRoot, trail);
  };

  const handleBack = () => {
    if (breadcrumbs.length > 1 && activeRoot) {
      const previous = breadcrumbs[breadcrumbs.length - 2];
      const trail = breadcrumbs.slice(0, -1);
      void loadChildren(previous.path, activeRoot, trail);
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
    }
  };

  const handleLoadMore = () => {
    if (!activeRoot || !currentIdentifier || !pagination?.hasMore || loadingMore) {
      return;
    }
    void loadChildren(currentIdentifier, activeRoot, breadcrumbs, true);
  };

  const handleSelectRoot = async () => {
    if (isRootPicker || !activeRoot || !currentIdentifier) {
      setError("Choose a cloud location and folder first.");
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

  const canGoBack = Boolean(activeRoot);
  const canSelect = !isRootPicker && Boolean(currentIdentifier);

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
              <ArrowLeft size={20 * zoomLevel} />
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
                      size={16 * zoomLevel}
                      className="browse-folder__breadcrumb-separator"
                      aria-hidden="true"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className="browse-folder__list-container"
          style={{ fontSize: `${zoomLevel}rem` }}
        >
          {!isRootPicker && !loading && connectionValid !== false && (
            <div className="browse-folder__drive-toolbar">
              <button
                type="button"
                className={`browse-folder__drive-toggle${
                  hideFiles ? " browse-folder__drive-toggle--active" : ""
                }`}
                onClick={() => setHideFiles((current) => !current)}
                title={
                  hideFiles
                    ? "Show files in this folder (files cannot be selected as a root)"
                    : "Hide files and show folders only"
                }
              >
                {hideFiles ? "Show files" : "Hide files"}
              </button>
            </div>
          )}

          <div className="browse-folder__list">
            {loading || checkingConnection ? (
              <div className="browse-folder__empty">Loading…</div>
            ) : connectionValid === false ? (
              <div className="browse-folder__empty">
                Reconnect your cloud account to browse folders.
              </div>
            ) : isRootPicker ? (
              roots.length === 0 ? (
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
                      </div>
                    </div>
                    <ChevronRight size={20} className="browse-folder__item-arrow" />
                  </button>
                ))
              )
            ) : folders.length === 0 && (hideFiles || files.length === 0) ? (
              <div className="browse-folder__empty">This folder is empty.</div>
            ) : (
              <>
                {folders.map((folder) => (
                  <button
                    key={folder.ServiceID}
                    type="button"
                    className="browse-folder__item"
                    onClick={() => handleFolderClick(folder)}
                  >
                    <div className="browse-folder__item-icon">
                      <FolderOpen size={32} />
                    </div>
                    <div className="browse-folder__item-info">
                      <div className="browse-folder__item-name">{folder.name}</div>
                      <div className="browse-folder__item-meta">{folder.locationPath}</div>
                    </div>
                    <ChevronRight size={20} className="browse-folder__item-arrow" />
                  </button>
                ))}
                {!hideFiles &&
                  files.map((file) => (
                    <div
                      key={file.ServiceID}
                      className="browse-folder__item browse-folder__item--file"
                      title="Files cannot be selected as a migration root"
                      aria-disabled="true"
                    >
                      <div className="browse-folder__item-icon">
                        <File size={32} />
                      </div>
                      <div className="browse-folder__item-info">
                        <div className="browse-folder__item-name">{file.name}</div>
                        <div className="browse-folder__item-meta">{file.locationPath}</div>
                      </div>
                    </div>
                  ))}
                {pagination?.hasMore && (
                  <button
                    type="button"
                    className="browse-folder__load-more"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 size={20} className="browse-folder__load-more-spinner" />
                        Loading…
                      </>
                    ) : (
                      `Load more (${Math.max(
                        0,
                        pagination.total - folders.length - (hideFiles ? 0 : files.length)
                      )} remaining)`
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="browse-folder__footer">
          <ZoomControl />
          <div className="browse-folder__footer-actions">
            {canSelect && connectionValid === true && (
              <button
                type="button"
                className="glass-button glass-button--progress-cta"
                onClick={() => void handleSelectRoot()}
              >
                Select
              </button>
            )}
          </div>
        </div>
      </GlassSurfacePanel>
    </section>
  );
}
