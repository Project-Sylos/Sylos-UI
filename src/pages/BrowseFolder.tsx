import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { FolderOpen, File, ChevronRight, ArrowLeft, HardDrive, Loader2, CircleAlert } from "lucide-react";

import "../App.css";
import { listDrives, listChildren, mountDrive as mountDriveApi } from "../api/services";
import { Drive, Folder, PaginationInfo } from "../types/services";
import { GlassSurfacePanel } from "../components/GlassSurfacePanel";
import PageBackButton from "../components/PageBackButton";
import ZoomControl from "../components/ZoomControl";
import { useZoom } from "../contexts/ZoomContext";
import { formatBytes } from "../utils/formatBytes";
import { getBrowseTrailFromFolder } from "../utils/migrationRoots";
import "./BrowseFolder.css";

interface BreadcrumbItem {
  path: string;
  name: string;
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

export default function BrowseFolder() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const serviceIdentifier = searchParams.get("serviceId") || "";
  const role = (searchParams.get("role") as "source" | "destination") || "source";
  const { zoomLevel } = useZoom();

  const [drives, setDrives] = useState<Drive[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<Folder[]>([]);
  const [hideFiles, setHideFiles] = useState(false);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDriveView, setIsDriveView] = useState(true);
  const [showUnmountedDrives, setShowUnmountedDrives] = useState(false);
  const [mountingDrive, setMountingDrive] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const resumeHandledRef = useRef(false);
  const hideFilesToggleInitializedRef = useRef(false);

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
    if (isDriveView || !currentPath || breadcrumbs.length === 0) {
      return;
    }
    const currentCrumb = breadcrumbs[breadcrumbs.length - 1];
    void loadChildren(currentCrumb.path, currentCrumb.name, false, { hideFiles });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideFiles]);

  const openAtFolder = async (folder: Folder) => {
    setLoading(true);
    setError(null);

    try {
      const breadcrumbsTrail = getBrowseTrailFromFolder(folder);
      const response = await listChildren(serviceIdentifier, folder.ServiceID, role, {
        offset: 0,
        limit: 100,
        ...(hideFiles ? { foldersOnly: true } : {}),
      });

      setFolders(response.folders || []);
      setFiles(hideFiles ? [] : response.files || []);
      setCurrentPath(folder.ServiceID);
      setIsDriveView(false);
      setBreadcrumbs(breadcrumbsTrail);
      setPagination(response.pagination ?? null);
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
      const offset = append && pagination ? pagination.offset + pagination.limit : 0;
      const response = await listChildren(serviceIdentifier, path, role, {
        offset,
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
        setCurrentPath(path);
        setIsDriveView(false);
        
        const newBreadcrumb: BreadcrumbItem = { path, name: name };
        setBreadcrumbs((prev) => {
          const index = prev.findIndex((b) => b.path === path);
          if (index >= 0) {
            return prev.slice(0, index + 1);
          }
          return [...prev, newBreadcrumb];
        });
      }
      
      if (response.pagination) {
        setPagination(response.pagination);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load folder contents."
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!currentPath || !pagination?.hasMore || loadingMore) {
      return;
    }
    
    const currentBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
    loadChildren(currentPath, currentBreadcrumb.name, true);
  };

  const handleDriveSelect = (drive: Drive) => {
    if (!isDriveMounted(drive)) return;
    loadChildren(drive.path, drive.name);
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

  const handleFolderClick = (folder: Folder) => {
    loadChildren(folder.ServiceID, folder.name);
  };

  const handleBack = () => {
    if (breadcrumbs.length > 1) {
      // Go back to previous breadcrumb
      const previous = breadcrumbs[breadcrumbs.length - 2];
      loadChildren(previous.path, previous.name);
    } else if (breadcrumbs.length === 1) {
      // Go back to drives view
      loadDrives();
    }
  };

  const handlePageBack = () => {
    navigate(role === "destination" ? "/destination" : "/connect");
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
                        loadChildren(crumb.path, crumb.name);
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
        </div>

        {/* Content area */}
        <div className="browse-folder__list-container" style={{ fontSize: `${zoomLevel}rem` }}>
          {isDriveView && !loading && unmountedDriveCount > 0 && (
            <div className="browse-folder__drive-toolbar">
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

          {!isDriveView && !loading && (
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
          {loading ? (
            <div className="browse-folder__empty">Loading...</div>
          ) : isDriveView ? (
            drives.length === 0 ? (
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
                        <HardDrive size={32} />
                      </div>
                      <div className="browse-folder__item-info">
                        <div className="browse-folder__item-name">{getDriveDisplayName(drive)}</div>
                        <div className="browse-folder__item-meta">{getDriveSubtitle(drive)}</div>
                        <DriveStorageInfo drive={drive} />
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
                      <HardDrive size={32} />
                    </div>
                    <div className="browse-folder__item-info">
                      <div className="browse-folder__item-name">{getDriveDisplayName(drive)}</div>
                      <div className="browse-folder__item-meta">{getDriveSubtitle(drive)}</div>
                      <DriveStorageInfo drive={drive} />
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
                    <div className="browse-folder__item-meta">{folder.ServiceID}</div>
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
                      <div className="browse-folder__item-meta">{file.ServiceID}</div>
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
                      Loading...
                    </>
                  ) : (
                    `Load More (${Math.max(
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
    </section>
  );
}

