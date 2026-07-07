import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Folder,
  File,
  Copy,
  RotateCw,
} from "lucide-react";
import { 
  getMigrationDiffs,
  excludeNode, 
  unexcludeNode,
  markNodeForRetryDiscovery,
  unmarkNodeForRetryDiscovery,
  markNodeForRetryCopy,
  unmarkNodeForRetryCopy,
  DiffItem,
  getPendingWork,
  changePhase,
  PendingWorkResponse,
  getPathReviewStats,
  PathReviewStats,
  PaginationInfo,
  getRunningBackgroundTasks,
  triggerRetrySweep,
  getMigrationStatus,
} from "../api/services";
import {
  MigrationStatusResponse,
  isTraversalReviewPhase,
  isCopyReviewPhase,
  getMigrationPhase,
} from "../types/migrations";
import ItemHoverCard from "../components/ItemHoverCard";
import { GlassSurfacePanel } from "../components/GlassSurfacePanel";
import PageBackButton from "../components/PageBackButton";
import Toast from "../components/Toast";
import ConfirmDialog from "../components/ConfirmDialog";
import ListDensityControl from "../components/ListDensityControl";
import {
  ListDensityProvider,
  useListDensity,
} from "../contexts/ListDensityContext";
import { PATH_REVIEW_DENSITY_STORAGE_KEY } from "../utils/listDensity";
import PathReviewListView from "./PathReviewListView";
import PathReviewStatusIcon from "../components/PathReviewStatusIcon";
import PathReviewLegend from "../components/PathReviewLegend";
import PathReviewFooterInfo from "../components/PathReviewFooterInfo";
import ListItemMeta from "../components/ListItemMeta";
import { getDiffItemFailureMessage } from "../utils/diffFailureMessage";
import {
  getTraversalRetryNodeId,
  hasTraversalFailure,
  isTraversalRetryPending,
} from "../utils/pathReviewTraversalStatus";
import "../App.css";
import "./PathReview.css";

interface BreadcrumbItem {
  path: string;      // locationPath for navigation and display
  name: string;
}

interface ToastState {
  message: string;
  type: "error" | "success" | "info";
}

/**
 * Apply API deltas to local stats (no refetch).
 * Canonical keys: traversalPending, traversalPendingRetry, traversalFailed, copyPending, copyFailed,
 * excluded, folders, files, sizeSrc, sizeDst. Only non-zero deltas are present.
 * Stats mapping matches normalizePathReviewStats: “Pending” is copyStatusCounts.pending (copyPending),
 * “Pending Retry” is traversal pending in traversal phase / copy pending in copy phase.
 * - Traversal: copyPending → pendingCount; traversalPending → pendingCount (legacy); traversalFailed → failedCount; traversalPendingRetry → pendingRetriesCount.
 * - Copy: copyPending → pendingCount and pendingRetriesCount; copyFailed → failedCount.
 */
function applyStatsDeltas(
  prev: PathReviewStats | null,
  deltas: Record<string, number> | undefined,
  phase: "traversal" | "copy"
): PathReviewStats | null {
  if (!prev || !deltas || Object.keys(deltas).length === 0) return prev;
  const d = (k: string) => deltas[k] ?? 0;
  const isCopy = phase === "copy";
  const failedDelta = isCopy ? d("copyFailed") : d("traversalFailed");
  const foldersCount = Math.max(0, prev.foldersCount + d("folders"));
  const filesCount = Math.max(0, prev.filesCount + d("files"));
  const total = foldersCount + filesCount;
  return {
    pendingCount: Math.max(
      0,
      prev.pendingCount +
        d("copyPending") +
        (isCopy ? 0 : d("traversalPending"))
    ),
    failedCount: Math.max(0, prev.failedCount + failedDelta),
    excludedCount: Math.max(0, prev.excludedCount + d("excluded")),
    pendingRetriesCount: Math.max(
      0,
      (prev.pendingRetriesCount ?? 0) +
        (isCopy ? d("copyPending") : d("traversalPendingRetry"))
    ),
    foldersCount,
    filesCount,
    foldersRatio: total > 0 ? foldersCount / total : prev.foldersRatio,
    filesRatio: total > 0 ? filesCount / total : prev.filesRatio,
    totalFileSize: {
      src: Math.max(0, prev.totalFileSize.src + d("sizeSrc")),
      dst: Math.max(0, prev.totalFileSize.dst + d("sizeDst")),
    },
  };
}

/** Merge deltas from multiple action responses (e.g. exclude src + dst). */
function mergeDeltas(
  ...responses: Array<{ deltas?: Record<string, number> } | null>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of responses) {
    if (!r?.deltas) continue;
    for (const [k, v] of Object.entries(r.deltas)) {
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

export default function PathReview() {
  return (
    <ListDensityProvider storageKey={PATH_REVIEW_DENSITY_STORAGE_KEY}>
      <PathReviewPage />
    </ListDensityProvider>
  );
}

function PathReviewPage() {
  const { migrationId } = useParams<{ migrationId: string }>();
  const navigate = useNavigate();
  const { densityStyle, setListViewportElement } = useListDensity();
  const treeListRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<"tree" | "list">("tree");
  const activeTabRef = useRef<"tree" | "list">(activeTab);
  activeTabRef.current = activeTab;
  const [items, setItems] = useState<DiffItem[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | undefined>(undefined);  // undefined for root
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<any>(null);
  const [checkedItems, setPendingItems] = useState<Set<string>>(new Set());
  const [retryItems, setRetryItems] = useState<Set<string>>(new Set()); // Items marked for retry
  const [hasRunningTasks, setHasRunningTasks] = useState(false); // Track if background tasks are running
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogType, setConfirmDialogType] = useState<"copy" | "retry">("copy");
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statsPollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingStatsRef = useRef<boolean>(false);
  const pendingRetryUpdatesRef = useRef<Map<string, boolean>>(new Map());
  const pendingUpdatesRef = useRef<Map<string, boolean>>(new Map());
  
  useEffect(() => {
    if (activeTab === "tree") {
      setListViewportElement(treeListRef.current);
    }
  }, [activeTab, setListViewportElement, items.length, loading]);

  // Workflow state tracking
  const [reviewIteration, setReviewIteration] = useState(1);
  const [pendingWork, setPendingWork] = useState<PendingWorkResponse | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatusResponse | null>(null);
  const [isTriggeringSweep, setIsTriggeringSweep] = useState(false);
  const [stats, setStats] = useState<PathReviewStats | null>(null);
  const [showSelectionWarning, setShowSelectionWarning] = useState(false);
  const [listPagination, setListPagination] = useState<PaginationInfo | null>(null);
  const [listItemsPerPage, setListItemsPerPage] = useState<number>(100);
  /** Bumped after successful exclude/retry in tree view so list search refetches (only when tree tab is active at completion). */
  const [treeListRefreshToken, setTreeListRefreshToken] = useState(0);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  
  // Tree view pagination
  const [treeCurrentPage, setTreeCurrentPage] = useState(0);
  const [treeItemsPerPage, setTreeItemsPerPage] = useState(100);
  const [showTreeItemsPerPageDropdown, setShowTreeItemsPerPageDropdown] = useState(false);
  const treeItemsPerPageDropdownRef = useRef<HTMLDivElement>(null);
  // Map of locationPath -> page number to remember pagination per folder
  const [folderPageMap, setFolderPageMap] = useState<Map<string, number>>(new Map());
  const currentTreePathRef = useRef<string>("/");
  
  const [searchParams, setSearchParams] = useSearchParams();

  const fetchPendingWork = async () => {
    if (!migrationId) return;
    try {
      const work = await getPendingWork(migrationId);
      setPendingWork(work);
      // Stats will be the source of truth for pending retries count
    } catch (err) {
      console.error("Failed to fetch pending work:", err);
    }
  };

  const fetchStats = async () => {
    if (!migrationId || activeTab !== "tree") return; // Only fetch stats when on tree view
    try {
      const currentPhase = getCurrentPhase();
      const statsData = await getPathReviewStats(migrationId, currentPhase);
      // Always update stats from polling, but list view selection stats will override when items are selected
      // This ensures stats are always fresh when user deselects items
      if (statsData) {
        setStats(statsData);
      }
      // Don't reload items here - optimistic updates handle immediate UI changes
      // Items will refresh naturally on user navigation or explicit actions
    } catch (err) {
      console.error("Failed to fetch stats:", err);
      setStats(null);
    }
  };

  const fetchMigrationStatus = async () => {
    if (!migrationId) return;
    try {
      const statusData = await getMigrationStatus(migrationId);
      setMigrationStatus(statusData);
    } catch (err) {
      console.error("Failed to fetch migration status:", err);
    }
  };
  
  const checkCanStartCopy = (): boolean => {
    // Block if we have pending retries (requires explicit user action)
    if ((stats?.pendingRetriesCount ?? 0) > 0) return false;
    
    // Block if background tasks are running
    if (hasRunningTasks) return false;
    
    // Exclusion sweeps run automatically, so don't block on hasPendingExclusions
    // hasPathReviewChanges is informational - exclusion sweep will run automatically
    
    // Check migration status - only allow copy phase start when in traversal phase
    if (migrationStatus) {
      return isTraversalPhase(migrationStatus);
    }
    
    // If we don't have migration status yet, allow it (will be checked again in handleConfirmCopy)
    // This prevents blocking the button while status is loading
    return true;
  };

  const checkRunningTasks = async (): Promise<boolean> => {
    if (!migrationId) return false;
    try {
      const runningTasks = await getRunningBackgroundTasks(migrationId);
      setHasRunningTasks(runningTasks.hasRunningTasks);
      return runningTasks.hasRunningTasks;
    } catch (err) {
      console.error("Failed to check running tasks:", err);
      return false;
    }
  };
  

  useEffect(() => {
    if (!migrationId) {
      navigate("/");
      return;
    }
    // Only load once when component mounts or migrationId changes
    // Check for saved page for root, otherwise start at 0
    const rootSavedPage = folderPageMap.get("/");
    if (rootSavedPage !== undefined) {
      setTreeCurrentPage(rootSavedPage);
    } else {
      setTreeCurrentPage(0);
    }
    loadItems(undefined);  // undefined for root (children of all roots)
    
    // Fetch migration status on startup
    fetchMigrationStatus();
    
    // Fetch pending work on startup to load state
    fetchPendingWork();
    
    // Fetch stats on startup
    fetchStats();
    
    // Check for review iteration query param
    const iterationParam = searchParams.get("reviewIteration");
    if (iterationParam) {
      const iteration = parseInt(iterationParam, 10);
      if (!isNaN(iteration) && iteration > reviewIteration) {
        setReviewIteration(iteration);
        // Refresh pending work status (API will have cleared hasPathReviewChanges automatically)
        fetchPendingWork();
        // Check for saved page for root, otherwise start at 0
        const rootSavedPage = folderPageMap.get("/");
        if (rootSavedPage !== undefined) {
          setTreeCurrentPage(rootSavedPage);
        } else {
          setTreeCurrentPage(0);
        }
        loadItems("/");
        setToast({
          message: "Sweep completed. Review updated paths.",
          type: "success",
        });
        // Clear query param
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.delete("reviewIteration");
        setSearchParams(newSearchParams);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [migrationId]);

  // Poll stats based on background tasks - starts after status updates
  const startStatsPolling = async () => {
    if (!migrationId || isPollingStatsRef.current) {
      // Already polling, ignore
      return;
    }
    
    isPollingStatsRef.current = true;
    
    const pollRunningTasks = async () => {
      try {
        const runningTasks = await getRunningBackgroundTasks(migrationId);
        
        // Update running tasks state
        setHasRunningTasks(runningTasks.hasRunningTasks);
        
        // If no running tasks, stop polling and update stats once
        if (!runningTasks.hasRunningTasks) {
          // Stop polling
          if (statsPollingIntervalRef.current) {
            clearInterval(statsPollingIntervalRef.current);
            statsPollingIntervalRef.current = null;
          }
          isPollingStatsRef.current = false;
          
          // Update stats once
          await fetchStats();
          return;
        }
        
        // If there are running tasks, update stats and continue polling
        await fetchStats();
      } catch (err) {
        console.error("Failed to poll running tasks:", err);
        // On error, stop polling
        if (statsPollingIntervalRef.current) {
          clearInterval(statsPollingIntervalRef.current);
          statsPollingIntervalRef.current = null;
        }
        isPollingStatsRef.current = false;
      }
    };
    
    // Poll immediately, then every 5 seconds
    await pollRunningTasks();
    
    if (isPollingStatsRef.current) {
      statsPollingIntervalRef.current = setInterval(pollRunningTasks, 5000);
    }
  };
  
  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (statsPollingIntervalRef.current) {
        clearInterval(statsPollingIntervalRef.current);
        statsPollingIntervalRef.current = null;
      }
      isPollingStatsRef.current = false;
    };
  }, []);

  // Reload items when pagination changes (only in tree view)
  useEffect(() => {
    if (activeTab === "tree" && migrationId) {
      const currentLocationPath = breadcrumbs.length > 0 
        ? breadcrumbs[breadcrumbs.length - 1].path 
        : undefined;
      const pathKey = currentLocationPath || "/";
      
      // Save the current page for this folder
      setFolderPageMap((prev) => {
        const newMap = new Map(prev);
        newMap.set(pathKey, treeCurrentPage);
        return newMap;
      });
      
      loadItems(currentLocationPath, treeCurrentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeCurrentPage, treeItemsPerPage]);

  // Handle click outside items per page dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        treeItemsPerPageDropdownRef.current &&
        !treeItemsPerPageDropdownRef.current.contains(event.target as Node)
      ) {
        setShowTreeItemsPerPageDropdown(false);
      }
    };

    if (showTreeItemsPerPageDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showTreeItemsPerPageDropdown]);

  // Handle stats change from list view (from API polling)
  const handleStatsChange = (newStats: PathReviewStats | null) => {
    if (newStats) {
      setStats(newStats);
    }
  };

  // Apply action deltas to local stats (no refetch). Uses current phase so traversal vs copy keys map correctly.
  const handleApplyStatsDeltas = (deltas: Record<string, number>) => {
    const phase = getCurrentPhase();
    setStats((prev) => applyStatsDeltas(prev, deltas, phase));
  };

  // Handle pagination change from list view
  const handlePaginationChange = (pagination: PaginationInfo | null, itemsPerPage: number) => {
    setListPagination(pagination);
    setListItemsPerPage(itemsPerPage);
  };

  // Handle selection warning from list view
  const handleSelectionWarning = (hasWarning: boolean) => {
    const wasWarning = showSelectionWarning;
    setShowSelectionWarning(hasWarning);
    
    // Show toast when warning first appears
    if (hasWarning && !wasWarning) {
      setToast({
        message: "Stats at the bottom may not reflect all data. Some items may be beyond the current view.",
        type: "info",
      });
    }
  };

  // Handle selection state change from list view

  const isCopyPhase = (status: MigrationStatusResponse | null): boolean =>
    isCopyReviewPhase(status);

  const isTraversalPhase = (status: MigrationStatusResponse | null): boolean =>
    isTraversalReviewPhase(status);

  const getCurrentPhase = (): "traversal" | "copy" =>
    isCopyPhase(migrationStatus) ? "copy" : "traversal";

  // Determine if we're in traversal review mode (for backwards compatibility)
  const isTraversalReviewMode = () => {
    return isTraversalPhase(migrationStatus);
  };

  // Get item status based on API data (copyStatus and traversalStatus)
  // Uses phase-appropriate status fields: copyStatus in copy phase, traversalStatus in traversal phase
  const getItemStatus = (item: DiffItem) => {
    const currentPhase = getCurrentPhase();
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
      // 4. Excluded = copy status excluded (visible but read-only in copy phase; cannot unexclude here)
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
      // Traversal (discovery) phase: copyStatus = exclude state (editable here). traversalStatus = traverse/retry state.
      const copyStatus = item.src?.copyStatus || item.copyStatus || "pending";
      const isFailed = item.src?.traversalStatus === "failed" || item.dst?.traversalStatus === "failed" || item.traversalStatus === "failed";
      const existsOnlyOnDst = item.traversalStatus === "not_on_src" || item.dst?.traversalStatus === "not_on_src";
      // Traversal phase: Failed = traversal failed. Excluded = copy status excluded (editable: can unexclude).
      // Pending = copy pending. Pending retry = traversal pending. Successful = copy successful.
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

  const loadItems = async (
    locationPath: string | undefined,
    page?: number,
    options?: { silent?: boolean }
  ) => {
    if (!migrationId) return;

    // Use the provided page, or check if we have a saved page for this path, or default to 0
    const pathKey = locationPath || "/";
    currentTreePathRef.current = pathKey;

    const savedPage = folderPageMap.get(pathKey);
    const targetPage = page !== undefined ? page : (savedPage !== undefined ? savedPage : treeCurrentPage);
    
    // Update current page state
    setTreeCurrentPage(targetPage);

    const showFullLoading = !options?.silent;
    if (showFullLoading) {
      setLoading(true);
      setError(null);
    }

    try {
      const offset = targetPage * treeItemsPerPage;
      const response = await getMigrationDiffs(migrationId, {
        locationPath: locationPath || "/",
        offset,
        limit: treeItemsPerPage,
      });

      // Response already filters out DST-only items and returns items with inSrc/inDst flags
      let filteredItems = response.items;

      // Sort: folders first, then files, both alphabetically by name
      filteredItems = filteredItems.sort((a, b) => {
        // First, separate by type: folders come before files
        if (a.type === "folder" && b.type === "file") {
          return -1;
        }
        if (a.type === "file" && b.type === "folder") {
          return 1;
        }
        // If same type, sort alphabetically by name
        return a.name.localeCompare(b.name, undefined, { 
          numeric: true, 
          sensitivity: 'base' 
        });
      });

      // Initialize pending: 
      // - Items that exist only on src (not on dst) should be marked as pending 
      // - Items that exist on both should NOT be checked (they already exist)
      const initialPending = new Set<string>();
      filteredItems.forEach((item) => {
        // Only check items that exist on src but NOT on dst (pending items to copy)
        if (item?.copyStatus === "pending") {
          initialPending.add(item.id);
        }
      });
      setPendingItems(initialPending);

      // Sync retryItems from API so icons stay correct after navigation/refetch
      const currentPhase = getCurrentPhase();
      const initialRetry = new Set<string>();
      if (currentPhase === "traversal") {
        filteredItems.forEach((item) => {
          if (isTraversalRetryPending(item)) {
            initialRetry.add(item.id);
          }
        });
        setRetryItems(initialRetry);
      }

      setItems(filteredItems);
      setPagination(response.pagination);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load path review data."
      );
    } finally {
      if (showFullLoading) {
        setLoading(false);
      }
      setLoadingMore(false);
    }
  };

  /** Reload current tree folder from API after list-view mutations (silent if tree tab hidden). */
  const handleListDataMutated = () => {
    const pathForLoad =
      breadcrumbs.length > 0
        ? breadcrumbs[breadcrumbs.length - 1].path
        : undefined;
    const silent = activeTabRef.current === "list";
    void loadItems(pathForLoad, undefined, { silent });
  };

  const handleFolderClick = (item: DiffItem) => {
    // Use copyStatus-based logic for traversal review mode
    const status = getItemStatus(item);
    
    if (status.isExcluded) {
      return; // Don't allow navigation into excluded folders
    }
    
    if (status.isFailed && item.type === "folder") {
      setToast({
        message: `This folder was unable to be traversed. Please retry it if you wish to view its contents.`,
        type: "info",
      });
      return; // Don't allow navigation into failed folders
    }

    if (retryItems.has(item.id) && item.type === "folder") {
      return; // Don't allow navigation into folders marked for retry (same as failed: just unclickable)
    }
    
    // Don't allow navigation into folders that exist only on destination
    if (status.existsOnlyOnDst && item.type === "folder") {
      return;
    }
    
    // Save current page for the current folder before navigating
    const currentLocationPath = breadcrumbs.length > 0 
      ? breadcrumbs[breadcrumbs.length - 1].path 
      : "/";
    setFolderPageMap((prev) => {
      const newMap = new Map(prev);
      newMap.set(currentLocationPath, treeCurrentPage);
      return newMap;
    });
    
    const newBreadcrumb: BreadcrumbItem = {
      path: item.locationPath,  // locationPath for navigation
      name: item.name,
    };
    setBreadcrumbs((prev) => [...prev, newBreadcrumb]);
    // Don't reset page - loadItems will check for saved page or default to 0
    loadItems(item.locationPath);  // Use locationPath
  };

  const handleBack = () => {
    // Save current page for the current folder before going back
    const currentLocationPath = breadcrumbs.length > 0 
      ? breadcrumbs[breadcrumbs.length - 1].path 
      : "/";
    setFolderPageMap((prev) => {
      const newMap = new Map(prev);
      newMap.set(currentLocationPath, treeCurrentPage);
      return newMap;
    });
    
    if (breadcrumbs.length > 0) {
      const newBreadcrumbs = breadcrumbs.slice(0, -1);
      setBreadcrumbs(newBreadcrumbs);
      const targetLocationPath =
        newBreadcrumbs.length > 0
          ? newBreadcrumbs[newBreadcrumbs.length - 1].path
          : undefined;
      // Don't reset page - loadItems will check for saved page or default to 0
      loadItems(targetLocationPath);
    } else {
      // Don't reset page - loadItems will check for saved page or default to 0
      loadItems(undefined);  // Root (children of all roots)
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    // Save current page for the current folder before navigating
    const currentLocationPath = breadcrumbs.length > 0 
      ? breadcrumbs[breadcrumbs.length - 1].path 
      : "/";
    setFolderPageMap((prev) => {
      const newMap = new Map(prev);
      newMap.set(currentLocationPath, treeCurrentPage);
      return newMap;
    });
    
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newBreadcrumbs);
    const targetLocationPath =
      newBreadcrumbs.length > 0
        ? newBreadcrumbs[newBreadcrumbs.length - 1].path
        : undefined;
    // Don't reset page - loadItems will check for saved page or default to 0
    loadItems(targetLocationPath);
  };

  // Helper function to extract parent path from a locationPath
  const getParentPath = (locationPath: string): string | undefined => {
    if (!locationPath || locationPath === "/") {
      return undefined; // Root has no parent
    }
    // Remove trailing slash if present
    const normalizedPath = locationPath.endsWith("/") ? locationPath.slice(0, -1) : locationPath;
    // Find the last slash
    const lastSlashIndex = normalizedPath.lastIndexOf("/");
    if (lastSlashIndex === 0) {
      return "/"; // Parent is root
    } else if (lastSlashIndex > 0) {
      return normalizedPath.substring(0, lastSlashIndex) || "/";
    }
    return undefined;
  };

  // Navigate to tree view and highlight an item
  const navigateToTreeView = async (item: DiffItem) => {
    // Extract parent path from item's locationPath
    const parentPath = item.parentPath || getParentPath(item.locationPath);
    
    // Build breadcrumbs to parent folder
    if (parentPath) {
      // Parse the parent path into breadcrumbs
      const pathParts = parentPath.split("/").filter(p => p !== "");
      const newBreadcrumbs: BreadcrumbItem[] = [];
      
      let currentPath = "";
      for (const part of pathParts) {
        currentPath += (currentPath === "" ? "" : "/") + part;
        newBreadcrumbs.push({
          path: "/" + currentPath,
          name: part,
        });
      }
      
      setBreadcrumbs(newBreadcrumbs);
    } else {
      // Root folder
      setBreadcrumbs([]);
    }
    
    // Switch to tree view tab
    setActiveTab("tree");
    
    // Load items for the parent folder (will use saved page if available)
    await loadItems(parentPath || undefined);
    
    // Highlight the item for 2 seconds
    setHighlightedItemId(item.id);
    setTimeout(() => {
      setHighlightedItemId(null);
    }, 2000);
  };

  const handleRetryClick = async (item: DiffItem) => {
    if (!migrationId) return;
    
    const currentPhase = getCurrentPhase();
    const isCopy = currentPhase === "copy";
    const srcNodeId = item.src?.id;
    const dstNodeId = item.dst?.id;
    
    // Determine which node has failed or pending status (failed takes priority)
    let nodeIdToUpdate: string | null = null;
    let isMarkedForRetry = false;
    
    if (isCopy) {
      // Copy phase: check copyStatus (only on src nodes)
      const copyStatus = item.src?.copyStatus || item.copyStatus || "";
      
      if (copyStatus === "failed" && srcNodeId) {
        nodeIdToUpdate = srcNodeId;
        isMarkedForRetry = retryItems.has(item.id) || false;
      } else if (copyStatus === "pending" && srcNodeId) {
        nodeIdToUpdate = srcNodeId;
        isMarkedForRetry = retryItems.has(item.id) || true;
      }
    } else {
      const nodeId = getTraversalRetryNodeId(item);
      if (nodeId) {
        nodeIdToUpdate = nodeId;
        isMarkedForRetry =
          item.src?.traversalStatus === "pending"
            ? retryItems.has(item.id) || true
            : retryItems.has(item.id) || false;
      }
    }

    if (!nodeIdToUpdate) {
      setToast({
        message: "No node with failed or pending status available for this item.",
        type: "error",
      });
      return;
    }
    
    // Store original item state for rollback
    const originalItem = { ...item };
    
    // Optimistic update
    const newRetryState = !isMarkedForRetry;
    setRetryItems((prev) => {
      const newSet = new Set(prev);
      if (newRetryState) {
        newSet.add(item.id);
      } else {
        newSet.delete(item.id);
      }
      return newSet;
    });

    // Optimistically update item's status in items array for immediate status icon update
    // Update the specific node (src or dst) that we're modifying
    setItems((prevItems) =>
      prevItems.map((i) => {
        if (i.id === item.id) {
          const updatedItem = { ...i };
          // Update the node we're modifying
          if (nodeIdToUpdate === srcNodeId && i.src) {
            if (isCopy) {
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
    
    pendingRetryUpdatesRef.current.set(item.id, newRetryState);
    
    try {
      // Mark or unmark for retry based on current state and phase
      // Use phase-specific endpoints: discovery retry for traversal phase, copy retry for copy phase
      const result = isMarkedForRetry
        ? (isCopy
            ? await unmarkNodeForRetryCopy(migrationId, nodeIdToUpdate)
            : await unmarkNodeForRetryDiscovery(migrationId, nodeIdToUpdate))
        : (isCopy
            ? await markNodeForRetryCopy(migrationId, nodeIdToUpdate)
            : await markNodeForRetryDiscovery(migrationId, nodeIdToUpdate));
      
      // If the call fails, revert optimistic update
      if (!result.success) {
        // Revert optimistic update
        setRetryItems((prev) => {
          const newSet = new Set(prev);
          if (isMarkedForRetry) {
            newSet.add(item.id);
          } else {
            newSet.delete(item.id);
          }
          return newSet;
        });
        setItems((prevItems) =>
          prevItems.map((i) => {
            if (i.id === item.id) {
              return originalItem;
            }
            return i;
          })
        );
        pendingRetryUpdatesRef.current.delete(item.id);
        setToast({
          message: result.error || "Failed to update node. Please try again.",
          type: "error",
        });
        return;
      }
      
      // Success – apply deltas from response instead of refetching stats
      pendingRetryUpdatesRef.current.delete(item.id);
      if (result.deltas && Object.keys(result.deltas).length > 0) {
        handleApplyStatsDeltas(result.deltas);
      }
      
      // Show success message
      setToast({
        message: newRetryState 
          ? "Item marked for retry" 
          : "Item unmarked for retry",
        type: "success",
      });
      if (activeTabRef.current === "tree") {
        setTreeListRefreshToken((n) => n + 1);
      }
    } catch (err) {
      // Revert optimistic update on network error
      setRetryItems((prev) => {
        const newSet = new Set(prev);
        if (isMarkedForRetry) {
          newSet.add(item.id);
        } else {
          newSet.delete(item.id);
        }
        return newSet;
      });
      setItems((prevItems) =>
        prevItems.map((i) => {
          if (i.id === item.id) {
            return originalItem;
          }
          return i;
        })
      );
      pendingRetryUpdatesRef.current.delete(item.id);
      
      setToast({
        message: err instanceof Error ? err.message : "Network error: Failed to update node. Please try again.",
        type: "error",
      });
    }
  };

  const handleCheckboxChange = async (
    item: DiffItem,
    currentChecked: boolean
  ) => {
    // In copy phase, exclusion/inclusion are read-only (no actions allowed)
    if (isCopyPhase(migrationStatus)) {
      return;
    }

    const isFolder = item.type === "folder";
    const status = getItemStatus(item);
    
    // Items that exist on both or only on destination are locked (not clickable)
    if ((status.existsOnBoth || status.existsOnlyOnDst) && isFolder) {
      return;
    }

    if (!migrationId) return;

    // Determine if we're excluding or unexcluding based on copyStatus
    // If currently pending (not excluded), clicking should EXCLUDE it
    // If currently excluded, clicking should UNEXCLUDE it (back to pending)
    const isExcluding = !status.isExcluded;
    // Separate src and dst node IDs to ensure they stay in sync
    const srcNodeId = item.src?.id;
    const dstNodeId = item.dst?.id && (!item.src?.id || item.dst.id !== item.src.id) ? item.dst.id : null;

    if (!srcNodeId && !dstNodeId) {
      setToast({
        message: "No node ID available for this item.",
        type: "error",
      });
      return;
    }

    // Store original item state for rollback
    const originalItem = { ...item };

    // Optimistic update: immediately update UI
    const newChecked = !currentChecked;
    setPendingItems((prev) => {
      const newSet = new Set(prev);
      if (newChecked) {
        newSet.add(item.id);
      } else {
        newSet.delete(item.id);
      }
      return newSet;
    });

    // Optimistically update item's copyStatus in items array for immediate status icon update
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

    // Track pending update
    pendingUpdatesRef.current.set(item.id, newChecked);

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
          setPendingItems((prev) => {
            const newSet = new Set(prev);
            if (currentChecked) {
              newSet.add(item.id);
            } else {
              newSet.delete(item.id);
            }
            return newSet;
          });
          setItems((prevItems) =>
            prevItems.map((i) => {
              if (i.id === item.id) {
                return originalItem;
              }
              return i;
            })
          );
          pendingUpdatesRef.current.delete(item.id);
          // Check if error is due to phase locking
          let errorMessage = srcResult.error || "Failed to update source node. Please try again.";
          if (srcResult.error && (
            srcResult.error.includes("copy phase") || 
            srcResult.error.includes("exclusion operations are not available")
          )) {
            errorMessage = "Exclusion is only available during traversal review";
          }
          setToast({
            message: errorMessage,
            type: "error",
          });
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
          setPendingItems((prev) => {
            const newSet = new Set(prev);
            if (currentChecked) {
              newSet.add(item.id);
            } else {
              newSet.delete(item.id);
            }
            return newSet;
          });
          setItems((prevItems) =>
            prevItems.map((i) => {
              if (i.id === item.id) {
                return originalItem;
              }
              return i;
            })
          );
          pendingUpdatesRef.current.delete(item.id);
          setToast({
            message: dstResult.error || "Failed to update destination node. Changes have been rolled back.",
            type: "error",
          });
          return;
        }
      }
      
      // Both succeeded (or only one node exists and it succeeded)
      pendingUpdatesRef.current.delete(item.id);
      const merged = mergeDeltas(srcResult, dstResult);
      if (Object.keys(merged).length > 0) {
        handleApplyStatsDeltas(merged);
      }
      if (activeTabRef.current === "tree") {
        setTreeListRefreshToken((n) => n + 1);
      }
    } catch (err) {
      // Revert optimistic update on network error
      setPendingItems((prev) => {
        const newSet = new Set(prev);
        if (currentChecked) {
          newSet.add(item.id);
        } else {
          newSet.delete(item.id);
        }
        return newSet;
      });

      setItems((prevItems) =>
        prevItems.map((i) => {
          if (i.id === item.id) {
            return originalItem;
          }
          return i;
        })
      );

      pendingUpdatesRef.current.delete(item.id);

      // Show error toast
      const errorMessage =
        err instanceof Error
          ? err.message
          : `Network error: Failed to ${isExcluding ? "exclude" : "unexclude"} node.`;
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

    // Capture the element reference before the timeout
    const element = event.currentTarget as HTMLElement;
    
    hoverTimeoutRef.current = setTimeout(() => {
      const rect = element.getBoundingClientRect();
      setHoverPosition({ x: rect.right + 10, y: rect.top });
      setHoveredItemId(itemId);
    }, 250);
  };

  const handleItemLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredItemId(null);
    setHoverPosition(null);
  };

  // Items are now white by default, no color coding needed

  const handleStartCopying = () => {
    // In copy phase, this is a retry operation
    if (isCopyPhase(migrationStatus)) {
      // Show confirmation dialog for copy retry
      setConfirmDialogType("copy");
      setShowConfirmDialog(true);
      return;
    }
    
    // In traversal phase, block if we have pending retries (requires explicit user action)
    if ((stats?.pendingRetriesCount ?? 0) > 0) {
      return; // Button should be disabled, but this is a safety check
    }
    // Show confirmation dialog for copy
    setConfirmDialogType("copy");
    setShowConfirmDialog(true);
  };
  
  const handleStartRetryDiscovery = () => {
    // Show confirmation dialog for retry
    setConfirmDialogType("retry");
    setShowConfirmDialog(true);
  };

  const handleConfirmCopy = async () => {
    setShowConfirmDialog(false);
    
    if (!migrationId) return;
    
    // Check for running tasks before starting copy
    const hasRunning = await checkRunningTasks();
    if (hasRunning) {
      setToast({
        message: "Cannot start copy: background tasks are running. Please wait.",
        type: "error",
      });
      return;
    }
    
    setIsTriggeringSweep(true);
    try {
      // Use phase-change endpoint which handles exclusion sweep automatically
      const result = await changePhase(migrationId, "copy");
      
      if (!result.success) {
        setToast({
          message: result.error || "Failed to start copy phase",
          type: "error",
        });
        setIsTriggeringSweep(false);
        return;
      }

      setIsTriggeringSweep(false);
      const copyRetry = isCopyPhase(migrationStatus);
      navigate(
        `/progress-monitor/${migrationId}?mode=copy${copyRetry ? "&retry=1" : ""}`
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to start copy phase";
      setToast({
        message: errorMessage,
        type: "error",
      });
      setIsTriggeringSweep(false);
    }
  };
  
  const handleConfirmRetry = async () => {
    setShowConfirmDialog(false);
    
    if (!migrationId) return;
    
    // Check for running tasks before starting retry
    const hasRunning = await checkRunningTasks();
    if (hasRunning) {
      setToast({
        message: "Cannot start retry: background tasks are running. Please wait.",
        type: "error",
      });
      return;
    }
    
    setIsTriggeringSweep(true);
    try {
      // Use retry-sweep endpoint instead of phase-change
      const result = await triggerRetrySweep(migrationId);
      
      if (!result.success) {
        // Check if error is due to phase locking
        let errorMessage = result.error || "Failed to start retry discovery";
        if (result.error && (
          result.error.includes("copy phase") ||
          result.error.includes("traversal operations are locked")
        )) {
          errorMessage = "Retry sweep is only available during traversal review";
        }
        setToast({
          message: errorMessage,
          type: "error",
        });
        setIsTriggeringSweep(false);
        return;
      }

      setIsTriggeringSweep(false);
      navigate(`/progress-monitor/${migrationId}?mode=discovery&retry=1`);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to start retry discovery";
      setToast({
        message: errorMessage,
        type: "error",
      });
      setIsTriggeringSweep(false);
    }
  };

  const handleCancelCopy = () => {
    setShowConfirmDialog(false);
  };

  const hoveredItem = items.find((item) => item.id === hoveredItemId);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <section className="path-review">
      <GlassSurfacePanel className="path-review__content path-review__content--with-button">
        <PageBackButton
          onClick={() => navigate(-1)}
          title="Go back to previous page"
          className="path-review__back"
        />
        <header className="path-review__header">
          <h1>
            {isCopyPhase(migrationStatus) ? (
              <>Review <span className="path-review__highlight">Copy Results</span></>
            ) : (
              <>Review the <span className="path-review__highlight">Action Plan</span></>
            )}
          </h1>
        </header>

        {/* Tabs */}
        <div className="path-review__tabs">
          <button
            type="button"
            className={`path-review__tab ${activeTab === "tree" ? "path-review__tab--active" : ""}`}
            onClick={() => setActiveTab("tree")}
          >
            Tree View
          </button>
          <button
            type="button"
            className={`path-review__tab ${activeTab === "list" ? "path-review__tab--active" : ""}`}
            onClick={() => setActiveTab("list")}
          >
            List View
          </button>
        </div>

        {error && <div className="path-review__error">{error}</div>}

        {/* Tree View Content */}
        <div className={activeTab === "tree" ? "path-review__tab-content" : "path-review__tab-content path-review__tab-content--hidden"}>
          <>

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
                loadItems(undefined);  // undefined for root (children of all roots)
              }}
              disabled={breadcrumbs.length === 0}
            >
              /
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
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Status Legend with Pagination */}
        {!loading && items.length > 0 && (
          <div className="path-review-list__legend-wrapper">
            <PathReviewLegend zoomLevel={1} className="path-review__legend--compact" phase={getCurrentPhase()} />
            {pagination && (
              <div className="path-review-list__page-nav">
                <div className="path-review-list__items-per-page-compact" ref={treeItemsPerPageDropdownRef}>
                  <button
                    type="button"
                    className="path-review-list__items-per-page-button"
                    onClick={() => setShowTreeItemsPerPageDropdown(!showTreeItemsPerPageDropdown)}
                    title="Items per page"
                    aria-label="Items per page"
                  >
                    {treeItemsPerPage}
                    <ChevronDown size={14} />
                  </button>
                  {showTreeItemsPerPageDropdown && (
                    <div className="path-review-list__items-per-page-dropdown">
                      {[50, 100, 500, 1000].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`path-review-list__items-per-page-option ${
                            treeItemsPerPage === value ? "path-review-list__items-per-page-option--selected" : ""
                          }`}
                          onClick={() => {
                            setTreeItemsPerPage(value);
                            setTreeCurrentPage(0);
                            setShowTreeItemsPerPageDropdown(false);
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
                  onClick={() => {
                    const newPage = Math.max(0, treeCurrentPage - 1);
                    const currentLocationPath = breadcrumbs.length > 0 
                      ? breadcrumbs[breadcrumbs.length - 1].path 
                      : "/";
                    setTreeCurrentPage(newPage);
                    // Save the page immediately
                    setFolderPageMap((prev) => {
                      const newMap = new Map(prev);
                      newMap.set(currentLocationPath, newPage);
                      return newMap;
                    });
                  }}
                  disabled={treeCurrentPage === 0 || loading}
                  title="Previous page"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="path-review__page-info">
                  Page {treeCurrentPage + 1} of {(() => {
                    const total = pagination.total;
                    return total > 0 ? Math.ceil(total / treeItemsPerPage) : 1;
                  })()}
                </span>
                <button
                  type="button"
                  className="path-review-list__page-nav-button"
                  onClick={() => {
                    const total = pagination.total;
                    const totalPages = total > 0 ? Math.ceil(total / treeItemsPerPage) : 1;
                    const newPage = Math.min(totalPages - 1, treeCurrentPage + 1);
                    const currentLocationPath = breadcrumbs.length > 0 
                      ? breadcrumbs[breadcrumbs.length - 1].path 
                      : "/";
                    setTreeCurrentPage(newPage);
                    // Save the page immediately
                    setFolderPageMap((prev) => {
                      const newMap = new Map(prev);
                      newMap.set(currentLocationPath, newPage);
                      return newMap;
                    });
                  }}
                  disabled={(() => {
                    const total = pagination.total;
                    if (total > 0) {
                      return treeCurrentPage >= Math.ceil(total / treeItemsPerPage) - 1;
                    }
                    return !pagination.hasMore;
                  })()}
                  title="Next page"
                  aria-label="Next page"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Items List */}
        <div className="path-review__list-container" style={densityStyle}>
          <div ref={treeListRef} className="path-review__list">
            {loading ? (
              <div className="path-review__empty">Loading...</div>
            ) : items.length === 0 ? (
              <div className="path-review__empty">This folder is empty.</div>
            ) : (
              <>
                {items.map((item) => {
                  const status = getItemStatus(item);
                  const isFolder = item.type === "folder";
                  const isLocked = isFolder && (status.existsOnBoth || status.existsOnlyOnDst); // Locked if folder exists on both or only on destination
                  // Items with pending traversalStatus are treated as marked for retry
                  // But if traversalStatus is "failed", it's not marked for retry (even if in retryItems set)
                  // Check both src and dst nodes - failed overrides pending
                  const isMarkedForRetry =
                    isTraversalRetryPending(item) ||
                    (retryItems.has(item.id) && !hasTraversalFailure(item));
                  const isHighlighted = highlightedItemId === item.id;
                  // isChecked is based on copyStatus: not excluded and not successful
                  const isChecked = !status.isExcluded && !status.isSuccessful;
                  const failureMessage = getDiffItemFailureMessage(item);

                  return (
                    <div
                      key={item.id}
                      className={`path-review__item ${status.isExcluded ? "path-review__item--excluded" : ""} ${isHighlighted ? "path-review__item--highlighted" : ""}`}
                      onMouseEnter={(e) => handleItemHover(item.id, e)}
                      onMouseLeave={handleItemLeave}
                    >
                      <div className="path-review__item-status-icon-container">
                        <PathReviewStatusIcon
                          item={item}
                          isMarkedForRetry={isMarkedForRetry}
                          isLocked={isLocked}
                          zoomLevel={1}
                          phase={getCurrentPhase()}
                          onRetryClick={handleRetryClick}
                          onExcludeClick={handleCheckboxChange}
                        />
                      </div>

                      <div className="path-review__item-icon">
                        {isFolder ? (
                          <Folder size={16} />
                        ) : (
                          <File size={16} />
                        )}
                      </div>

                      <div
                        className={`path-review__item-name-col ${isFolder ? "path-review__item-name--folder" : ""}`}
                        onClick={() => {
                          if (isFolder && !status.isExcluded && !status.isFailed && !isMarkedForRetry && !status.existsOnlyOnDst) {
                            handleFolderClick(item);
                          }
                        }}
                        style={{
                          cursor: isFolder && !status.isExcluded && !status.isFailed && !isMarkedForRetry && !status.existsOnlyOnDst
                            ? "pointer"
                            : (status.isExcluded || status.isFailed || isMarkedForRetry || status.existsOnlyOnDst)
                            ? "not-allowed"
                            : "default",
                        }}
                      >
                        <div className="path-review__item-name">{item.name}</div>
                        {failureMessage && (
                          <div
                            className="path-review__item-failure-message"
                            title={failureMessage}
                          >
                            {failureMessage}
                          </div>
                        )}
                      </div>

                      <div className="path-review__item-path-col" title={item.locationPath}>
                        {item.locationPath}
                      </div>

                      <ListItemMeta
                        className="path-review__item-meta-col"
                        lastUpdated={item.lastUpdated}
                        size={item.size}
                        type={isFolder ? "folder" : "file"}
                      />

                      {isFolder ? (
                        <ChevronRight size={16} className="path-review__item-arrow" />
                      ) : (
                        <span className="path-review__item-arrow-spacer" aria-hidden="true" />
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
          </>
        </div>

        {/* List View Content */}
        {migrationId && (
          <div 
            className={`path-review__list-view-container ${activeTab === "list" ? "" : "path-review__tab-content--hidden"}`}
          >
            <PathReviewListView
              migrationId={migrationId}
              isActive={activeTab === "list"}
              treeListRefreshToken={treeListRefreshToken}
              onListDataMutated={handleListDataMutated}
              onItemUpdate={() => {
                startStatsPolling();
              }}
              onApplyStatsDeltas={handleApplyStatsDeltas}
              onStatsChange={handleStatsChange}
              onSelectionStatsWarning={handleSelectionWarning}
              onPaginationChange={handlePaginationChange}
              onNavigateToTreeView={navigateToTreeView}
              onToast={(message, type) => setToast({ message, type })}
            />
          </div>
        )}

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

        {/* Footer with Stats, Zoom Control, Sweep Buttons, and Start Copying Button */}
        <div className="path-review__footer">
          <ListDensityControl />
          {/* Stats - Only show on tree view */}
          {stats && activeTab === "tree" && (
            <PathReviewFooterInfo
              items={[
                { label: "Folders", value: stats.foldersCount.toLocaleString() },
                { label: "Files", value: stats.filesCount.toLocaleString() },
                {
                  label: "Folders/Files",
                  isRatio: true,
                  ratioValues: {
                    folders: stats.foldersRatio,
                    files: stats.filesRatio,
                  },
                },
                { label: "Size (Src)", value: formatBytes(stats.totalFileSize.src) },
                { 
                  label: "Size (Dst)", 
                  value: formatBytes(stats.totalFileSize.dst),
                  tooltip: {
                    tipId: "path-review-dst-size-explanation",
                    category: "path-review-dst-size",
                    position: "above",
                    content: (
                      <p>This is only the cumulative size of all the overlapping items between the source and the destination. Not the total potential size of everything inside of your destination root folder.</p>
                    ),
                  },
                },
                { label: "Pending", value: stats.pendingCount.toLocaleString() },
                { label: "Failed", value: stats.failedCount.toLocaleString() },
                { label: "Excluded", value: stats.excludedCount.toLocaleString() },
                { label: "Pending Retry", value: (stats.pendingRetriesCount ?? 0).toLocaleString() },
              ]}
            />
          )}
          {/* Pagination Info - Only show on list view */}
          {activeTab === "list" && listPagination && (
            <PathReviewFooterInfo
              items={[
                {
                  label: "Showing",
                  value: `${listPagination.offset + 1} to ${Math.min(listPagination.offset + listItemsPerPage, listPagination.total)} of ${listPagination.total.toLocaleString()} item${listPagination.total !== 1 ? "s" : ""}`,
                },
              ]}
            />
          )}
          {!(stats && activeTab === "tree") && !(activeTab === "list" && listPagination) && <div></div>}
          <div className="path-review__footer-actions">
            {/* Review Iteration Counter */}
            {reviewIteration > 1 && (
              <div className="path-review__iteration-counter">
                Review {reviewIteration}
              </div>
            )}
            
            {/* Retry Discovery, Retry Copying, or Start Copying Button */}
            {isCopyPhase(migrationStatus) ? (
              // Copy phase: show "Retry Copying of Failed Items" if pendingRetriesCount > 0
              (stats?.pendingRetriesCount ?? 0) > 0 ? (
                <button
                  type="button"
                  className="glass-button glass-button--progress-cta"
                  onClick={handleStartCopying}
                  disabled={isTriggeringSweep || hasRunningTasks}
                  title="Retry copying failed and pending items"
                >
                  <RotateCw size={20} style={{ marginRight: "0.5rem" }} />
                  Retry Copying of Failed Items
                </button>
              ) : null // Hide button if there's nothing to retry
            ) : (
              // Traversal phase: show retry discovery or start copying
              (stats?.pendingRetriesCount ?? 0) > 0 ? (
                <button
                  type="button"
                  className="glass-button glass-button--progress-cta"
                  onClick={handleStartRetryDiscovery}
                  disabled={isTriggeringSweep || hasRunningTasks}
                  title="Retry failed items and re-traverse them"
                >
                  <RotateCw size={20} style={{ marginRight: "0.5rem" }} />
                  Retry Discovery of Failed Items
                </button>
              ) : (
                <button
                  type="button"
                  className="glass-button glass-button--progress-cta"
                  onClick={handleStartCopying}
                  disabled={!checkCanStartCopy() || hasRunningTasks}
                  title={
                    !checkCanStartCopy()
                      ? migrationStatus
                        ? (() => {
                            if (getMigrationPhase(migrationStatus) !== "awaiting-traversal-review") {
                              return `Migration phase: ${getMigrationPhase(migrationStatus)} (needs: awaiting-traversal-review)`;
                            }
                            return "Migration not ready for copy phase";
                          })()
                        : "Loading migration status..."
                      : pendingWork?.hasPathReviewChanges
                      ? "Exclusion sweep will run automatically before copy phase"
                      : "Start the copy phase"
                  }
                >
                  <Copy size={20} style={{ marginRight: "0.5rem" }} />
                  Start Copying
                </button>
              )
            )}
          </div>
        </div>
      </GlassSurfacePanel>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <ConfirmDialog
          title={confirmDialogType === "retry" ? "Retry Discovery" : (isCopyPhase(migrationStatus) ? "Retry Copying" : "Confirm Copy")}
          message={
            confirmDialogType === "retry"
              ? "We'll try to discover what is in those folders that you marked to retry. We'll send you back here to review the results when the process is complete. Would you like to proceed?"
              : isCopyPhase(migrationStatus)
              ? "We'll retry copying the failed and pending items. We'll send you back here to review the results when the process is complete. Would you like to proceed?"
              : "Are you sure you'd like to copy over these selected items?"
          }
          confirmLabel="Yes"
          cancelLabel="No"
          onConfirm={confirmDialogType === "retry" ? handleConfirmRetry : handleConfirmCopy}
          onCancel={() => setShowConfirmDialog(false)}
        />
      )}

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