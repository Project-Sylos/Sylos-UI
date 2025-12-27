import { useState, useEffect, useRef } from "react";
import {
  Folder,
  File,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowRight,
  X,
  ArrowUpDown,
  ExternalLink,
} from "lucide-react";
import {
  searchPathReviewItems,
  DiffItem,
  PaginationInfo,
  excludeNode,
  unexcludeNode,
  markNodeForRetry,
  unmarkNodeForRetry,
  bulkExcludeNodes,
  bulkUnexcludeNodes,
  getBackgroundTasks,
  BackgroundTask,
  PathReviewStats,
} from "../api/services";
import { useZoom } from "../contexts/ZoomContext";
import PathReviewStatusIcon from "../components/PathReviewStatusIcon";
import PathReviewLegend from "../components/PathReviewLegend";
import "./PathReview.css";

interface PathReviewListViewProps {
  migrationId: string;
  onItemUpdate?: () => void; // Callback for when items are updated (for stats refresh)
  onStatsChange?: (stats: PathReviewStats | null) => void; // Callback for when stats change
  onSelectionStatsWarning?: (hasWarning: boolean) => void; // Callback to show/hide selection warning
  onPaginationChange?: (pagination: PaginationInfo | null, itemsPerPage: number) => void; // Callback for pagination info
  onNavigateToTreeView?: (item: DiffItem) => void; // Callback to navigate to tree view and highlight item
}

export default function PathReviewListView({
  migrationId,
  onItemUpdate,
  onStatsChange,
  onSelectionStatsWarning,
  onPaginationChange,
  onNavigateToTreeView,
}: PathReviewListViewProps) {
  const { zoomLevel } = useZoom();
  const [items, setItems] = useState<DiffItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [explicitSelected, setExplicitSelected] = useState<Set<string>>(new Set());
  const [explicitSelectedPaths, setExplicitSelectedPaths] = useState<Map<string, string>>(new Map()); // itemId -> path (persists across pages)
  const [explicitSelectedItemData, setExplicitSelectedItemData] = useState<Map<string, DiffItem>>(new Map()); // itemId -> item data (for API calls)
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [sortField, setSortField] = useState<string | null>("path");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState<string>("");
  const [searchField, setSearchField] = useState<"path" | "name">("path"); // Field to search in (path or name)
  const [typeFilter, setTypeFilter] = useState<"both" | "folder" | "file">("both"); // Type filter: both, folder, or file
  const [depthFilter, setDepthFilter] = useState<string>(""); // Depth filter (as string for input)
  const [depthOperator, setDepthOperator] = useState<"equals" | "gt" | "gte" | "lt" | "lte">("equals"); // Depth operator
  const [sizeFilter, setSizeFilter] = useState<string>(""); // Size filter (as string for input, in bytes)
  const [sizeOperator, setSizeOperator] = useState<"equals" | "gt" | "gte" | "lt" | "lte">("equals"); // Size operator
  const [sizeDisplayUnit, setSizeDisplayUnit] = useState<"bytes" | "KB" | "MB" | "GB">("MB"); // Display unit for size input
  const [traversalStatusFilter, setTraversalStatusFilter] = useState<string>(""); // Traversal status filter (pending, failed, etc.)
  const [foldersOnly, setFoldersOnly] = useState(false); // Deprecated - using typeFilter instead
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [currentPage, setCurrentPage] = useState(0);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [activeTaskIds, setActiveTaskIds] = useState<Set<string>>(new Set());
  const [taskStatuses, setTaskStatuses] = useState<Map<string, BackgroundTask>>(new Map());
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [apiStats, setApiStats] = useState<PathReviewStats | null>(null);
  const [showItemsPerPageDropdown, setShowItemsPerPageDropdown] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const itemsPerPageDropdownRef = useRef<HTMLDivElement>(null);

  // Sanitize search query: trim and escape potentially dangerous characters
  const sanitizeSearchQuery = (query: string): string => {
    // Trim whitespace
    let sanitized = query.trim();
    
    // Remove or escape characters that could break JSON strings or cause issues
    // Since JSON.stringify will handle proper escaping, we mainly need to remove
    // control characters and null bytes that could cause issues
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
    
    return sanitized;
  };

  // Convert bytes to human-readable format
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(2)} ${sizes[i]}`;
  };

  // Convert human-readable size to bytes
  const parseFileSize = (value: string, unit: "bytes" | "KB" | "MB" | "GB"): number => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return 0;
    
    const multipliers: Record<"bytes" | "KB" | "MB" | "GB", number> = {
      bytes: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
    };
    
    return Math.round(numValue * multipliers[unit]);
  };

  // Convert bytes to specified unit for display
  const convertBytesToUnit = (bytes: number, unit: "bytes" | "KB" | "MB" | "GB"): string => {
    if (bytes === 0) return "0";
    
    const multipliers: Record<"bytes" | "KB" | "MB" | "GB", number> = {
      bytes: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
    };
    
    const value = bytes / multipliers[unit];
    return value.toFixed(2);
  };

  // Lightweight path-based data structure for quick lookups
  // Maps path -> item ID for current view
  const [pathToItemMap, setPathToItemMap] = useState<Map<string, string>>(new Map());
  const [itemIdToPathMap, setItemIdToPathMap] = useState<Map<string, string>>(new Map());

  // Update path maps when items change (for current page only)
  useEffect(() => {
    const pathMap = new Map<string, string>();
    const idMap = new Map<string, string>();
    
    items.forEach(item => {
      const path = item.locationPath || '';
      pathMap.set(path, item.id);
      idMap.set(item.id, path);
    });
    
    setPathToItemMap(pathMap);
    setItemIdToPathMap(idMap);
    
    // Update explicitSelectedPaths and explicitSelectedItemData for items on current page
    // Only add/update, don't remove (to preserve data from other pages)
    setExplicitSelectedPaths(prev => {
      const updated = new Map(prev);
      items.forEach(item => {
        if (explicitSelected.has(item.id)) {
          updated.set(item.id, item.locationPath || '');
        }
      });
      return updated;
    });
    
    setExplicitSelectedItemData(prev => {
      const updated = new Map(prev);
      items.forEach(item => {
        if (explicitSelected.has(item.id)) {
          updated.set(item.id, item);
        }
      });
      return updated;
    });
  }, [items]); // Remove explicitSelected dependency to avoid unnecessary updates

  // Helper: Check if a path is a child of any explicitly selected path
  const isChildOfSelectedPath = (itemPath: string, explicitSelectedPaths: Set<string>): boolean => {
    // Normalize item path: ensure it starts with / and has proper separators
    const normalizedItemPath = itemPath.startsWith('/') ? itemPath : '/' + itemPath;
    
    for (const selectedPath of explicitSelectedPaths) {
      // Normalize selected path
      const normalizedSelectedPath = selectedPath.startsWith('/') ? selectedPath : '/' + selectedPath;
      
      // Skip if it's the same path
      if (normalizedItemPath === normalizedSelectedPath) {
        continue;
      }
      
      // Check if itemPath is a child of selectedPath
      // A child path should start with the parent path followed by a / or be the parent itself
      // Example: "/Google" matches "/Google/GoogleUpdater" but not "/GoogleBackup"
      const parentWithSlash = normalizedSelectedPath.endsWith('/') 
        ? normalizedSelectedPath 
        : normalizedSelectedPath + '/';
      
      if (normalizedItemPath.startsWith(parentWithSlash)) {
        return true;
      }
    }
    
    return false;
  };

  // Helper: Get all items that are inherited (have an ancestor path in explicit selection)
  // Uses paths from all pages, not just current page
  const getInheritedSelections = (explicitSelected: Set<string>): Set<string> => {
    const inherited = new Set<string>();
    
    // Get all explicitly selected paths (from all pages, using persistent map)
    const selectedPaths = new Set<string>();
    explicitSelected.forEach(itemId => {
      const path = explicitSelectedPaths.get(itemId);
      if (path) {
        selectedPaths.add(path);
      }
    });
    
    // Check each item on current page to see if its path is a child of any selected path
    items.forEach(item => {
      if (!explicitSelected.has(item.id)) {
        const itemPath = item.locationPath || '';
        if (isChildOfSelectedPath(itemPath, selectedPaths)) {
          inherited.add(item.id);
        }
      }
    });
    
    return inherited;
  };

  // Normalize explicit selection: remove items whose ancestor paths are also selected
  // Uses paths from all pages
  const normalizeExplicitSelection = (explicitSelected: Set<string>): Set<string> => {
    const normalized = new Set<string>();
    const selectedPaths = new Set<string>();
    
    // First, collect all explicitly selected paths (from all pages)
    explicitSelected.forEach(itemId => {
      const path = explicitSelectedPaths.get(itemId);
      if (path) {
        selectedPaths.add(path);
      }
    });
    
    // Then, only keep items whose path is not a child of any other selected path
    explicitSelected.forEach(itemId => {
      const itemPath = explicitSelectedPaths.get(itemId);
      if (!itemPath) return;
      
      // Check if this path is a child of any other selected path
      let isChild = false;
      for (const selectedPath of selectedPaths) {
        if (itemPath !== selectedPath && isChildOfSelectedPath(itemPath, new Set([selectedPath]))) {
          isChild = true;
          break;
        }
      }
      
      // Only add if it's not a child of another selected path
      if (!isChild) {
        normalized.add(itemId);
      }
    });
    
    return normalized;
  };

  const loadItems = async (append = false) => {
    if (!migrationId) return;

    if (!append) {
      setLoading(true);
      setError(null);
    }

    try {
      const offset = currentPage * itemsPerPage;
      
      // Parse depth and size filters as numbers
      const parsedDepth = depthFilter.trim() !== "" ? parseInt(depthFilter, 10) : null;
      const parsedSizeBytes = sizeFilter.trim() !== "" ? parseFileSize(sizeFilter, sizeDisplayUnit) : null;
      
      const response = await searchPathReviewItems(migrationId, {
        offset,
        limit: itemsPerPage,
        sortField: sortField || undefined,
        sortDir: sortDir,
        query: activeSearchQuery || undefined,
        searchField: searchField,
        typeFilter: typeFilter,
        depthFilter: parsedDepth !== null && !isNaN(parsedDepth) && parsedDepth >= 0 ? parsedDepth : undefined,
        depthOperator: parsedDepth !== null && !isNaN(parsedDepth) && parsedDepth >= 0 ? depthOperator : undefined,
        sizeFilter: parsedSizeBytes !== null && parsedSizeBytes >= 0 ? parsedSizeBytes : undefined,
        sizeOperator: parsedSizeBytes !== null && parsedSizeBytes >= 0 ? sizeOperator : undefined,
        traversalStatusFilter: traversalStatusFilter || undefined,
      });

      if (append) {
        setItems((prev) => [...prev, ...response.items]);
      } else {
        setItems(response.items);
      }

      setPagination(response.pagination);
      setApiStats(response.stats);
      // Stats will be updated via useEffect hook when apiStats changes
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load path review items."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [migrationId, currentPage, itemsPerPage, sortField, sortDir, activeSearchQuery, searchField, typeFilter, depthFilter, depthOperator, sizeFilter, sizeOperator, sizeDisplayUnit, traversalStatusFilter]);

  // Close items per page dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showItemsPerPageDropdown &&
        itemsPerPageDropdownRef.current &&
        !itemsPerPageDropdownRef.current.contains(event.target as Node)
      ) {
        setShowItemsPerPageDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showItemsPerPageDropdown]);

  // Poll background tasks
  useEffect(() => {
    if (!migrationId || activeTaskIds.size === 0) return;

    const pollTasks = async () => {
      try {
        const tasks = await getBackgroundTasks(migrationId);
        const newTaskStatuses = new Map<string, BackgroundTask>();
        const stillActive = new Set<string>();

        tasks.forEach((task) => {
          if (activeTaskIds.has(task.id)) {
            newTaskStatuses.set(task.id, task);
            if (task.status === "running") {
              stillActive.add(task.id);
            } else if (task.status === "completed") {
              // Task completed successfully - reload items and stats
              loadItems();
              if (onItemUpdate) {
                onItemUpdate();
              }
            } else if (task.status === "failed") {
              // Task failed - could show error notification
              console.error("Background task failed:", task.error);
            }
          }
        });

        setTaskStatuses(newTaskStatuses);
        
        // Remove completed/failed tasks from active set
        if (stillActive.size !== activeTaskIds.size) {
          setActiveTaskIds(stillActive);
        }
      } catch (err) {
        console.error("Failed to poll background tasks:", err);
      }
    };

    // Poll immediately, then every second
    pollTasks();
    const interval = setInterval(pollTasks, 1000);

    return () => clearInterval(interval);
  }, [migrationId, activeTaskIds, onItemUpdate]);

  const handleSearch = () => {
    // Sanitize and set the active search query
    const sanitized = sanitizeSearchQuery(searchQuery);
    setActiveSearchQuery(sanitized);
    setCurrentPage(0); // Reset to first page when searching
    // loadItems will be called automatically via useEffect when activeSearchQuery changes
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setCurrentPage(0); // Reset to first page when sorting changes
    setShowSortMenu(false);
  };

  const handleSelectAll = () => {
    const allItemIds = new Set(items.map((item) => item.id));
    if (explicitSelected.size === items.length && 
        items.every(item => explicitSelected.has(item.id))) {
      // Deselect all items on current page
      setExplicitSelected(prev => {
        const updated = new Set(prev);
        items.forEach(item => updated.delete(item.id));
        return updated;
      });
      setExplicitSelectedPaths(prev => {
        const updated = new Map(prev);
        items.forEach(item => updated.delete(item.id));
        return updated;
      });
      setExplicitSelectedItemData(prev => {
        const updated = new Map(prev);
        items.forEach(item => updated.delete(item.id));
        return updated;
      });
      setLastSelectedIndex(null);
    } else {
      // Select all items on current page (merge with existing selections)
      setExplicitSelected(prev => {
        const updated = new Set(prev);
        items.forEach(item => updated.add(item.id));
        return updated;
      });
      setExplicitSelectedPaths(prev => {
        const updated = new Map(prev);
        items.forEach(item => updated.set(item.id, item.locationPath || ''));
        return updated;
      });
      setExplicitSelectedItemData(prev => {
        const updated = new Map(prev);
        items.forEach(item => updated.set(item.id, item));
        return updated;
      });
      setLastSelectedIndex(items.length > 0 ? items.length - 1 : null);
    }
  };

  const handleItemSelect = (itemId: string, itemIndex: number, event?: React.MouseEvent) => {
    const isShiftClick = event?.shiftKey && lastSelectedIndex !== null;
    const item = items.find(i => i.id === itemId);
    
    if (isShiftClick) {
      // Shift-click: select visual range
      const start = Math.min(lastSelectedIndex, itemIndex);
      const end = Math.max(lastSelectedIndex, itemIndex);
      const rangeItems = items.slice(start, end + 1);
      
      setExplicitSelected((prev) => {
        const newSet = new Set(prev);
        rangeItems.forEach(item => newSet.add(item.id));
        return newSet;
      });
      setExplicitSelectedPaths((prev) => {
        const updated = new Map(prev);
        rangeItems.forEach(item => updated.set(item.id, item.locationPath || ''));
        return updated;
      });
      setExplicitSelectedItemData((prev) => {
        const updated = new Map(prev);
        rangeItems.forEach(item => updated.set(item.id, item));
        return updated;
      });
    } else {
      // Regular click: toggle single item
      if (item) {
        setExplicitSelected((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(itemId)) {
            newSet.delete(itemId);
          } else {
            newSet.add(itemId);
          }
          return newSet;
        });
        setExplicitSelectedPaths((prev) => {
          const updated = new Map(prev);
          if (explicitSelected.has(itemId)) {
            updated.delete(itemId);
          } else {
            updated.set(itemId, item.locationPath || '');
          }
          return updated;
        });
        setExplicitSelectedItemData((prev) => {
          const updated = new Map(prev);
          if (explicitSelected.has(itemId)) {
            updated.delete(itemId);
          } else {
            updated.set(itemId, item);
          }
          return updated;
        });
      }
      setLastSelectedIndex(itemIndex);
    }
  };

  const handleCheckboxChange = async (
    item: DiffItem,
    currentChecked: boolean
  ) => {
    if (!migrationId) return;

    const isFolder = item.type === "folder";
    const existsOnBoth = item.inSrc && item.inDst;

    // Items that exist on both are locked (not clickable)
    if (existsOnBoth && isFolder) {
      return;
    }

    // Determine if we're excluding or unexcluding
    const isExcluding = currentChecked;
    const nodeULIDs: string[] = [];
    if (item.src?.id) {
      nodeULIDs.push(item.src.id);
    }
    if (item.dst?.id && (!item.src?.id || item.dst.id !== item.src.id)) {
      nodeULIDs.push(item.dst.id);
    }

    if (nodeULIDs.length === 0) {
      return;
    }

    try {
      const promises = nodeULIDs.map((nodeULID) =>
        isExcluding
          ? excludeNode(migrationId, nodeULID)
          : unexcludeNode(migrationId, nodeULID)
      );

      const results = await Promise.all(promises);
      const failed = results.filter((r) => !r.success);

      if (failed.length === 0) {
        // Reload items to reflect changes
        loadItems();
        if (onItemUpdate) {
          onItemUpdate();
        }
      }
    } catch (err) {
      console.error("Failed to update item:", err);
    }
  };

  const handleRetryClick = async (item: DiffItem) => {
    if (!migrationId) return;

    const nodeULIDs: string[] = [];
    if (item.src?.id) {
      nodeULIDs.push(item.src.id);
    }
    if (item.dst?.id && (!item.src?.id || item.dst.id !== item.src.id)) {
      nodeULIDs.push(item.dst.id);
    }

    if (nodeULIDs.length === 0) {
      return;
    }

    try {
      // For now, we only handle single node retry (bulk retry not implemented in API yet)
      const promises = nodeULIDs.map((nodeULID) =>
        markNodeForRetry(migrationId, nodeULID)
      );

      const results = await Promise.all(promises);
      const failed = results.filter((r) => !r.success);

      if (failed.length === 0) {
        // Reload items to reflect changes
        loadItems();
        if (onItemUpdate) {
          onItemUpdate();
        }
      }
    } catch (err) {
      console.error("Failed to mark item for retry:", err);
    }
  };


  // Determine item status (same logic as tree view)
  const getItemStatus = (item: DiffItem) => {
    const existsOnBoth = item.inSrc && item.inDst;
    const isExcluded =
      item.traversalStatus === "exclusion_explicit" ||
      item.traversalStatus === "exclusion_inherited";
    const isFailed = item.traversalStatus === "failed";
    const isPending =
      item.traversalStatus === "pending" && !isExcluded && !isFailed;

    return {
      isExcluded,
      isFailed,
      isPending,
      existsOnBoth,
      isChecked: !isExcluded && !existsOnBoth,
    };
  };

  // Update stats from API only (no selection-based stats)
  useEffect(() => {
    if (onStatsChange && apiStats) {
      onStatsChange(apiStats);
    }
    if (onSelectionStatsWarning) {
      onSelectionStatsWarning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiStats]);

  // Notify parent of pagination changes
  useEffect(() => {
    if (onPaginationChange) {
      onPaginationChange(pagination, itemsPerPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination, itemsPerPage]);


  const totalPages = pagination
    ? Math.ceil(pagination.total / itemsPerPage)
    : 0;

  return (
    <div 
      className="path-review-list"
      style={{ 
        '--zoom': zoomLevel,
      } as React.CSSProperties}
    >
      {/* Toolbar */}
      <div className="path-review-list__toolbar">
        <div className="path-review-list__select-all-wrapper">
          <input
            type="checkbox"
            checked={items.length > 0 && items.every(item => explicitSelected.has(item.id))}
            onChange={handleSelectAll}
            className="path-review-list__select-all-checkbox"
            title="Select All"
            aria-label="Select All"
          />
        </div>
        <div className="path-review-list__search-bar">
          <input
            type="text"
            className="path-review-list__search-input"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
          />
          <button
            ref={filterButtonRef}
            type="button"
            className="path-review-list__filter-button"
            onClick={() => setShowFilterMenu(true)}
            title="Filter"
            aria-label="Filter"
          >
            <Filter size={18} />
          </button>
          <button
            ref={sortButtonRef}
            type="button"
            className="path-review-list__filter-button"
            onClick={() => setShowSortMenu(true)}
            title="Sort"
            aria-label="Sort"
          >
            <ArrowUpDown size={18} />
          </button>
          {showFilterMenu && (
            <div className="path-review-list__filter-modal-overlay" onClick={() => setShowFilterMenu(false)}>
              <div ref={filterMenuRef} className="path-review-list__filter-modal" onClick={(e) => e.stopPropagation()}>
                <div className="path-review-list__filter-modal-header">
                  <h2 className="path-review-list__filter-modal-title">Filter</h2>
                  <button
                    type="button"
                    className="path-review-list__filter-modal-close"
                    onClick={() => setShowFilterMenu(false)}
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="path-review-list__filter-modal-content">
                {/* Search Field Toggle */}
                <div className="path-review-list__filter-menu-section">
                  <label className="path-review-list__filter-menu-label">Search In</label>
                  <div className="path-review-list__filter-menu-toggle">
                    <button
                      type="button"
                      className={`path-review-list__filter-menu-toggle-button ${searchField === "path" ? "path-review-list__filter-menu-toggle-button--active" : ""}`}
                      onClick={() => setSearchField("path")}
                    >
                      Path
                    </button>
                    <button
                      type="button"
                      className={`path-review-list__filter-menu-toggle-button ${searchField === "name" ? "path-review-list__filter-menu-toggle-button--active" : ""}`}
                      onClick={() => setSearchField("name")}
                    >
                      Name
                    </button>
                  </div>
                </div>

                {/* Type Filter */}
                <div className="path-review-list__filter-menu-section">
                  <label className="path-review-list__filter-menu-label">Type</label>
                  <div className="path-review-list__filter-menu-options">
                    {[
                      { value: "both" as const, label: "Both" },
                      { value: "folder" as const, label: "Folders" },
                      { value: "file" as const, label: "Files" },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        className={`path-review-list__filter-menu-option ${
                          typeFilter === value ? "path-review-list__filter-menu-option--active" : ""
                        }`}
                        onClick={() => {
                          setTypeFilter(value);
                          if (value === "folder") {
                            setSizeFilter(""); // Clear size filter when folders only
                          }
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Depth Filter */}
                <div className="path-review-list__filter-menu-section">
                  <label className="path-review-list__filter-menu-label" htmlFor="depth-filter">
                    Depth
                  </label>
                  <div className="path-review-list__filter-menu-numeric-controls">
                    <select
                      className="path-review-list__filter-menu-operator"
                      value={depthOperator}
                      onChange={(e) => setDepthOperator(e.target.value as "equals" | "gt" | "gte" | "lt" | "lte")}
                    >
                      <option value="equals">=</option>
                      <option value="gt">&gt;</option>
                      <option value="gte">≥</option>
                      <option value="lt">&lt;</option>
                      <option value="lte">≤</option>
                    </select>
                    <input
                      id="depth-filter"
                      type="number"
                      className="path-review-list__filter-menu-input"
                      placeholder="Any"
                      value={depthFilter}
                      onChange={(e) => setDepthFilter(e.target.value)}
                      min="0"
                    />
                  </div>
                </div>

                {/* Size Filter */}
                <div className="path-review-list__filter-menu-section">
                  <label className="path-review-list__filter-menu-label" htmlFor="size-filter">
                    File Size
                  </label>
                  <div className="path-review-list__filter-menu-numeric-controls">
                    <select
                      className="path-review-list__filter-menu-operator"
                      value={sizeOperator}
                      onChange={(e) => setSizeOperator(e.target.value as "equals" | "gt" | "gte" | "lt" | "lte")}
                      disabled={typeFilter === "folder"}
                    >
                      <option value="equals">=</option>
                      <option value="gt">&gt;</option>
                      <option value="gte">≥</option>
                      <option value="lt">&lt;</option>
                      <option value="lte">≤</option>
                    </select>
                    <input
                      id="size-filter"
                      type="number"
                      className="path-review-list__filter-menu-input"
                      placeholder="Any"
                      value={sizeFilter}
                      onChange={(e) => setSizeFilter(e.target.value)}
                      min="0"
                      step="0.01"
                      disabled={typeFilter === "folder"}
                    />
                    <select
                      className="path-review-list__filter-menu-unit"
                      value={sizeDisplayUnit}
                      onChange={(e) => setSizeDisplayUnit(e.target.value as "bytes" | "KB" | "MB" | "GB")}
                      disabled={typeFilter === "folder"}
                    >
                      <option value="bytes">Bytes</option>
                      <option value="KB">KB</option>
                      <option value="MB">MB</option>
                      <option value="GB">GB</option>
                    </select>
                  </div>
                </div>

                {/* Traversal Status Filter */}
                <div className="path-review-list__filter-menu-section">
                  <label className="path-review-list__filter-menu-label" htmlFor="status-filter">
                    Status
                  </label>
                  <select
                    id="status-filter"
                    className="path-review-list__filter-menu-select"
                    value={traversalStatusFilter}
                    onChange={(e) => setTraversalStatusFilter(e.target.value)}
                  >
                    <option value="">All</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="NotOnSrc">Destination Only</option>
                    <option value="excluded">Excluded</option>
                  </select>
                </div>

                </div>
                <div className="path-review-list__filter-modal-footer">
                  <button
                    type="button"
                    className="path-review-list__filter-modal-button path-review-list__filter-modal-button--secondary"
                    onClick={() => {
                      setSearchField("path");
                      setTypeFilter("both");
                      setDepthFilter("");
                      setDepthOperator("equals");
                      setSizeFilter("");
                      setSizeOperator("equals");
                      setSizeDisplayUnit("MB");
                      setTraversalStatusFilter("");
                      setCurrentPage(0);
                    }}
                  >
                    Clear All Filters
                  </button>
                  <button
                    type="button"
                    className="path-review-list__filter-modal-button path-review-list__filter-modal-button--primary"
                    onClick={() => setShowFilterMenu(false)}
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </div>
          )}
          {showSortMenu && (
            <div className="path-review-list__sort-modal-overlay" onClick={() => setShowSortMenu(false)}>
              <div ref={sortMenuRef} className="path-review-list__sort-modal" onClick={(e) => e.stopPropagation()}>
                <div className="path-review-list__sort-modal-header">
                  <h2 className="path-review-list__sort-modal-title">Sort By</h2>
                  <button
                    type="button"
                    className="path-review-list__sort-modal-close"
                    onClick={() => setShowSortMenu(false)}
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="path-review-list__sort-modal-content">
                  <div className="path-review-list__filter-menu-options">
                    {[
                      { value: "name", label: "Name" },
                      { value: "path", label: "Path" },
                      { value: "depth", label: "Depth" },
                      { value: "size", label: "Size" },
                      { value: "type", label: "Type" },
                      { value: "traversalStatus", label: "Status" },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        className={`path-review-list__filter-menu-option ${
                          sortField === value ? "path-review-list__filter-menu-option--active" : ""
                        }`}
                        onClick={() => handleSort(value)}
                      >
                        {label}
                        {sortField === value && (
                          <span className="path-review-list__filter-menu-direction">
                            {sortDir === "asc" ? (
                              <ChevronUp size={14} />
                            ) : (
                              <ChevronDown size={14} />
                            )}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="path-review-list__sort-modal-footer">
                  {sortField && (
                    <button
                      type="button"
                      className="path-review-list__filter-modal-button path-review-list__filter-modal-button--secondary"
                      onClick={() => {
                        setSortField(null);
                        setSortDir("asc");
                        setCurrentPage(0);
                        setShowSortMenu(false);
                      }}
                    >
                      Clear Sort
                    </button>
                  )}
                  <button
                    type="button"
                    className="path-review-list__filter-modal-button path-review-list__filter-modal-button--primary"
                    onClick={() => setShowSortMenu(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
          <button
            type="button"
            className="path-review-list__search-button"
            onClick={handleSearch}
            title="Search"
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </div>

      {/* Background Task Status */}
      {activeTaskIds.size > 0 && (
        <div className="path-review-list__task-status">
          {Array.from(activeTaskIds).map((taskId) => {
            const task = taskStatuses.get(taskId);
            return (
              <div key={taskId} className="path-review-list__task-item">
                {task?.status === "running" && (
                  <span>Processing bulk operation...</span>
                )}
                {task?.status === "completed" && (
                  <span>Bulk operation completed successfully</span>
                )}
                {task?.status === "failed" && (
                  <span className="path-review-list__task-error">
                    Bulk operation failed: {task.error || "Unknown error"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk Actions */}
      {(explicitSelected.size > 0 || getInheritedSelections(explicitSelected).size > 0) && (
        <div className="path-review-list__bulk-actions">
          <span className="path-review-list__bulk-count">
            {explicitSelected.size + getInheritedSelections(explicitSelected).size} item{(explicitSelected.size + getInheritedSelections(explicitSelected).size) !== 1 ? "s" : ""}{" "}
            selected
          </span>
          <div className="path-review-list__bulk-buttons">
            <button
              type="button"
              className="glass-button glass-button--small"
              onClick={async () => {
                if (!migrationId || explicitSelected.size === 0 || bulkLoading) return;
                
                setBulkLoading(true);
                try {
                  // Normalize selection: remove items whose ancestor paths are also selected
                  const normalized = normalizeExplicitSelection(explicitSelected);
                  
                  // Get node IDs for normalized selected items from all pages
                  const nodeIDs: string[] = [];
                  normalized.forEach((itemId) => {
                    const item = explicitSelectedItemData.get(itemId);
                    if (item) {
                      if (item.src?.id) {
                        nodeIDs.push(item.src.id);
                      }
                      if (item.dst?.id && (!item.src?.id || item.dst.id !== item.src.id)) {
                        nodeIDs.push(item.dst.id);
                      }
                    }
                  });

                  const result = await bulkExcludeNodes(migrationId, {
                    nodeIDs: nodeIDs,
                  });

                  if (result.success) {
                    // Clear selection and associated data
                    setExplicitSelected(new Set());
                    setExplicitSelectedPaths(new Map());
                    setExplicitSelectedItemData(new Map());
                    setLastSelectedIndex(null);
                    
                    if (result.taskID) {
                      // Background task started - add to active tasks
                      setActiveTaskIds((prev) => new Set(prev).add(result.taskID!));
                    } else {
                      // Immediate completion - reload items
                      await loadItems();
                      if (onItemUpdate) {
                        onItemUpdate();
                      }
                    }
                  }
                } catch (err) {
                  console.error("Failed to bulk exclude items:", err);
                } finally {
                  setBulkLoading(false);
                }
              }}
              disabled={bulkLoading}
            >
              {bulkLoading ? "Processing..." : "Exclude Selected"}
            </button>
            <button
              type="button"
              className="glass-button glass-button--small"
              onClick={async () => {
                if (!migrationId || explicitSelected.size === 0 || bulkLoading) return;
                
                setBulkLoading(true);
                try {
                  // Normalize selection: remove items whose ancestor paths are also selected
                  const normalized = normalizeExplicitSelection(explicitSelected);
                  
                  // Get node IDs for normalized selected items from all pages
                  const nodeIDs: string[] = [];
                  normalized.forEach((itemId) => {
                    const item = explicitSelectedItemData.get(itemId);
                    if (item) {
                      if (item.src?.id) {
                        nodeIDs.push(item.src.id);
                      }
                      if (item.dst?.id && (!item.src?.id || item.dst.id !== item.src.id)) {
                        nodeIDs.push(item.dst.id);
                      }
                    }
                  });

                  const result = await bulkUnexcludeNodes(migrationId, {
                    nodeIDs: nodeIDs,
                  });

                  if (result.success) {
                    // Clear selection and associated data
                    setExplicitSelected(new Set());
                    setExplicitSelectedPaths(new Map());
                    setExplicitSelectedItemData(new Map());
                    setLastSelectedIndex(null);
                    
                    if (result.taskID) {
                      // Background task started - add to active tasks
                      setActiveTaskIds((prev) => new Set(prev).add(result.taskID!));
                    } else {
                      // Immediate completion - reload items
                      await loadItems();
                      if (onItemUpdate) {
                        onItemUpdate();
                      }
                    }
                  }
                } catch (err) {
                  console.error("Failed to bulk unexclude items:", err);
                } finally {
                  setBulkLoading(false);
                }
              }}
              disabled={bulkLoading}
            >
              {bulkLoading ? "Processing..." : "Unexclude Selected"}
            </button>
            <button
              type="button"
              className="path-review-list__clear-selection"
              onClick={() => {
                setExplicitSelected(new Set());
                setExplicitSelectedPaths(new Map());
                setExplicitSelectedItemData(new Map());
                setLastSelectedIndex(null);
              }}
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Status Legend with Pagination Arrows */}
      {!loading && items.length > 0 && (
        <div className="path-review-list__legend-wrapper">
          <PathReviewLegend zoomLevel={zoomLevel} className="path-review__legend--compact" />
          {pagination && (
            <div className="path-review-list__page-nav">
              <div className="path-review-list__items-per-page-compact" ref={itemsPerPageDropdownRef}>
                <button
                  type="button"
                  className="path-review-list__items-per-page-button"
                  onClick={() => setShowItemsPerPageDropdown(!showItemsPerPageDropdown)}
                  title="Items per page"
                  aria-label="Items per page"
                >
                  {itemsPerPage}
                  <ChevronDown size={14 * zoomLevel} />
                </button>
                {showItemsPerPageDropdown && (
                  <div className="path-review-list__items-per-page-dropdown">
                    {[50, 100, 500, 1000].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`path-review-list__items-per-page-option ${
                          itemsPerPage === value ? "path-review-list__items-per-page-option--selected" : ""
                        }`}
                        onClick={() => {
                          setItemsPerPage(value);
                          setCurrentPage(0);
                          setShowItemsPerPageDropdown(false);
                        }}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="path-review-list__page-nav-button"
                onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                title="Previous page"
                aria-label="Previous page"
              >
                <ChevronLeft size={18 * zoomLevel} />
              </button>
              <button
                type="button"
                className="path-review-list__page-nav-button"
                onClick={() => {
                  if (totalPages > 0) {
                    setCurrentPage(Math.min(totalPages - 1, currentPage + 1));
                  } else {
                    setCurrentPage(currentPage + 1);
                  }
                }}
                disabled={totalPages > 0 ? currentPage >= totalPages - 1 : !pagination.hasMore}
                title="Next page"
                aria-label="Next page"
              >
                <ChevronRight size={18 * zoomLevel} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Items List */}
      <div 
        className="path-review-list__items-container"
        style={{ 
          '--zoom': zoomLevel,
        } as React.CSSProperties}
      >
        {loading ? (
          <div className="path-review-list__empty">Loading...</div>
        ) : error ? (
          <div className="path-review-list__error">{error}</div>
        ) : items.length === 0 ? (
          <div className="path-review-list__empty">No items found.</div>
        ) : (
          <div className="path-review-list__items">
            {/* Items */}
            {items.map((item, index) => {
              const status = getItemStatus(item);
              const isExplicit = explicitSelected.has(item.id);
              const inherited = getInheritedSelections(explicitSelected);
              const isInherited = !isExplicit && inherited.has(item.id);
              const isSelected = isExplicit || isInherited;
              const isFolder = item.type === "folder";
              const isLocked = isFolder && status.existsOnBoth;

              return (
                <div
                  key={item.id}
                  className={`path-review-list__item ${
                    status.isExcluded ? "path-review-list__item--excluded" : ""
                  } ${isExplicit ? "path-review-list__item--selected" : ""} ${
                    isInherited ? "path-review-list__item--inherited" : ""
                  }`}
                >
                  {/* Checkbox */}
                  <div className="path-review-list__item-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isInherited}
                      onClick={(e) => {
                        if (!isInherited) {
                          handleItemSelect(item.id, index, e);
                        }
                      }}
                      onChange={() => {}} // Controlled by onClick
                      title={isInherited ? "Inherited selection (cannot be toggled directly)" : ""}
                    />
                  </div>

                  {/* Status Icon */}
                  <div className="path-review-list__item-status-icon-container">
                    <PathReviewStatusIcon
                      item={item}
                      isMarkedForRetry={false}
                      isChecked={status.isChecked}
                      existsOnBoth={status.existsOnBoth}
                      isLocked={isLocked}
                      zoomLevel={zoomLevel}
                      size={16 * zoomLevel}
                      className="path-review-list__item-status-icon"
                      onRetryClick={handleRetryClick}
                      onExcludeClick={handleCheckboxChange}
                    />
                  </div>

                  {/* File/Folder Icon */}
                  <div className="path-review-list__item-icon">
                    {isFolder ? (
                      <Folder size={16 * zoomLevel} color="#ffffff" />
                    ) : (
                      <File size={16 * zoomLevel} color="#ffffff" />
                    )}
                  </div>

                  {/* Name Column */}
                  <div className="path-review-list__item-name-col">
                    <div className="path-review-list__item-name">{item.name}</div>
                  </div>

                  {/* Path Column */}
                  <div className="path-review-list__item-path-col">
                    <div className="path-review-list__item-path">{item.locationPath}</div>
                    {!isFolder && item.size !== undefined && (
                      <div className="path-review-list__item-meta">
                        {(item.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    )}
                  </div>

                  {/* Navigate to Tree View Icon */}
                  <div className="path-review-list__item-navigate">
                    <button
                      type="button"
                      className="path-review-list__item-navigate-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onNavigateToTreeView) {
                          onNavigateToTreeView(item);
                        }
                      }}
                      title="Show in tree view"
                      aria-label="Show in tree view"
                    >
                      <ExternalLink size={14 * zoomLevel} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

