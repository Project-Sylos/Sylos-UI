import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  EyeOff,
  Copy,
  RotateCw,
  Search,
} from "lucide-react";
import { 
  getMigrationDiffs,
  excludeNode, 
  unexcludeNode,
  bulkExcludeNodes,
  bulkUnexcludeNodes,
  bulkMarkNodesForRetry,
  bulkUnmarkNodesForRetry,
  getReviewOpsStatus,
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
  probeMigrationFSHealth,
  getMigrationStatus,
  listPathIssues,
  PathIssue,
  applyPathIssuesToDiffItems,
  acceptAllPathProposals,
  ignoreRemainingPathIssues,
  ignorePathIssueSubtree,
  unignorePathIssueSubtree,
  getStorageInfo,
  StorageInfo,
  ExclusionResponse,
  BulkRetryKind,
  excludeMatchingSearch,
  forceReplaceCopyNode,
  unforceReplaceCopyNode,
  acceptUniquePathName,
  resetPathRemap,
  previewPathResolutionCascade,
  type PathResolutionCascadePreview,
  getPathRenameProgress,
  softStopPathRename,
  hardStopPathRename,
  PathRenameProgress,
} from "../api/services";
import CompatibilityCaution from "../components/CompatibilityCaution";
import CompatReviewBanner from "../components/CompatReviewBanner";
import DestinationRenameHint from "../components/DestinationRenameHint";
import PathReviewInspector from "../components/PathReviewInspector";
import PathReviewContextMenu from "../components/PathReviewContextMenu";
import PathRenameEditor from "../components/PathRenameEditor";
import type { ActiveTask } from "../components/ActiveTasksPanel";
import { useActiveTasks } from "../contexts/ActiveTasksContext";
import {
  PATH_REVIEW_COPY,
  canIgnorePathIssue,
  needsManualCompatAction,
  summarizePathIssues,
} from "../utils/pathReviewCopy";
import UnpairedSideChip from "../components/UnpairedSideChip";
import {
  MigrationStatusResponse,
  isTraversalReviewPhase,
  isCopyReviewPhase,
  isDeleteReviewPhase,
  getMigrationPhase,
} from "../types/migrations";
import { PageShell } from "../components/PageShell";
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
import {
  canIncludeRuleExcludedSubtree,
  excludedByRuleText,
  includeRuleExcludedSubtree,
  isRuleExcluded,
} from "../utils/pathReviewRuleExclusion";
import FileTypeIcon from "../components/FileTypeIcon";
import PathReviewStatusIcon from "../components/PathReviewStatusIcon";
import PathReviewLegend from "../components/PathReviewLegend";
import PathReviewIssuesButton from "../components/PathReviewIssuesButton";
import PathReviewIssuesPanel, {
  type PathReviewListJumpTarget,
} from "../components/PathReviewIssuesPanel";
import PathReviewFooterInfo from "../components/PathReviewFooterInfo";
import PathReviewSizeColumnHeader from "../components/PathReviewSizeColumnHeader";
import { getDiffItemFailureMessage } from "../utils/diffFailureMessage";
import {
  hasTraversalFailure,
  isTraversalAckFromFailed,
  isTraversalRetryPending,
  traversalBlocksFolderNav,
} from "../utils/pathReviewTraversalStatus";
import {
  applyDeleteStatusInItems,
  isDeleteExcludePending,
  isDeletePendingExplicit,
  toggleDeleteExclude,
} from "../utils/pathReviewDeletePlan";
import {
  getPathReviewDisplayPhase,
  getPathReviewPageBackPath,
  getPathReviewPageBackTitle,
  getPathReviewUIPhase,
  isSourceCleanupPlanPhase,
  showsPathReviewPendingColumn,
  type PathReviewRouteView,
} from "../utils/pathReviewPhase";
import {
  REVIEW_STATUS_LABELS,
  isReviewPeerItem,
  runReviewStatusCycleClick,
  runReviewStatusTransition,
  type ReviewStatusAxis,
} from "../utils/reviewStatusCycle";
import {
  applyExcludeOptimistic,
  displayPhaseAllowsBulkExclude,
  excludeActionSetsExcluded,
  getPathReviewItemActions,
} from "../utils/pathReviewItemActions";
import {
  getPathReviewItemStatus,
  itemStatusPhase,
} from "../utils/pathReviewItemStatus";
import { finiteNonNeg, formatBytes } from "../utils/formatBytes";
import { formatItemTimestamp } from "../utils/formatItemTimestamp";
import { formatListShowingRange } from "../utils/listSearch";
import {
  browseLayoutPhaseKey,
  effectiveBrowseLayout,
  loadBrowseLayout,
  saveBrowseLayout,
  type PathReviewBrowseLayout,
  type PathReviewSearchSide,
} from "../utils/pathReviewBrowseLayout";
import {
  EXCLUSION_OP_TITLE,
  MUTATION_CONFIRM_MS,
  REMOVAL_OP_TITLE,
  canStartMutation,
  inFlightOpState,
  inFlightOpTitle,
  itemMutationIds,
  withInFlightOp,
  type MutationOpState,
} from "../utils/pathReviewMutationGuard";
import { storageFetchOptions } from "../utils/storageFetchOptions";
import { formatFSHealthFailure } from "../utils/fsHealth";
import {
  formatBulkActionToast,
  isNoItemsChangedError,
} from "../utils/bulkActionToast";
import { mapPathReviewStatusFilter } from "../utils/pathReviewStatusFilters";
import {
  BULK_ACTION_LABELS,
  bulkNodeIDs,
  bulkSrcNodeIDs,
  partitionBulkAction,
  type BulkActionKind,
  type BulkActionPartition,
} from "../utils/bulkActionEligibility";
import {
  FORCE_REPLACE_BULK_FOLDER_CONFIRM,
  FORCE_REPLACE_FOLDER_CONFIRM,
  isForceReplaceReviewView,
} from "../utils/forceReplaceCopy";
import BulkActionConfirmDialog from "../components/BulkActionConfirmDialog";
import HelpTooltip from "../components/HelpTooltip";
import ListViewPagination from "../components/ListViewPagination";
import PathReviewSelectionControls, {
  type PathReviewSelectionAction,
} from "../components/PathReviewSelectionControls";
import {
  BrowseSelectableItem,
  PATH_REVIEW_FOLDER_SELECT_BOUNCE_MS,
  clearFolderSelectBounce,
  runWithFolderSelectBounce,
  useBrowseSelection,
} from "../hooks/useBrowseSelection";
import { useAltTextSelect } from "../hooks/useAltTextSelect";
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
 * - Traversal / copy post-review / delete review: pendingCount omitted.
 * - Copy-plan: (copyPending − copyPendingRetry) → pendingCount.
 * - Source cleanup (pre-delete): deletePending → pendingCount; deleteSkipped → excludedCount.
 */
function applyStatsDeltas(
  prev: PathReviewStats | null,
  deltas: Record<string, number> | undefined,
  phase: "traversal" | "copy" | "copy-plan" | "delete" | "source-cleanup"
): PathReviewStats | null {
  if (!prev || !deltas || Object.keys(deltas).length === 0) return prev;
  // Preserve signed deltas (excludes subtract size); only reject non-finite.
  const delta = (k: string) => {
    const v = deltas[k];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  const isCopy = phase === "copy";
  const isDelete = phase === "delete" || phase === "source-cleanup";
  const failedDelta = isDelete
    ? delta("deleteFailed")
    : isCopy || phase === "copy-plan"
      ? delta("copyFailed")
      : delta("traversalFailed");
  const tracksPending =
    phase === "copy-plan" || phase === "source-cleanup";
  const pendingDelta = tracksPending
    ? phase === "source-cleanup"
      ? delta("deletePending")
      : delta("copyPending") - delta("copyPendingRetry")
    : 0;
  const foldersCount = finiteNonNeg(prev.foldersCount + delta("folders"));
  const filesCount = finiteNonNeg(prev.filesCount + delta("files"));
  const total = foldersCount + filesCount;
  return {
    ...(tracksPending
      ? {
          pendingCount: finiteNonNeg((prev.pendingCount ?? 0) + pendingDelta),
        }
      : {}),
    failedCount: finiteNonNeg(prev.failedCount + failedDelta),
    excludedCount: finiteNonNeg(
      prev.excludedCount + (isDelete ? delta("deleteSkipped") : delta("excluded"))
    ),
    pendingRetriesCount: finiteNonNeg(
      (prev.pendingRetriesCount ?? 0) +
        (phase === "delete"
          ? delta("deletePending")
          : phase === "source-cleanup"
            ? 0
            : isCopy || phase === "copy-plan"
              ? delta("copyPendingRetry")
              : delta("traversalPendingRetry"))
    ),
    successfulCount: finiteNonNeg(
      (prev.successfulCount ?? 0) +
        (isDelete ? delta("deleteDeleted") : delta("copySuccessful"))
    ),
    foldersCount,
    filesCount,
    foldersRatio: total > 0 ? foldersCount / total : prev.foldersRatio,
    filesRatio: total > 0 ? filesCount / total : prev.filesRatio,
    totalFileSize: {
      src: finiteNonNeg(finiteNonNeg(prev.totalFileSize?.src) + delta("sizeSrc")),
      dst: finiteNonNeg(finiteNonNeg(prev.totalFileSize?.dst) + delta("sizeDst")),
      selected: finiteNonNeg(
        finiteNonNeg(prev.totalFileSize?.selected) + delta("sizeSelected")
      ),
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
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

export default function PathReview({ reviewView = "default" }: { reviewView?: PathReviewRouteView }) {
  return (
    <ListDensityProvider storageKey={PATH_REVIEW_DENSITY_STORAGE_KEY}>
      <PathReviewPage reviewView={reviewView} />
    </ListDensityProvider>
  );
}

function PathReviewPage({ reviewView }: { reviewView: PathReviewRouteView }) {
  const { migrationId } = useParams<{ migrationId: string }>();
  const navigate = useNavigate();
  const isSourceCleanupView = reviewView === "source-cleanup";
  const isCopyPlanView = reviewView === "copy-plan";
  const { densityStyle, setListViewportElement } = useListDensity();
  const altTextSelect = useAltTextSelect();
  const treeListRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<"tree" | "list">("tree");
  const [listFiltersPageOpen, setListFiltersPageOpen] = useState(false);
  const [advancedFiltersCanApply, setAdvancedFiltersCanApply] = useState(false);
  const advancedFiltersClearRef = useRef<() => void>(() => {});
  const advancedFiltersApplyRef = useRef<() => void>(() => {});
  const [issuesPanelOpen, setIssuesPanelOpen] = useState(false);
  const [listJumpToken, setListJumpToken] = useState(0);
  const [listJumpTarget, setListJumpTarget] = useState<PathReviewListJumpTarget | null>(null);
  const [treeSearchQuery, setTreeSearchQuery] = useState("");
  const [treeSearchExpanded, setTreeSearchExpanded] = useState(false);
  const [dstTreeSearchQuery, setDstTreeSearchQuery] = useState("");
  const [dstTreeSearchExpanded, setDstTreeSearchExpanded] = useState(false);
  const treeSearchInputRef = useRef<HTMLInputElement | null>(null);
  const dstTreeSearchInputRef = useRef<HTMLInputElement | null>(null);
  const activeTabRef = useRef<"tree" | "list">(activeTab);
  activeTabRef.current = activeTab;
  const [items, setItems] = useState<DiffItem[]>([]);
  const [dstItems, setDstItems] = useState<DiffItem[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | undefined>(undefined);  // undefined for root
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [dstBreadcrumbs, setDstBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [preferredBrowseLayout, setPreferredBrowseLayout] =
    useState<PathReviewBrowseLayout>(() =>
      loadBrowseLayout(
        browseLayoutPhaseKey(
          reviewView === "copy-plan"
            ? "copy-plan"
            : reviewView === "source-cleanup"
              ? "source-cleanup"
              : "traversal"
        )
      )
    );
  const [listSearchSide, setListSearchSide] =
    useState<PathReviewSearchSide>("both");
  const [dstLoading, setDstLoading] = useState(false);
  const [dstPagination, setDstPagination] = useState<any>(null);
  const [dstTreeCurrentPage, setDstTreeCurrentPage] = useState(0);
  const [dstFolderPageMap, setDstFolderPageMap] = useState<Map<string, number>>(
    new Map()
  );
  const currentDstTreePathRef = useRef<string>("/");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<any>(null);
  const [checkedItems, setPendingItems] = useState<Set<string>>(new Set());
  const [retryItems, setRetryItems] = useState<Set<string>>(new Set()); // Items marked for retry
  const [hasRunningTasks, setHasRunningTasks] = useState(false); // Track if background tasks are running
  const [inspectorItem, setInspectorItem] = useState<DiffItem | null>(null);
  const {
    selected: treeSelected,
    selectedCount: treeSelectedCount,
    isSelected: isTreeSelected,
    select: selectTreeItem,
    clear: clearTreeSelection,
  } = useBrowseSelection();
  const treeSelectedDataRef = useRef<Map<string, DiffItem>>(new Map());
  const [treeBulkLoading, setTreeBulkLoading] = useState(false);
  const [pendingTreeBulk, setPendingTreeBulk] = useState<{
    action: BulkActionKind;
    partition: BulkActionPartition;
  } | null>(null);
  const [treeApplyMenuOpen, setTreeApplyMenuOpen] = useState(false);
  const treeApplyMenuRef = useRef<HTMLDivElement | null>(null);
  // Delay plain folder select so a double-click can navigate first.
  const treeFolderClickTimerRef = useRef<number | null>(null);
  /** Suppress duplicate navigate from click detail=2 + native dblclick. */
  const lastFolderNavRef = useRef<{ key: string; at: number } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogType, setConfirmDialogType] = useState<
    "copy" | "retry" | "delete" | "delete-retry" | "ignore-remaining"
  >("copy");
  const [showExcludeAllFailedConfirm, setShowExcludeAllFailedConfirm] =
    useState(false);
  const [excludeAllFailedBusy, setExcludeAllFailedBusy] = useState(false);
  const [forceReplaceConfirm, setForceReplaceConfirm] = useState<{
    item?: DiffItem;
    items?: DiffItem[];
  } | null>(null);
  const [cascadeConfirm, setCascadeConfirm] = useState<{
    item: DiffItem;
    action: "unique";
    preview: PathResolutionCascadePreview;
    proposedName?: string;
  } | null>(null);
  const [pathIssues, setPathIssues] = useState<PathIssue[]>([]);
  const [pathIssuesRemainingCount, setPathIssuesRemainingCount] = useState(0);
  const activePathIssues = useMemo(
    () => pathIssues.filter((i) => !i.ignored),
    [pathIssues]
  );
  const [renameTarget, setRenameTarget] = useState<{
    item: DiffItem;
    initialName?: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: DiffItem;
  } | null>(null);
  const [pathRenameWatch, setPathRenameWatch] = useState(false);
  const [pathRenameProgress, setPathRenameProgress] =
    useState<PathRenameProgress | null>(null);
  const [pathBulkTask, setPathBulkTask] = useState<ActiveTask | null>(null);
  const [renameRevealNonce, setRenameRevealNonce] = useState(0);
  const { setTask, removeTask } = useActiveTasks();
  useEffect(() => {
    if (!migrationId || !pathRenameWatch) {
      setPathRenameProgress(null);
      return;
    }
    let cancelled = false;
    let sawServerProgress = false;
    const tick = async () => {
      try {
        const p = await getPathRenameProgress(migrationId);
        if (cancelled) return;
        if (p.active) {
          sawServerProgress = true;
          setPathRenameProgress(p);
          return;
        }
        // Before the first active poll, we are still waiting on the API.
        if (!sawServerProgress) {
          setPathRenameProgress({
            active: true,
            phase: "starting",
            message: PATH_REVIEW_COPY.updatingRelatedPaths,
            done: 0,
            total: 0,
            canSoftStop: false,
            canHardStop: false,
          });
          return;
        }
        // Keep last live server snapshot until the HTTP request returns.
        setPathRenameProgress((prev) =>
          prev
            ? { ...prev, canSoftStop: false, canHardStop: false }
            : prev
        );
      } catch {
        /* ignore */
      }
    };
    void tick();
    const handle = setInterval(() => {
      void tick();
    }, 750);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [pathRenameWatch, migrationId]);

  useEffect(() => {
    if (!migrationId) return;
    const renameId = `path-rename:${migrationId}`;
    const bulkId = `path-bulk:${migrationId}`;
    if (pathRenameWatch || pathRenameProgress?.active) {
      removeTask(bulkId);
      setTask({
        id: renameId,
        kind: "path-rename",
        title:
          pathRenameProgress?.message || PATH_REVIEW_COPY.updatingRelatedPaths,
        done: pathRenameProgress?.done,
        total: pathRenameProgress?.total,
        phase: pathRenameProgress?.phase,
        canSoftStop: !!pathRenameProgress?.canSoftStop,
        canHardStop: !!pathRenameProgress?.canHardStop,
        onOpen: renameTarget
          ? () => setRenameRevealNonce((n) => n + 1)
          : undefined,
        onSoftStop: () =>
          softStopPathRename(migrationId).catch((err) =>
            setToast({
              message:
                err instanceof Error ? err.message : "Could not stop rename.",
              type: "error",
            })
          ),
        onHardStop: () =>
          hardStopPathRename(migrationId).catch((err) =>
            setToast({
              message:
                err instanceof Error
                  ? err.message
                  : "Could not hard-stop rename.",
              type: "error",
            })
          ),
      });
      return;
    }
    if (pathBulkTask) {
      removeTask(renameId);
      setTask({ ...pathBulkTask, id: bulkId });
      return;
    }
    removeTask(renameId);
    removeTask(bulkId);
  }, [
    migrationId,
    pathRenameWatch,
    pathRenameProgress,
    pathBulkTask,
    renameTarget,
    setTask,
    removeTask,
  ]);

  useEffect(() => {
    if (!migrationId) return;
    const renameId = `path-rename:${migrationId}`;
    const bulkId = `path-bulk:${migrationId}`;
    return () => {
      removeTask(renameId);
      removeTask(bulkId);
    };
  }, [migrationId, removeTask]);
  const statsPollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingStatsRef = useRef<boolean>(false);
  const pendingUpdatesRef = useRef<Map<string, boolean>>(new Map());
  const [mutationOps, setMutationOps] = useState<Map<string, MutationOpState>>(
    () => new Map()
  );

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
  const [destStorage, setDestStorage] = useState<StorageInfo | null>(null);
  const [storageWarningDismissedAt, setStorageWarningDismissedAt] = useState<
    number | null
  >(null);
  const [showSelectionWarning, setShowSelectionWarning] = useState(false);
  const [listPagination, setListPagination] = useState<PaginationInfo | null>(null);
  const [listItemsPerPage, setListItemsPerPage] = useState<number>(100);
  const [listCalculatedTotal, setListCalculatedTotal] = useState<number | null>(null);
  /** Bumped after successful exclude/retry in tree view so list search refetches (only when tree tab is active at completion). */
  const [treeListRefreshToken, setTreeListRefreshToken] = useState(0);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [deleteSummary, setDeleteSummary] = useState<DeleteSummaryResponse | null>(null);
  const sourceCleanupPreparedRef = useRef(false);
  /** Source-cleanup / delete review: include destination-only rows in the tree. */
  const [showDestinationOnly, setShowDestinationOnly] = useState(true);
  
  // Tree view pagination
  const [treeCurrentPage, setTreeCurrentPage] = useState(0);
  const [treeItemsPerPage, setTreeItemsPerPage] = useState(100);
  // Map of locationPath -> page number to remember pagination per folder
  const [folderPageMap, setFolderPageMap] = useState<Map<string, number>>(new Map());
  const currentTreePathRef = useRef<string>("/");

  const destinationOnlyToggleVisible =
    isSourceCleanupView || isDeleteReviewPhase(migrationStatus);
  const includeDestinationOnly = destinationOnlyToggleVisible
    ? showDestinationOnly
    : true;
  const srcOnlyBrowsePhase =
    isSourceCleanupView || isDeleteReviewPhase(migrationStatus);
  const layoutPhaseKey = browseLayoutPhaseKey(
    getPathReviewDisplayPhase(migrationStatus, reviewView)
  );
  const browseLayout = effectiveBrowseLayout(
    preferredBrowseLayout,
    srcOnlyBrowsePhase,
    layoutPhaseKey
  );
  const isDualBrowse = browseLayout === "dual";

  // Apply per-phase default (or remembered override) when the review mode changes.
  // Traversal is dual-only; copy keeps a Dual/Merged preference; delete is forced merged.
  useEffect(() => {
    if (layoutPhaseKey === "traversal") {
      setPreferredBrowseLayout("dual");
      return;
    }
    setPreferredBrowseLayout(
      srcOnlyBrowsePhase ? "merged" : loadBrowseLayout(layoutPhaseKey)
    );
  }, [layoutPhaseKey, srcOnlyBrowsePhase]);

  // Reload diffs when dual↔merged flips after the initial mount load.
  const browseLayoutReloadSkipRef = useRef(true);
  useEffect(() => {
    if (!migrationId) return;
    if (browseLayoutReloadSkipRef.current) {
      browseLayoutReloadSkipRef.current = false;
      return;
    }
    const path =
      breadcrumbs.length > 0
        ? breadcrumbs[breadcrumbs.length - 1].path
        : undefined;
    if (browseLayout === "dual") {
      void loadItems(path, 0, { side: "src" });
      void loadDstItems(
        dstBreadcrumbs.length > 0
          ? dstBreadcrumbs[dstBreadcrumbs.length - 1].path
          : undefined,
        0
      );
    } else {
      setListSearchSide("both");
      void loadItems(path, 0, { side: "both" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseLayout, migrationId]);

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
      const statsData = await getPathReviewStats(
        migrationId,
        isSourceCleanupView
          ? "source-cleanup"
          : isCopyPlanView
            ? "copy-plan"
            : undefined
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

  useEffect(() => {
    const root = migrationStatus?.destinationRoot;
    if (!root?.serviceId) {
      setDestStorage(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const info = await getStorageInfo(
          root.serviceId,
          storageFetchOptions(
            "destination",
            root,
            migrationStatus?.destinationConnectionId || root.connectionId,
            migrationId || undefined
          )
        );
        if (!cancelled) {
          setDestStorage(info);
          setStorageWarningDismissedAt(null);
        }
      } catch (err) {
        console.error("Failed to fetch destination storage:", err);
        if (!cancelled) setDestStorage({ available: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    migrationId,
    migrationStatus?.destinationRoot?.serviceId,
    migrationStatus?.destinationRoot?.connectionId,
    migrationStatus?.destinationRoot?.locationPath,
    migrationStatus?.destinationRoot?.nativePath,
    migrationStatus?.destinationRoot?.type,
    migrationStatus?.destinationRoot?.parentId,
    migrationStatus?.destinationConnectionId,
  ]);
  
  const checkCanStartCopy = (): boolean => {
    // Block if we have pending retries (requires explicit user action)
    if ((stats?.pendingRetriesCount ?? 0) > 0) return false;
    
    // Block if background tasks are running
    if (hasRunningTasks) return false;

    // Copy plan: non-ignored manual_review path issues must be resolved first
    if (manualReviewCount > 0) return false;
    
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
    if (isDualBrowse) {
      setDstBreadcrumbs([]);
      setDstTreeCurrentPage(0);
      void loadDstItems(undefined);
    }
    
    // Fetch migration status on startup
    fetchMigrationStatus();
    
    // Fetch pending work on startup to load state
    fetchPendingWork();

    // Destination name review queue (plain-language path issues)
    void fetchPathIssues();
    
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
        if (isDualBrowse) {
          void loadDstItems("/");
        }
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

  // When switching into dual layout, seed the DST pane at root.
  useEffect(() => {
    if (!migrationId || !isDualBrowse) return;
    if (dstItems.length === 0 && !dstLoading) {
      void loadDstItems(
        dstBreadcrumbs.length > 0
          ? dstBreadcrumbs[dstBreadcrumbs.length - 1].path
          : undefined
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDualBrowse, migrationId]);

  // Stats projection is view-specific (Discover omits pending; copy-plan returns it).
  // React Router reuses PathReview across /path-review/:id ↔ …/copy-plan, so migrationId
  // alone does not remount — refetch when reviewView changes or we would keep traversal stats
  // and show Pending: 0 via pendingCount ?? 0.
  useEffect(() => {
    if (!migrationId) return;
    setStats(null);
    void fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [migrationId, reviewView]);

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
        // Idempotent re-entry (plan already aligned) returns success:false with
        // "no items changed" — continue into the view without a toast.
        if (!result.success && !isNoItemsChangedError(result.error)) {
          sourceCleanupPreparedRef.current = false;
          setToast({
            message: result.error || "Failed to prepare source removal plan",
            type: "error",
          });
          return;
        }
        // Prefer a fresh stats fetch over optimistic deltas: empty prepare is
        // idempotent and must not leave Selected counts drifted from the DB.
        try {
          const statsData = await getPathReviewStats(migrationId, "source-cleanup");
          setStats(statsData);
        } catch {
          if (result.deltas) {
            handleApplyStatsDeltas(result.deltas);
          }
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

  // Reload destination pane when its page or shared page size changes.
  useEffect(() => {
    if (activeTab !== "tree" || !migrationId || !isDualBrowse) return;
    const currentLocationPath =
      dstBreadcrumbs.length > 0
        ? dstBreadcrumbs[dstBreadcrumbs.length - 1].path
        : undefined;
    const pathKey = currentLocationPath || "/";
    setDstFolderPageMap((prev) => {
      const next = new Map(prev);
      next.set(pathKey, dstTreeCurrentPage);
      return next;
    });
    void loadDstItems(currentLocationPath, dstTreeCurrentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dstTreeCurrentPage, treeItemsPerPage, isDualBrowse]);

  // Handle stats change from list view (from API polling)
  const handleStatsChange = (newStats: PathReviewStats | null) => {
    if (newStats) {
      setStats(newStats);
    }
  };

  // Apply action deltas to local stats (no refetch), projected for the visible review.
  const handleApplyStatsDeltas = (deltas: Record<string, number>) => {
    const phase = isSourceCleanupView
      ? "source-cleanup"
      : isCopyPlanView
        ? "copy-plan"
        : getCurrentPhase();
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
  const isAwaitingCopyReview =
    getMigrationPhase(migrationStatus) === "awaiting-copy-review";
  // Destination-name (GPL) UI only on copy-plan / copy review, not Discover.
  const showCompatUI =
    !isSourceCleanupView &&
    !isDeletePhase(migrationStatus) &&
    (isCopyPlanView || isAwaitingCopyReview);

  const selectedBytes = finiteNonNeg(stats?.totalFileSize?.selected);
  const destFreeKnown =
    !!destStorage?.available &&
    !destStorage.unlimited &&
    typeof destStorage.freeBytes === "number";
  const overCapacity =
    destFreeKnown && selectedBytes > (destStorage?.freeBytes ?? 0);
  const showStorageWarning =
    isTraversalPhase(migrationStatus) &&
    overCapacity &&
    (storageWarningDismissedAt === null ||
      selectedBytes > storageWarningDismissedAt);
  const forceReplaceAllowed = isForceReplaceReviewView(
    isCopyPlanView,
    isSourceCleanupView,
    isAwaitingCopyReview
  );

  const manualReviewCount = activePathIssues.filter(
    (i) => i.status === "manual_review"
  ).length;
  const pathIssueSummary = useMemo(
    () => summarizePathIssues(activePathIssues),
    [activePathIssues]
  );
  // Naming / GPL counts only on copy-plan (primary actions live there).
  const issuesAttentionCount =
    (stats?.failedCount ?? 0) + (showCompatUI ? manualReviewCount : 0);
  const issuesWarningCount = showCompatUI
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

  const handleConfirmExcludeAllFailed = async () => {
    if (!migrationId || excludeAllFailedBusy) return;
    const failedCount = stats?.failedCount ?? 0;
    if (failedCount <= 0) {
      setShowExcludeAllFailedConfirm(false);
      return;
    }
    setShowExcludeAllFailedConfirm(false);
    setExcludeAllFailedBusy(true);
    try {
      const mapped = mapPathReviewStatusFilter(getDisplayPhase(), "failed");
      const result = await excludeMatchingSearch(
        migrationId,
        {
          statusSearchType: mapped.statusSearchType,
          traversalStatusFilter: mapped.traversalStatusFilter,
          copyStatusFilter: mapped.copyStatusFilter,
          deleteStatusFilter: mapped.deleteStatusFilter,
          phase: getCurrentPhase(),
        },
        []
      );
      const toastInfo = formatBulkActionToast("Exclude", result);
      if (toastInfo) {
        setToast({ message: toastInfo.message, type: toastInfo.type });
      }
      if (result.deltas && Object.keys(result.deltas).length > 0) {
        handleApplyStatsDeltas(result.deltas);
      }
      const pathForLoad =
        breadcrumbs.length > 0
          ? breadcrumbs[breadcrumbs.length - 1].path
          : undefined;
      await loadItems(pathForLoad, undefined, { silent: true });
      if (isDualBrowse) {
        const dstPath =
          dstBreadcrumbs.length > 0
            ? dstBreadcrumbs[dstBreadcrumbs.length - 1].path
            : undefined;
        await loadDstItems(dstPath, undefined, { silent: true });
      }
      setTreeListRefreshToken((t) => t + 1);
    } catch (err) {
      setToast({
        message:
          err instanceof Error ? err.message : "Failed to exclude all failed items",
        type: "error",
      });
    } finally {
      setExcludeAllFailedBusy(false);
    }
  };

  const handleTreeSearchSubmit = (pane: "src" | "dst" = "src") => {
    const q =
      pane === "dst" ? dstTreeSearchQuery.trim() : treeSearchQuery.trim();
    const crumbs = pane === "dst" ? dstBreadcrumbs : breadcrumbs;
    const currentLocationPath =
      crumbs.length > 0 ? crumbs[crumbs.length - 1].path : "/";
    const under =
      currentLocationPath && currentLocationPath !== "/"
        ? currentLocationPath
        : undefined;
    if (!q && !under) {
      return;
    }
    const underPathLabel = under
      ? "/" + crumbs.map((c) => c.name).join("/")
      : undefined;
    if (isDualBrowse) {
      setListSearchSide(pane);
    }
    setListJumpTarget({
      underPath: under,
      underPathLabel,
      nameQuery: q || undefined,
      side: isDualBrowse ? pane : "both",
    });
    setListJumpToken((n) => n + 1);
    setActiveTab("list");
  };

  // Determine if we're in traversal review mode (for backwards compatibility)
  const isTraversalReviewMode = () => {
    return isTraversalPhase(migrationStatus);
  };

  // Phase-aware row status (shared with list view).
  const getItemStatus = (item: DiffItem) =>
    getPathReviewItemStatus(item, itemStatusPhase(getDisplayPhase()));

  const sortTreeItems = (list: DiffItem[]) =>
    [...list].sort((a, b) => {
      if (a.type === "folder" && b.type === "file") return -1;
      if (a.type === "file" && b.type === "folder") return 1;
      return a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

  const loadItems = async (
    locationPath: string | undefined,
    page?: number,
    options?: { silent?: boolean; side?: "src" | "dst" | "both" }
  ) => {
    if (!migrationId) return;

    const side =
      options?.side ??
      (isDualBrowse ? "src" : "both");

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
        includeDestinationOnly: side === "src" ? false : includeDestinationOnly,
        side,
      });

      let filteredItems = sortTreeItems(response.items);

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
          if (isDeletePendingExplicit(item.src?.deleteStatus)) {
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

  const loadDstItems = async (
    locationPath: string | undefined,
    page?: number,
    options?: { silent?: boolean }
  ) => {
    if (!migrationId || !isDualBrowse) return;
    const pathKey = locationPath || "/";
    currentDstTreePathRef.current = pathKey;
    const savedPage = dstFolderPageMap.get(pathKey);
    const targetPage =
      page !== undefined
        ? page
        : savedPage !== undefined
          ? savedPage
          : dstTreeCurrentPage;
    setDstTreeCurrentPage(targetPage);
    const showFullLoading = !options?.silent;
    if (showFullLoading) {
      setDstLoading(true);
    }
    try {
      const offset = targetPage * treeItemsPerPage;
      const response = await getMigrationDiffs(migrationId, {
        locationPath: locationPath || "/",
        offset,
        limit: treeItemsPerPage,
        side: "dst",
      });
      setDstItems(
        applyPathIssuesToDiffItems(sortTreeItems(response.items), await fetchPathIssues())
      );
      setDstPagination(response.pagination);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load destination path review data."
      );
    } finally {
      if (showFullLoading) {
        setDstLoading(false);
      }
    }
  };

  /** Reload current tree folder(s) from API after list-view mutations (silent if tree tab hidden). */
  const handleListDataMutated = () => {
    const pathForLoad =
      breadcrumbs.length > 0
        ? breadcrumbs[breadcrumbs.length - 1].path
        : undefined;
    const silent = activeTabRef.current === "list";
    void loadItems(pathForLoad, undefined, { silent });
    if (isDualBrowse) {
      const dstPath =
        dstBreadcrumbs.length > 0
          ? dstBreadcrumbs[dstBreadcrumbs.length - 1].path
          : undefined;
      void loadDstItems(dstPath, undefined, { silent });
    }
  };

  const clearTreeMultiSelect = () => {
    clearFolderSelectBounce(treeFolderClickTimerRef);
    clearTreeSelection();
    treeSelectedDataRef.current = new Map();
    setTreeApplyMenuOpen(false);
    setInspectorItem(null);
    setHighlightedItemId(null);
  };

  const handleFolderClick = (
    item: DiffItem,
    pane: "src" | "dst" | "merged" = "merged"
  ) => {
    const navKey = `${pane}:${item.id}`;
    const now = Date.now();
    if (
      lastFolderNavRef.current &&
      lastFolderNavRef.current.key === navKey &&
      now - lastFolderNavRef.current.at < 500
    ) {
      return;
    }
    lastFolderNavRef.current = { key: navKey, at: now };

    const opTitle = inFlightOpTitle(mutationOps, itemMutationIds(item));
    if (opTitle) {
      setToast({
        message: "An operation is still running on this folder.",
        type: "info",
      });
      return;
    }
    // Use copyStatus-based logic for traversal review mode
    const status = getItemStatus(item);
    
    if (status.isExcluded || status.isTraversalSkipped) {
      return; // Don't allow navigation into excluded / discovery-skipped folders
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
    
    clearTreeMultiSelect();
    setInspectorItem(null);

    if (pane === "dst") {
      const currentLocationPath =
        dstBreadcrumbs.length > 0
          ? dstBreadcrumbs[dstBreadcrumbs.length - 1].path
          : "/";
      setDstFolderPageMap((prev) => {
        const newMap = new Map(prev);
        newMap.set(currentLocationPath, dstTreeCurrentPage);
        return newMap;
      });
      const navPath =
        item.dst?.locationPath || item.locationPath || item.src?.locationPath;
      if (!navPath) return;
      setDstBreadcrumbs((prev) => [...prev, { path: navPath, name: item.name }]);
      void loadDstItems(navPath);
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

    // Paired/merged rows navigate by SRC id_path (id_map resolves DST peers).
    // Destination-only folders use their DST id_path so merged trees stay browsable.
    // Dual SRC pane always prefers SRC locationPath.
    const navPath =
      pane === "src"
        ? item.src?.locationPath || item.locationPath
        : item.src?.locationPath ||
          item.locationPath ||
          item.dst?.locationPath;
    if (!navPath) {
      return;
    }
    
    const newBreadcrumb: BreadcrumbItem = {
      path: navPath,
      name: item.name,
    };
    setBreadcrumbs((prev) => [...prev, newBreadcrumb]);
    // Don't reset page - loadItems will check for saved page or default to 0
    loadItems(navPath, undefined, {
      side: pane === "src" ? "src" : "both",
    });
  };

  const handleBack = () => {
    clearTreeMultiSelect();
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
    clearTreeMultiSelect();
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
    // Nav uses id_path; breadcrumb labels use display-name segments when available.
    const parentPath = item.parentPath || getParentPath(item.locationPath);
    const displayParent = getParentPath(item.displayPath || item.locationPath);

    if (parentPath) {
      const locParts = parentPath.split("/").filter((p) => p !== "");
      const nameParts = (displayParent || "")
        .split("/")
        .filter((p) => p !== "");
      const newBreadcrumbs: BreadcrumbItem[] = [];
      let currentPath = "";
      for (let i = 0; i < locParts.length; i++) {
        currentPath += (currentPath === "" ? "" : "/") + locParts[i];
        newBreadcrumbs.push({
          path: "/" + currentPath,
          name: nameParts[i] || locParts[i],
        });
      }
      setBreadcrumbs(newBreadcrumbs);
    } else {
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

  const reviewAxisForPhase = (): ReviewStatusAxis => {
    const phase = getCurrentPhase();
    if (phase === "copy") return "copy";
    if (phase === "delete") return "delete";
    return "discovery";
  };

  const reviewStatusDeps = () => ({
    setItems,
    setDstItems,
    peerLists: [items, dstItems],
    mutationOps,
    setMutationOps,
    notify: (message: string, type: "success" | "error") =>
      setToast({ message, type }),
    applyDeltas: handleApplyStatsDeltas,
    setRetryItems,
  });

  /** Dual browse: exclusion / failure on either peer blocks folder open on both. */
  const dualPeerBlocksFolderNav = (item: DiffItem): boolean => {
    if (!isDualBrowse) return traversalBlocksFolderNav(item);
    if (traversalBlocksFolderNav(item)) return true;
    for (const list of [items, dstItems]) {
      for (const peer of list) {
        if (
          peer.id !== item.id &&
          isReviewPeerItem(peer, item) &&
          traversalBlocksFolderNav(peer)
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const handleRetryClick = async (item: DiffItem) => {
    if (!migrationId) return;
    await runReviewStatusCycleClick(
      migrationId,
      item,
      reviewAxisForPhase(),
      reviewStatusDeps()
    );
  };

  const handleCheckboxChange = async (
    item: DiffItem,
    _currentChecked: boolean
  ) => {
    if (!migrationId || isSourceCleanupView) return;

    const displayPhase = getDisplayPhase();
    const status = getItemStatus(item);
    const acts = getPathReviewItemActions(item, status, displayPhase, {
      showCompatUI,
      forceReplaceAllowed,
      folderPeers: items,
    });
    if (!acts.canExclude) {
      return;
    }

    const isExcluding = excludeActionSetsExcluded(item, displayPhase, status);
    // Phase-aware exclude is SRC-only on the API.
    const srcNodeId = item.src?.id;

    if (!srcNodeId) {
      setToast({
        message: "No node ID available for this item.",
        type: "error",
      });
      return;
    }

    const primaryId = srcNodeId;
    if (!canStartMutation(mutationOps, primaryId)) {
      setToast({
        message:
          "An operation is already running on this path; try again once it finishes.",
        type: "error",
      });
      return;
    }

    // Store original item state for rollback
    const originalItem = { ...item };

    setMutationOps((prev) =>
      withInFlightOp(prev, [primaryId, item.id], EXCLUSION_OP_TITLE)
    );

    // Optimistic update: immediately update UI
    setPendingItems((prev) => {
      const newSet = new Set(prev);
      if (isExcluding) {
        newSet.add(item.id);
      } else {
        newSet.delete(item.id);
      }
      return newSet;
    });

    setItems((prevItems) =>
      prevItems.map((i) =>
        i.id === item.id
          ? applyExcludeOptimistic(i, isExcluding, displayPhase)
          : i
      )
    );

    // Track pending update
    pendingUpdatesRef.current.set(item.id, isExcluding);

    try {
      const srcResult = isExcluding
        ? await excludeNode(migrationId, srcNodeId)
        : await unexcludeNode(migrationId, srcNodeId);

      if (!srcResult.success) {
        setPendingItems((prev) => {
          const newSet = new Set(prev);
          if (!isExcluding) {
            newSet.add(item.id);
          } else {
            newSet.delete(item.id);
          }
          return newSet;
        });
        setItems((prevItems) =>
          prevItems.map((i) => (i.id === item.id ? originalItem : i))
        );
        pendingUpdatesRef.current.delete(item.id);
        if (!isNoItemsChangedError(srcResult.error)) {
          let errorMessage =
            srcResult.error || "Failed to update source node. Please try again.";
          if (
            srcResult.error &&
            (srcResult.error.includes("copy phase") ||
              srcResult.error.includes(
                "exclusion operations are not available"
              ))
          ) {
            errorMessage = "Exclusion is not available in the current phase";
          }
          setToast({
            message: errorMessage,
            type: "error",
          });
        }
        return;
      }

      if (srcResult.deltas && Object.keys(srcResult.deltas).length > 0) {
        setStats((prev) =>
          applyStatsDeltas(prev, srcResult.deltas, displayPhase)
        );
      }
      pendingUpdatesRef.current.delete(item.id);
      // Refresh issue overlays/stats only; keep the optimistic row in place.
      await refreshAfterPathChange();
      const opIds: Array<string | null | undefined> = [primaryId, item.id];
      setMutationOps((prev) =>
        withInFlightOp(prev, opIds, EXCLUSION_OP_TITLE, "confirmed")
      );
      window.setTimeout(() => {
        setMutationOps((prev) => withInFlightOp(prev, opIds, null));
      }, MUTATION_CONFIRM_MS);
      return;
    } catch (err) {
      setPendingItems((prev) => {
        const newSet = new Set(prev);
        if (!isExcluding) {
          newSet.add(item.id);
        } else {
          newSet.delete(item.id);
        }
        return newSet;
      });
      setItems((prevItems) =>
        prevItems.map((i) => (i.id === item.id ? originalItem : i))
      );
      pendingUpdatesRef.current.delete(item.id);
      setToast({
        message:
          err instanceof Error
            ? err.message
            : "Network error: Failed to update node. Please try again.",
        type: "error",
      });
    } finally {
      setMutationOps((prev) => {
        const opIds: Array<string | null | undefined> = [primaryId, item.id];
        const st = inFlightOpState(prev, opIds);
        if (st?.phase === "confirmed") return prev;
        return withInFlightOp(prev, opIds, null);
      });
    }
  };

  const selectInspectorItem = (item: DiffItem) => {
    setIssuesPanelOpen(false);
    setInspectorItem(applyPathIssuesToDiffItems([item], pathIssues)[0]);
  };

  const ensureInspectorItem = (item: DiffItem) => {
    setIssuesPanelOpen(false);
    setInspectorItem(applyPathIssuesToDiffItems([item], pathIssues)[0]);
  };

  const treeVisibleItems: BrowseSelectableItem[] = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        type: item.type === "folder" ? "folder" : "file",
        name: item.name,
      })),
    [items]
  );

  const handleTreeItemSelect = (
    item: DiffItem,
    index: number,
    event: React.MouseEvent
  ) => {
    event.preventDefault();
    const runSelect = () => {
      const { next } = selectTreeItem(
        {
          id: item.id,
          type: item.type === "folder" ? "folder" : "file",
          name: item.name,
        },
        index,
        {
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        },
        treeVisibleItems
      );
      const data = new Map(treeSelectedDataRef.current);
      for (const id of data.keys()) {
        if (!next.has(id)) data.delete(id);
      }
      for (const [id] of next) {
        const row = items.find((entry) => entry.id === id);
        if (row) data.set(id, row);
      }
      treeSelectedDataRef.current = data;
      if (next.has(item.id)) {
        selectInspectorItem(item);
        return;
      }
      if (inspectorItem?.id === item.id) {
        const remaining = Array.from(next.keys());
        const fallbackId = remaining[remaining.length - 1];
        const fallback = fallbackId
          ? data.get(fallbackId) ?? items.find((entry) => entry.id === fallbackId)
          : null;
        if (fallback) {
          selectInspectorItem(fallback);
        } else {
          setInspectorItem(null);
        }
      }
    };

    runWithFolderSelectBounce(
      treeFolderClickTimerRef,
      item.type === "folder" ? "folder" : "file",
      event,
      runSelect,
      PATH_REVIEW_FOLDER_SELECT_BOUNCE_MS
    );
  };

  const treeSelectedItems = (): DiffItem[] => {
    const selected: DiffItem[] = [];
    for (const id of treeSelected.keys()) {
      const item = treeSelectedDataRef.current.get(id);
      if (item) selected.push(item);
    }
    return selected;
  };

  // Eligibility is recomputed as the selection is added to / dropped from,
  // so the menu and confirm dialog only ever read the current partitions.
  const treeBulkPartitions = useMemo<Record<BulkActionKind, BulkActionPartition>>(
    () => {
      const selected = treeSelectedItems();
      const displayPhase = getDisplayPhase();
      return {
        exclude: partitionBulkAction(
          selected,
          "exclude",
          getItemStatus,
          displayPhase
        ),
        unexclude: partitionBulkAction(
          selected,
          "unexclude",
          getItemStatus,
          displayPhase
        ),
        mark_retry: partitionBulkAction(
          selected,
          "mark_retry",
          getItemStatus,
          displayPhase
        ),
        mark_failed: partitionBulkAction(
          selected,
          "mark_failed",
          getItemStatus,
          displayPhase
        ),
        force_replace: partitionBulkAction(
          selected,
          "force_replace",
          getItemStatus,
          displayPhase,
          forceReplaceAllowed
        ),
        unforce_replace: partitionBulkAction(
          selected,
          "unforce_replace",
          getItemStatus,
          displayPhase,
          forceReplaceAllowed
        ),
      };
    },
    // treeSelectedItems reads the data ref kept in sync with treeSelected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [treeSelected, items, migrationStatus, forceReplaceAllowed, reviewView]
  );

  /** Gate a bulk action on selection eligibility: mixed selections confirm first. */
  const requestTreeBulkAction = (action: BulkActionKind) => {
    if (!migrationId || treeBulkLoading || treeSelectedCount === 0) return;
    setTreeApplyMenuOpen(false);
    const partition = treeBulkPartitions[action];
    if (partition.valid.length === 0) return;
    if (partition.invalid.length > 0) {
      setPendingTreeBulk({ action, partition });
      return;
    }
    if (
      action === "force_replace" &&
      partition.valid.some((item) => item.type === "folder")
    ) {
      setForceReplaceConfirm({ items: partition.valid });
      return;
    }
    void runTreeBulkAction(action, partition.valid);
  };

  const canTreeBulkExclude = displayPhaseAllowsBulkExclude(getDisplayPhase());

  const treeSelectionActions = ((): PathReviewSelectionAction[] => {
    const actions: PathReviewSelectionAction[] = [];
    if (canTreeBulkExclude) {
      actions.push(
        {
          key: "exclude",
          label: "Exclude",
          disabled: treeBulkPartitions.exclude.valid.length === 0,
          title:
            treeBulkPartitions.exclude.valid.length === 0
              ? "No selected items can be excluded"
              : undefined,
          onClick: () => requestTreeBulkAction("exclude"),
        },
        {
          key: "unexclude",
          label: "Unexclude",
          disabled: treeBulkPartitions.unexclude.valid.length === 0,
          title:
            treeBulkPartitions.unexclude.valid.length === 0
              ? "No selected items are excluded"
              : undefined,
          onClick: () => requestTreeBulkAction("unexclude"),
        }
      );
    }
    actions.push(
      {
        key: "mark_retry",
        label: "Mark for retry",
        disabled: treeBulkPartitions.mark_retry.valid.length === 0,
        title:
          treeBulkPartitions.mark_retry.valid.length === 0
            ? "No selected items can be marked for retry"
            : undefined,
        onClick: () => requestTreeBulkAction("mark_retry"),
      },
      {
        key: "mark_failed",
        label: "Mark failed",
        disabled: treeBulkPartitions.mark_failed.valid.length === 0,
        title:
          treeBulkPartitions.mark_failed.valid.length === 0
            ? "No selected items are marked for retry"
            : undefined,
        onClick: () => requestTreeBulkAction("mark_failed"),
      }
    );
    if (forceReplaceAllowed) {
      actions.push(
        {
          key: "force_replace",
          label: "Replace with source",
          disabled: treeBulkPartitions.force_replace.valid.length === 0,
          title:
            treeBulkPartitions.force_replace.valid.length === 0
              ? "No selected items exist on both sides"
              : undefined,
          onClick: () => requestTreeBulkAction("force_replace"),
        },
        {
          key: "unforce_replace",
          label: "Keep destination (undo replace)",
          disabled: treeBulkPartitions.unforce_replace.valid.length === 0,
          title:
            treeBulkPartitions.unforce_replace.valid.length === 0
              ? "No selected items are marked to replace with source"
              : undefined,
          onClick: () => requestTreeBulkAction("unforce_replace"),
        }
      );
    }
    return actions;
  })();

  const runTreeBulkAction = async (
    action: BulkActionKind,
    validItems: DiffItem[]
  ) => {
    if (!migrationId || treeBulkLoading || validItems.length === 0) return;
    setTreeBulkLoading(true);
    try {
      const nodeIDs = bulkNodeIDs(validItems);
      if (nodeIDs.length === 0) {
        setToast({
          message: "No selectable nodes in the current selection.",
          type: "error",
        });
        return;
      }

      let result: ExclusionResponse;
      const phase = getCurrentPhase();
      const kind: BulkRetryKind =
        phase === "delete" ? "delete" : phase === "copy" ? "copy" : "discovery";
      switch (action) {
        case "exclude":
          result = await bulkExcludeNodes(migrationId, { nodeIDs });
          break;
        case "unexclude":
          result = await bulkUnexcludeNodes(migrationId, { nodeIDs });
          break;
        case "mark_retry":
          result = await bulkMarkNodesForRetry(migrationId, { nodeIDs, kind });
          break;
        case "mark_failed":
          result = await bulkUnmarkNodesForRetry(migrationId, { nodeIDs, kind });
          break;
        case "force_replace":
        case "unforce_replace": {
          const srcIDs = bulkSrcNodeIDs(validItems);
          let affected = 0;
          const deltas: Record<string, number> = {};
          let lastError = "";
          for (const id of srcIDs) {
            const one =
              action === "force_replace"
                ? await forceReplaceCopyNode(migrationId, id)
                : await unforceReplaceCopyNode(migrationId, id);
            if (one.success) {
              affected += one.affectedCount ?? 0;
              if (one.deltas) {
                for (const [k, v] of Object.entries(one.deltas)) {
                  deltas[k] = (deltas[k] ?? 0) + (v as number);
                }
              }
            } else if (one.error) {
              lastError = one.error;
            }
          }
          result = {
            success: affected > 0,
            affectedCount: affected,
            deltas,
            error: affected > 0 ? undefined : lastError || "no items changed",
          };
          break;
        }
      }
      const toastInfo = formatBulkActionToast(BULK_ACTION_LABELS[action], result);
      if (toastInfo) {
        setToast({ message: toastInfo.message, type: toastInfo.type });
      }
      if (!result.taskID) {
        if (result.deltas && Object.keys(result.deltas).length > 0) {
          handleApplyStatsDeltas(result.deltas);
        }
        const pathForLoad =
          breadcrumbs.length > 0
            ? breadcrumbs[breadcrumbs.length - 1].path
            : undefined;
        await loadItems(pathForLoad, undefined, { silent: true });
        setTreeListRefreshToken((token) => token + 1);
      }
      clearTreeMultiSelect();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Bulk action failed",
        type: "error",
      });
    } finally {
      setTreeBulkLoading(false);
      try {
        await getReviewOpsStatus(migrationId);
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    if (!treeApplyMenuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (
        treeApplyMenuRef.current &&
        !treeApplyMenuRef.current.contains(event.target as Node)
      ) {
        setTreeApplyMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [treeApplyMenuOpen]);

  const toggleIgnoreWarningForItem = async (item: DiffItem) => {
    if (!migrationId) return;
    const restoring = !!item.pathIssueIgnored;
    setPathBulkTask({
      id: "path-bulk",
      kind: "path-bulk",
      title: PATH_REVIEW_COPY.updatingRelatedPaths,
    });
    try {
      const res = restoring
        ? await unignorePathIssueSubtree(migrationId, item.id)
        : await ignorePathIssueSubtree(migrationId, item.id);
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
      setPathBulkTask(null);
    }
  };

  const handleIncludeRuleExcludedSubtree = async (item: DiffItem) => {
    if (!migrationId || !canIncludeRuleExcludedSubtree(item)) return;
    const nodeId = item.src?.id || item.id;
    setPathBulkTask({
      id: "path-bulk",
      kind: "path-bulk",
      title: "Including subtree and marking for re-scan…",
    });
    try {
      const result = await includeRuleExcludedSubtree(migrationId, nodeId);
      if (!result.success) {
        setToast({
          message: result.error || "Could not include and re-scan subtree",
          type: "error",
        });
        return;
      }
      setToast({
        message: "Subtree included and marked for discovery retry",
        type: "success",
      });
      await loadItems(
        breadcrumbs.length > 0
          ? breadcrumbs[breadcrumbs.length - 1].path
          : undefined,
        undefined,
        { silent: activeTabRef.current === "list" }
      );
      await fetchStats();
      if (activeTabRef.current === "tree") {
        setTreeListRefreshToken((n) => n + 1);
      }
    } catch (err) {
      setToast({
        message:
          err instanceof Error
            ? err.message
            : "Could not include and re-scan subtree",
        type: "error",
      });
    } finally {
      setPathBulkTask(null);
    }
  };

  const handleForceReplaceClick = async (item: DiffItem, mark: boolean) => {
    if (!migrationId || !item.src?.id) return;
    if (mark && item.type === "folder") {
      setForceReplaceConfirm({ item });
      return;
    }
    const nodeId = item.src.id;
    if (!canStartMutation(mutationOps, nodeId)) {
      setToast({
        message:
          "An operation is already running on this path; try again once it finishes.",
        type: "error",
      });
      return;
    }
    setMutationOps((prev) =>
      withInFlightOp(prev, [nodeId, item.id], mark ? "Replace with source" : "Undo replace")
    );
    try {
      const result = mark
        ? await forceReplaceCopyNode(migrationId, nodeId)
        : await unforceReplaceCopyNode(migrationId, nodeId);
      const toastInfo = formatBulkActionToast(
        mark ? "Replace with source" : "Keep destination (undo replace)",
        result
      );
      if (toastInfo) {
        setToast({ message: toastInfo.message, type: toastInfo.type });
      }
      if (result.deltas && Object.keys(result.deltas).length > 0) {
        handleApplyStatsDeltas(result.deltas);
      }
      if (result.success) {
        const pathForLoad =
          breadcrumbs.length > 0
            ? breadcrumbs[breadcrumbs.length - 1].path
            : undefined;
        await loadItems(pathForLoad, undefined, { silent: true });
        setTreeListRefreshToken((token) => token + 1);
      }
    } catch (err) {
      setToast({
        message:
          err instanceof Error
            ? err.message
            : mark
              ? "Failed to replace with source"
              : "Failed to undo replace",
        type: "error",
      });
    } finally {
      setMutationOps((prev) => {
        const next = new Map(prev);
        next.delete(nodeId);
        next.delete(item.id);
        return next;
      });
    }
  };

  const buildTreeContextActions = (item: DiffItem) => {
    const status = getItemStatus(item);
    const displayPhase = getDisplayPhase();
    const phase = getCurrentPhase();
    const isDeleteReview = phase === "delete";
    const isFolder = item.type === "folder";
    const isMarkedForRetry = isDeleteReview
      ? isDeletePendingExplicit(item.src?.deleteStatus) ||
        (retryItems.has(item.id) && (item.src?.deleteStatus || "") !== "deleted")
      : isTraversalRetryPending(item) ||
        (retryItems.has(item.id) && !hasTraversalFailure(item));
    const acts = getPathReviewItemActions(item, status, displayPhase, {
      showCompatUI,
      forceReplaceAllowed,
      isMarkedForRetry,
      folderPeers: items,
    });
    const canOpenFolder =
      isFolder &&
      !inFlightOpTitle(mutationOps, itemMutationIds(item)) &&
      (isDeleteReview
        ? !status.isFailed && !isMarkedForRetry
        : !status.isExcluded &&
          !dualPeerBlocksFolderNav(item) &&
          !isMarkedForRetry);
    const canToggleIgnoreWarning =
      showCompatUI &&
      !isSourceCleanupView &&
      !isDeletePhase(migrationStatus) &&
      !isCopyPhase(migrationStatus) &&
      !!(item.pathIssueStatus || item.proposedPath) &&
      canIgnorePathIssue(item);

    const actions: { key: string; label: string; onClick: () => void }[] = [];
    if (canOpenFolder) {
      actions.push({
        key: "open-folder",
        label: PATH_REVIEW_COPY.openFolder,
        onClick: () => handleFolderClick(item),
      });
    }
    if (canIncludeRuleExcludedSubtree(item)) {
      actions.push({
        key: "include-rescan",
        label: PATH_REVIEW_COPY.includeRuleExcludedSubtree,
        onClick: () => {
          void handleIncludeRuleExcludedSubtree(item);
        },
      });
    }
    if (
      acts.reviewAxis &&
      acts.statusTransitions.length > 0 &&
      !inFlightOpTitle(mutationOps, itemMutationIds(item))
    ) {
      for (const status of acts.statusTransitions) {
        actions.push({
          key: `status-${status}`,
          label: REVIEW_STATUS_LABELS[status],
          onClick: () => {
            if (!migrationId || !acts.reviewAxis) return;
            void runReviewStatusTransition(
              migrationId,
              item,
              acts.reviewAxis,
              status,
              reviewStatusDeps()
            );
          },
        });
      }
    } else if (acts.canExclude) {
      actions.push({
        key: "exclude",
        label: acts.excludeLabel,
        onClick: () => {
          void handleCheckboxChange(item, true);
        },
      });
    }
    if (acts.canForceReplace) {
      actions.push({
        key: "force-replace",
        label: "Replace with source",
        onClick: () => {
          void handleForceReplaceClick(item, true);
        },
      });
    }
    if (acts.canUnforceReplace) {
      actions.push({
        key: "unforce-replace",
        label: "Keep destination (undo replace)",
        onClick: () => {
          void handleForceReplaceClick(item, false);
        },
      });
    }
    if (acts.canUniqueName) {
      const uniqueLabel = acts.uniqueNameSuggestion
        ? PATH_REVIEW_COPY.acceptUniqueName(acts.uniqueNameSuggestion)
        : PATH_REVIEW_COPY.useUniqueName;
      actions.push({
        key: "unique-name",
        label: uniqueLabel,
        onClick: () => {
          void handleUniquePathName(item, acts.uniqueNameSuggestion || undefined);
        },
      });
      actions.push({
        key: "edit-unique-name",
        label: PATH_REVIEW_COPY.editUniqueName,
        onClick: () => {
          setRenameTarget({
            item,
            initialName: acts.uniqueNameSuggestion || undefined,
          });
        },
      });
    }
    if (acts.canUndoAcceptedRename) {
      actions.push({
        key: "undo-rename",
        label: PATH_REVIEW_COPY.undoAcceptedRename,
        onClick: () => {
          void handleUndoAcceptedRename(item);
        },
      });
    }
    if (acts.canSkipDelete) {
      actions.push({
        key: "skip-delete",
        label: acts.skipDeleteLabel,
        onClick: () => {
          void handleSkipDeleteClick(item);
        },
      });
    }
    if (acts.canRename) {
      actions.push({
        key: "rename",
        label: PATH_REVIEW_COPY.renameDestination,
        onClick: () => setRenameTarget({ item }),
      });
    }
    if (canToggleIgnoreWarning) {
      actions.push({
        key: "ignore-warning",
        label: item.pathIssueIgnored
          ? PATH_REVIEW_COPY.unignoreWarning
          : item.copyStatus === "already_existed"
            ? PATH_REVIEW_COPY.ignoreKeepExistingName
            : PATH_REVIEW_COPY.ignoreWarning,
        onClick: () => {
          void toggleIgnoreWarningForItem(item);
        },
      });
    }
    return actions;
  };

  const handleItemContextMenu = (item: DiffItem, event: React.MouseEvent) => {
    const actions = buildTreeContextActions(item);
    if (actions.length === 0) return;
    event.preventDefault();
    ensureInspectorItem(item);
    setContextMenu({ x: event.clientX, y: event.clientY, item });
  };

  const commitUniquePathName = async (
    item: DiffItem,
    proposedName?: string
  ) => {
    if (!migrationId) return;
    try {
      const res = await acceptUniquePathName(
        migrationId,
        item.id,
        proposedName
      );
      if (!res.success) {
        setToast({
          message:
            res.message || res.error || "Could not assign a unique destination name.",
          type: "error",
        });
        return;
      }
      await refreshAfterPathChange();
    } catch (e) {
      setToast({
        message:
          e instanceof Error
            ? e.message
            : "Could not assign a unique destination name.",
        type: "error",
      });
    }
  };

  const handleUniquePathName = async (
    item: DiffItem,
    proposedName?: string
  ) => {
    if (!migrationId) return;
    if (item.type !== "folder") {
      await commitUniquePathName(item, proposedName);
      return;
    }
    try {
      const preview = await previewPathResolutionCascade(
        migrationId,
        item.id,
        "unique",
        proposedName
      );
      if (!preview.success) {
        setToast({
          message: preview.message || "Could not preview unique name.",
          type: "error",
        });
        return;
      }
      setCascadeConfirm({
        item,
        action: "unique",
        preview,
        proposedName,
      });
    } catch (e) {
      setToast({
        message:
          e instanceof Error ? e.message : "Could not preview unique name.",
        type: "error",
      });
    }
  };

  const cascadePreviewMessage = (
    preview: PathResolutionCascadePreview
  ): string => {
    const parts: string[] = [];
    if (preview.folderCollisionCount > 0) {
      parts.push(
        PATH_REVIEW_COPY.cascadeFolderConflicts(preview.folderCollisionCount)
      );
      for (const c of preview.folderCollisions ?? []) {
        parts.push(`• “${c.srcName}” ↔ “${c.dstName}”`);
      }
    }
    if (preview.fileOverwriteCount > 0) {
      parts.push(
        PATH_REVIEW_COPY.cascadeFileOverwrites(preview.fileOverwriteCount)
      );
      for (const f of preview.fileOverwrites ?? []) {
        const win =
          f.defaultWinner === "dst"
            ? PATH_REVIEW_COPY.cascadeDefaultWinnerDst
            : PATH_REVIEW_COPY.cascadeDefaultWinnerSrc;
        parts.push(`• “${f.srcName}”: ${win}`);
      }
    }
    if (parts.length === 0) {
      return PATH_REVIEW_COPY.cascadePreviewEmpty;
    }
    return parts.join("\n");
  };

  const handleUndoAcceptedRename = async (item: DiffItem) => {
    if (!migrationId) return;
    try {
      const res = await resetPathRemap(migrationId, item.id);
      if (!res.success) {
        setToast({
          message:
            res.message || res.error || "Could not undo destination rename.",
          type: "error",
        });
        return;
      }
      await refreshAfterPathChange();
    } catch (e) {
      setToast({
        message:
          e instanceof Error ? e.message : "Could not undo destination rename.",
        type: "error",
      });
    }
  };

  /** Overlay path-issue flags and refresh stats without reloading the whole table. */
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
      const health = await probeMigrationFSHealth(migrationId, "both");
      if (!health.ok) {
        setToast({
          message: formatFSHealthFailure(health),
          type: "error",
        });
        setIsTriggeringSweep(false);
        return;
      }
      const result = await resumeMigration(migrationId);
      if (!result.success) {
        setToast({
          message: result.fsHealth
            ? formatFSHealthFailure(result.fsHealth)
            : result.error || "Failed to retry source removal",
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
        setPathBulkTask({
          id: "path-bulk",
          kind: "path-bulk",
          title: PATH_REVIEW_COPY.updatingRelatedPaths,
        });
        setPathRenameWatch(true);
        const accepted = await acceptAllPathProposals(migrationId);
        setPathRenameWatch(false);
        setPathBulkTask(null);
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
      setPathRenameWatch(false);
      setPathBulkTask(null);
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
    const isExcluding = isDeleteExcludePending(item.src?.deleteStatus);
    const nextStatus = isExcluding ? ("skipped" as const) : ("pending_explicit" as const);
    const nodeId = item.src?.id || item.id;

    if (!canStartMutation(mutationOps, nodeId)) {
      setToast({
        message:
          "An operation is already running on this path; try again once it finishes.",
        type: "error",
      });
      return;
    }

    setMutationOps((prev) =>
      withInFlightOp(prev, [nodeId, item.id], REMOVAL_OP_TITLE)
    );
    setItems((prev) => applyDeleteStatusInItems(prev, item, nextStatus));

    try {
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
    } finally {
      setMutationOps((prev) => withInFlightOp(prev, [nodeId, item.id], null));
    }
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

  const inspectorStatus = inspectorItem ? getItemStatus(inspectorItem) : null;
  const inspectorMarkedForRetry = inspectorItem
    ? getCurrentPhase() === "delete"
      ? isDeletePendingExplicit(inspectorItem.src?.deleteStatus) ||
        (retryItems.has(inspectorItem.id) &&
          (inspectorItem.src?.deleteStatus || "") !== "deleted")
      : isTraversalRetryPending(inspectorItem) ||
        (retryItems.has(inspectorItem.id) && !hasTraversalFailure(inspectorItem))
    : false;
  const inspectorActions =
    inspectorItem && inspectorStatus
      ? getPathReviewItemActions(
          inspectorItem,
          inspectorStatus,
          getDisplayPhase(),
          {
            showCompatUI,
            forceReplaceAllowed,
            isMarkedForRetry: inspectorMarkedForRetry,
            folderPeers: items,
          }
        )
      : null;
  const inspectorCanCompatActions = Boolean(
    inspectorItem &&
      !isSourceCleanupView &&
      !isDeletePhase(migrationStatus) &&
      !isCopyPhase(migrationStatus)
  );
  return (
    <section className={`path-review${listFiltersPageOpen ? " path-review--filters-page" : ""}`}>
      <PageShell
        className={`path-review__content path-review__content--with-button${
          listFiltersPageOpen ? " path-review__content--filters-page" : ""
        }`}
      >
        <header className="path-review__header">
          <PageBackButton
            onClick={() => {
              if (listFiltersPageOpen) {
                setListFiltersPageOpen(false);
                return;
              }
              if (!migrationId) {
                navigate("/choose");
                return;
              }
              navigate(
                getPathReviewPageBackPath(
                  migrationId,
                  migrationStatus,
                  reviewView
                )
              );
            }}
            title={
              listFiltersPageOpen
                ? "Back to list search"
                : getPathReviewPageBackTitle(migrationStatus, reviewView)
            }
            className="path-review__back"
          />
          <h1>
            {listFiltersPageOpen ? (
              <>
                Advanced{" "}
                <span className="path-review__highlight">filters</span>
              </>
            ) : isSourceCleanupView ? (
              <>
                Review{" "}
                <span className="path-review__highlight--magenta">source</span>{" "}
                removal plan
              </>
            ) : isCopyPlanView ? (
              <>
                Review the <span className="path-review__highlight">copy plan</span>
              </>
            ) : isDeletePhase(migrationStatus) ? (
              <>
                Review{" "}
                <span className="path-review__highlight--magenta">source</span>{" "}
                removal results
              </>
            ) : isCopyPhase(migrationStatus) ? (
              <>
                Review <span className="path-review__highlight">copy</span> results
              </>
            ) : (
              <>
                Review <span className="path-review__highlight">discovery</span> results
              </>
            )}
          </h1>
        </header>
        {/* Tabs */}
        {!listFiltersPageOpen && (
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
          {layoutPhaseKey === "copy" && activeTab === "tree" && (
            <div className="path-review__layout-toggle" role="group" aria-label="Browse layout">
              <button
                type="button"
                className={`path-review__layout-btn${browseLayout === "dual" ? " path-review__layout-btn--active" : ""}`}
                onClick={() => {
                  setPreferredBrowseLayout("dual");
                  saveBrowseLayout(layoutPhaseKey, "dual");
                }}
              >
                Dual
              </button>
              <button
                type="button"
                className={`path-review__layout-btn${browseLayout === "merged" ? " path-review__layout-btn--active" : ""}`}
                onClick={() => {
                  setPreferredBrowseLayout("merged");
                  saveBrowseLayout(layoutPhaseKey, "merged");
                }}
              >
                Merged
              </button>
            </div>
          )}
        </div>
        )}

        {error && <div className="path-review__error">{error}</div>}

        <div className={`path-review__workspace${listFiltersPageOpen ? " path-review__workspace--filters-page" : ""}`}>
          <div className="path-review__workspace-main">
        {/* Tree View Content */}
        <div className={activeTab === "tree" && !listFiltersPageOpen ? "path-review__tab-content" : "path-review__tab-content path-review__tab-content--hidden"}>
          {/* Always keep the dual flex shell so merged (single pane) still gets flex:1
              height; without it list-container collapses under overflow:hidden. */}
          <div
            className={
              isDualBrowse
                ? "path-review__dual-panes"
                : "path-review__dual-panes path-review__dual-panes--merged"
            }
          >
          <div
            className={
              isDualBrowse
                ? "path-review__dual-pane path-review__dual-pane--src"
                : "path-review__dual-pane path-review__dual-pane--merged"
            }
          >
          {isDualBrowse && (
            <div className="path-review__dual-pane-label path-review__dual-pane-label--src">
              Source
            </div>
          )}

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
                loadItems(undefined, undefined, {
                  side: isDualBrowse ? "src" : "both",
                });
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
          <form
            className={`path-review__tree-search${
              treeSearchExpanded ? " path-review__tree-search--expanded" : ""
            }`}
            onSubmit={(e) => {
              e.preventDefault();
              handleTreeSearchSubmit("src");
            }}
          >
            <input
              ref={treeSearchInputRef}
              type="search"
              className="path-review__tree-search-input"
              placeholder={
                breadcrumbs.length > 0
                  ? "Search in this folder…"
                  : "Search all items…"
              }
              value={treeSearchQuery}
              onChange={(e) => setTreeSearchQuery(e.target.value)}
              onBlur={() => {
                if (treeSearchQuery.trim() === "") {
                  setTreeSearchExpanded(false);
                }
              }}
              aria-label="Search from current folder"
            />
            <button
              type={treeSearchExpanded || treeSearchQuery.trim() ? "submit" : "button"}
              className="path-review__tree-search-button"
              title="Search in list view"
              aria-label="Search in list view"
              onClick={(e) => {
                if (!treeSearchExpanded && treeSearchQuery.trim() === "") {
                  e.preventDefault();
                  setTreeSearchExpanded(true);
                  window.setTimeout(() => treeSearchInputRef.current?.focus(), 0);
                }
              }}
            >
              <Search size={16} />
            </button>
          </form>
        </div>

        {/* Issues / selection actions / pagination for the source (or merged) pane.
            Always reserve this row (like dual) so a past-last-page empty result still
            shows pagination and the user can return to page 1. */}
        <div className="path-review-list__legend-wrapper path-review-list__legend-wrapper--toolbar-only">
            <div className="path-review-list__legend-toolbar">
              <div className="path-review-list__legend-start">
                {!loading && items.length > 0 ? (
                  <PathReviewIssuesButton
                    issueCount={issuesAttentionCount}
                    warningCount={issuesWarningCount}
                    showWarnings={showCompatUI}
                    active={issuesPanelOpen}
                    onClick={openIssuesPanel}
                  />
                ) : null}
              </div>
              <div className="path-review-list__legend-end">
                {treeSelectedCount > 0 ? (
                  <PathReviewSelectionControls
                    selectedLabel={`${treeSelectedCount} selected`}
                    loading={treeBulkLoading}
                    menuOpen={treeApplyMenuOpen}
                    onToggleMenu={() => setTreeApplyMenuOpen((open) => !open)}
                    menuRef={treeApplyMenuRef}
                    actions={treeSelectionActions}
                    onClear={clearTreeMultiSelect}
                  />
                ) : null}
                {pagination ? (
                  <ListViewPagination
                    pagination={pagination}
                    currentPage={treeCurrentPage}
                    itemsPerPage={treeItemsPerPage}
                    onPageChange={(newPage) => {
                      const currentLocationPath =
                        breadcrumbs.length > 0
                          ? breadcrumbs[breadcrumbs.length - 1].path
                          : "/";
                      clearTreeMultiSelect();
                      setTreeCurrentPage(newPage);
                      setFolderPageMap((prev) => {
                        const next = new Map(prev);
                        next.set(currentLocationPath, newPage);
                        return next;
                      });
                    }}
                    onItemsPerPageChange={(value) => {
                      clearTreeMultiSelect();
                      setTreeItemsPerPage(value);
                      setTreeCurrentPage(0);
                      setDstTreeCurrentPage(0);
                    }}
                    zoomLevel={1}
                  />
                ) : null}
              </div>
            </div>
          </div>

        {/* Items List */}
        <div className="path-review__list-container" style={densityStyle}>
          <div
            ref={treeListRef}
            className={`path-review__list${altTextSelect ? " path-review__list--text-select" : ""}`}
          >
            {loading ? (
              <div className="path-review__empty">Loading...</div>
            ) : items.length === 0 ? (
              <div className="path-review__empty">
                {treeCurrentPage > 0
                  ? "No items on this page. Use pagination above to go back."
                  : "This folder is empty."}
              </div>
            ) : (
              <>
                <PathReviewSizeColumnHeader
                  variant="tree"
                  showSideColumn={!isDualBrowse}
                />
                {items.map((item, index) => {
                  const status = getItemStatus(item);
                  const isFolder = item.type === "folder";
                  const isLocked = isFolder && status.existsOnBoth;
                  // Items with pending traversalStatus are treated as marked for retry
                  // But if traversalStatus is "failed", it's not marked for retry (even if in retryItems set)
                  // Check both src and dst nodes - failed overrides pending
                  const isMarkedForRetry =
                    getCurrentPhase() === "delete"
                      ? isDeletePendingExplicit(item.src?.deleteStatus) ||
                        (retryItems.has(item.id) && (item.src?.deleteStatus || "") !== "deleted")
                      : isTraversalRetryPending(item) ||
                        (retryItems.has(item.id) && !hasTraversalFailure(item));
                  const isHighlighted = highlightedItemId === item.id;
                  const failureMessage = getDiffItemFailureMessage(item);
                  const isDeleteReview = getCurrentPhase() === "delete";
                  const canOpenFolder = isFolder &&
                    !inFlightOpTitle(mutationOps, itemMutationIds(item)) && (
                    isDeleteReview
                      ? !status.isFailed && !isMarkedForRetry
                      : !status.isExcluded &&
                        !dualPeerBlocksFolderNav(item) &&
                        !isMarkedForRetry
                  );
                  const folderOpTitle = inFlightOpTitle(mutationOps, itemMutationIds(item));
                  const isInspectorFocused = inspectorItem?.id === item.id;
                  const isMultiSelected = isTreeSelected(item.id);

                  return (
                    <div
                      key={item.id}
                      className={`path-review__item${!isDualBrowse ? " path-review__item--with-side" : ""} ${status.isExcluded || isTraversalAckFromFailed(item) ? "path-review__item--excluded" : ""} ${status.isTraversalSkipped ? "path-review__item--traversal-skipped" : ""} ${status.isDeleted ? "path-review__item--deleted" : ""} ${isHighlighted ? "path-review__item--highlighted" : ""} ${isMultiSelected ? "path-review__item--selected" : ""} ${isInspectorFocused ? "path-review__item--inspector-focused" : ""} ${showCompatUI && item.pathIssueStatus === "manual_review" && !item.pathIssueIgnored ? "path-review__item--path-issue" : ""}`}
                      onClick={(event) => {
                        if (altTextSelect) return;
                        // Navigate on the 2nd click of a double-click so we do not
                        // depend only on native dblclick (easy to miss if the
                        // pointer moves slightly between clicks).
                        if (
                          canOpenFolder &&
                          event.detail > 1 &&
                          !event.shiftKey &&
                          !event.ctrlKey &&
                          !event.metaKey
                        ) {
                          clearFolderSelectBounce(treeFolderClickTimerRef);
                          handleFolderClick(
                            item,
                            isDualBrowse ? "src" : "merged"
                          );
                          return;
                        }
                        handleTreeItemSelect(item, index, event);
                      }}
                      onDoubleClick={(event) => {
                        if (altTextSelect) return;
                        // Ctrl/Cmd/Shift multi-select: never navigate.
                        if (event.shiftKey || event.ctrlKey || event.metaKey) {
                          clearFolderSelectBounce(treeFolderClickTimerRef);
                          return;
                        }
                        clearFolderSelectBounce(treeFolderClickTimerRef);
                        if (canOpenFolder) {
                          handleFolderClick(
                            item,
                            isDualBrowse ? "src" : "merged"
                          );
                        }
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
                          opState={inFlightOpState(mutationOps, itemMutationIds(item))}
                          onRetryClick={handleRetryClick}
                          onExcludeClick={handleCheckboxChange}
                          onSkipDeleteClick={handleSkipDeleteClick}
                        />
                      </div>

                      <div className="path-review__item-icon">
                        <FileTypeIcon
                          name={item.name}
                          type={isFolder ? "folder" : "file"}
                          size={18}
                        />
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
                              folderPeers={items}
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
                        {excludedByRuleText(item) ? (
                          <div
                            className="path-review__item-rule-exclusion"
                            title={excludedByRuleText(item)}
                          >
                            {excludedByRuleText(item)}
                          </div>
                        ) : null}
                      </div>

                      {!isDualBrowse && (
                        <div className="path-review__item-side-col">
                          <UnpairedSideChip
                            item={item}
                            existsOnlyOnDst={status.existsOnlyOnDst}
                          />
                        </div>
                      )}
                      {!isDualBrowse && (
                        <div
                          className="path-review__item-side-spacer"
                          aria-hidden="true"
                        />
                      )}

                      <div className="path-review__item-modified-col">
                        {formatItemTimestamp(item.lastUpdated) || ""}
                      </div>
                      <div className="path-review__item-size-col">
                        {item.size != null && item.size >= 0
                          ? formatBytes(item.size)
                          : ""}
                      </div>

                      {isFolder ? (
                        <button
                          type="button"
                          className="path-review__item-arrow-button"
                          disabled={!canOpenFolder}
                          title={
                            folderOpTitle
                              ? folderOpTitle
                              : canOpenFolder
                                ? "Open folder"
                                : "Cannot open folder"
                          }
                          aria-label={
                            folderOpTitle
                              ? folderOpTitle
                              : canOpenFolder
                                ? "Open folder"
                                : "Cannot open folder"
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canOpenFolder) {
                              handleFolderClick(
                                item,
                                isDualBrowse ? "src" : "merged"
                              );
                            }
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
          </div>

          {isDualBrowse && (
            <div className="path-review__dual-pane path-review__dual-pane--dst">
              <div className="path-review__dual-pane-label path-review__dual-pane-label--dst">
                Destination
              </div>
              <div className="path-review__breadcrumbs-container">
                {dstBreadcrumbs.length > 0 && (
                  <button
                    type="button"
                    className="path-review__back-button"
                    onClick={() => {
                      clearTreeMultiSelect();
                      setInspectorItem(null);
                      const currentLocationPath =
                        dstBreadcrumbs.length > 0
                          ? dstBreadcrumbs[dstBreadcrumbs.length - 1].path
                          : "/";
                      setDstFolderPageMap((prev) => {
                        const newMap = new Map(prev);
                        newMap.set(currentLocationPath, dstTreeCurrentPage);
                        return newMap;
                      });
                      if (dstBreadcrumbs.length > 0) {
                        const next = dstBreadcrumbs.slice(0, -1);
                        setDstBreadcrumbs(next);
                        void loadDstItems(
                          next.length > 0
                            ? next[next.length - 1].path
                            : undefined
                        );
                      } else {
                        void loadDstItems(undefined);
                      }
                    }}
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
                      setDstBreadcrumbs([]);
                      void loadDstItems(undefined);
                    }}
                    disabled={dstBreadcrumbs.length === 0}
                  >
                    /
                  </button>
                  {dstBreadcrumbs.map((crumb, index) => (
                    <div key={crumb.path} className="path-review__breadcrumb">
                      <ChevronRight
                        size={16}
                        className="path-review__breadcrumb-separator"
                      />
                      <button
                        type="button"
                        className="path-review__breadcrumb-link"
                        onClick={() => {
                          clearTreeMultiSelect();
                          setInspectorItem(null);
                          const next = dstBreadcrumbs.slice(0, index + 1);
                          setDstBreadcrumbs(next);
                          void loadDstItems(next[next.length - 1].path);
                        }}
                        disabled={index === dstBreadcrumbs.length - 1}
                      >
                        {crumb.name}
                      </button>
                    </div>
                  ))}
                </div>
                <form
                  className={`path-review__tree-search${
                    dstTreeSearchExpanded
                      ? " path-review__tree-search--expanded"
                      : ""
                  }`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleTreeSearchSubmit("dst");
                  }}
                >
                  <input
                    ref={dstTreeSearchInputRef}
                    type="search"
                    className="path-review__tree-search-input"
                    placeholder={
                      dstBreadcrumbs.length > 0
                        ? "Search in this folder…"
                        : "Search all items…"
                    }
                    value={dstTreeSearchQuery}
                    onChange={(e) => setDstTreeSearchQuery(e.target.value)}
                    onBlur={() => {
                      if (dstTreeSearchQuery.trim() === "") {
                        setDstTreeSearchExpanded(false);
                      }
                    }}
                    aria-label="Search destination from current folder"
                  />
                  <button
                    type={
                      dstTreeSearchExpanded || dstTreeSearchQuery.trim()
                        ? "submit"
                        : "button"
                    }
                    className="path-review__tree-search-button"
                    title="Search destination in list view"
                    aria-label="Search destination in list view"
                    onClick={(e) => {
                      if (
                        !dstTreeSearchExpanded &&
                        dstTreeSearchQuery.trim() === ""
                      ) {
                        e.preventDefault();
                        setDstTreeSearchExpanded(true);
                        window.setTimeout(
                          () => dstTreeSearchInputRef.current?.focus(),
                          0
                        );
                      }
                    }}
                  >
                    <Search size={16} />
                  </button>
                </form>
              </div>
              <div className="path-review-list__legend-wrapper path-review-list__legend-wrapper--toolbar-only">
                <div className="path-review-list__legend-toolbar">
                  <div className="path-review-list__legend-start" aria-hidden="true" />
                  <div className="path-review-list__legend-end">
                    {dstPagination ? (
                      <ListViewPagination
                        pagination={dstPagination}
                        currentPage={dstTreeCurrentPage}
                        itemsPerPage={treeItemsPerPage}
                        onPageChange={(newPage) => {
                          const currentLocationPath =
                            dstBreadcrumbs.length > 0
                              ? dstBreadcrumbs[dstBreadcrumbs.length - 1].path
                              : "/";
                          clearTreeMultiSelect();
                          setDstTreeCurrentPage(newPage);
                          setDstFolderPageMap((prev) => {
                            const next = new Map(prev);
                            next.set(currentLocationPath, newPage);
                            return next;
                          });
                        }}
                        onItemsPerPageChange={(value) => {
                          clearTreeMultiSelect();
                          setTreeItemsPerPage(value);
                          setTreeCurrentPage(0);
                          setDstTreeCurrentPage(0);
                        }}
                        zoomLevel={1}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="path-review__list-container" style={densityStyle}>
                <div className="path-review__list">
                  {dstLoading ? (
                    <div className="path-review__empty">Loading...</div>
                  ) : dstItems.length === 0 ? (
                    <div className="path-review__empty">This folder is empty.</div>
                  ) : (
                    <>
                      <PathReviewSizeColumnHeader variant="tree" />
                      {dstItems.map((item) => {
                        const status = getItemStatus(item);
                        const isFolder = item.type === "folder";
                        const isMarkedForRetry = isTraversalRetryPending(item);
                        const canOpenFolder =
                          isFolder &&
                          !inFlightOpTitle(mutationOps, itemMutationIds(item)) &&
                          !status.isExcluded &&
                          !dualPeerBlocksFolderNav(item) &&
                          !isMarkedForRetry;
                        const dstName = item.dst?.name || item.name;
                        const lastUpdated =
                          item.dst?.lastUpdated || item.lastUpdated;
                        const size =
                          item.dst?.size != null ? item.dst.size : item.size;
                        return (
                          <div
                            key={`dst-${item.id}`}
                            className={`path-review__item${
                              status.isExcluded || isTraversalAckFromFailed(item)
                                ? " path-review__item--excluded"
                                : ""
                            }${
                              status.isTraversalSkipped
                                ? " path-review__item--traversal-skipped"
                                : ""
                            }${
                              inspectorItem?.id === item.id
                                ? " path-review__item--inspector-focused"
                                : ""
                            }`}
                            onClick={(event) => {
                              if (altTextSelect) return;
                              event.preventDefault();
                              if (
                                canOpenFolder &&
                                event.detail > 1 &&
                                !event.shiftKey &&
                                !event.ctrlKey &&
                                !event.metaKey
                              ) {
                                clearFolderSelectBounce(treeFolderClickTimerRef);
                                handleFolderClick(item, "dst");
                                return;
                              }
                              runWithFolderSelectBounce(
                                treeFolderClickTimerRef,
                                item.type === "folder" ? "folder" : "file",
                                event,
                                () => selectInspectorItem(item),
                                PATH_REVIEW_FOLDER_SELECT_BOUNCE_MS
                              );
                            }}
                            onDoubleClick={(event) => {
                              if (altTextSelect) return;
                              if (event.shiftKey || event.ctrlKey || event.metaKey) {
                                clearFolderSelectBounce(treeFolderClickTimerRef);
                                return;
                              }
                              clearFolderSelectBounce(treeFolderClickTimerRef);
                              if (canOpenFolder) handleFolderClick(item, "dst");
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
                                zoomLevel={1}
                                phase={getDisplayPhase()}
                                opState={inFlightOpState(
                                  mutationOps,
                                  itemMutationIds(item)
                                )}
                                onRetryClick={handleRetryClick}
                                onExcludeClick={handleCheckboxChange}
                                onSkipDeleteClick={handleSkipDeleteClick}
                              />
                            </div>
                            <div className="path-review__item-icon">
                              <FileTypeIcon
                                name={dstName}
                                type={isFolder ? "folder" : "file"}
                                size={18}
                              />
                            </div>
                            <div
                              className={`path-review__item-name-col ${
                                isFolder ? "path-review__item-name--folder" : ""
                              }`}
                            >
                              <div className="path-review__item-name-row">
                                <div className="path-review__item-name">
                                  {dstName}
                                </div>
                              </div>
                            </div>
                            <div className="path-review__item-modified-col">
                              {formatItemTimestamp(lastUpdated) || ""}
                            </div>
                            <div className="path-review__item-size-col">
                              {size != null && size >= 0
                                ? formatBytes(size)
                                : ""}
                            </div>
                            {isFolder ? (
                              <button
                                type="button"
                                className="path-review__item-arrow-button"
                                disabled={!canOpenFolder}
                                title={
                                  canOpenFolder
                                    ? "Open folder"
                                    : "Cannot open folder"
                                }
                                aria-label={
                                  canOpenFolder
                                    ? "Open folder"
                                    : "Cannot open folder"
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (canOpenFolder) {
                                    handleFolderClick(item, "dst");
                                  }
                                }}
                              >
                                <ChevronRight
                                  size={16}
                                  className="path-review__item-arrow"
                                />
                              </button>
                            ) : (
                              <span
                                className="path-review__item-arrow-spacer"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          </div>

          {(!loading && items.length > 0) ||
          (isDualBrowse && !dstLoading && dstItems.length > 0) ? (
            <div className="path-review__tree-legend-footer">
              <PathReviewLegend
                zoomLevel={1}
                phase={getDisplayPhase()}
                showDestinationOnly={includeDestinationOnly}
                showCompatibility={showCompatUI && activePathIssues.length > 0}
              />
              <div className="path-review__tree-legend-selection path-review__legend path-review__legend--compact path-review__legend--inline">
                <div className="path-review__legend-item">
                  <span className="path-review__legend-label">Selection</span>
                  <HelpTooltip tipId="path-review-selection" position="above" />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* List View Content */}
        {migrationId && (
          <div 
            className={`path-review__list-view-container ${
              activeTab === "list" || listFiltersPageOpen
                ? ""
                : "path-review__tab-content--hidden"
            }`}
          >
            <PathReviewListView
              migrationId={migrationId}
              reviewView={reviewView}
              isActive={activeTab === "list" || listFiltersPageOpen}
              advancedFiltersOpen={listFiltersPageOpen}
              onAdvancedFiltersOpenChange={setListFiltersPageOpen}
              advancedFiltersClearRef={advancedFiltersClearRef}
              advancedFiltersApplyRef={advancedFiltersApplyRef}
              onAdvancedFiltersCanApplyChange={setAdvancedFiltersCanApply}
              onSkipDeleteClick={handleSkipDeleteClick}
              treeListRefreshToken={treeListRefreshToken}
              includeDestinationOnly={includeDestinationOnly}
              showDestinationOnlyToggle={destinationOnlyToggleVisible}
              showDestinationOnly={showDestinationOnly}
              showSearchSideToggle={isDualBrowse}
              searchSide={listSearchSide}
              onSearchSideChange={setListSearchSide}
              onShowDestinationOnlyChange={handleShowDestinationOnlyChange}
              onListDataMutated={handleListDataMutated}
              pathIssues={pathIssues}
              issuesAttentionCount={issuesAttentionCount}
              issuesWarningCount={issuesWarningCount}
              issuesPanelOpen={issuesPanelOpen}
              onOpenIssuesPanel={openIssuesPanel}
              listJumpToken={listJumpToken}
              listJumpTarget={listJumpTarget}
              sourceItemCount={
                (stats?.foldersCount ?? 0) + (stats?.filesCount ?? 0)
              }
              onPathIssuesChange={setPathIssues}
              onOpenRename={(item, opts) =>
                setRenameTarget({ item, initialName: opts?.initialName })
              }
              onAcceptUniqueName={(item, suggestedName) => {
                void handleUniquePathName(item, suggestedName);
              }}
              onUndoAcceptedRename={(item) => {
                void handleUndoAcceptedRename(item);
              }}
              onToggleIgnoreWarning={(item) => {
                void toggleIgnoreWarningForItem(item);
              }}
              inspectorItemId={inspectorItem?.id ?? null}
              onInspectorSelect={selectInspectorItem}
              onInspectorClear={() => {
                setInspectorItem(null);
                setHighlightedItemId(null);
              }}
              onInspectorEnsure={ensureInspectorItem}
              onItemUpdate={() => {
                startStatsPolling();
              }}
              onApplyStatsDeltas={handleApplyStatsDeltas}
              onStatsChange={handleStatsChange}
              onSelectionStatsWarning={handleSelectionWarning}
              onPaginationChange={handlePaginationChange}
              onNavigateToTreeView={navigateToTreeView}
              mutationOps={mutationOps}
              setMutationOps={setMutationOps}
              onToast={(message, type) => setToast({ message, type })}
              onCalculatedTotalChange={(total) => {
                setListCalculatedTotal(total);
              }}
              forceReplaceAllowed={forceReplaceAllowed}
            />
          </div>
        )}
          </div>

          {listFiltersPageOpen ? null : issuesPanelOpen ? (
            <PathReviewIssuesPanel
              failedCount={stats?.failedCount ?? 0}
              pathIssues={showCompatUI ? activePathIssues : []}
              showNamingIssues={showCompatUI}
              onExcludeAllFailed={
                displayPhaseAllowsBulkExclude(getDisplayPhase()) &&
                (stats?.failedCount ?? 0) > 0
                  ? () => setShowExcludeAllFailedConfirm(true)
                  : undefined
              }
              excludeAllFailedBusy={excludeAllFailedBusy}
              onClose={() => setIssuesPanelOpen(false)}
              onJump={handleIssuesJump}
            />
          ) : inspectorItem ? (
          <PathReviewInspector
            item={inspectorItem}
            phase={getDisplayPhase()}
            busy={
              pathRenameWatch ||
              !!pathBulkTask ||
              !!pathRenameProgress?.active ||
              !!inFlightOpTitle(mutationOps, itemMutationIds(inspectorItem))
            }
            showExclude={!!inspectorActions?.showExclude}
            canExclude={!!inspectorActions?.canExclude}
            excludeLabel={inspectorActions?.excludeLabel}
            excludeDisabledReason={inspectorActions?.excludeDisabledReason}
            showRetry={!!inspectorActions?.showRetry}
            canRetry={!!inspectorActions?.canRetry}
            canForceReplace={!!inspectorActions?.canForceReplace}
            canUnforceReplace={!!inspectorActions?.canUnforceReplace}
            canUniqueName={!!inspectorActions?.canUniqueName}
            canUndoAcceptedRename={!!inspectorActions?.canUndoAcceptedRename}
            uniqueNameSuggestion={inspectorActions?.uniqueNameSuggestion}
            retryLabel={inspectorActions?.retryLabel}
            retryDisabledReason={inspectorActions?.retryDisabledReason}
            isExcluded={
              !!inspectorStatus?.isExcluded ||
              !!inspectorActions?.isAcknowledgedExcluded
            }
            isMarkedForRetry={inspectorMarkedForRetry}
            canRename={!!inspectorActions?.canRename}
            canToggleIgnoreWarning={
              inspectorCanCompatActions &&
              !!(inspectorItem.pathIssueStatus || inspectorItem.proposedPath)
            }
            ignoreWarningBlocked={
              inspectorCanCompatActions &&
              !!(inspectorItem.pathIssueStatus || inspectorItem.proposedPath) &&
              needsManualCompatAction(inspectorItem) &&
              !inspectorItem.pathIssueIgnored
            }
            onRename={() => {
              setRenameTarget({ item: inspectorItem });
            }}
            onToggleIgnoreWarning={async () => {
              await toggleIgnoreWarningForItem(inspectorItem);
            }}
            onExclude={() => {
              void handleCheckboxChange(
                inspectorItem,
                !inspectorStatus?.isExcluded
              );
            }}
            onRetry={() => {
              void handleRetryClick(inspectorItem);
            }}
            onForceReplace={() => {
              void handleForceReplaceClick(inspectorItem, true);
            }}
            onUnforceReplace={() => {
              void handleForceReplaceClick(inspectorItem, false);
            }}
            onUniqueName={() => {
              void handleUniquePathName(
                inspectorItem,
                inspectorActions?.uniqueNameSuggestion || undefined
              );
            }}
            onEditUniqueName={() => {
              setRenameTarget({
                item: inspectorItem,
                initialName:
                  inspectorActions?.uniqueNameSuggestion || undefined,
              });
            }}
            onUndoAcceptedRename={() => {
              void handleUndoAcceptedRename(inspectorItem);
            }}
          />
          ) : null}
        </div>

        {contextMenu && (
          <PathReviewContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            actions={buildTreeContextActions(contextMenu.item)}
            onClose={() => setContextMenu(null)}
          />
        )}

        {renameTarget && migrationId && (
          <PathRenameEditor
            migrationId={migrationId}
            item={renameTarget.item}
            issue={
              pathIssues.find((i) => i.nodeId === renameTarget.item.id) || null
            }
            initialName={renameTarget.initialName}
            revealNonce={renameRevealNonce}
            onClose={() => setRenameTarget(null)}
            onApplied={() => {
              void refreshAfterPathChange();
            }}
            onCascadeActiveChange={setPathRenameWatch}
            onError={(message) => setToast({ message, type: "error" })}
          />
        )}

        {showStorageWarning && (
          <CompatReviewBanner
            message={`Selected data (${formatBytes(selectedBytes)}) may exceed free space on the destination (${formatBytes(destStorage?.freeBytes ?? 0)}). You can still proceed; exclude items or free space if needed.`}
            onDismiss={() => setStorageWarningDismissedAt(selectedBytes)}
          />
        )}

        {/* Footer */}
        {listFiltersPageOpen ? (
          <div className="path-review__footer path-review__footer--filters">
            <div />
            <div className="path-review__footer-actions">
              <button
                type="button"
                className="action-button action-button--secondary"
                onClick={() => advancedFiltersClearRef.current()}
              >
                Clear rules
              </button>
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={() => advancedFiltersApplyRef.current()}
                disabled={!advancedFiltersCanApply}
              >
                Apply & search
              </button>
            </div>
          </div>
        ) : (
        <div className="path-review__footer">
          <ListDensityControl />
          {/* Stats - Only show on tree view */}
          {stats && activeTab === "tree" && (
            <PathReviewFooterInfo
              items={[
                {
                  label: "Size (Src)",
                  value: formatBytes(finiteNonNeg(stats.totalFileSize.src)),
                },
                ...(isCopyPlanView || isSourceCleanupView
                  ? [
                      {
                        label: "Selected",
                        value: formatBytes(
                          finiteNonNeg(stats.totalFileSize.selected)
                        ),
                        selectedHoverCard: {
                          summary: isSourceCleanupView
                            ? "Bytes still scheduled for source removal (delete-pending only). Skipping items lowers this."
                            : "Bytes still scheduled to copy (copy-pending only). Excluding folders or files lowers this.",
                          foldersCount: stats.foldersCount,
                          filesCount: stats.filesCount,
                          foldersRatio: stats.foldersRatio,
                          filesRatio: stats.filesRatio,
                        },
                      },
                    ]
                  : []),
                {
                  label: "Size (Dst)",
                  value: formatBytes(finiteNonNeg(stats.totalFileSize.dst)),
                  tooltip: {
                    tipId: "path-review-dst-size-explanation",
                    position: "above",
                  },
                },
                {
                  label: "Free (Dst)",
                  value: destStorage?.available
                    ? destStorage.unlimited
                      ? "Unlimited"
                      : formatBytes(destStorage.freeBytes ?? 0)
                    : "Unavailable",
                  tooltip: {
                    tipId: "path-review-free-dst-explanation",
                    position: "above",
                  },
                },
                ...(showsPathReviewPendingColumn(
                  getDisplayPhase(),
                  migrationStatus
                )
                  ? [
                      {
                        label: "Pending",
                        value: (stats.pendingCount ?? 0).toLocaleString(),
                      },
                    ]
                  : []),
                {
                  label: "Failed",
                  value: stats.failedCount.toLocaleString(),
                  ...(stats.failedCount > 0 ? { highlight: "failed" as const } : {}),
                },
                ...(getDisplayPhase() !== "traversal"
                  ? [
                      {
                        label: "Excluded",
                        value: stats.excludedCount.toLocaleString(),
                      },
                    ]
                  : []),
                ...(getDisplayPhase() !== "copy-plan" &&
                getDisplayPhase() !== "source-cleanup"
                  ? [
                      {
                        label: "Pending Retry",
                        value: (stats.pendingRetriesCount ?? 0).toLocaleString(),
                      },
                    ]
                  : []),
              ]}
            />
          )}
          {/* Pagination Info - Only show on list view */}
          {activeTab === "list" && listPagination && (
            <PathReviewFooterInfo
              items={[
                {
                  label: "Showing",
                  value: formatListShowingRange(
                    {
                      offset: listPagination.offset,
                      limit: listPagination.limit || listItemsPerPage,
                      total: listCalculatedTotal ?? listPagination.total,
                      hasMore: listPagination.hasMore,
                    },
                    listItemsPerPage
                  ),
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

            {(() => {
              const unresolvedFailed = stats?.failedCount ?? 0;
              const pendingRetries = stats?.pendingRetriesCount ?? 0;
              const reviewFailedGate =
                unresolvedFailed > 0 && pendingRetries === 0;
              const reviewFailedButton = (
                <button
                  type="button"
                  className="action-button action-button--primary action-button--multiline"
                  onClick={openIssuesPanel}
                  title="Resolve or acknowledge failed items before continuing"
                >
                  Review {unresolvedFailed.toLocaleString()} failed item
                  {unresolvedFailed === 1 ? "" : "s"} before continuing
                </button>
              );

              if (isSourceCleanupView) {
                return (
                  <button
                    type="button"
                    className="action-button action-button--primary action-button--multiline"
                    onClick={handleBeginRemoval}
                    disabled={isTriggeringSweep || hasRunningTasks}
                    title="Start removing copied items from the source"
                  >
                    Begin Removal from Source
                  </button>
                );
              }
              if (isCopyPlanView) {
                const copyBlockedByIssues = manualReviewCount > 0;
                const startCopyDisabled =
                  !checkCanStartCopy() || hasRunningTasks || isTriggeringSweep;
                return (
                  <div className="path-review__phase-cta">
                    {copyBlockedByIssues ? (
                      <button
                        type="button"
                        className="path-review__phase-blocker"
                        onClick={openIssuesPanel}
                        title={PATH_REVIEW_COPY.phaseBlockedOpenIssuesTip}
                        aria-label={PATH_REVIEW_COPY.phaseBlockedOpenIssues(
                          manualReviewCount
                        )}
                      >
                        <AlertTriangle size={16} aria-hidden />
                        <span>
                          {PATH_REVIEW_COPY.requireReviewBeforeCopy(
                            manualReviewCount
                          )}
                        </span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="action-button action-button--primary"
                      onClick={handleStartCopying}
                      disabled={startCopyDisabled}
                      title={
                        copyBlockedByIssues
                          ? PATH_REVIEW_COPY.requireReviewBeforeCopy(
                              manualReviewCount
                            )
                          : !checkCanStartCopy()
                            ? migrationStatus
                              ? (() => {
                                  if (
                                    getMigrationPhase(migrationStatus) !==
                                    "awaiting-traversal-review"
                                  ) {
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
                  </div>
                );
              }
              if (isDeletePhase(migrationStatus)) {
                if (pendingRetries > 0) {
                  return (
                    <button
                      type="button"
                      className="action-button action-button--primary"
                      onClick={handleStartDeleteRetry}
                      disabled={isTriggeringSweep || hasRunningTasks}
                      title="Retry removing failed items from the source"
                    >
                      <RotateCw size={20} style={{ marginRight: "0.5rem" }} />
                      Retry Removal of Failed Items
                    </button>
                  );
                }
                return null;
              }
              if (isCopyPhase(migrationStatus)) {
                if (pendingRetries > 0) {
                  return (
                    <button
                      type="button"
                      className="action-button action-button--primary"
                      onClick={handleStartCopying}
                      disabled={isTriggeringSweep || hasRunningTasks}
                      title="Retry copying failed and pending items"
                    >
                      <RotateCw size={20} style={{ marginRight: "0.5rem" }} />
                      Retry Copying of Failed Items
                    </button>
                  );
                }
                if (reviewFailedGate) {
                  return reviewFailedButton;
                }
                if (isAwaitingCopyReview) {
                  return (
                    <button
                      type="button"
                      className="action-button action-button--primary action-button--multiline"
                      onClick={() =>
                        navigate(`/path-review/${migrationId}/source-cleanup`)
                      }
                      disabled={isTriggeringSweep || hasRunningTasks}
                      title="Review which copied items to remove from the source"
                    >
                      Review Deletion Plan
                    </button>
                  );
                }
                return null;
              }
              // Traversal review: retry discovery or open the copy plan
              if (pendingRetries > 0) {
                return (
                  <button
                    type="button"
                    className="action-button action-button--primary"
                    onClick={handleStartRetryDiscovery}
                    disabled={isTriggeringSweep || hasRunningTasks}
                    title="Retry failed items and re-traverse them"
                  >
                    <RotateCw size={20} style={{ marginRight: "0.5rem" }} />
                    Retry Discovery of Failed Items
                  </button>
                );
              }
              if (reviewFailedGate) {
                return reviewFailedButton;
              }
              return (
                <button
                  type="button"
                  className="action-button action-button--primary action-button--multiline"
                  onClick={() =>
                    navigate(`/path-review/${migrationId}/copy-plan`)
                  }
                  disabled={isTriggeringSweep || hasRunningTasks}
                  title="Review what will be copied before starting"
                >
                  <Copy size={20} style={{ marginRight: "0.5rem" }} />
                  Review Copy Plan
                </button>
              );
            })()}
          </div>
        </div>
        )}
      </PageShell>

      {showExcludeAllFailedConfirm && (
        <ConfirmDialog
          title={PATH_REVIEW_COPY.issuesExcludeAllFailedTitle}
          message={PATH_REVIEW_COPY.issuesExcludeAllFailedConfirm(
            stats?.failedCount ?? 0
          )}
          confirmLabel={PATH_REVIEW_COPY.issuesExcludeAllFailedConfirmLabel}
          cancelLabel="Cancel"
          confirmTone="danger"
          onConfirm={() => {
            void handleConfirmExcludeAllFailed();
          }}
          onCancel={() => setShowExcludeAllFailedConfirm(false)}
        />
      )}

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
              ? (() => {
                  const selectedItemCount = stats
                    ? finiteNonNeg(stats.foldersCount) + finiteNonNeg(stats.filesCount)
                    : 0;
                  const location = deleteSummary
                    ? `${deleteSummary.sourceHost ? `${deleteSummary.sourceHost}:` : ""}${deleteSummary.sourceRootPath}`
                    : "the source";
                  const qty = `${selectedItemCount.toLocaleString()} item${selectedItemCount !== 1 ? "s" : ""} (${formatBytes(selectedBytes)})`;
                  return `This will permanently remove ${qty} from ${location}. Items you excluded from the plan will be kept. Would you like to proceed?`;
                })()
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
                  let base = PATH_REVIEW_COPY.confirmCopyMessage;
                  if (pendingSuggestionCount > 0) {
                    base = PATH_REVIEW_COPY.confirmCopyWithSuggestions(
                      pendingSuggestionCount
                    );
                  } else if (manualReviewIssueCount > 0) {
                    base = PATH_REVIEW_COPY.confirmCopyWithManualOnly(
                      manualReviewIssueCount
                    );
                  }
                  if (overCapacity) {
                    base += ` Selected data (${formatBytes(selectedBytes)}) may exceed free space on the destination (${formatBytes(destStorage?.freeBytes ?? 0)}).`;
                  }
                  return base;
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

      {pendingTreeBulk && (
        <BulkActionConfirmDialog
          actionLabel={BULK_ACTION_LABELS[pendingTreeBulk.action]}
          validCount={pendingTreeBulk.partition.valid.length}
          invalid={pendingTreeBulk.partition.invalid}
          onConfirm={() => {
            const { action, partition } = pendingTreeBulk;
            setPendingTreeBulk(null);
            if (
              action === "force_replace" &&
              partition.valid.some((item) => item.type === "folder")
            ) {
              setForceReplaceConfirm({ items: partition.valid });
              return;
            }
            void runTreeBulkAction(action, partition.valid);
          }}
          onCancel={() => setPendingTreeBulk(null)}
        />
      )}


      {cascadeConfirm && (
        <div
          className="confirm-dialog__overlay"
          onClick={() => setCascadeConfirm(null)}
        >
          <div
            className="confirm-dialog__content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 520 }}
          >
            <h2 className="confirm-dialog__title">
              {PATH_REVIEW_COPY.cascadePreviewTitle(
                cascadeConfirm.action,
                cascadeConfirm.proposedName
              )}
            </h2>
            <pre
              className="confirm-dialog__message"
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                margin: "0 0 1rem",
                maxHeight: "40vh",
                overflow: "auto",
              }}
            >
              {cascadePreviewMessage(cascadeConfirm.preview)}
            </pre>
            <div className="confirm-dialog__actions">
              <button
                type="button"
                className="confirm-dialog__button confirm-dialog__button--cancel"
                onClick={() => setCascadeConfirm(null)}
              >
                {PATH_REVIEW_COPY.cascadePreviewCancel}
              </button>
              <button
                type="button"
                className="confirm-dialog__button confirm-dialog__button--confirm confirm-dialog__button--confirm-cyan"
                onClick={() => {
                  const pending = cascadeConfirm;
                  setCascadeConfirm(null);
                  void commitUniquePathName(pending.item, pending.proposedName);
                }}
              >
                {PATH_REVIEW_COPY.cascadePreviewProceed}
              </button>
            </div>
          </div>
        </div>
      )}

      {forceReplaceConfirm && (
        <ConfirmDialog
          title="Replace with source"
          message={
            forceReplaceConfirm.items
              ? FORCE_REPLACE_BULK_FOLDER_CONFIRM
              : FORCE_REPLACE_FOLDER_CONFIRM
          }
          confirmLabel="Yes"
          cancelLabel="No"
          onConfirm={() => {
            const pending = forceReplaceConfirm;
            setForceReplaceConfirm(null);
            if (pending.items) {
              void runTreeBulkAction("force_replace", pending.items);
              return;
            }
            if (pending.item?.src?.id && migrationId) {
              void (async () => {
                const item = pending.item!;
                const nodeId = item.src!.id;
                setMutationOps((prev) =>
                  withInFlightOp(prev, [nodeId, item.id], "Replace with source")
                );
                try {
                  const result = await forceReplaceCopyNode(migrationId, nodeId);
                  const toastInfo = formatBulkActionToast(
                    "Replace with source",
                    result
                  );
                  if (toastInfo) {
                    setToast({ message: toastInfo.message, type: toastInfo.type });
                  }
                  if (result.deltas && Object.keys(result.deltas).length > 0) {
                    handleApplyStatsDeltas(result.deltas);
                  }
                  if (result.success) {
                    const pathForLoad =
                      breadcrumbs.length > 0
                        ? breadcrumbs[breadcrumbs.length - 1].path
                        : undefined;
                    await loadItems(pathForLoad, undefined, { silent: true });
                    setTreeListRefreshToken((token) => token + 1);
                  }
                } catch (err) {
                  setToast({
                    message:
                      err instanceof Error
                        ? err.message
                        : "Failed to replace with source",
                    type: "error",
                  });
                } finally {
                  setMutationOps((prev) => {
                    const next = new Map(prev);
                    next.delete(nodeId);
                    next.delete(item.id);
                    return next;
                  });
                }
              })();
            }
          }}
          onCancel={() => setForceReplaceConfirm(null)}
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