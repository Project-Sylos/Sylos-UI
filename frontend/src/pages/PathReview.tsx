import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  Folder,
  File,
  Copy,
} from "lucide-react";
import { getMigrationDiffs, updateItemCopyStatus, DiffItem } from "../api/services";
import ItemHoverCard from "../components/ItemHoverCard";
import Toast from "../components/Toast";
import "../App.css";
import "./PathReview.css";

interface BreadcrumbItem {
  path: string;
  displayName: string;
}

interface ToastState {
  message: string;
  type: "error" | "success" | "info";
}

export default function PathReview() {
  const { migrationId } = useParams<{ migrationId: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<DiffItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("/");
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<any>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (!migrationId) {
      navigate("/");
      return;
    }
    loadItems("/");
  }, [migrationId, navigate]);

  const loadItems = async (path: string, append = false) => {
    if (!migrationId) return;

    if (!append) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const offset = append && pagination ? pagination.offset + pagination.limit : 0;
      const response = await getMigrationDiffs(migrationId, {
        path,
        offset,
        limit: 100,
      });

      // Filter: only show items where inSrc is true
      // Filter out items with traversalStatus === "not_on_src" (only on dst)
      const filteredItems = [
        ...(response.folders || []),
        ...(response.files || []),
      ].filter(
        (item) =>
          item.inSrc === true &&
          item.traversalStatus !== "not_on_src"
      );

      // Initialize checkboxes: items only on src are checked by default
      // Items on both are unchecked by default (for files, folders are locked)
      if (!append) {
        const initialChecked = new Set<string>();
        filteredItems.forEach((item) => {
          if (item.inSrc && !item.inDst) {
            // Only on src - checked by default
            initialChecked.add(item.id);
          }
        });
        setCheckedItems(initialChecked);
      }

      if (append) {
        setItems((prev) => [...prev, ...filteredItems]);
      } else {
        setItems(filteredItems);
        setCurrentPath(path);
      }

      setPagination(response.pagination);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load path review data."
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleFolderClick = (item: DiffItem) => {
    const newBreadcrumb: BreadcrumbItem = {
      path: item.locationPath,
      displayName: item.displayName,
    };
    setBreadcrumbs((prev) => [...prev, newBreadcrumb]);
    loadItems(item.locationPath);
  };

  const handleBack = () => {
    if (breadcrumbs.length > 0) {
      const newBreadcrumbs = breadcrumbs.slice(0, -1);
      setBreadcrumbs(newBreadcrumbs);
      const targetPath =
        newBreadcrumbs.length > 0
          ? newBreadcrumbs[newBreadcrumbs.length - 1].path
          : "/";
      loadItems(targetPath);
    } else {
      loadItems("/");
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newBreadcrumbs);
    const targetPath =
      newBreadcrumbs.length > 0
        ? newBreadcrumbs[newBreadcrumbs.length - 1].path
        : "/";
    loadItems(targetPath);
  };

  const handleCheckboxChange = async (
    itemId: string,
    isFolder: boolean,
    inDst: boolean,
    currentChecked: boolean
  ) => {
    // Folders that exist on both are locked (greyed out, checked, not clickable)
    if (isFolder && inDst) {
      return;
    }

    if (!migrationId) return;

    // Optimistic update: immediately update UI
    const newChecked = !currentChecked;
    setCheckedItems((prev) => {
      const newSet = new Set(prev);
      if (newChecked) {
        newSet.add(itemId);
      } else {
        newSet.delete(itemId);
      }
      return newSet;
    });

    // Track pending update
    pendingUpdatesRef.current.set(itemId, newChecked);

    try {
      // Make API call to confirm the change
      await updateItemCopyStatus(migrationId, itemId, newChecked);
      
      // Success - remove from pending updates
      pendingUpdatesRef.current.delete(itemId);
    } catch (err) {
      // Revert optimistic update on error
      setCheckedItems((prev) => {
        const newSet = new Set(prev);
        if (currentChecked) {
          newSet.add(itemId);
        } else {
          newSet.delete(itemId);
        }
        return newSet;
      });

      pendingUpdatesRef.current.delete(itemId);

      // Show error toast
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to update item status. Please try again.";
      setToast({
        message: errorMessage,
        type: "error",
      });
    }
  };

  const handleItemHover = (itemId: string, event: React.MouseEvent) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setHoverPosition({ x: rect.right + 10, y: rect.top });
    setHoveredItemId(itemId);
  };

  const handleItemLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredItemId(null);
      setHoverPosition(null);
    }, 200);
  };

  const getItemColor = (item: DiffItem): string => {
    if (item.inSrc && item.inDst) {
      return "#00ffff"; // Cyan - both
    } else if (item.inSrc && !item.inDst) {
      return "#ff00ff"; // Magenta - only on src
    }
    return "#ffffff"; // Shouldn't happen due to filtering
  };

  const handleStartCopying = () => {
    // TODO: Implement start copying logic
    // This should call an API endpoint to start the copy phase
    // Expected endpoint: POST /api/migrations/{migrationId}/start-copy
    console.log("Starting copy with checked items:", Array.from(checkedItems));
    setToast({
      message: "Copy phase will be implemented soon.",
      type: "info",
    });
  };

  const hoveredItem = items.find((item) => item.id === hoveredItemId);

  return (
    <section className="path-review">
      <button
        type="button"
        className="path-review__back"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft size={16} style={{ marginRight: "0.5rem" }} />
        Back
      </button>

      <div className="path-review__content">
        <header className="path-review__header">
          <h1>
            Path <span className="path-review__highlight">Review</span>
          </h1>
          <p className="path-review__summary">
            Review the folder structure and select which items to copy.
          </p>
        </header>

        {error && <div className="path-review__error">{error}</div>}

        {/* Breadcrumbs */}
        <div className="path-review__breadcrumbs-container">
          {breadcrumbs.length > 0 && (
            <button
              type="button"
              className="path-review__back-button"
              onClick={handleBack}
              title="Go back"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="path-review__breadcrumbs">
            <button
              type="button"
              className="path-review__breadcrumb-link"
              onClick={() => {
                setBreadcrumbs([]);
                loadItems("/");
              }}
              disabled={breadcrumbs.length === 0}
            >
              Root
            </button>
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.path} className="path-review__breadcrumb">
                <ChevronRight size={16} className="path-review__breadcrumb-separator" />
                <button
                  type="button"
                  className="path-review__breadcrumb-link"
                  onClick={() => handleBreadcrumbClick(index)}
                  disabled={index === breadcrumbs.length - 1}
                >
                  {crumb.displayName}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Items List */}
        <div className="path-review__list-container">
          <div className="path-review__list">
            {loading ? (
              <div className="path-review__empty">Loading...</div>
            ) : items.length === 0 ? (
              <div className="path-review__empty">This folder is empty.</div>
            ) : (
              <>
                {items.map((item) => {
                  const isChecked = checkedItems.has(item.id);
                  const isFolder = item.type === "folder";
                  const isLocked = isFolder && item.inDst;
                  const itemColor = getItemColor(item);

                  return (
                    <div
                      key={item.id}
                      className="path-review__item"
                      onMouseEnter={(e) => handleItemHover(item.id, e)}
                      onMouseLeave={handleItemLeave}
                    >
                      <div className="path-review__item-checkbox-container">
                        <input
                          type="checkbox"
                          className="path-review__item-checkbox"
                          checked={isChecked || isLocked}
                          disabled={isLocked}
                          onChange={() =>
                            handleCheckboxChange(item.id, isFolder, item.inDst, isChecked)
                          }
                        />
                        {isLocked && (
                          <div className="path-review__item-lock-indicator" />
                        )}
                      </div>

                      <div
                        className="path-review__item-icon"
                        style={{ color: itemColor }}
                      >
                        {isFolder ? (
                          <Folder size={24} />
                        ) : (
                          <File size={24} />
                        )}
                      </div>

                      <div
                        className="path-review__item-info"
                        onClick={() => isFolder && handleFolderClick(item)}
                        style={{ cursor: isFolder ? "pointer" : "default" }}
                      >
                        <div className="path-review__item-name">{item.displayName}</div>
                        {!isFolder && item.size !== undefined && (
                          <div className="path-review__item-meta">
                            {(item.size / 1024 / 1024).toFixed(2)} MB
                          </div>
                        )}
                      </div>

                      {isFolder && (
                        <ChevronRight
                          size={20}
                          className="path-review__item-arrow"
                        />
                      )}
                    </div>
                  );
                })}

                {pagination?.hasMore && (
                  <button
                    type="button"
                    className="path-review__load-more"
                    onClick={() => loadItems(currentPath, true)}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading..." : "Load More"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Hover Card */}
        {hoveredItem && hoverPosition && (
          <ItemHoverCard
            item={hoveredItem}
            position={hoverPosition}
            onClose={() => {
              setHoveredItemId(null);
              setHoverPosition(null);
            }}
          />
        )}

        {/* Start Copying Button */}
        <div className="path-review__footer">
          <button
            type="button"
            className="glass-button"
            onClick={handleStartCopying}
          >
            <Copy size={20} style={{ marginRight: "0.5rem" }} />
            Start Copying
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </section>
  );
}

