import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FolderOpen, ChevronRight, ArrowLeft, HardDrive, Loader2 } from "lucide-react";

import "../App.css";
import { listDrives, listChildren } from "../api/services";
import { Drive, Folder, PaginationInfo } from "../types/services";
import "./BrowseFolder.css";

interface BreadcrumbItem {
  path: string;
  displayName: string;
}

export default function BrowseFolder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const serviceId = searchParams.get("serviceId") || "";
  const role = (searchParams.get("role") as "source" | "destination") || "source";

  const [drives, setDrives] = useState<Drive[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDriveView, setIsDriveView] = useState(true);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);

  useEffect(() => {
    if (!serviceId) {
      setError("Service ID is required");
      setLoading(false);
      return;
    }

    loadDrives();
  }, [serviceId]);

  const loadDrives = async () => {
    setLoading(true);
    setError(null);
    try {
      const drivesList = await listDrives(serviceId);
      setDrives(drivesList);
      setIsDriveView(true);
      setCurrentPath(null);
      setBreadcrumbs([]);
      setFolders([]);
      setPagination(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load drives."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadChildren = async (path: string, displayName: string, append = false) => {
    if (!append) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    
    try {
      const offset = append && pagination ? pagination.offset + pagination.limit : 0;
      const response = await listChildren(serviceId, path, role, {
        offset,
        limit: 100,
        foldersOnly: true, // Only show folders in the browser
      });
      
      if (append) {
        // Append to existing folders
        setFolders((prev) => [...prev, ...(response.folders || [])]);
      } else {
        // Replace folders
        setFolders(response.folders || []);
        setCurrentPath(path);
        setIsDriveView(false);
        
        // Update breadcrumbs
        const newBreadcrumb: BreadcrumbItem = { path, displayName };
        setBreadcrumbs((prev) => {
          // Find if this path is already in breadcrumbs (for back navigation)
          const index = prev.findIndex((b) => b.path === path);
          if (index >= 0) {
            // If found, truncate to this point
            return prev.slice(0, index + 1);
          }
          // Otherwise, add to the end
          return [...prev, newBreadcrumb];
        });
      }
      
      // Update pagination info
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
    loadChildren(currentPath, currentBreadcrumb.displayName, true);
  };

  const handleDriveSelect = (drive: Drive) => {
    loadChildren(drive.path, drive.displayName);
  };

  const handleFolderClick = (folder: Folder) => {
    loadChildren(folder.id, folder.displayName);
  };

  const handleBack = () => {
    if (breadcrumbs.length > 1) {
      // Go back to previous breadcrumb
      const previous = breadcrumbs[breadcrumbs.length - 2];
      loadChildren(previous.path, previous.displayName);
    } else if (breadcrumbs.length === 1) {
      // Go back to drives view
      loadDrives();
    } else {
      // Already at drives view, go back to previous page
      navigate(-1 as any);
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

    // Build locationPath from breadcrumbs
    // Drive root is "/", each child is "/{childName}"
    let locationPath = "/";
    if (breadcrumbs.length > 1) {
      // Skip the first breadcrumb (drive), build path from children
      const childBreadcrumbs = breadcrumbs.slice(1);
      locationPath = "/" + childBreadcrumbs.map(c => c.displayName).join("/");
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
    // This comes from the folder.id or drive.path from the API
    const currentBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
    const selectedFolder: Folder = {
      id: normalizedId, // Absolute path in OS-native format (e.g., "C:\Users\golde\Documents" or "C:\")
      displayName: currentBreadcrumb.displayName,
      locationPath: locationPath, // Relative path (e.g., "/Users/golde/Documents" or "/" for drive root)
      parentId: normalizedParentId,
      parentPath: normalizedParentPath,
      lastUpdated: new Date().toISOString(),
      depthLevel: breadcrumbs.length - 1, // Depth from drive (drive is 0)
      type: "folder",
    };

    console.log("Selected folder:", selectedFolder);
    console.log("Navigating to route with state:", { selectedFolder, serviceId, role });

    // Navigate to the appropriate route based on role
    // Pass role in state so the destination component knows how to handle it
    if (role === "source") {
      // After selecting source root, go to destination selection
      navigate("/destination", { state: { selectedFolder, serviceId, role: "source" } });
    } else if (role === "destination") {
      // After selecting destination root, stay on destination page (it will handle the migration start)
      navigate("/destination", { state: { selectedFolder, serviceId, role: "destination" } });
    } else {
      // Fallback to going back
      console.warn("Unknown role, navigating back:", role);
      navigate(-1 as any, { state: { selectedFolder, serviceId, role } });
    }
  };

  const canGoBack = breadcrumbs.length > 0 || !isDriveView;

  return (
    <section className="browse-folder">
      <div className="browse-folder__header">
        <h1 className="browse-folder__title">
          {role === "source" ? "Select Source Folder" : "Select Destination Folder"}
        </h1>
      </div>

      <div className="browse-folder__content">
        {error && (
          <div className="browse-folder__error">{error}</div>
        )}

        {/* Breadcrumbs with back button */}
        <div className="browse-folder__breadcrumbs-container">
          {canGoBack && (
            <button
              type="button"
              className="browse-folder__back-button"
              onClick={handleBack}
              title="Go back"
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
                        loadChildren(crumb.path, crumb.displayName);
                      }
                    }}
                    disabled={index === breadcrumbs.length - 1}
                  >
                    {crumb.displayName}
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
        <div className="browse-folder__list-container">
          <div className="browse-folder__list">
          {loading ? (
            <div className="browse-folder__empty">Loading...</div>
          ) : isDriveView ? (
            drives.length === 0 ? (
              <div className="browse-folder__empty">No drives available.</div>
            ) : (
              drives.map((drive) => (
                <button
                  key={drive.path}
                  type="button"
                  className="browse-folder__item"
                  onClick={() => handleDriveSelect(drive)}
                >
                  <div className="browse-folder__item-icon">
                    <HardDrive size={32} color="#ffffff" />
                  </div>
                  <div className="browse-folder__item-info">
                    <div className="browse-folder__item-name">{drive.displayName}</div>
                    <div className="browse-folder__item-meta">{drive.path}</div>
                  </div>
                  <ChevronRight size={20} className="browse-folder__item-arrow" />
                </button>
              ))
            )
          ) : folders.length === 0 ? (
            <div className="browse-folder__empty">This folder is empty.</div>
          ) : (
            <>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className="browse-folder__item"
                  onClick={() => handleFolderClick(folder)}
                >
                  <div className="browse-folder__item-icon">
                    <FolderOpen size={32} color="#ffffff" />
                  </div>
                  <div className="browse-folder__item-info">
                    <div className="browse-folder__item-name">{folder.displayName}</div>
                    <div className="browse-folder__item-meta">{folder.id}</div>
                  </div>
                  <ChevronRight size={20} className="browse-folder__item-arrow" />
                </button>
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
                    `Load More (${pagination.totalFolders - folders.length} remaining)`
                  )}
                </button>
              )}
            </>
          )}
          </div>
        </div>

        {/* Select button */}
        {!isDriveView && currentPath && (
          <div className="browse-folder__footer">
            <button
              type="button"
              className="glass-button"
              onClick={handleSelectRoot}
            >
              Select
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

