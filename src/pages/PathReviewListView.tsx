import { useState, useEffect, useRef } from "react";
import {
  Folder,
  File,
  ChevronUp,
  ChevronDown,
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
  markNodeForRetryDiscovery,
  unmarkNodeForRetryDiscovery,
  markNodeForRetryCopy,
  unmarkNodeForRetryCopy,
  markNodeForRetryDelete,
  unmarkNodeForRetryDelete,
  bulkExcludeNodes,
  bulkUnexcludeNodes,
  getBackgroundTasks,
  BackgroundTask,
  PathReviewStats,
  getMigrationStatus,
} from "../api/services";
import {
  MigrationStatusResponse,
  isCopyReviewPhase,
  isDeleteReviewPhase,
} from "../types/migrations";
import {
  getPathReviewDisplayPhase,
  getPathReviewUIPhase,
} from "../utils/pathReviewPhase";
import { useListDensity } from "../contexts/ListDensityContext";
import PathReviewStatusIcon from "../components/PathReviewStatusIcon";
import PathReviewLegend from "../components/PathReviewLegend";
import ListViewPagination from "../components/ListViewPagination";
import ListItemMeta from "../components/ListItemMeta";
import { getDiffItemFailureMessage } from "../utils/diffFailureMessage";
import {
  getTraversalRetryNodeId,
  isTraversalRetryPending,
} from "../utils/pathReviewTraversalStatus";
import "./PathReview.css";

export interface PathReviewListViewProps {
  migrationId: string;
  reviewView?: "default" | "source-cleanup";
  onSkipDeleteClick?: (item: DiffItem) => void;
  /** Incremented from tree view after successful exclude/retry so list search results stay in sync. */
  treeListRefreshToken?: number;
  /** When false, server omits destination-only rows from search results. */
  includeDestinationOnly?: boolean;
  /** Show the destination-only checkbox in the filter modal (cleanup/delete review). */
  showDestinationOnlyToggle?: boolean;
  showDestinationOnly?: boolean;
  onShowDestinationOnlyChange?: (next: boolean) => void;
  /** Called after list mutations that should refresh the tree view’s current folder. */
  onListDataMutated?: () => void;
  onItemUpdate?: () => void; // Callback for when items are updated (e.g. start stats polling for background tasks)
  onApplyStatsDeltas?: (deltas: Record<string, number>) => void; // Apply action deltas to parent stats (no refetch)
  onStatsChange?: (stats: PathReviewStats | null) => void; // Callback for when stats change
  onSelectionStatsWarning?: (hasWarning: boolean) => void; // Callback to show/hide selection warning
  onPaginationChange?: (pagination: PaginationInfo | null, itemsPerPage: number) => void; // Callback for pagination info
  onNavigateToTreeView?: (item: DiffItem) => void; // Callback to navigate to tree view and highlight item
  onToast?: (message: string, type: "success" | "error") => void; // Callback to show toast (e.g. retry/exclude success or error)
  isActive?: boolean;
}

export default function PathReviewListView({
  migrationId,
  reviewView = "default",
  onSkipDeleteClick,
  treeListRefreshToken = 0,
  includeDestinationOnly = true,
  showDestinationOnlyToggle = false,
  showDestinationOnly = false,
  onShowDestinationOnlyChange,
  onListDataMutated,
  onItemUpdate,
  onApplyStatsDeltas,
  onStatsChange,
  onSelectionStatsWarning,
  onPaginationChange,
  onNavigateToTreeView,
  onToast,
  isActive = true,
}: PathReviewListViewProps) {
  const { densityStyle, setListViewportElement } = useListDensity();
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
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatusResponse | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const listItemsRef = useRef<HTMLDivElement | null>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);

  // Phase detection helpers
  const isCopyPhase = (status: MigrationStatusResponse | null): boolean =>
    isCopyReviewPhase(status);

  const isDeletePhase = (status: MigrationStatusResponse | null): boolean =>
    isDeleteReviewPhase(status);

  const isSourceCleanupView = reviewView === "source-cleanup";

  const getCurrentPhase = () => getPathReviewUIPhase(migrationStatus);

  const getDisplayPhase = () =>
    getPathReviewDisplayPhase(migrationStatus, reviewView);

  // Fetch migration status
  const fetchMigrationStatus = async () => {
    if (!migrationId) return;
    try {
      const statusData = await getMigrationStatus(migrationId);
      setMigrationStatus(statusData);
    } catch (err) {
      console.error("Failed to fetch migration status:", err);
    }
  };

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

  useEffect(() => {
    if (isActive) {
      setListViewportElement(listItemsRef.current);
    }
  }, [isActive, setListViewportElement, items.length, loading]);

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

  const loadItems = async (
    append = false,
    options?: { silent?: boolean }
  ) => {
    if (!migrationId) return;

    const showFullLoading = !append && !options?.silent;
    if (showFullLoading) {
      setLoading(true);
      setError(null);
    }

    try {
      const offset = currentPage * itemsPerPage;
      
      // Parse depth and size filters as numbers
      const parsedDepth = depthFilter.trim() !== "" ? parseInt(depthFilter, 10) : null;
      const parsedSizeBytes = sizeFilter.trim() !== "" ? parseFileSize(sizeFilter, sizeDisplayUnit) : null;
      
      // Determine current phase and use phase-appropriate status fields
      const phase = getCurrentPhase();
      const isCopy = phase === "copy";
      
      let statusSearchType: "traversal" | "copy" | "both" | undefined = undefined;
      let traversalStatusFilterValue: string | undefined = undefined;
      let copyStatusFilterValue: string | undefined = undefined;
      
      if (isCopy) {
        // Copy phase: use copyStatus field
        statusSearchType = "copy";
        
        if (traversalStatusFilter === "failed") {
          copyStatusFilterValue = "failed";
        } else if (traversalStatusFilter === "pending") {
          copyStatusFilterValue = "pending";
        } else if (traversalStatusFilter === "successful") {
          copyStatusFilterValue = "successful";
        } else if (traversalStatusFilter === "excluded") {
          // In copy phase, excluded is read-only but still searchable
          copyStatusFilterValue = "excluded";
        } else if (traversalStatusFilter === "not_on_src") {
          // Destination only - this is a traversal status concept (not copy status)
          statusSearchType = "traversal";
          traversalStatusFilterValue = "not_on_src";
        } else if (traversalStatusFilter === "pending_retry") {
          // In copy phase, pending_retry means pending copy items
          copyStatusFilterValue = "pending";
        }
      } else {
        // Traversal phase: use traversalStatus field (existing behavior)
        statusSearchType = "traversal";
        
        if (traversalStatusFilter === "failed") {
          traversalStatusFilterValue = "failed";
        } else if (traversalStatusFilter === "pending_retry") {
          // Pending retry is a traversal status (items with traversalStatus = "pending")
          traversalStatusFilterValue = "pending";
        } else if (traversalStatusFilter === "excluded") {
          // Excluded is a copy status (maps to exclusion_explicit/exclusion_inherited)
          statusSearchType = "copy";
          copyStatusFilterValue = "excluded";
        } else if (traversalStatusFilter === "pending") {
          // Pending is a copy status
          statusSearchType = "copy";
          copyStatusFilterValue = "pending";
        } else if (traversalStatusFilter === "successful") {
          // Successful is a copy status
          statusSearchType = "copy";
          copyStatusFilterValue = "successful";
        } else if (traversalStatusFilter === "not_on_src") {
          // Destination only - this is a traversal status
          traversalStatusFilterValue = "not_on_src";
        }
      }

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
        traversalStatusFilter: traversalStatusFilterValue,
        copyStatusFilter: copyStatusFilterValue,
        statusSearchType: statusSearchType,
        phase: phase,
        includeDestinationOnly,
      });

      if (append) {
        setItems((prev) => [...prev, ...response.items]);
      } else {
        setItems(response.items);
      }

      setPagination(response.pagination);
      // Stats will be updated via useEffect hook when apiStats changes
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load path review items."
      );
    } finally {
      if (showFullLoading) {
        setLoading(false);
      }
    }
  };

  // Fetch migration status on mount
  useEffect(() => {
    fetchMigrationStatus();
  }, [migrationId]);

  // Clear "pending" filter when switching to copy phase (since it's not available in copy phase)
  useEffect(() => {
    if (isCopyPhase(migrationStatus) && traversalStatusFilter === "pending") {
      setTraversalStatusFilter("");
    }
  }, [migrationStatus, traversalStatusFilter]);

  // Reset to first page when destination-only visibility changes so totals stay aligned.
  useEffect(() => {
    setCurrentPage(0);
  }, [includeDestinationOnly]);

  useEffect(() => {
    if (!showDestinationOnly && traversalStatusFilter === "not_on_src") {
      setTraversalStatusFilter("");
    }
  }, [showDestinationOnly, traversalStatusFilter]);

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [migrationId, currentPage, itemsPerPage, sortField, sortDir, activeSearchQuery, searchField, typeFilter, depthFilter, depthOperator, sizeFilter, sizeOperator, sizeDisplayUnit, traversalStatusFilter, treeListRefreshToken, includeDestinationOnly]);

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
              void loadItems(false, { silent: true }).then(() => {
                onListDataMutated?.();
              });
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
  }, [migrationId, activeTaskIds, onItemUpdate, onListDataMutated]);

  const handleSearch = () => {
    // Sanitize and set the active search query
    const sanitized = sanitizeSearchQuery(searchQuery);
    setActiveSearchQuery(sanitized);
    setCurrentPage(0); // Reset to first page when searching
    // loadItems will be called automatically via useEffect when activeSearchQuery changes
  };

  const handleSelectAll = () => {
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

    // In copy phase, exclusion/inclusion are read-only (no actions allowed)
    if (isCopyPhase(migrationStatus)) {
      return;
    }

    const status = getItemStatus(item);
    const isFolder = item.type === "folder";

    // Items that exist on both or only on destination are locked (not clickable)
    if ((status.existsOnBoth || status.existsOnlyOnDst) && isFolder) {
      return;
    }

    // Determine if we're excluding or unexcluding based on copyStatus
    // If currently pending (not excluded), clicking should EXCLUDE it
    // If currently excluded, clicking should UNEXCLUDE it (back to pending)
    const isExcluding = !status.isExcluded;
    // Separate src and dst node IDs to ensure they stay in sync
    const srcNodeId = item.src?.id;
    const dstNodeId = item.dst?.id && (!item.src?.id || item.dst.id !== item.src.id) ? item.dst.id : null;

    if (!srcNodeId && !dstNodeId) {
      onToast?.("No node ID available for this item.", "error");
      return;
    }

    // Store original item state for rollback
    const originalItem = { ...item };

    // Optimistic update: immediately update item's copyStatus
    setItems((prevItems) =>
      prevItems.map((i) => {
        if (i.id === item.id) {
          const newCopyStatus = isExcluding ? "exclusion_explicit" : "pending";
          return {
            ...i,
            copyStatus: newCopyStatus,
            src: i.src ? { ...i.src, copyStatus: newCopyStatus } : i.src,
          };
        }
        return i;
      })
    );

    try {
      // Make API calls for src and dst nodes sequentially to avoid database conflicts
      // Update src first, then dst - if src fails, don't try dst
      // If dst fails, rollback src to keep them in sync
      
      let srcResult: any = null;
      let dstResult: any = null;
      
      // Step 1: Update src node (if it exists)
      if (srcNodeId) {
        srcResult = isExcluding
          ? await excludeNode(migrationId, srcNodeId)
          : await unexcludeNode(migrationId, srcNodeId);
        
        // If src fails, stop and revert
        if (!srcResult.success) {
          // Revert optimistic update
          setItems((prevItems) =>
            prevItems.map((i) => {
              if (i.id === item.id) {
                return originalItem;
              }
              return i;
            })
          );
          let errorMessage = srcResult.error || "Failed to update source node. Please try again.";
          if (srcResult.error && (
            srcResult.error.includes("copy phase") ||
            srcResult.error.includes("exclusion operations are not available")
          )) {
            errorMessage = "Exclusion is only available during traversal review";
          }
          onToast?.(errorMessage, "error");
          return;
        }
      }
      
      // Step 2: Update dst node (if it exists and src succeeded)
      if (dstNodeId) {
        dstResult = isExcluding
          ? await excludeNode(migrationId, dstNodeId)
          : await unexcludeNode(migrationId, dstNodeId);
        
        // If dst fails, rollback src to keep them in sync
        if (!dstResult.success) {
          // Rollback src node
          if (srcNodeId) {
            await (isExcluding
              ? unexcludeNode(migrationId, srcNodeId)  // Opposite operation to rollback
              : excludeNode(migrationId, srcNodeId));
          }
          
          // Revert optimistic update
          setItems((prevItems) =>
            prevItems.map((i) => {
              if (i.id === item.id) {
                return originalItem;
              }
              return i;
            })
          );
          onToast?.(dstResult.error || "Failed to update destination node. Changes have been rolled back.", "error");
          return;
        }
      }

      // Both succeeded (or only one node exists and it succeeded)
      const merged: Record<string, number> = {};
      for (const r of [srcResult, dstResult]) {
        if (r?.deltas) for (const [k, v] of Object.entries(r.deltas)) merged[k] = (merged[k] ?? 0) + (v as number);
      }
      if (Object.keys(merged).length > 0) onApplyStatsDeltas?.(merged);
      await loadItems(false, { silent: true });
      onListDataMutated?.();
      onToast?.(isExcluding ? "Item excluded" : "Item unexcluded", "success");
    } catch (err) {
      // Revert optimistic update on network error
      setItems((prevItems) =>
        prevItems.map((i) => {
          if (i.id === item.id) {
            return originalItem;
          }
          return i;
        })
      );
      const message = err instanceof Error ? err.message : `Network error: Failed to ${isExcluding ? "exclude" : "unexclude"} node.`;
      onToast?.(message, "error");
    }
  };

  const handleRetryClick = async (item: DiffItem) => {
    if (!migrationId) return;

    const currentPhase = getCurrentPhase();
    const isCopy = currentPhase === "copy";
    const isDelete = currentPhase === "delete";
    const srcNodeId = item.src?.id;
    const dstNodeId = item.dst?.id;
    
    // Determine which node has failed or pending status (failed takes priority)
    let nodeIdToUpdate: string | null = null;
    let isMarkedForRetry = false;
    
    if (isDelete) {
      const deleteStatus = item.src?.deleteStatus || "";
      if ((deleteStatus === "failed" || deleteStatus === "pending") && srcNodeId) {
        nodeIdToUpdate = srcNodeId;
        isMarkedForRetry = deleteStatus === "pending";
      }
    } else if (isCopy) {
      // Copy phase: check copyStatus (only on src nodes)
      const copyStatus = item.src?.copyStatus || item.copyStatus || "";
      
      if (copyStatus === "failed" && srcNodeId) {
        nodeIdToUpdate = srcNodeId;
        isMarkedForRetry = false;
      } else if (copyStatus === "pending" && srcNodeId) {
        nodeIdToUpdate = srcNodeId;
        isMarkedForRetry = true;
      }
    } else {
      const nodeId = getTraversalRetryNodeId(item);
      if (nodeId) {
        nodeIdToUpdate = nodeId;
        isMarkedForRetry = item.src?.traversalStatus === "pending";
      }
    }

    if (!nodeIdToUpdate) {
      onToast?.("No node with failed or pending status available for this item.", "error");
      return;
    }

    const newRetryState = !isMarkedForRetry;

    // Store original item state for rollback
    const originalItem = { ...item };

    // Optimistic update: immediately update item's status based on which node we're updating
    setItems((prevItems) =>
      prevItems.map((i) => {
        if (i.id === item.id) {
          // Update the node we're modifying
          const updatedItem = { ...i };
          if (nodeIdToUpdate === srcNodeId && i.src) {
            if (isDelete) {
              updatedItem.src = {
                ...i.src,
                deleteStatus: isMarkedForRetry ? "failed" : "pending",
              };
            } else if (isCopy) {
              // Copy phase: update copyStatus
              updatedItem.src = {
                ...i.src,
                copyStatus: isMarkedForRetry ? "failed" : "pending",
              };
              updatedItem.copyStatus = isMarkedForRetry ? "failed" : "pending";
            } else {
              // Traversal phase: update traversalStatus
              updatedItem.src = {
                ...i.src,
                traversalStatus: isMarkedForRetry ? "failed" : "pending",
              };
              if (i.id === srcNodeId) {
                updatedItem.traversalStatus = isMarkedForRetry ? "failed" : "pending";
              }
            }
          } else if (nodeIdToUpdate === dstNodeId && i.dst) {
            // Only traversal phase uses dst nodes for retry
            updatedItem.dst = {
              ...i.dst,
              traversalStatus: isMarkedForRetry ? "failed" : "pending",
            };
            if (i.id === dstNodeId) {
              updatedItem.traversalStatus = isMarkedForRetry ? "failed" : "pending";
            }
          }
          return updatedItem;
        }
        return i;
      })
    );

    try {
      // Mark or unmark for retry based on current state and phase
      // Use phase-specific endpoints: discovery retry for traversal phase, copy retry for copy phase
      const result = isMarkedForRetry
        ? (isDelete
            ? await unmarkNodeForRetryDelete(migrationId, nodeIdToUpdate)
            : isCopy
            ? await unmarkNodeForRetryCopy(migrationId, nodeIdToUpdate)
            : await unmarkNodeForRetryDiscovery(migrationId, nodeIdToUpdate))
        : (isDelete
            ? await markNodeForRetryDelete(migrationId, nodeIdToUpdate)
            : isCopy
            ? await markNodeForRetryCopy(migrationId, nodeIdToUpdate)
            : await markNodeForRetryDiscovery(migrationId, nodeIdToUpdate));
      
      // If the call fails, revert optimistic update
      if (!result.success) {
        // Revert optimistic update
        setItems((prevItems) =>
          prevItems.map((i) => {
            if (i.id === item.id) {
              return originalItem;
            }
            return i;
          })
        );
        onToast?.(result.error || "Failed to update node. Please try again.", "error");
        return;
      }

      if (result.deltas && Object.keys(result.deltas).length > 0) onApplyStatsDeltas?.(result.deltas);
      await loadItems(false, { silent: true });
      onListDataMutated?.();
      onToast?.(newRetryState ? "Item marked for retry" : "Item unmarked for retry", "success");
    } catch (err) {
      // Revert optimistic update on network error
      setItems((prevItems) =>
        prevItems.map((i) => {
          if (i.id === item.id) {
            return originalItem;
          }
          return i;
        })
      );
      const message = err instanceof Error ? err.message : "Network error: Failed to update node. Please try again.";
      onToast?.(message, "error");
    }
  };


  // Get item status based on API data (copyStatus and traversalStatus)
  // Uses phase-appropriate status fields: copyStatus in copy phase, traversalStatus in traversal phase
  const getItemStatus = (item: DiffItem) => {
    const currentPhase = getCurrentPhase();

    if (currentPhase === "delete") {
      const deleteStatus = item.src?.deleteStatus || "";
      const isDeleted = deleteStatus === "deleted";
      const isFailed = deleteStatus === "failed";
      const isPendingRetry = deleteStatus === "pending";
      return {
        isExcluded: false,
        isPending: isPendingRetry,
        isSuccessful: isDeleted,
        isDeleted,
        existsOnBoth: false,
        existsOnlyOnDst: false,
        isFailed,
      };
    }

    const isCopy = currentPhase === "copy";
    
    if (isCopy) {
      // Copy phase: use copyStatus field
      const copyStatus = item.src?.copyStatus || item.copyStatus || "pending";
      const isFailed = copyStatus === "failed";
      const existsOnlyOnDst = !item.src && !!item.dst; // dst-only node (no src node)
      
      // Copy phase status logic:
      // 1. Failed = src.copyStatus === "failed" (copy failed)
      // 2. Successful = src.copyStatus === "successful" (got brought over) OR item is dst-only
      // 3. Pending = src.copyStatus === "pending" (didn't get brought over - treat same as failed)
      // 4. Excluded = copyStatus shows exclusion (read-only in copy phase)
      
      const isExcluded =
        copyStatus === "exclusion_explicit" ||
        copyStatus === "exclusion_inherited" ||
        copyStatus === "excluded";
      const isPending = copyStatus === "pending";
      const isSuccessful = copyStatus === "successful" || existsOnlyOnDst;
      const existsOnBoth = copyStatus === "successful"; // Successful copyStatus means it exists on both
      
      return {
        isExcluded,
        isPending,
        isSuccessful,
        existsOnBoth,
        existsOnlyOnDst,
        isFailed,
      };
    } else {
      // Traversal (discovery) phase: copyStatus from src when present (exclude state, editable)
      const copyStatus = item.src?.copyStatus || item.copyStatus || "pending";
      const isFailed = item.src?.traversalStatus === "failed" || item.dst?.traversalStatus === "failed" || item.traversalStatus === "failed";
      const existsOnlyOnDst = item.traversalStatus === "not_on_src" || item.dst?.traversalStatus === "not_on_src";
      
      // Traversal phase status logic (existing):
      // 1. Failed traversalStatus → failed to traverse
      // 2. Excluded copyStatus → excluded from copy
      // 3. Pending copyStatus → pending - will be copied over
      // 4. Successful copyStatus → already exists on both
      // 5. traversalStatus 'not_on_src' → exists only on destination
      
      const isExcluded =
        copyStatus === "exclusion_explicit" ||
        copyStatus === "exclusion_inherited" ||
        copyStatus === "excluded";
      const isPending = copyStatus === "pending";
      const isSuccessful = copyStatus === "successful";
      const existsOnBoth = isSuccessful; // Successful copyStatus means it exists on both
      
      return {
        isExcluded,
        isPending,
        isSuccessful,
        existsOnBoth,
        existsOnlyOnDst,
        isFailed,
      };
    }
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


  // Check if any filters are active
  const hasActiveFilters = () => {
    return (
      activeSearchQuery.trim() !== "" ||
      typeFilter !== "both" ||
      depthFilter.trim() !== "" ||
      sizeFilter.trim() !== "" ||
      traversalStatusFilter !== "" ||
      (showDestinationOnlyToggle && showDestinationOnly)
    );
  };

  const isFilterActive = hasActiveFilters();

  // Check if sort is active (not default: "path" with "asc")
  const isSortActive = sortField !== "path" || sortDir !== "asc";

  return (
    <div className="path-review-list" style={densityStyle}>
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
            className={`path-review-list__filter-button ${isFilterActive ? "path-review-list__filter-button--active" : ""}`}
            onClick={() => setShowFilterMenu(true)}
            title={isFilterActive ? "Filter (active)" : "Filter"}
            aria-label={isFilterActive ? "Filter (active)" : "Filter"}
          >
            <Filter size={18} />
            {isFilterActive && (
              <span className="path-review-list__filter-indicator" aria-hidden="true" />
            )}
          </button>
          <button
            ref={sortButtonRef}
            type="button"
            className={`path-review-list__filter-button ${isSortActive ? "path-review-list__filter-button--active" : ""}`}
            onClick={() => setShowSortMenu(true)}
            title={isSortActive ? "Sort (active)" : "Sort"}
            aria-label={isSortActive ? "Sort (active)" : "Sort"}
          >
            <ArrowUpDown size={18} />
            {isSortActive && (
              <span className="path-review-list__filter-indicator" aria-hidden="true" />
            )}
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

                {/* Status Filter */}
                <div className="path-review-list__filter-menu-section">
                  <label className="path-review-list__filter-menu-label" htmlFor="status-filter">
                    Status
                  </label>
                  <select
                    id="status-filter"
                    className="path-review-list__filter-menu-select"
                    value={traversalStatusFilter}
                    onChange={(e) => {
                      const next = e.target.value;
                      setTraversalStatusFilter(next);
                      if (next === "not_on_src" && showDestinationOnlyToggle) {
                        onShowDestinationOnlyChange?.(true);
                      }
                    }}
                  >
                    <option value="">All</option>
                    {!isCopyPhase(migrationStatus) && (
                      <option value="pending">Pending (will be copied over)</option>
                    )}
                    <option value="pending_retry">Pending Retry</option>
                    <option value="excluded">
                      {isCopyPhase(migrationStatus) 
                        ? "Excluded (was not copied over)" 
                        : "Excluded (will not be copied over)"}
                    </option>
                    <option value="failed">
                      {isCopyPhase(migrationStatus) 
                        ? "Failed" 
                        : "Failed (discovery of items inside failed)"}
                    </option>
                    <option value="successful">Exists (on both)</option>
                    <option value="not_on_src">Exists (on destination only)</option>
                  </select>
                </div>

                {showDestinationOnlyToggle && (
                  <div className="path-review-list__filter-menu-section">
                    <label className="path-review-list__filter-menu-checkbox">
                      <input
                        type="checkbox"
                        checked={showDestinationOnly}
                        onChange={(e) => {
                          const next = e.target.checked;
                          onShowDestinationOnlyChange?.(next);
                          if (!next && traversalStatusFilter === "not_on_src") {
                            setTraversalStatusFilter("");
                          }
                          setCurrentPage(0);
                        }}
                      />
                      Show destination-only items
                    </label>
                  </div>
                )}

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
                      if (showDestinationOnlyToggle) {
                        onShowDestinationOnlyChange?.(false);
                      }
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
                  {sortField && (
                    <div className="path-review-list__filter-menu-section">
                      <label className="path-review-list__filter-menu-label">Sort Direction</label>
                      <div className="path-review-list__filter-menu-toggle">
                        <button
                          type="button"
                          className={`path-review-list__filter-menu-toggle-button ${sortDir === "asc" ? "path-review-list__filter-menu-toggle-button--active" : ""}`}
                          onClick={() => {
                            setSortDir("asc");
                            setCurrentPage(0);
                          }}
                        >
                          <ChevronUp size={14} style={{ marginRight: "0.25rem" }} />
                          Ascending
                        </button>
                        <button
                          type="button"
                          className={`path-review-list__filter-menu-toggle-button ${sortDir === "desc" ? "path-review-list__filter-menu-toggle-button--active" : ""}`}
                          onClick={() => {
                            setSortDir("desc");
                            setCurrentPage(0);
                          }}
                        >
                          <ChevronDown size={14} style={{ marginRight: "0.25rem" }} />
                          Descending
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="path-review-list__filter-menu-section">
                    <label className="path-review-list__filter-menu-label">Sort By</label>
                    <div className="path-review-list__filter-menu-options">
                      {[
                        { value: "name", label: "Name" },
                        { value: "path", label: "Path" },
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
                          onClick={() => {
                            setSortField(value);
                            setSortDir("asc");
                            setCurrentPage(0);
                          }}
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
                </div>
                <div className="path-review-list__sort-modal-footer">
                  {isSortActive && (
                    <button
                      type="button"
                      className="path-review-list__filter-modal-button path-review-list__filter-modal-button--secondary"
                      onClick={() => {
                        setSortField("path");
                        setSortDir("asc");
                        setCurrentPage(0);
                      }}
                    >
                      Reset to Default
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
              disabled={isCopyPhase(migrationStatus) || isDeletePhase(migrationStatus) || bulkLoading}
              title={
                isCopyPhase(migrationStatus)
                  ? "Exclusion is only available during traversal review"
                  : isDeletePhase(migrationStatus)
                  ? "Exclusion is not available during removal review"
                  : ""
              }
              onClick={async () => {
                if (!migrationId || explicitSelected.size === 0 || bulkLoading || isCopyPhase(migrationStatus) || isDeletePhase(migrationStatus)) return;
                
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
                      if (onItemUpdate) onItemUpdate();
                    } else {
                      if (result.deltas && Object.keys(result.deltas).length > 0) onApplyStatsDeltas?.(result.deltas);
                      await loadItems(false, { silent: true });
                      onListDataMutated?.();
                    }
                  }
                } catch (err) {
                  console.error("Failed to bulk exclude items:", err);
                  // Check if error is due to phase locking
                  const errorMessage = err instanceof Error ? err.message : "Failed to bulk exclude items";
                  if (errorMessage.includes("copy phase") || errorMessage.includes("exclusion operations are not available")) {
                    // Don't show error - UI should already be disabled, but log for debugging
                    console.warn("Bulk exclude blocked in copy phase");
                  }
                } finally {
                  setBulkLoading(false);
                }
              }}
            >
              {bulkLoading ? "Processing..." : "Exclude Selected"}
            </button>
            <button
              type="button"
              className="glass-button glass-button--small"
              disabled={isCopyPhase(migrationStatus) || isDeletePhase(migrationStatus) || bulkLoading}
              title={
                isCopyPhase(migrationStatus)
                  ? "Exclusion is only available during traversal review"
                  : isDeletePhase(migrationStatus)
                  ? "Exclusion is not available during removal review"
                  : ""
              }
              onClick={async () => {
                if (!migrationId || explicitSelected.size === 0 || bulkLoading || isCopyPhase(migrationStatus) || isDeletePhase(migrationStatus)) return;
                
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
                      if (onItemUpdate) onItemUpdate();
                    } else {
                      if (result.deltas && Object.keys(result.deltas).length > 0) onApplyStatsDeltas?.(result.deltas);
                      await loadItems(false, { silent: true });
                      onListDataMutated?.();
                    }
                  }
                } catch (err) {
                  console.error("Failed to bulk unexclude items:", err);
                  // Check if error is due to phase locking
                  const errorMessage = err instanceof Error ? err.message : "Failed to bulk unexclude items";
                  if (errorMessage.includes("copy phase") || errorMessage.includes("exclusion operations are not available")) {
                    // Don't show error - UI should already be disabled, but log for debugging
                    console.warn("Bulk unexclude blocked in copy phase");
                  }
                } finally {
                  setBulkLoading(false);
                }
              }}
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
          <PathReviewLegend
            zoomLevel={1}
            className="path-review__legend--compact"
            phase={getDisplayPhase()}
            showDestinationOnly={includeDestinationOnly}
          />
          {pagination && (
            <ListViewPagination
              pagination={pagination}
              currentPage={currentPage}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(value) => {
                setItemsPerPage(value);
                setCurrentPage(0);
              }}
              zoomLevel={1}
            />
          )}
        </div>
      )}

      {/* Items List */}
      <div className="path-review-list__items-container">
        {loading ? (
          <div className="path-review-list__empty">Loading...</div>
        ) : error ? (
          <div className="path-review-list__error">{error}</div>
        ) : items.length === 0 ? (
          <div className="path-review-list__empty">No items found.</div>
        ) : (
          <div
            ref={listItemsRef}
            className="path-review-list__items"
          >
            {/* Items */}
            {items.map((item, index) => {
              const status = getItemStatus(item);
              const isExplicit = explicitSelected.has(item.id);
              const inherited = getInheritedSelections(explicitSelected);
              const isInherited = !isExplicit && inherited.has(item.id);
              const isSelected = isExplicit || isInherited;
              const isFolder = item.type === "folder";
              const isLocked = isFolder && (status.existsOnBoth || status.existsOnlyOnDst);
              const failureMessage = getDiffItemFailureMessage(item);

              const isMarkedForRetry =
                getCurrentPhase() === "delete"
                  ? (item.src?.deleteStatus || "") === "pending"
                  : isTraversalRetryPending(item);

              return (
                <div
                  key={item.id}
                  className={`path-review-list__item ${
                    status.isExcluded ? "path-review-list__item--excluded" : ""
                  } ${status.isDeleted ? "path-review-list__item--deleted" : ""} ${
                    isExplicit ? "path-review-list__item--selected" : ""
                  } ${isInherited ? "path-review-list__item--inherited" : ""}`}
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
                      isMarkedForRetry={isMarkedForRetry}
                      isLocked={isLocked}
                      zoomLevel={1}
                      size={16}
                      className="path-review-list__item-status-icon"
                      phase={getDisplayPhase()}
                      onRetryClick={handleRetryClick}
                      onExcludeClick={(item, currentChecked) => handleCheckboxChange(item, currentChecked)}
                      onSkipDeleteClick={onSkipDeleteClick}
                    />
                  </div>

                  {/* File/Folder Icon */}
                  <div className="path-review-list__item-icon">
                    {isFolder ? (
                      <Folder size={16} />
                    ) : (
                      <File size={16} />
                    )}
                  </div>

                  {/* Name Column */}
                  <div className="path-review-list__item-name-col">
                    <div className="path-review-list__item-name">{item.name}</div>
                    {failureMessage && (
                      <div
                        className="path-review-list__item-failure-message"
                        title={failureMessage}
                      >
                        {failureMessage}
                      </div>
                    )}
                  </div>

                  {/* Path Column */}
                  <div className="path-review-list__item-path-col" title={item.locationPath}>
                    <div className="path-review-list__item-path">{item.locationPath}</div>
                  </div>

                  <ListItemMeta
                    className="path-review-list__item-meta-col"
                    lastUpdated={item.lastUpdated}
                    size={item.size}
                    type={isFolder ? "folder" : "file"}
                  />

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
                      <ExternalLink size={14} />
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

