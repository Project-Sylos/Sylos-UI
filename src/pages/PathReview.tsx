import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  EyeOff,
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
  markNodeForRetryDelete,
  unmarkNodeForRetryDelete,
  DiffItem,
  getPendingWork,
  changePhase,
  getDeleteSummary,
  prepareSourceCleanup,
  DeleteSummaryResponse,
  PendingWorkResponse,
  getPathReviewStats,
  PathReviewStats,
  PaginationInfo,
  getRunningBackgroundTasks,
  triggerRetrySweep,
  resumeMigration,
  getMigrationStatus,
  listPathIssues,
  PathIssue,
  applyPathIssuesToDiffItems,
  acceptAllPathProposals,
  ignoreRemainingPathIssues,
  ignorePathIssueSubtree,
  unignorePathIssueSubtree,
} from "../api/services";
import CompatibilityCaution from "../components/CompatibilityCaution";
import DestinationRenameHint from "../components/DestinationRenameHint";
import PathReviewInspector from "../components/PathReviewInspector";
import PathReviewContextMenu from "../components/PathReviewContextMenu";
import PathRenameEditor from "../components/PathRenameEditor";
import { PATH_REVIEW_COPY, summarizePathIssues } from "../utils/pathReviewCopy";
import {
  MigrationStatusResponse,
  isTraversalReviewPhase,
  isCopyReviewPhase,
  isDeleteReviewPhase,
  getMigrationPhase,
} from "../types/migrations";
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
import PathReviewIssuesButton from "../components/PathReviewIssuesButton";
import PathReviewIssuesPanel, {
  type PathReviewListJumpTarget,
} from "../components/PathReviewIssuesPanel";
import PathReviewFooterInfo from "../components/PathReviewFooterInfo";
import ListItemMeta from "../components/ListItemMeta";
import { getDiffItemFailureMessage } from "../utils/diffFailureMessage";
import {
  getTraversalRetryNodeId,
  hasTraversalFailure,
  isTraversalRetryPending,
} from "../utils/pathReviewTraversalStatus";
import {
  applyDeleteStatusInItems,
  toggleDeleteExclude,
} from "../utils/pathReviewDeletePlan";
import {
  getPathReviewDisplayPhase,
  getPathReviewUIPhase,
  isSourceCleanupPlanPhase,
} from "../utils/pathReviewPhase";
import { isCopyComplete } from "../utils/copyStatus";
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
 * Canonical keys include traversal/copy/delete status buckets plus excluded,
 * folders, files, sizeSrc, and sizeDst. Only non-zero deltas are present.
 * Stats mapping matches normalizePathReviewStats: “Pending” is copyStatusCounts.pending (copyPending),
 * “Pending Retry” is traversal pending in traversal phase / copy pending in copy phase.
 * - Traversal: copyPending → pendingCount; traversalPending → pendingCount (legacy); traversalFailed → failedCount; traversalPendingRetry → pendingRetriesCount.
 * - Copy: copyPending → pendingCount and pendingRetriesCount; copyFailed → failedCount.
 * - Delete/source cleanup: deletePending → pendingCount; deleteFailed → failedCount;
 *   deleteSkipped → excludedCount.
 */
function applyStatsDeltas(
  prev: PathReviewStats | null,
  deltas: Record<string, number> | undefined,
  phase: "traversal" | "copy" | "delete" | "source-cleanup"
): PathReviewStats | null {
  if (!prev || !deltas || Object.keys(deltas).length === 0) return prev;
  const d = (k: string) => deltas[k] ?? 0;
  const isCopy = phase === "copy";
  const isDelete = phase === "delete" || phase === "source-cleanup";
  const failedDelta = isDelete
    ? d("deleteFailed")
    : isCopy
      ? d("copyFailed")
      : d("traversalFailed");
  const pendingDelta = isDelete
    ? d("deletePending")
    : d("copyPending") + (isCopy ? 0 : d("traversalPending"));
  const foldersCount = Math.max(0, prev.foldersCount + d("folders"));
  const filesCount = Math.max(0, prev.filesCount + d("files"));
  const total = foldersCount + filesCount;
  return {
    pendingCount: Math.max(0, prev.pendingCount + pendingDelta),
    failedCount: Math.max(0, prev.failedCount + failedDelta),
    excludedCount: Math.max(
      0,
      prev.excludedCount + (isDelete ? d("deleteSkipped") : d("excluded"))
    ),
    pendingRetriesCount: Math.max(
      0,
      (prev.pendingRetriesCount ?? 0) +
        (phase === "delete"
          ? d("deletePending")
          : phase === "source-cleanup"
            ? 0
            : isCopy
              ? d("copyPending")
              : d("traversalPendingRetry"))
    ),
    successfulCount: Math.max(
      0,
      (prev.successfulCount ?? 0) +
        (isDelete ? d("deleteDeleted") : d("copySuccessful"))
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

export default function PathReview({ reviewView = "default" }: { reviewView?: "default" | "source-cleanup" }) {
  return (
    <ListDensityProvider storageKey={PATH_REVIEW_DENSITY_STORAGE_KEY}>
      <PathReviewPage reviewView={reviewView} />
    </ListDensityProvider>
  );
}

function PathReviewPage({ reviewView }: { reviewView: "default" | "source-cleanup" }) {
  const { migrationId } = useParams<{ migrationId: string }>();
  const navigate = useNavigate();
  const isSourceCleanupView = reviewView === "source-cleanup";
  const { densityStyle, setListViewportElement } = useListDensity();
  const treeListRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<"tree" | "list">("tree");
  const [issuesPanelOpen, setIssuesPanelOpen] = useState(false);
  const [listJumpToken, setListJumpToken] = useState(0);
  const [listJumpTarget, setListJumpTarget] = useState<PathReviewListJumpTarget | null>(null);
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
  const [inspectorItem, setInspectorItem] = useState<DiffItem | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogType, setConfirmDialogType] = useState<
    "copy" | "retry" | "delete" | "delete-retry" | "ignore-remaining"
  >("copy");
  const [pathIssues, setPathIssues] = useState<PathIssue[]>([]);
  const [pathIssuesRemainingCount, setPathIssuesRemainingCount] = useState(0);
  const activePathIssues = useMemo(
    () => pathIssues.filter((i) => !i.ignored),
    [pathIssues]
  );
  const [renameTarget, setRenameTarget] = useState<DiffItem | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: DiffItem;
  } | null>(null);
  const [pathBusyMessage, setPathBusyMessage] = useState<string | null>(null);
  const statsPollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingStatsRef = useRef<boolean>(false);
  const pendingRetryUpdatesRef = useRef<Map<string, boolean>>(new Map());
  const pendingUpdatesRef = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    // Keep inspector in sync with path-issue overlays and current tree page.
    setInspectorItem((prev) => {
      if (!prev) return prev;
      const fromTree = items.find((i) => i.id === prev.id);
      if (fromTree) {
        return applyPathIssuesToDiffItems([fromTree], pathIssues)[0];
      }
      if (activeTab === "tree") {
        return null;
      }
      return applyPathIssuesToDiffItems([prev], pathIssues)[0];
    });
  }, [items, pathIssues, activeTab]);

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
  const [deleteSummary, setDeleteSummary] = useState<DeleteSummaryResponse | null>(null);
  const sourceCleanupPreparedRef = useRef(false);
  /** Source-cleanup / delete review: hide destination-only by default. */
  const [showDestinationOnly, setShowDestinationOnly] = useState(false);
  
  // Tree view pagination
  const [treeCurrentPage, setTreeCurrentPage] = useState(0);
  const [treeItemsPerPage, setTreeItemsPerPage] = useState(100);
  const [showTreeItemsPerPageDropdown, setShowTreeItemsPerPageDropdown] = useState(false);
  const treeItemsPerPageDropdownRef = useRef<HTMLDivElement>(null);
  // Map of locationPath -> page number to remember pagination per folder
  const [folderPageMap, setFolderPageMap] = useState<Map<string, number>>(new Map());
  const currentTreePathRef = useRef<string>("/");

  const destinationOnlyToggleVisible =
    isSourceCleanupView || isDeleteReviewPhase(migrationStatus);
  const includeDestinationOnly = destinationOnlyToggleVisible
    ? showDestinationOnly
    : true;

  const handleShowDestinationOnlyChange = (next: boolean) => {
    setShowDestinationOnly(next);
    setTreeCurrentPage(0);
    setFolderPageMap(new Map());
  };
  
  const [searchParams, setSearchParams] = useSearchParams();

  const fetchPathIssues = async (): Promise<PathIssue[]> => {
    if (!migrationId) return [];
    try {
      const res = await listPathIssues(migrationId);
      const issues = res.issues || [];
      setPathIssues(issues);
      return issues;
    } catch (err) {
      console.error("Failed to fetch destination name issues:", err);
      return [];
    }
  };

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
      const statsData = await getPathReviewStats(
        migrationId,
        currentPhase,
        isSourceCleanupView ? "source-cleanup" : undefined
      );
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

    // Destination name review queue (plain-language path issues)
    void fetchPathIssues();
    
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

  useEffect(() => {
    if (!migrationId || !isSourceCleanupView || sourceCleanupPreparedRef.current) return;
    // Wait for phase before deciding: prepareSourceCleanup rebuilds the removal plan and
    // requires awaiting-copy-review. When we enter source-cleanup to view removal *results*
    // (delete-in-progress/suspended/awaiting-delete-review), skip prep and just show results.
    if (!migrationStatus) return;
    if (!isSourceCleanupPlanPhase(migrationStatus)) {
      sourceCleanupPreparedRef.current = true;
      return;
    }
    sourceCleanupPreparedRef.current = true;

    (async () => {
      try {
        const result = await prepareSourceCleanup(migrationId, {});
        if (!result.success) {
          sourceCleanupPreparedRef.current = false;
          setToast({
            message: result.error || "Failed to prepare source removal plan",
            type: "error",
          });
          return;
        }
        if (result.deltas) {
          handleApplyStatsDeltas(result.deltas);
        }
        const pathKey = currentTreePathRef.current;
        await loadItems(pathKey === "/" ? undefined : pathKey, undefined, { silent: true });
        setTreeListRefreshToken((t) => t + 1);
      } catch (err) {
        sourceCleanupPreparedRef.current = false;
        setToast({
          message: err instanceof Error ? err.message : "Failed to prepare source removal plan",
          type: "error",
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [migrationId, isSourceCleanupView, migrationStatus]);

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
  }, [treeCurrentPage, treeItemsPerPage, includeDestinationOnly]);

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

  // Apply action deltas to local stats (no refetch), projected for the visible review.
  const handleApplyStatsDeltas = (deltas: Record<string, number>) => {
    const phase = isSourceCleanupView ? "source-cleanup" : getCurrentPhase();
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

  const isDeletePhase = (status: MigrationStatusResponse | null): boolean =>
    isDeleteReviewPhase(status);

  const isTraversalPhase = (status: MigrationStatusResponse | null): boolean =>
    isTraversalReviewPhase(status);

  const getCurrentPhase = () => getPathReviewUIPhase(migrationStatus);

  const getDisplayPhase = () =>
    getPathReviewDisplayPhase(migrationStatus, reviewView);
  const showCompatUI =
    !isSourceCleanupView && !isDeletePhase(migrationStatus);

  const isAwaitingCopyReview =
    getMigrationPhase(migrationStatus) === "awaiting-copy-review";

  const manualReviewCount = activePathIssues.filter(
    (i) => i.status === "manual_review"
  ).length;
  const pathIssueSummary = useMemo(
    () => summarizePathIssues(activePathIssues),
    [activePathIssues]
  );
  const issuesAttentionCount =
    (stats?.failedCount ?? 0) +
    (!isSourceCleanupView &&
    !isDeletePhase(migrationStatus) &&
    !isCopyPhase(migrationStatus)
      ? manualReviewCount
      : 0);
  const issuesWarningCount =
    !isSourceCleanupView &&
    !isDeletePhase(migrationStatus) &&
    !isCopyPhase(migrationStatus)
      ? pathIssueSummary.suggestionCount
      : 0;

  const openIssuesPanel = () => {
    setIssuesPanelOpen(true);
    setInspectorItem(null);
  };

  const handleIssuesJump = (target: PathReviewListJumpTarget) => {
    setListJumpTarget(target);
    setListJumpToken((n) => n + 1);
    setActiveTab("list");
    setIssuesPanelOpen(true);
  };

  // Determine if we're in traversal review mode (for backwards compatibility)
  const isTraversalReviewMode = () => {
    return isTraversalPhase(migrationStatus);
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
      // 2. Successful = copy complete (successful / already_existed) OR item is dst-only
      // 3. Pending = src.copyStatus === "pending" (didn't get brought over - treat same as failed)
      // 4. Excluded = copy status excluded (visible but read-only in copy phase; cannot unexclude here)
      const isExcluded =
        copyStatus === "exclusion_explicit" ||
        copyStatus === "exclusion_inherited" ||
        copyStatus === "excluded";
      const isPending = copyStatus === "pending";
      const isSuccessful = isCopyComplete(copyStatus) || existsOnlyOnDst;
      const existsOnBoth = isCopyComplete(copyStatus); // Copy complete means it exists on both
      
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
      // Pending = copy pending. Pending retry = traversal pending. Successful = copy complete.
      const isExcluded =
        copyStatus === "exclusion_explicit" ||
        copyStatus === "exclusion_inherited" ||
        copyStatus === "excluded";
      const isPending = copyStatus === "pending";
      const isSuccessful = isCopyComplete(copyStatus);
      const existsOnBoth = isSuccessful; // Copy complete means it exists on both
      
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
        includeDestinationOnly,
      });

      // Server may exclude destination-only when includeDestinationOnly is false.
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
      } else if (currentPhase === "delete") {
        filteredItems.forEach((item) => {
          if ((item.src?.deleteStatus || "") === "pending") {
            initialRetry.add(item.id);
          }
        });
        setRetryItems(initialRetry);
      }

      setItems(applyPathIssuesToDiffItems(filteredItems, await fetchPathIssues()));
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

    setInspectorItem(null);
    
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
    setInspectorItem(null);
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
    setInspectorItem(null);
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
    setInspectorItem(applyPathIssuesToDiffItems([item], pathIssues)[0]);
    setTimeout(() => {
      setHighlightedItemId(null);
    }, 2000);
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
        isMarkedForRetry = deleteStatus === "pending" || retryItems.has(item.id);
      }
    } else if (isCopy) {
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
    
    pendingRetryUpdatesRef.current.set(item.id, newRetryState);
    
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
    // In copy/delete review, exclusion/inclusion are read-only (no actions allowed)
    if (isCopyPhase(migrationStatus) || isDeletePhase(migrationStatus)) {
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
      // Exclude also ignores naming warnings; unexclude restores them.
      await refreshAfterPathChange();
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

  const selectInspectorItem = (item: DiffItem) => {
    setIssuesPanelOpen(false);
    setInspectorItem(applyPathIssuesToDiffItems([item], pathIssues)[0]);
  };

  const handleItemContextMenu = (item: DiffItem, event: React.MouseEvent) => {
    if (!showCompatUI) return;
    if (!item.pathIssueStatus && !item.proposedPath) return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, item });
  };

  const refreshAfterPathChange = async () => {
    const issues = await fetchPathIssues();
    setItems((prev) => applyPathIssuesToDiffItems(prev, issues));
    await fetchStats();
  };


  const handleIgnoreRemainingAndCopy = async () => {
    setShowConfirmDialog(false);
    if (!migrationId) return;
    setIsTriggeringSweep(true);
    try {
      const ignored = await ignoreRemainingPathIssues(migrationId);
      if (!ignored.success) {
        setToast({
          message: ignored.message || "Could not dismiss name warnings.",
          type: "error",
        });
        setIsTriggeringSweep(false);
        return;
      }
      await fetchPathIssues();
      const result = await changePhase(migrationId, "copy");
      if (!result.success) {
        setToast({
          message: result.error || PATH_REVIEW_COPY.someNeedAttention,
          type: "error",
        });
        setIsTriggeringSweep(false);
        return;
      }
      setIsTriggeringSweep(false);
      navigate(`/progress-monitor/${migrationId}?mode=copy`);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to start copy phase",
        type: "error",
      });
      setIsTriggeringSweep(false);
    }
  };

  // Items are now white by default, no color coding needed

  const handleStartDeleteRetry = () => {
    setConfirmDialogType("delete-retry");
    setShowConfirmDialog(true);
  };

  const handleConfirmDeleteRetry = async () => {
    setShowConfirmDialog(false);
    if (!migrationId) return;

    const hasRunning = await checkRunningTasks();
    if (hasRunning) {
      setToast({
        message: "Cannot start removal retry: background tasks are running. Please wait.",
        type: "error",
      });
      return;
    }

    setIsTriggeringSweep(true);
    try {
      const result = await resumeMigration(migrationId);
      if (!result.success) {
        setToast({
          message: result.error || "Failed to retry source removal",
          type: "error",
        });
        setIsTriggeringSweep(false);
        return;
      }

      setIsTriggeringSweep(false);
      navigate(`/progress-monitor/${migrationId}?mode=delete&retry=1`);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to retry source removal",
        type: "error",
      });
      setIsTriggeringSweep(false);
    }
  };

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
      // Default: apply auto-suggested destination names before entering copy.
      // Manual-review items (empty proposed path) are skipped by accept-all.
      const pendingSuggestions = activePathIssues.filter(
        (i) => i.status === "pending" && !!i.proposedPath
      ).length;
      if (!isCopyPhase(migrationStatus) && pendingSuggestions > 0) {
        setPathBusyMessage(PATH_REVIEW_COPY.updatingRelatedPaths);
        const accepted = await acceptAllPathProposals(migrationId);
        setPathBusyMessage(null);
        if (!accepted.success) {
          setToast({
            message:
              accepted.message || "Could not apply suggested destination names.",
            type: "error",
          });
          setIsTriggeringSweep(false);
          return;
        }
        await fetchPathIssues();
      }

      const result = await changePhase(migrationId, "copy");

      if (!result.success) {
        if (result.errorCode === "PATH_ISSUES_REMAINING") {
          setPathIssuesRemainingCount(result.count ?? result.issues?.length ?? 0);
          if (result.issues) setPathIssues(result.issues);
          setConfirmDialogType("ignore-remaining");
          setShowConfirmDialog(true);
          setIsTriggeringSweep(false);
          return;
        }
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
      setPathBusyMessage(null);
      setToast({
        message:
          err instanceof Error ? err.message : "Failed to start copy phase",
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

  const handleSkipDeleteClick = async (item: DiffItem) => {
    if (!migrationId || !isSourceCleanupView) return;

    const originalItems = items;
    const deleteStatus = item.src?.deleteStatus || "";
    const isExcluding = deleteStatus === "pending" || deleteStatus === "";
    const nextStatus: "pending" | "skipped" = isExcluding ? "skipped" : "pending";

    setItems((prev) => applyDeleteStatusInItems(prev, item, nextStatus));

    const result = await toggleDeleteExclude(migrationId, item);
    if (!result.success) {
      setItems(originalItems);
      setToast({
        message: result.error || "Failed to update removal plan",
        type: "error",
      });
      return;
    }
    if (result.deltas) {
      handleApplyStatsDeltas(result.deltas);
    }
    setTreeListRefreshToken((t) => t + 1);
  };

  const handleBeginRemoval = async () => {
    if (!migrationId) return;
    try {
      const summary = await getDeleteSummary(migrationId);
      setDeleteSummary(summary);
      setConfirmDialogType("delete");
      setShowConfirmDialog(true);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to load delete summary",
        type: "error",
      });
    }
  };

  const handleConfirmDelete = async () => {
    setShowConfirmDialog(false);
    if (!migrationId) return;

    const hasRunning = await checkRunningTasks();
    if (hasRunning) {
      setToast({
        message: "Cannot start removal: background tasks are running. Please wait.",
        type: "error",
      });
      return;
    }

    setIsTriggeringSweep(true);
    try {
      const result = await changePhase(migrationId, "delete");
      if (!result.success) {
        setToast({
          message: result.error || "Failed to start source removal",
          type: "error",
        });
        setIsTriggeringSweep(false);
        return;
      }
      setIsTriggeringSweep(false);
      navigate(`/progress-monitor/${migrationId}?mode=delete`);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to start source removal",
        type: "error",
      });
      setIsTriggeringSweep(false);
    }
  };

  const handleCancelCopy = () => {
    setShowConfirmDialog(false);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const inspectorStatus = inspectorItem ? getItemStatus(inspectorItem) : null;
  const inspectorMarkedForRetry = inspectorItem
    ? getCurrentPhase() === "delete"
      ? (inspectorItem.src?.deleteStatus || "") === "pending" ||
        (retryItems.has(inspectorItem.id) &&
          (inspectorItem.src?.deleteStatus || "") !== "deleted")
      : isTraversalRetryPending(inspectorItem) ||
        (retryItems.has(inspectorItem.id) && !hasTraversalFailure(inspectorItem))
    : false;
  const inspectorCanRetry = Boolean(
    inspectorItem && (inspectorStatus?.isFailed || inspectorMarkedForRetry)
  );
  const inspectorCanExclude = Boolean(
    inspectorItem &&
      !isCopyPhase(migrationStatus) &&
      !isDeletePhase(migrationStatus) &&
      !isSourceCleanupView &&
      !(
        inspectorItem.type === "folder" &&
        (inspectorStatus?.existsOnBoth || inspectorStatus?.existsOnlyOnDst)
      )
  );
  const inspectorCanCompatActions = Boolean(
    inspectorItem &&
      !isSourceCleanupView &&
      !isDeletePhase(migrationStatus) &&
      !isCopyPhase(migrationStatus)
  );

  return (
    <section className="path-review">
      <GlassSurfacePanel className="path-review__content path-review__content--with-button">
        <header className="path-review__header">
          <PageBackButton
            onClick={() => navigate(-1)}
            title="Go back to previous page"
            className="path-review__back"
          />
          <h1>
            {isSourceCleanupView ? (
              <>Plan <span className="path-review__highlight">Source Removal</span></>
            ) : isDeletePhase(migrationStatus) ? (
              <>Review <span className="path-review__highlight">Removal Results</span></>
            ) : isCopyPhase(migrationStatus) ? (
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
          {destinationOnlyToggleVisible && (
            <label className="path-review__destination-only-toggle">
              <input
                type="checkbox"
                checked={showDestinationOnly}
                onChange={(e) => handleShowDestinationOnlyChange(e.target.checked)}
              />
              <span>Show destination-only items</span>
            </label>
          )}
        </div>

        {error && <div className="path-review__error">{error}</div>}

        <div className="path-review__workspace">
          <div className="path-review__workspace-main">
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
                setInspectorItem(null);
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

        {/* Icon help + pagination */}
        {!loading && items.length > 0 && (
          <div className="path-review-list__legend-wrapper">
            <div className="path-review-list__legend-toolbar">
              <div className="path-review-list__legend-start">
                <PathReviewIssuesButton
                  issueCount={issuesAttentionCount}
                  warningCount={issuesWarningCount}
                  active={issuesPanelOpen}
                  onClick={openIssuesPanel}
                />
                <PathReviewLegend
                  zoomLevel={1}
                  phase={getDisplayPhase()}
                  showDestinationOnly={includeDestinationOnly}
                  showCompatibility={showCompatUI && activePathIssues.length > 0}
                />
              </div>
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
                    getCurrentPhase() === "delete"
                      ? (item.src?.deleteStatus || "") === "pending" ||
                        (retryItems.has(item.id) && (item.src?.deleteStatus || "") !== "deleted")
                      : isTraversalRetryPending(item) ||
                        (retryItems.has(item.id) && !hasTraversalFailure(item));
                  const isHighlighted = highlightedItemId === item.id;
                  const failureMessage = getDiffItemFailureMessage(item);
                  const isDeleteReview = getCurrentPhase() === "delete";
                  const canOpenFolder = isFolder && (
                    isDeleteReview
                      ? !status.isFailed && !isMarkedForRetry
                      : !status.isExcluded && !status.isFailed && !isMarkedForRetry && !status.existsOnlyOnDst
                  );
                  const isSelected = inspectorItem?.id === item.id;

                  return (
                    <div
                      key={item.id}
                      className={`path-review__item ${status.isExcluded ? "path-review__item--excluded" : ""} ${status.isDeleted ? "path-review__item--deleted" : ""} ${isHighlighted ? "path-review__item--highlighted" : ""} ${isSelected ? "path-review__item--selected" : ""} ${showCompatUI && item.pathIssueStatus === "manual_review" && !item.pathIssueIgnored ? "path-review__item--path-issue" : ""}`}
                      onClick={() => selectInspectorItem(item)}
                      onDoubleClick={() => {
                        if (canOpenFolder) handleFolderClick(item);
                      }}
                      onContextMenu={(e) => handleItemContextMenu(item, e)}
                    >
                      <div
                        className="path-review__item-status-icon-container"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <PathReviewStatusIcon
                          item={item}
                          isMarkedForRetry={isMarkedForRetry}
                          isLocked={isLocked}
                          zoomLevel={1}
                          phase={getDisplayPhase()}
                          onRetryClick={handleRetryClick}
                          onExcludeClick={handleCheckboxChange}
                          onSkipDeleteClick={handleSkipDeleteClick}
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
                      >
                        <div className="path-review__item-name-row">
                          <div className="path-review__item-name">{item.name}</div>
                          {showCompatUI &&
                            !item.pathIssueIgnored &&
                            (item.pathIssueStatus || item.proposedPath) && (
                            <CompatibilityCaution item={item} compact />
                          )}
                          {showCompatUI && item.pathIssueIgnored ? (
                            <span
                              className="path-review__item-ignored"
                              title={PATH_REVIEW_COPY.compatibilityIgnoredLabel}
                              aria-label={PATH_REVIEW_COPY.compatibilityIgnoredLabel}
                            >
                              <EyeOff size={14} aria-hidden />
                            </span>
                          ) : null}
                        </div>
                        {showCompatUI ? (
                          <DestinationRenameHint
                            item={item}
                            phase={getDisplayPhase()}
                          />
                        ) : null}
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
                        <button
                          type="button"
                          className="path-review__item-arrow-button"
                          disabled={!canOpenFolder}
                          title={canOpenFolder ? "Open folder" : "Cannot open folder"}
                          aria-label={canOpenFolder ? "Open folder" : "Cannot open folder"}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canOpenFolder) handleFolderClick(item);
                          }}
                        >
                          <ChevronRight size={16} className="path-review__item-arrow" />
                        </button>
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
              reviewView={reviewView}
              isActive={activeTab === "list"}
              onSkipDeleteClick={handleSkipDeleteClick}
              treeListRefreshToken={treeListRefreshToken}
              includeDestinationOnly={includeDestinationOnly}
              showDestinationOnlyToggle={destinationOnlyToggleVisible}
              showDestinationOnly={showDestinationOnly}
              onShowDestinationOnlyChange={handleShowDestinationOnlyChange}
              onListDataMutated={handleListDataMutated}
              pathIssues={pathIssues}
              issuesAttentionCount={issuesAttentionCount}
              issuesWarningCount={issuesWarningCount}
              issuesPanelOpen={issuesPanelOpen}
              onOpenIssuesPanel={openIssuesPanel}
              listJumpToken={listJumpToken}
              listJumpTarget={listJumpTarget}
              onPathIssuesChange={setPathIssues}
              onOpenRename={(item) => setRenameTarget(item)}
              inspectorItemId={inspectorItem?.id ?? null}
              onInspectorSelect={selectInspectorItem}
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
          </div>

          {issuesPanelOpen ? (
            <PathReviewIssuesPanel
              failedCount={stats?.failedCount ?? 0}
              pathIssues={
                !isSourceCleanupView &&
                !isDeletePhase(migrationStatus) &&
                !isCopyPhase(migrationStatus)
                  ? activePathIssues
                  : []
              }
              onClose={() => setIssuesPanelOpen(false)}
              onJump={handleIssuesJump}
            />
          ) : (
          <PathReviewInspector
            item={inspectorItem}
            phase={getDisplayPhase()}
            busy={!!pathBusyMessage}
            canExclude={inspectorCanExclude}
            canRetry={inspectorCanRetry}
            isExcluded={!!inspectorStatus?.isExcluded}
            isMarkedForRetry={inspectorMarkedForRetry}
            canRename={
              inspectorCanCompatActions &&
              !!(inspectorItem?.pathIssueStatus || inspectorItem?.proposedPath)
            }
            canToggleIgnoreWarning={
              inspectorCanCompatActions &&
              !!(inspectorItem?.pathIssueStatus || inspectorItem?.proposedPath)
            }
            onRename={() => {
              if (inspectorItem) setRenameTarget(inspectorItem);
            }}
            onToggleIgnoreWarning={async () => {
              if (!migrationId || !inspectorItem) return;
              const restoring = !!inspectorItem.pathIssueIgnored;
              setPathBusyMessage(PATH_REVIEW_COPY.updatingRelatedPaths);
              try {
                const res = restoring
                  ? await unignorePathIssueSubtree(migrationId, inspectorItem.id)
                  : await ignorePathIssueSubtree(migrationId, inspectorItem.id);
                if (!res.success) {
                  setToast({
                    message:
                      res.message ||
                      (restoring
                        ? "Could not restore this warning."
                        : "Could not dismiss this warning."),
                    type: "error",
                  });
                  return;
                }
                await refreshAfterPathChange();
                setToast({
                  message: restoring
                    ? PATH_REVIEW_COPY.warningRestoredSubtree
                    : PATH_REVIEW_COPY.warningDismissedSubtree,
                  type: "success",
                });
              } catch (err) {
                setToast({
                  message:
                    err instanceof Error
                      ? err.message
                      : restoring
                        ? "Could not restore this warning."
                        : "Could not dismiss this warning.",
                  type: "error",
                });
              } finally {
                setPathBusyMessage(null);
              }
            }}
            onExclude={() => {
              if (inspectorItem) {
                void handleCheckboxChange(
                  inspectorItem,
                  !inspectorStatus?.isExcluded
                );
              }
            }}
            onRetry={() => {
              if (inspectorItem) void handleRetryClick(inspectorItem);
            }}
          />
          )}
        </div>

        {contextMenu && (
          <PathReviewContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onRename={() => setRenameTarget(contextMenu.item)}
            onClose={() => setContextMenu(null)}
          />
        )}

        {renameTarget && migrationId && (
          <PathRenameEditor
            migrationId={migrationId}
            item={renameTarget}
            issue={pathIssues.find((i) => i.nodeId === renameTarget.id) || null}
            onClose={() => setRenameTarget(null)}
            onApplied={() => {
              void refreshAfterPathChange();
            }}
            onBusy={setPathBusyMessage}
            onError={(message) => setToast({ message, type: "error" })}
          />
        )}

        {pathBusyMessage && (
          <div className="path-review__path-busy" role="status">
            {pathBusyMessage}
          </div>
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
                {
                  label: "Failed",
                  value: stats.failedCount.toLocaleString(),
                  ...(stats.failedCount > 0 ? { highlight: "failed" as const } : {}),
                },
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
                ...((stats?.failedCount ?? 0) > 0
                  ? [{
                      label: "Failed",
                      value: (stats?.failedCount ?? 0).toLocaleString(),
                      highlight: "failed" as const,
                    }]
                  : []),

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

            
            {/* Retry Copying, Review Deletion Plan, or Start Copying */}
            {isSourceCleanupView ? (
              <button
                type="button"
                className="glass-button glass-button--progress-cta glass-button--multiline"
                onClick={handleBeginRemoval}
                disabled={isTriggeringSweep || hasRunningTasks}
                title="Start removing copied items from the source"
              >
                Begin Removal from Source
              </button>
            ) : isDeletePhase(migrationStatus) ? (
              (stats?.pendingRetriesCount ?? 0) > 0 ? (
                <button
                  type="button"
                  className="glass-button glass-button--progress-cta"
                  onClick={handleStartDeleteRetry}
                  disabled={isTriggeringSweep || hasRunningTasks}
                  title="Retry removing failed items from the source"
                >
                  <RotateCw size={20} style={{ marginRight: "0.5rem" }} />
                  Retry Removal of Failed Items
                </button>
              ) : null
            ) : isCopyPhase(migrationStatus) ? (
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
              ) : isAwaitingCopyReview ? (
                <button
                  type="button"
                  className="glass-button glass-button--progress-cta glass-button--multiline"
                  onClick={() => navigate(`/path-review/${migrationId}/source-cleanup`)}
                  disabled={isTriggeringSweep || hasRunningTasks}
                  title="Review which copied items to remove from the source"
                >
                  Review Deletion Plan
                </button>
              ) : null
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
          title={
            confirmDialogType === "retry"
              ? "Retry Discovery"
              : confirmDialogType === "delete-retry"
              ? "Retry Source Removal"
              : confirmDialogType === "delete"
              ? "Begin Source Removal"
              : confirmDialogType === "ignore-remaining"
              ? PATH_REVIEW_COPY.ignoreRemainingTitle
              : isCopyPhase(migrationStatus)
              ? "Retry Copying"
              : PATH_REVIEW_COPY.confirmCopyTitle
          }
          message={
            confirmDialogType === "retry"
              ? "We'll try to discover what is in those folders that you marked to retry. We'll send you back here to review the results when the process is complete. Would you like to proceed?"
              : confirmDialogType === "delete-retry"
              ? "We'll retry removing the failed items you marked from the source. We'll send you back here to review the results when the process is complete. Would you like to proceed?"
              : confirmDialogType === "delete"
              ? deleteSummary
                ? `This will permanently remove ${deleteSummary.pending.toLocaleString()} item${deleteSummary.pending !== 1 ? "s" : ""} from ${deleteSummary.sourceHost ? `${deleteSummary.sourceHost}:` : ""}${deleteSummary.sourceRootPath}. Items you excluded from the plan will be kept. Would you like to proceed?`
                : "This will permanently remove copied items from the source. Would you like to proceed?"
              : confirmDialogType === "ignore-remaining"
              ? PATH_REVIEW_COPY.ignoreRemainingConfirm(pathIssuesRemainingCount)
              : isCopyPhase(migrationStatus)
              ? "We'll retry copying the failed and pending items. We'll send you back here to review the results when the process is complete. Would you like to proceed?"
              : (() => {
                  const pendingSuggestionCount = activePathIssues.filter(
                    (i) => i.status === "pending" && !!i.proposedPath
                  ).length;
                  const manualReviewIssueCount = activePathIssues.filter(
                    (i) => i.status === "manual_review"
                  ).length;
                  if (pendingSuggestionCount > 0) {
                    return PATH_REVIEW_COPY.confirmCopyWithSuggestions(
                      pendingSuggestionCount
                    );
                  }
                  if (manualReviewIssueCount > 0) {
                    return PATH_REVIEW_COPY.confirmCopyWithManualOnly(
                      manualReviewIssueCount
                    );
                  }
                  return PATH_REVIEW_COPY.confirmCopyMessage;
                })()
          }
          confirmLabel={
            confirmDialogType === "copy" &&
            !isCopyPhase(migrationStatus) &&
            pathIssues.some((i) => !i.ignored && i.status === "pending" && !!i.proposedPath)
              ? PATH_REVIEW_COPY.confirmCopyAcceptLabel
              : "Yes"
          }
          cancelLabel="No"
          secondaryLabel={
            confirmDialogType === "copy" &&
            !isCopyPhase(migrationStatus) &&
            activePathIssues.length > 0
              ? PATH_REVIEW_COPY.confirmCopyIgnoreLabel
              : undefined
          }
          onConfirm={
            confirmDialogType === "retry"
              ? handleConfirmRetry
              : confirmDialogType === "delete-retry"
              ? handleConfirmDeleteRetry
              : confirmDialogType === "delete"
              ? handleConfirmDelete
              : confirmDialogType === "ignore-remaining"
              ? handleIgnoreRemainingAndCopy
              : handleConfirmCopy
          }
          onSecondary={
            confirmDialogType === "copy" &&
            !isCopyPhase(migrationStatus) &&
            activePathIssues.length > 0
              ? handleIgnoreRemainingAndCopy
              : undefined
          }
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