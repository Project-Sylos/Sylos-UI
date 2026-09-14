import { useState, useEffect, useRef, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  Folder,
  File,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Filter,
  ArrowRight,
  X,
  ArrowUpDown,
  ExternalLink,
  Plus,
} from "lucide-react";
import {
  searchPathReviewItems,
  countPathReviewSearchMatches,
  DiffItem,
  PaginationInfo,
  SearchOptions,
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
  bulkMarkNodesForRetry,
  bulkUnmarkNodesForRetry,
  excludeMatchingSearch,
  unexcludeMatchingSearch,
  getBackgroundTasks,
  getReviewOpsStatus,
  BackgroundTask,
  PathReviewStats,
  getMigrationStatus,
  PathIssue,
  applyPathIssuesToDiffItems,
  listPathIssues,
  createRuleset,
  getRuleset,
  listRulesets,
  type BulkRetryKind,
  type ExclusionResponse,
} from "../api/services";
import type { RulesetSummary } from "../types/rulesets";
import { hasListSearchPredicate } from "../utils/listSearch";
import {
  allMatchingSelectedLabel,
  excludeApplyLabel,
  showSelectAllMatchingEscalate,
  unexcludeApplyLabel,
} from "../utils/pathReviewSelectMatching";
import {
  EXCLUSION_OP_TITLE,
  RETRY_OP_TITLE,
  canStartMutation,
  inFlightOpTitle,
  itemMutationIds,
  withInFlightOp,
} from "../utils/pathReviewMutationGuard";
import {
  mapPathReviewStatusFilter,
  statusFilterOptionLabel,
} from "../utils/pathReviewStatusFilters";
import HelpTooltip from "../components/HelpTooltip";
import type { PathReviewListJumpTarget } from "../components/PathReviewIssuesPanel";
import { formatBulkActionToast } from "../utils/bulkActionToast";
import { isDeletePendingExplicit } from "../utils/pathReviewDeletePlan";
import CompatibilityCaution from "../components/CompatibilityCaution";
import DestinationRenameHint from "../components/DestinationRenameHint";
import PathReviewContextMenu from "../components/PathReviewContextMenu";
import FilterRulesBuilder from "../components/filterRules/FilterRulesBuilder";
import FilterRuleExamples from "../components/filterRules/FilterRuleExamples";
import {
  PATH_REVIEW_COPY,
  itemDisplayPath,
  pathIssueShortLabel,
  summarizePathIssues,
} from "../utils/pathReviewCopy";
import {
  MigrationStatusResponse,
  isCopyReviewPhase,
  isDeleteReviewPhase,
} from "../types/migrations";
import {
  getPathReviewDisplayPhase,
  getPathReviewUIPhase,
} from "../utils/pathReviewPhase";
import {
  getPathReviewItemStatus,
  itemStatusPhase,
} from "../utils/pathReviewItemStatus";
import { isCopyComplete } from "../utils/copyStatus";
import { useListDensity } from "../contexts/ListDensityContext";
import PathReviewStatusIcon from "../components/PathReviewStatusIcon";
import PathReviewLegend from "../components/PathReviewLegend";
import PathReviewIssuesButton from "../components/PathReviewIssuesButton";
import ListViewPagination from "../components/ListViewPagination";
import ListItemMeta from "../components/ListItemMeta";
import PathReviewSizeColumnHeader from "../components/PathReviewSizeColumnHeader";
import { getDiffItemFailureMessage } from "../utils/diffFailureMessage";
import {
  applyDiscoveryRetryOptimistic,
  getTraversalRetryNodeId,
  isTraversalRetryPending,
} from "../utils/pathReviewTraversalStatus";
import type { PathReviewContextAction } from "../components/PathReviewContextMenu";
import {
  canIncludeRuleExcludedSubtree,
  excludedByRuleText,
  includeRuleExcludedSubtree,
} from "../utils/pathReviewRuleExclusion";
import {
  createEmptyRuleset,
  isRulesetEffectivelyEmpty,
  prepareRulesetForSave,
  presentRulesetForEditor,
  rulesetFromSummary,
  seedListSearchRuleset,
} from "../utils/rulesets";
import "./PathReview.css";

export interface PathReviewListViewProps {
  migrationId: string;
  reviewView?: "default" | "copy-plan" | "source-cleanup";
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
  /** Shared in-flight path ops so tree navigation stays blocked until the backend finishes. */
  mutationOps?: ReadonlyMap<string, string>;
  setMutationOps?: Dispatch<SetStateAction<Map<string, string>>>;
  onToast?: (message: string, type: "success" | "error") => void; // Callback to show toast (e.g. retry/exclude success or error)
  isActive?: boolean;
  pathIssues?: PathIssue[];
  onPathIssuesChange?: (issues: PathIssue[]) => void;
  onOpenRename?: (item: DiffItem) => void;
  /** Toggle GPL naming warning ignore/unignore for an item. */
  onToggleIgnoreWarning?: (item: DiffItem) => void;
  /** Shared inspector selection from parent PathReview. */
  inspectorItemId?: string | null;
  onInspectorSelect?: (item: DiffItem) => void;
  /** Force-select for context menu (does not toggle off). */
  onInspectorEnsure?: (item: DiffItem) => void;
  /** Attention count for Issues button (failed + manual rename). */
  issuesAttentionCount?: number;
  /** Suggested-rename warning count for Issues button. */
  issuesWarningCount?: number;
  issuesPanelOpen?: boolean;
  onOpenIssuesPanel?: () => void;
  /** When token changes, apply jump filters from Issues panel or tree search. */
  listJumpToken?: number;
  listJumpTarget?: PathReviewListJumpTarget | null;
  /** SRC folder+file count for large-migration search tip. */
  sourceItemCount?: number;
  /** Controlled advanced filter rules page (parent owns chrome / back button). */
  advancedFiltersOpen?: boolean;
  onAdvancedFiltersOpenChange?: (open: boolean) => void;
  advancedFiltersClearRef?: MutableRefObject<() => void>;
  advancedFiltersApplyRef?: MutableRefObject<() => void>;
  onAdvancedFiltersCanApplyChange?: (canApply: boolean) => void;
  /** Parent footer can trigger calculate total matches. */
  calculateTotalRef?: MutableRefObject<() => void>;
  onCalculatedTotalChange?: (total: number | null, counting: boolean) => void;
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
  mutationOps: mutationOpsProp,
  setMutationOps: setMutationOpsProp,
  onToast,
  isActive = true,
  pathIssues = [],
  onPathIssuesChange,
  onOpenRename,
  onToggleIgnoreWarning,
  inspectorItemId = null,
  onInspectorSelect,
  onInspectorEnsure,
  issuesAttentionCount = 0,
  issuesWarningCount = 0,
  issuesPanelOpen = false,
  onOpenIssuesPanel,
  listJumpToken = 0,
  listJumpTarget = null,
  sourceItemCount = 0,
  advancedFiltersOpen = false,
  onAdvancedFiltersOpenChange,
  advancedFiltersClearRef,
  advancedFiltersApplyRef,
  onAdvancedFiltersCanApplyChange,
  calculateTotalRef,
  onCalculatedTotalChange,
}: PathReviewListViewProps) {
  const { densityStyle, setListViewportElement } = useListDensity();
  const [items, setItems] = useState<DiffItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calculatedTotal, setCalculatedTotal] = useState<number | null>(null);
  const [calculatedTotalTruncated, setCalculatedTotalTruncated] = useState(false);
  const [countingTotal, setCountingTotal] = useState(false);
  const [draftRuleset, setDraftRuleset] = useState(() =>
    createEmptyRuleset(migrationId || "search")
  );
  const [activeRuleset, setActiveRuleset] = useState(() =>
    createEmptyRuleset(migrationId || "search")
  );
  const [countError, setCountError] = useState<string | null>(null);
  const countRequestVersion = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const countAbortRef = useRef<AbortController | null>(null);
  const [localMutationOps, setLocalMutationOps] = useState<Map<string, string>>(
    () => new Map()
  );
  const mutationOps = mutationOpsProp ?? localMutationOps;
  const setMutationOps = setMutationOpsProp ?? setLocalMutationOps;
  const [serverBulkMutationInProgress, setServerBulkMutationInProgress] =
    useState(false);
  const [explicitSelected, setExplicitSelected] = useState<Set<string>>(new Set());
  const [explicitSelectedPaths, setExplicitSelectedPaths] = useState<Map<string, string>>(new Map()); // itemId -> path (persists across pages)
  const [explicitSelectedItemData, setExplicitSelectedItemData] = useState<Map<string, DiffItem>>(new Map()); // itemId -> item data (for API calls)
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const [applyMenuOpen, setApplyMenuOpen] = useState(false);
  const applyMenuRef = useRef<HTMLDivElement>(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [sortField, setSortField] = useState<string | null>("path");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState<string>("");
  const [underPath, setUnderPath] = useState<string>("");
  const [underPathLabel, setUnderPathLabel] = useState<string>("");
  /** Ordered "in path" segment boxes (path mode only). */
  const [pathSegments, setPathSegments] = useState<string[]>([""]);
  const [activePathSegments, setActivePathSegments] = useState<string[]>([]);
  const [searchField, setSearchField] = useState<"path" | "name">("name"); // Field to search in (path or name)
  const MAX_PATH_SEGMENTS = 6;
  const [typeFilter, setTypeFilter] = useState<"both" | "folder" | "file">("both"); // Type filter: both, folder, or file
  const [depthFilter, setDepthFilter] = useState<string>(""); // Depth filter (as string for input)
  const [depthOperator, setDepthOperator] = useState<"equals" | "gt" | "gte" | "lt" | "lte">("equals"); // Depth operator
  const [sizeFilter, setSizeFilter] = useState<string>(""); // Size filter (as string for input, in bytes)
  const [sizeOperator, setSizeOperator] = useState<"equals" | "gt" | "gte" | "lt" | "lte">("equals"); // Size operator
  const [sizeDisplayUnit, setSizeDisplayUnit] = useState<"bytes" | "KB" | "MB" | "GB">("MB"); // Display unit for size input
  const [traversalStatusFilter, setTraversalStatusFilter] = useState<string>(""); // Traversal status filter (pending, failed, etc.)
  const [pathIssueStatusFilter, setPathIssueStatusFilter] = useState<string>(""); // Compatibility filter
  const [pathIssueCategoryFilter, setPathIssueCategoryFilter] = useState<string>(""); // Compat category
  const [foldersOnly, setFoldersOnly] = useState(false); // Deprecated - using typeFilter instead
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [currentPage, setCurrentPage] = useState(0);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [activeTaskIds, setActiveTaskIds] = useState<Set<string>>(new Set());
  const [taskStatuses, setTaskStatuses] = useState<Map<string, BackgroundTask>>(new Map());
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showSaveRulesDialog, setShowSaveRulesDialog] = useState(false);
  const [showLoadRulesDialog, setShowLoadRulesDialog] = useState(false);
  const [showRuleExamples, setShowRuleExamples] = useState(false);
  const [saveRulesName, setSaveRulesName] = useState("");
  const [saveRulesNotes, setSaveRulesNotes] = useState("");
  const [saveRulesBusy, setSaveRulesBusy] = useState(false);
  const [saveRulesError, setSaveRulesError] = useState<string | null>(null);
  const [libraryRulesets, setLibraryRulesets] = useState<RulesetSummary[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const importRulesInputRef = useRef<HTMLInputElement>(null);
  const advancedWasOpenRef = useRef(false);
  const [apiStats, setApiStats] = useState<PathReviewStats | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatusResponse | null>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const listItemsRef = useRef<HTMLDivElement | null>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: DiffItem;
  } | null>(null);

  useEffect(() => {
    setItems((prev) => applyPathIssuesToDiffItems(prev, pathIssues));
  }, [pathIssues]);

  const pathIssueCategoryCounts = useMemo(
    () => summarizePathIssues(pathIssues).categoryCounts,
    [pathIssues]
  );

  // Phase detection helpers
  const isCopyPhase = (status: MigrationStatusResponse | null): boolean =>
    isCopyReviewPhase(status);

  const isDeletePhase = (status: MigrationStatusResponse | null): boolean =>
    isDeleteReviewPhase(status);

  const isSourceCleanupView = reviewView === "source-cleanup";
  const isCopyPlanView = reviewView === "copy-plan";

  const getCurrentPhase = () => getPathReviewUIPhase(migrationStatus);

  const getDisplayPhase = () =>
    getPathReviewDisplayPhase(migrationStatus, reviewView);
  const showCompatUI =
    !isSourceCleanupView && !isDeletePhase(migrationStatus);

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

  const buildPhaseStatusFilters = (): {
    statusSearchType: SearchOptions["statusSearchType"];
    traversalStatusFilterValue: string | undefined;
    copyStatusFilterValue: string | undefined;
    deleteStatusFilterValue: string | undefined;
  } => {
    const mapped = mapPathReviewStatusFilter(
      getDisplayPhase(),
      traversalStatusFilter
    );
    return {
      statusSearchType: mapped.statusSearchType,
      traversalStatusFilterValue: mapped.traversalStatusFilter,
      copyStatusFilterValue: mapped.copyStatusFilter,
      deleteStatusFilterValue: mapped.deleteStatusFilter,
    };
  };

  const buildCurrentSearchOptions = (): SearchOptions => {
    const parsedDepth = depthFilter.trim() !== "" ? parseInt(depthFilter, 10) : null;
    const parsedSizeBytes =
      sizeFilter.trim() !== "" ? parseFileSize(sizeFilter, sizeDisplayUnit) : null;
    const phase = getCurrentPhase();
    const {
      statusSearchType,
      traversalStatusFilterValue,
      copyStatusFilterValue,
      deleteStatusFilterValue,
    } = buildPhaseStatusFilters();

    const trimmedSegments = activePathSegments
      .map((s) => sanitizeSearchQuery(s))
      .filter((s) => s !== "");

    return {
      offset: currentPage * itemsPerPage,
      limit: itemsPerPage,
      sortField: sortField || undefined,
      sortDir: sortDir,
      query:
        searchField === "name"
          ? activeSearchQuery || undefined
          : undefined,
      pathSegments:
        searchField === "path" && trimmedSegments.length > 0
          ? trimmedSegments
          : undefined,
      searchField: searchField,
      typeFilter: typeFilter,
      depthFilter:
        parsedDepth !== null && !isNaN(parsedDepth) && parsedDepth >= 0
          ? parsedDepth
          : undefined,
      depthOperator:
        parsedDepth !== null && !isNaN(parsedDepth) && parsedDepth >= 0
          ? depthOperator
          : undefined,
      sizeFilter:
        parsedSizeBytes !== null && parsedSizeBytes >= 0
          ? parsedSizeBytes
          : undefined,
      sizeOperator:
        parsedSizeBytes !== null && parsedSizeBytes >= 0
          ? sizeOperator
          : undefined,
      traversalStatusFilter: traversalStatusFilterValue,
      copyStatusFilter: copyStatusFilterValue,
      deleteStatusFilter: deleteStatusFilterValue,
      pathIssueStatusFilter: pathIssueStatusFilter || undefined,
      pathIssueCategoryFilter: pathIssueCategoryFilter || undefined,
      statusSearchType: statusSearchType,
      phase: phase,
      includeDestinationOnly,
      underPath: underPath.trim() && underPath.trim() !== "/" ? underPath.trim() : undefined,
      ruleset: isRulesetEffectivelyEmpty(activeRuleset)
        ? undefined
        : prepareRulesetForSave(activeRuleset),
    };
  };

  const advancedRulesActive = !isRulesetEffectivelyEmpty(activeRuleset);
  const draftAdvancedRulesActive = !isRulesetEffectivelyEmpty(draftRuleset);

  const commitDraftRuleset = () => {
    setActiveRuleset(draftRuleset);
  };

  const loadItems = async (
    append = false,
    options?: { silent?: boolean }
  ) => {
    if (!migrationId) return;

    if (
      !hasListSearchPredicate({
        query: activeSearchQuery,
        pathSegments: activePathSegments,
        underPath,
        typeFilter,
        depthFilter,
        sizeFilter,
        traversalStatusFilter,
        pathIssueStatusFilter,
        pathIssueCategoryFilter,
        hasAdvancedRules: advancedRulesActive,
      })
    ) {
      setItems([]);
      setPagination(null);
      setLoading(false);
      setError(null);
      return;
    }

    const showFullLoading = !append && !options?.silent;
    if (showFullLoading) {
      setLoading(true);
      setError(null);
    }

    searchAbortRef.current?.abort();
    const ac = new AbortController();
    searchAbortRef.current = ac;

    try {
      const response = await searchPathReviewItems(
        migrationId,
        buildCurrentSearchOptions(),
        { signal: ac.signal }
      );

      if (ac.signal.aborted) return;

      if (append) {
        setItems((prev) => [
          ...prev,
          ...applyPathIssuesToDiffItems(response.items, pathIssues),
        ]);
      } else {
        setItems(applyPathIssuesToDiffItems(response.items, pathIssues));
      }

      setPagination(response.pagination);
      // Stats will be updated via useEffect hook when apiStats changes
    } catch (err) {
      if (ac.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load path review items."
      );
    } finally {
      if (showFullLoading && !ac.signal.aborted) {
        setLoading(false);
      }
    }
  };

  // Fetch migration status on mount
  useEffect(() => {
    fetchMigrationStatus();
  }, [migrationId]);

  // Poll server bulk-mutation flag while a local bulk request may still be finishing on another tab/session.
  useEffect(() => {
    if (!migrationId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const ops = await getReviewOpsStatus(migrationId);
        if (!cancelled) {
          setServerBulkMutationInProgress(ops.bulkMutationInProgress);
        }
      } catch {
        // ignore
      }
    };
    void tick();
    const id = window.setInterval(() => {
      if (bulkLoading || serverBulkMutationInProgress) {
        void tick();
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [migrationId, bulkLoading, serverBulkMutationInProgress]);

  // Clear "pending" filter when switching away from phases that support it.
  useEffect(() => {
    const phase = getDisplayPhase();
    if (
      traversalStatusFilter === "pending" &&
      phase !== "source-cleanup" &&
      phase !== "delete" &&
      phase !== "copy-plan"
    ) {
      setTraversalStatusFilter("");
    }
  }, [migrationStatus, reviewView, traversalStatusFilter]);

  // Reset to first page when destination-only visibility changes so totals stay aligned.
  useEffect(() => {
    setCurrentPage(0);
  }, [includeDestinationOnly]);

  useEffect(() => {
    if (!showDestinationOnly && traversalStatusFilter === "not_on_src") {
      setTraversalStatusFilter("");
    }
  }, [showDestinationOnly, traversalStatusFilter]);

  const clearTextSearchState = () => {
    setSearchQuery("");
    setActiveSearchQuery("");
    setPathSegments([""]);
    setActivePathSegments([]);
  };

  const clearAllFilters = () => {
    clearTextSearchState();
    setUnderPath("");
    setUnderPathLabel("");
    setSearchField("name");
    setTypeFilter("both");
    setDepthFilter("");
    setDepthOperator("equals");
    setSizeFilter("");
    setSizeOperator("equals");
    setSizeDisplayUnit("MB");
    setTraversalStatusFilter("");
    setPathIssueStatusFilter("");
    setPathIssueCategoryFilter("");
    const empty = createEmptyRuleset(migrationId || "search");
    setDraftRuleset(empty);
    setActiveRuleset(empty);
    if (showDestinationOnlyToggle) {
      onShowDestinationOnlyChange?.(false);
    }
    setCurrentPage(0);
  };

  // Apply Issues-panel / tree-search jump filters (switch already happened in parent).
  useEffect(() => {
    if (!listJumpToken || !listJumpTarget) return;
    setCurrentPage(0);
    clearTextSearchState();
    const nextUnder = (listJumpTarget.underPath || "").trim();
    if (nextUnder && nextUnder !== "/") {
      setUnderPath(nextUnder);
      setUnderPathLabel(
        (listJumpTarget.underPathLabel || nextUnder).trim() || nextUnder
      );
    } else {
      setUnderPath("");
      setUnderPathLabel("");
    }
    const nameQ = (listJumpTarget.nameQuery || "").trim();
    if (nameQ) {
      setSearchField("name");
      setSearchQuery(nameQ);
      setActiveSearchQuery(nameQ);
      setPathSegments([""]);
      setActivePathSegments([]);
    }
    if (listJumpTarget.statusFilter) {
      setTraversalStatusFilter(listJumpTarget.statusFilter);
      setPathIssueStatusFilter("");
      setPathIssueCategoryFilter("");
    } else if (
      listJumpTarget.pathIssueStatus ||
      listJumpTarget.pathIssueCategory
    ) {
      setTraversalStatusFilter("");
      setPathIssueStatusFilter(listJumpTarget.pathIssueStatus || "");
      setPathIssueCategoryFilter(listJumpTarget.pathIssueCategory || "");
    } else if (listJumpTarget.underPath || listJumpTarget.nameQuery) {
      // Tree / folder-scoped jump: drop prior status filters.
      setTraversalStatusFilter("");
      setPathIssueStatusFilter("");
      setPathIssueCategoryFilter("");
    }
    // clearTextSearchState only uses state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listJumpToken, listJumpTarget]);


  useEffect(() => {
    countRequestVersion.current += 1;
    setCountingTotal(false);
    setCalculatedTotal(null);
    setCalculatedTotalTruncated(false);
    setAllMatchingSelected(false);
    onCalculatedTotalChange?.(null, false);
    setCountError(null);
  }, [
    activeSearchQuery,
    activePathSegments,
    underPath,
    searchField,
    typeFilter,
    depthFilter,
    depthOperator,
    sizeFilter,
    sizeOperator,
    sizeDisplayUnit,
    traversalStatusFilter,
    pathIssueStatusFilter,
    pathIssueCategoryFilter,
    includeDestinationOnly,
    activeRuleset,
  ]);

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [migrationId, currentPage, itemsPerPage, sortField, sortDir, activeSearchQuery, activePathSegments, underPath, searchField, typeFilter, depthFilter, depthOperator, sizeFilter, sizeOperator, sizeDisplayUnit, traversalStatusFilter, pathIssueStatusFilter, pathIssueCategoryFilter, treeListRefreshToken, includeDestinationOnly, activeRuleset]);

  useEffect(() => {
    const empty = createEmptyRuleset(migrationId || "search");
    setDraftRuleset(empty);
    setActiveRuleset(empty);
  }, [migrationId]);

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
    const sanitized = sanitizeSearchQuery(searchQuery);
    const sanitizedSegments = pathSegments
      .map((s) => sanitizeSearchQuery(s))
      .filter((s) => s !== "");
    const nextHasPredicate = hasListSearchPredicate({
      query: searchField === "name" ? sanitized : "",
      pathSegments: searchField === "path" ? sanitizedSegments : undefined,
      underPath,
      typeFilter,
      depthFilter,
      sizeFilter,
      traversalStatusFilter,
      pathIssueStatusFilter,
      pathIssueCategoryFilter,
      hasAdvancedRules: draftAdvancedRulesActive,
    });
    if (!nextHasPredicate) {
      return;
    }
    commitDraftRuleset();
    setActiveSearchQuery(searchField === "name" ? sanitized : "");
    setActivePathSegments(searchField === "path" ? sanitizedSegments : []);
    setCurrentPage(0);
  };

  const handleCalculateTotal = async () => {
    if (!migrationId || countingTotal) return;
    if (
      !hasListSearchPredicate({
        query: activeSearchQuery,
        pathSegments: activePathSegments,
        underPath,
        typeFilter,
        depthFilter,
        sizeFilter,
        traversalStatusFilter,
        pathIssueStatusFilter,
        pathIssueCategoryFilter,
        hasAdvancedRules: advancedRulesActive,
      })
    ) {
      return;
    }

    setCountingTotal(true);
    onCalculatedTotalChange?.(calculatedTotal, true);
    setCountError(null);
    const requestVersion = ++countRequestVersion.current;
    countAbortRef.current?.abort();
    const ac = new AbortController();
    countAbortRef.current = ac;
    try {
      const stats = await countPathReviewSearchMatches(
        migrationId,
        buildCurrentSearchOptions(),
        { signal: ac.signal }
      );
      if (requestVersion !== countRequestVersion.current || ac.signal.aborted) return;
      setCalculatedTotal(stats.total);
      setCalculatedTotalTruncated(!!stats.truncated);
      onCalculatedTotalChange?.(stats.total, false);
      setPagination((prev) =>
        prev
          ? {
              ...prev,
              total: stats.total,
              totalFolders: stats.totalFolders,
              totalFiles: stats.totalFiles,
            }
          : prev
      );
    } catch (err) {
      if (
        requestVersion !== countRequestVersion.current ||
        ac.signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError")
      ) {
        return;
      }
      setCountError(
        err instanceof Error ? err.message : "Failed to calculate total matches."
      );
      onCalculatedTotalChange?.(calculatedTotal, false);
    } finally {
      if (requestVersion === countRequestVersion.current) {
        setCountingTotal(false);
      }
    }
  };

  useEffect(() => {
    if (!calculateTotalRef) return;
    calculateTotalRef.current = () => {
      void handleCalculateTotal();
    };
  });

  useEffect(() => {
    if (!applyMenuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (
        applyMenuRef.current &&
        !applyMenuRef.current.contains(event.target as Node)
      ) {
        setApplyMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [applyMenuOpen]);

  const clearSelection = () => {
    setExplicitSelected(new Set());
    setExplicitSelectedPaths(new Map());
    setExplicitSelectedItemData(new Map());
    setLastSelectedIndex(null);
    setAllMatchingSelected(false);
    setApplyMenuOpen(false);
  };

  const collectSelectedNodeIDs = (): string[] => {
    const normalized = normalizeExplicitSelection(explicitSelected);
    const nodeIDs: string[] = [];
    normalized.forEach((itemId) => {
      const item = explicitSelectedItemData.get(itemId);
      if (!item) return;
      if (item.src?.id) nodeIDs.push(item.src.id);
      if (item.dst?.id && (!item.src?.id || item.dst.id !== item.src.id)) {
        nodeIDs.push(item.dst.id);
      }
    });
    return nodeIDs;
  };

  const retryKindForPhase = (): BulkRetryKind => {
    const phase = getCurrentPhase();
    if (phase === "delete") return "delete";
    if (phase === "copy") return "copy";
    return "discovery";
  };

  const finishBulkResult = async (
    actionLabel: string,
    result: ExclusionResponse
  ) => {
    const toast = formatBulkActionToast(actionLabel, result);
    onToast?.(toast.message, toast.type);
    if (result.taskID) {
      setActiveTaskIds((prev) => new Set(prev).add(result.taskID!));
      onItemUpdate?.();
    } else {
      if (result.deltas && Object.keys(result.deltas).length > 0) {
        onApplyStatsDeltas?.(result.deltas);
      }
      try {
        const refreshed = await listPathIssues(migrationId!);
        onPathIssuesChange?.(refreshed.issues || []);
      } catch {
        // list reload below still refreshes row state
      }
      await loadItems(false, { silent: true });
      onListDataMutated?.();
    }
    clearSelection();
  };

  const handleApplyAction = async (
    action: "exclude" | "unexclude" | "mark_retry" | "mark_failed"
  ) => {
    if (!migrationId || bulkLoading) return;
    setApplyMenuOpen(false);
    setBulkLoading(true);
    setServerBulkMutationInProgress(true);
    try {
      if (allMatchingSelected && (action === "exclude" || action === "unexclude")) {
        const result =
          action === "exclude"
            ? await excludeMatchingSearch(migrationId, buildCurrentSearchOptions(), [])
            : await unexcludeMatchingSearch(
                migrationId,
                buildCurrentSearchOptions(),
                []
              );
        await finishBulkResult(
          action === "exclude" ? "Exclude" : "Unexclude",
          result
        );
        return;
      }

      if (allMatchingSelected && (action === "mark_retry" || action === "mark_failed")) {
        onToast?.(
          "Mark for retry / Mark failed need an explicit row selection. Use Select all visible, or Apply Exclude/Unexclude for all matching.",
          "error"
        );
        return;
      }

      const nodeIDs = collectSelectedNodeIDs();
      if (nodeIDs.length === 0) {
        onToast?.("No selectable nodes in the current selection.", "error");
        return;
      }

      let result: ExclusionResponse;
      const kind = retryKindForPhase();
      switch (action) {
        case "exclude":
          result = await bulkExcludeNodes(migrationId, { nodeIDs });
          await finishBulkResult("Exclude", result);
          break;
        case "unexclude":
          result = await bulkUnexcludeNodes(migrationId, { nodeIDs });
          await finishBulkResult("Unexclude", result);
          break;
        case "mark_retry":
          result = await bulkMarkNodesForRetry(migrationId, { nodeIDs, kind });
          await finishBulkResult("Mark for retry", result);
          break;
        case "mark_failed":
          result = await bulkUnmarkNodesForRetry(migrationId, { nodeIDs, kind });
          await finishBulkResult("Mark failed", result);
          break;
      }
    } catch (err) {
      onToast?.(
        err instanceof Error ? err.message : "Bulk action failed",
        "error"
      );
    } finally {
      setBulkLoading(false);
      try {
        const ops = await getReviewOpsStatus(migrationId);
        setServerBulkMutationInProgress(ops.bulkMutationInProgress);
      } catch {
        setServerBulkMutationInProgress(false);
      }
    }
  };

  const selectAllVisible = () => {
    setAllMatchingSelected(false);
    const nextIds = new Set(explicitSelected);
    const nextPaths = new Map(explicitSelectedPaths);
    const nextData = new Map(explicitSelectedItemData);
    for (const item of items) {
      nextIds.add(item.id);
      nextPaths.set(item.id, itemDisplayPath(item) || item.id);
      nextData.set(item.id, item);
    }
    setExplicitSelected(nextIds);
    setExplicitSelectedPaths(nextPaths);
    setExplicitSelectedItemData(nextData);
  };

  const selectAllMatching = () => {
    setAllMatchingSelected(true);
    const nextIds = new Set<string>();
    const nextPaths = new Map<string, string>();
    const nextData = new Map<string, DiffItem>();
    for (const item of items) {
      nextIds.add(item.id);
      nextPaths.set(item.id, itemDisplayPath(item) || item.id);
      nextData.set(item.id, item);
    }
    setExplicitSelected(nextIds);
    setExplicitSelectedPaths(nextPaths);
    setExplicitSelectedItemData(nextData);
    if (calculatedTotal == null) {
      void handleCalculateTotal();
    }
  };

  const applySuggestedFilter = (kind: "failed" | "naming") => {
    setCurrentPage(0);
    clearTextSearchState();
    if (kind === "failed") {
      setTraversalStatusFilter("failed");
      setPathIssueStatusFilter("");
      setPathIssueCategoryFilter("");
    } else {
      setTraversalStatusFilter("");
      setPathIssueStatusFilter("issues");
      setPathIssueCategoryFilter("");
    }
  };

  const handleSelectAll = () => {
    setAllMatchingSelected(false);
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
    setAllMatchingSelected(false);
    
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

    // Copy results / delete / source-cleanup: exclusion read-only. Copy-plan allows exclude.
    if (
      (isCopyPhase(migrationStatus) && !isCopyPlanView) ||
      isDeletePhase(migrationStatus) ||
      isSourceCleanupView
    ) {
      return;
    }

    const status = getItemStatus(item);
    const isFolder = item.type === "folder";

    if (status.isTraversalSkipped) {
      return;
    }

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

    const primaryId = srcNodeId || dstNodeId || item.id;
    if (!canStartMutation(mutationOps, primaryId)) {
      onToast?.(
        "An operation is already running on this path; try again once it finishes.",
        "error"
      );
      return;
    }

    // Store original item state for rollback
    const originalItem = { ...item };

    setMutationOps((prev) =>
      withInFlightOp(prev, [primaryId, srcNodeId, dstNodeId, item.id], EXCLUSION_OP_TITLE)
    );

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
        if (r?.deltas) {
          for (const [k, v] of Object.entries(r.deltas)) {
            if (typeof v !== "number" || !Number.isFinite(v)) continue;
            merged[k] = (merged[k] ?? 0) + v;
          }
        }
      }
      if (Object.keys(merged).length > 0) onApplyStatsDeltas?.(merged);
      // Exclude also ignores naming warnings; unexclude restores them.
      try {
        const refreshed = await listPathIssues(migrationId);
        onPathIssuesChange?.(refreshed.issues || []);
      } catch {
        // list reload below still refreshes row state
      }
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
    } finally {
      setMutationOps((prev) =>
        withInFlightOp(prev, [primaryId, srcNodeId, dstNodeId, item.id], null)
      );
    }
  };

  const handleRetryClick = async (item: DiffItem) => {
    if (!migrationId) return;

    const currentPhase = getCurrentPhase();
    const isCopy = currentPhase === "copy";
    const isDelete = currentPhase === "delete";
    const srcNodeId = item.src?.id;

    // Determine which node has failed or pending status (failed takes priority)
    let nodeIdToUpdate: string | null = null;
    let isMarkedForRetry = false;
    
    if (isDelete) {
      const deleteStatus = item.src?.deleteStatus || "";
      if ((deleteStatus === "failed" || isDeletePendingExplicit(deleteStatus)) && srcNodeId) {
        nodeIdToUpdate = srcNodeId;
        isMarkedForRetry = isDeletePendingExplicit(deleteStatus);
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
        isMarkedForRetry = isTraversalRetryPending(item);
      }
    }

    if (!nodeIdToUpdate) {
      onToast?.(
        "No node with failed, skipped, or pending status available for this item.",
        "error"
      );
      return;
    }

    if (!canStartMutation(mutationOps, nodeIdToUpdate)) {
      onToast?.(
        "An operation is already running on this path; try again once it finishes.",
        "error"
      );
      return;
    }

    const newRetryState = !isMarkedForRetry;

    // Store original item state for rollback
    const originalItem = { ...item };

    setMutationOps((prev) =>
      withInFlightOp(prev, [nodeIdToUpdate, item.id], RETRY_OP_TITLE)
    );

    setItems((prevItems) =>
      prevItems.map((i) => {
        if (i.id !== item.id) {
          return i;
        }
        if (isDelete && i.src) {
          return {
            ...i,
            src: {
              ...i.src,
              deleteStatus: isMarkedForRetry ? "failed" : "pending_explicit",
            },
          };
        }
        if (isCopy && i.src) {
          const nextCopy = isMarkedForRetry ? "failed" : "pending";
          return {
            ...i,
            src: { ...i.src, copyStatus: nextCopy },
            copyStatus: nextCopy,
          };
        }
        return applyDiscoveryRetryOptimistic(i, newRetryState, "failed");
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
    } finally {
      setMutationOps((prev) =>
        withInFlightOp(prev, [nodeIdToUpdate, item.id], null)
      );
    }
  };


  // Phase-aware row status (shared with tree view).
  const getItemStatus = (item: DiffItem) =>
    getPathReviewItemStatus(item, itemStatusPhase(getDisplayPhase()));

  const handleIncludeRuleExcludedSubtree = async (item: DiffItem) => {
    if (!canIncludeRuleExcludedSubtree(item)) return;
    const nodeId = item.src?.id || item.id;
    try {
      const result = await includeRuleExcludedSubtree(migrationId, nodeId);
      if (!result.success) {
        onToast?.(
          result.error || "Could not include and re-scan subtree",
          "error"
        );
        return;
      }
      onToast?.("Subtree included and marked for discovery retry", "success");
      await loadItems(false, { silent: true });
      onListDataMutated?.();
      onItemUpdate?.();
    } catch (err) {
      onToast?.(
        err instanceof Error
          ? err.message
          : "Could not include and re-scan subtree",
        "error"
      );
    }
  };

  const buildListContextActions = (item: DiffItem): PathReviewContextAction[] => {
    const status = getItemStatus(item);
    const phase = getCurrentPhase();
    const isCopy = phase === "copy";
    const isDelete = phase === "delete";
    const copyStatus = item.src?.copyStatus || item.copyStatus || "";
    const deleteStatus = item.src?.deleteStatus || "";
    const isMarkedForRetry = isDelete
      ? isDeletePendingExplicit(deleteStatus)
      : isCopy
        ? copyStatus === "pending"
        : isTraversalRetryPending(item);
    const canExclude =
      (isCopyPlanView || (!isCopy && !isDelete)) &&
      !isSourceCleanupView &&
      !status.isTraversalSkipped &&
      !(
        item.type === "folder" &&
        (status.existsOnBoth || status.existsOnlyOnDst)
      );
    const canRetry =
      status.isFailed ||
      status.isTraversalSkipped ||
      isMarkedForRetry ||
      (isCopy && copyStatus === "failed");
    const canRename =
      showCompatUI &&
      !!(
        item.pathIssueStatus ||
        item.proposedPath ||
        (item.resolvedDstName && item.resolvedDstName !== item.name)
      );
    const canToggleIgnoreWarning =
      showCompatUI && !!(item.pathIssueStatus || item.proposedPath);
    const canSkipDelete =
      isSourceCleanupView &&
      !!onSkipDeleteClick &&
      !!item.src &&
      isCopyComplete(item.src.copyStatus || item.copyStatus || "");

    const actions: PathReviewContextAction[] = [];
    actions.push({
      key: "select-visible",
      label: "Select all visible",
      onClick: () => selectAllVisible(),
    });
    if (searchPredicateActive) {
      actions.push({
        key: "select-matching",
        label: "Select all that match the search",
        onClick: () => selectAllMatching(),
      });
    }
    if (onNavigateToTreeView) {
      actions.push({
        key: "show-in-tree",
        label: PATH_REVIEW_COPY.showInTreeView,
        onClick: () => onNavigateToTreeView(item),
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
    if (canExclude) {
      actions.push({
        key: "exclude",
        label: status.isExcluded ? "Unexclude" : "Exclude",
        onClick: () => {
          void handleCheckboxChange(item, !status.isExcluded);
        },
      });
    }
    if (canRetry) {
      actions.push({
        key: "retry",
        label: isMarkedForRetry ? "Unmark retry" : "Mark for retry",
        onClick: () => {
          void handleRetryClick(item);
        },
      });
    }
    if (canSkipDelete) {
      const skipped = deleteStatus === "skipped";
      actions.push({
        key: "skip-delete",
        label: skipped ? "Schedule removal" : "Keep on source",
        onClick: () => onSkipDeleteClick?.(item),
      });
    }
    if (canRename && onOpenRename) {
      actions.push({
        key: "rename",
        label: PATH_REVIEW_COPY.renameDestination,
        onClick: () => onOpenRename(item),
      });
    }
    if (canToggleIgnoreWarning && onToggleIgnoreWarning) {
      actions.push({
        key: "ignore-warning",
        label: item.pathIssueIgnored
          ? PATH_REVIEW_COPY.unignoreWarning
          : copyStatus === "already_existed"
            ? PATH_REVIEW_COPY.ignoreKeepExistingName
            : PATH_REVIEW_COPY.ignoreWarning,
        onClick: () => onToggleIgnoreWarning(item),
      });
    }
    return actions;
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


  // Check if any filters are active (toolbar indicator; includes destination-only toggle)
  const hasActiveFilters = () => {
    return (
      activeSearchQuery.trim() !== "" ||
      activePathSegments.some((s) => s.trim() !== "") ||
      (underPath.trim() !== "" && underPath.trim() !== "/") ||
      typeFilter !== "both" ||
      depthFilter.trim() !== "" ||
      sizeFilter.trim() !== "" ||
      traversalStatusFilter !== "" ||
      pathIssueStatusFilter !== "" ||
      pathIssueCategoryFilter !== "" ||
      advancedRulesActive ||
      draftAdvancedRulesActive ||
      (showDestinationOnlyToggle && showDestinationOnly)
    );
  };

  const isFilterActive = hasActiveFilters();
  const searchPredicateActive = hasListSearchPredicate({
    query: activeSearchQuery,
    pathSegments: activePathSegments,
    underPath,
    typeFilter,
    depthFilter,
    sizeFilter,
    traversalStatusFilter,
    pathIssueStatusFilter,
    pathIssueCategoryFilter,
    hasAdvancedRules: advancedRulesActive,
  });
  const draftPathSegments = pathSegments
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const canSubmitSearch = hasListSearchPredicate({
    query:
      searchField === "name"
        ? searchQuery.trim() !== ""
          ? searchQuery
          : activeSearchQuery
        : "",
    pathSegments:
      searchField === "path"
        ? draftPathSegments.length > 0
          ? draftPathSegments
          : activePathSegments
        : undefined,
    underPath,
    typeFilter,
    depthFilter,
    sizeFilter,
    traversalStatusFilter,
    pathIssueStatusFilter,
    pathIssueCategoryFilter,
    hasAdvancedRules: draftAdvancedRulesActive,
  });

  // Check if sort is active (not default: "path" with "asc")
  const isSortActive = sortField !== "path" || sortDir !== "asc";

  const setAdvancedFiltersPageOpen = (open: boolean) => {
    onAdvancedFiltersOpenChange?.(open);
  };

  // Parent back button closes advanced without Apply; keep draft committed.
  useEffect(() => {
    if (advancedWasOpenRef.current && !advancedFiltersOpen) {
      commitDraftRuleset();
      setShowSaveRulesDialog(false);
      setShowLoadRulesDialog(false);
    }
    advancedWasOpenRef.current = advancedFiltersOpen;
  }, [advancedFiltersOpen]);

  const clearSeededBasicFields = () => {
    clearTextSearchState();
    setSizeFilter("");
    setSizeOperator("equals");
    setTraversalStatusFilter("");
    setPathIssueStatusFilter("");
    setPathIssueCategoryFilter("");
  };

  const openAdvancedFiltersPage = () => {
    const sizeBytes =
      sizeFilter.trim() !== ""
        ? parseFileSize(sizeFilter, sizeDisplayUnit)
        : null;
    const { ruleset, seeded } = seedListSearchRuleset({
      migrationId: migrationId || "search",
      existing: draftRuleset,
      searchField,
      nameQuery: searchQuery,
      pathSegments,
      typeFilter,
      sizeBytes,
      sizeOperator,
      reviewStatus: traversalStatusFilter,
      pathIssueStatus: pathIssueStatusFilter,
      pathIssueCategory: pathIssueCategoryFilter,
    });
    setDraftRuleset(ruleset);
    if (seeded) {
      if (
        traversalStatusFilter === "not_on_src" &&
        showDestinationOnlyToggle
      ) {
        onShowDestinationOnlyChange?.(true);
      }
      clearSeededBasicFields();
    }
    setShowFilterMenu(false);
    setAdvancedFiltersPageOpen(true);
  };

  const applyBasicFilters = () => {
    handleSearch();
    setShowFilterMenu(false);
  };

  const applyAdvancedFilters = () => {
    handleSearch();
    setAdvancedFiltersPageOpen(false);
  };

  const clearAdvancedFilters = () => {
    const empty = createEmptyRuleset(migrationId || "search");
    setDraftRuleset(empty);
    setActiveRuleset(empty);
  };

  if (advancedFiltersClearRef) {
    advancedFiltersClearRef.current = clearAdvancedFilters;
  }
  if (advancedFiltersApplyRef) {
    advancedFiltersApplyRef.current = applyAdvancedFilters;
  }

  useEffect(() => {
    if (!advancedFiltersOpen) {
      onAdvancedFiltersCanApplyChange?.(false);
      return;
    }
    onAdvancedFiltersCanApplyChange?.(canSubmitSearch);
  }, [advancedFiltersOpen, canSubmitSearch, onAdvancedFiltersCanApplyChange]);

  const exportAdvancedRulesJson = () => {
    const payload = prepareRulesetForSave(draftRuleset);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(payload.name || "filters").replace(/\s+/g, "-").toLowerCase()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importAdvancedRulesJson = async (file: File) => {
    setLibraryError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("JSON must be a filter ruleset object");
      }
      const raw = parsed as Record<string, unknown>;
      const root =
        (raw.root_group as typeof draftRuleset.root_group | undefined) ??
        (raw.rootGroup as typeof draftRuleset.root_group | undefined);
      if (!root || typeof root !== "object") {
        throw new Error("JSON is missing root_group");
      }
      setDraftRuleset(
        presentRulesetForEditor({
          ruleset_id:
            typeof raw.ruleset_id === "string"
              ? raw.ruleset_id
              : `${migrationId || "search"}-ruleset`,
          name:
            typeof raw.name === "string" && raw.name.trim()
              ? raw.name
              : "Imported filters",
          description:
            typeof raw.description === "string" ? raw.description : undefined,
          schema_version:
            typeof raw.schema_version === "number"
              ? raw.schema_version
              : typeof raw.schemaVersion === "number"
                ? raw.schemaVersion
                : 1,
          root_group: root,
        })
      );
    } catch (err) {
      setLibraryError(
        err instanceof Error ? err.message : "Failed to import filter JSON"
      );
    }
  };

  const openSaveRulesDialog = () => {
    setSaveRulesName(draftRuleset.name?.trim() || "Saved list filters");
    setSaveRulesNotes(draftRuleset.description ?? "");
    setSaveRulesError(null);
    setShowSaveRulesDialog(true);
  };

  const saveRulesToAccount = async () => {
    const name = saveRulesName.trim();
    if (!name) {
      setSaveRulesError("Name is required");
      return;
    }
    setSaveRulesBusy(true);
    setSaveRulesError(null);
    try {
      const prepared = prepareRulesetForSave({
        ...draftRuleset,
        name,
        description: saveRulesNotes.trim() || undefined,
      });
      await createRuleset({
        name: prepared.name,
        description: prepared.description,
        schemaVersion: prepared.schema_version,
        rootGroup: prepared.root_group,
      });
      setDraftRuleset({
        ...draftRuleset,
        name: prepared.name,
        description: prepared.description,
      });
      setShowSaveRulesDialog(false);
      onToast?.("Filters saved to your account", "success");
    } catch (err) {
      setSaveRulesError(
        err instanceof Error ? err.message : "Failed to save filters"
      );
    } finally {
      setSaveRulesBusy(false);
    }
  };

  const openLoadRulesDialog = async () => {
    setShowLoadRulesDialog(true);
    setLibraryError(null);
    setLibraryBusy(true);
    try {
      const items = await listRulesets();
      setLibraryRulesets(items.filter((item) => item.createdBy !== "prepackaged"));
    } catch (err) {
      setLibraryError(
        err instanceof Error ? err.message : "Failed to load saved filters"
      );
      setLibraryRulesets([]);
    } finally {
      setLibraryBusy(false);
    }
  };

  const loadSavedRuleset = async (id: string) => {
    setLibraryBusy(true);
    setLibraryError(null);
    try {
      const summary = await getRuleset(id);
      setDraftRuleset(rulesetFromSummary(summary, migrationId || "search"));
      setShowLoadRulesDialog(false);
    } catch (err) {
      setLibraryError(
        err instanceof Error ? err.message : "Failed to load saved filters"
      );
    } finally {
      setLibraryBusy(false);
    }
  };

  const basicFilterSections = (
    <>
      <div className="path-review-list__filter-menu-section">
        <label className="path-review-list__filter-menu-label">Search In</label>
        <div className="path-review-list__filter-menu-toggle">
          <button
            type="button"
            className={`path-review-list__filter-menu-toggle-button ${searchField === "path" ? "path-review-list__filter-menu-toggle-button--active" : ""}`}
            onClick={() => setSearchField("path")}
          >
            In path
          </button>
          <button
            type="button"
            className={`path-review-list__filter-menu-toggle-button ${searchField === "name" ? "path-review-list__filter-menu-toggle-button--active" : ""}`}
            onClick={() => setSearchField("name")}
          >
            Name
          </button>
        </div>
        {searchField === "path" && (
          <p className="path-review-list__filter-menu-hint">
            Segments match folder/file names in order; gaps between them are allowed.
          </p>
        )}
      </div>

      <div className="path-review-list__filter-menu-section">
        <label className="path-review-list__filter-menu-label">Type</label>
        <div className="path-review-list__filter-menu-options">
          {(
            [
              { value: "both" as const, label: "Both" },
              { value: "folder" as const, label: "Folders" },
              { value: "file" as const, label: "Files" },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`path-review-list__filter-menu-option ${
                typeFilter === value ? "path-review-list__filter-menu-option--active" : ""
              }`}
              onClick={() => {
                setTypeFilter(value);
                if (value === "folder") {
                  setSizeFilter("");
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="path-review-list__filter-menu-section">
        <label className="path-review-list__filter-menu-label" htmlFor="size-filter">
          File Size
        </label>
        <div className="path-review-list__filter-menu-numeric-controls">
          <select
            className="path-review-list__filter-menu-operator"
            value={sizeOperator}
            onChange={(e) =>
              setSizeOperator(e.target.value as "equals" | "gt" | "gte" | "lt" | "lte")
            }
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
            onChange={(e) =>
              setSizeDisplayUnit(e.target.value as "bytes" | "KB" | "MB" | "GB")
            }
            disabled={typeFilter === "folder"}
          >
            <option value="bytes">Bytes</option>
            <option value="KB">KB</option>
            <option value="MB">MB</option>
            <option value="GB">GB</option>
          </select>
        </div>
      </div>

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
          {(getDisplayPhase() === "source-cleanup" ||
            getDisplayPhase() === "delete" ||
            getDisplayPhase() === "copy-plan") && (
            <option value="pending">
              {statusFilterOptionLabel(getDisplayPhase(), "pending")}
            </option>
          )}
          {getDisplayPhase() !== "copy-plan" && (
            <option value="pending_retry">
              {statusFilterOptionLabel(getDisplayPhase(), "pending_retry")}
            </option>
          )}
          <option value="excluded">
            {statusFilterOptionLabel(getDisplayPhase(), "excluded")}
          </option>
          <option value="failed">
            {statusFilterOptionLabel(getDisplayPhase(), "failed")}
          </option>
          <option value="successful">
            {statusFilterOptionLabel(getDisplayPhase(), "successful")}
          </option>
          <option value="not_on_src">
            {statusFilterOptionLabel(getDisplayPhase(), "not_on_src")}
          </option>
        </select>
      </div>

      {showCompatUI ? (
        <div className="path-review-list__filter-menu-section">
          <label
            className="path-review-list__filter-menu-label"
            htmlFor="compatibility-filter"
          >
            {PATH_REVIEW_COPY.compatibilityFilterLabel}
          </label>
          <select
            id="compatibility-filter"
            className="path-review-list__filter-menu-select"
            value={
              pathIssueCategoryFilter
                ? `cat:${pathIssueCategoryFilter}`
                : pathIssueStatusFilter
            }
            onChange={(e) => {
              const next = e.target.value;
              if (next.startsWith("cat:")) {
                setPathIssueStatusFilter("issues");
                setPathIssueCategoryFilter(next.slice(4));
              } else {
                setPathIssueStatusFilter(next);
                setPathIssueCategoryFilter("");
              }
              setCurrentPage(0);
            }}
          >
            <option value="">{PATH_REVIEW_COPY.compatibilityFilterAll}</option>
            <option value="issues">{PATH_REVIEW_COPY.compatibilityFilterIssues}</option>
            <option value="manual">
              {PATH_REVIEW_COPY.compatibilityFilterManual}
            </option>
            <option value="rejected">
              {PATH_REVIEW_COPY.compatibilityFilterRejected}
            </option>
            <option value="none">{PATH_REVIEW_COPY.compatibilityFilterNone}</option>
            {pathIssueCategoryCounts.length > 0 ? (
              <optgroup label={PATH_REVIEW_COPY.compatibilityFilterByType}>
                {pathIssueCategoryCounts.map(([category, count]) => (
                  <option key={category} value={`cat:${category}`}>
                    {pathIssueShortLabel([{ category }])} ({count})
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </div>
      ) : null}

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
    </>
  );

  if (advancedFiltersOpen) {
    return (
      <div className="path-review-list path-review-list--filters-page" style={densityStyle}>
        <p className="path-review-list-filters__summary">
          Build match rules for name, path, extension, size, modified time,
          status, and compatibility. Drag the handle to move rules between
          groups or back to the top level. Apply returns to results and runs
          the search.
        </p>

        <div className="path-review-list-filters__library">
          <input
            ref={importRulesInputRef}
            type="file"
            accept="application/json,.json"
            className="path-review-list-filters__file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importAdvancedRulesJson(file);
            }}
          />
          <button
            type="button"
            className="path-review-list-filters__library-btn"
            onClick={() => importRulesInputRef.current?.click()}
          >
            Import JSON
          </button>
          <button
            type="button"
            className="path-review-list-filters__library-btn"
            onClick={exportAdvancedRulesJson}
            disabled={isRulesetEffectivelyEmpty(draftRuleset)}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="path-review-list-filters__library-btn"
            onClick={openSaveRulesDialog}
            disabled={isRulesetEffectivelyEmpty(draftRuleset)}
          >
            Save for later
          </button>
          <button
            type="button"
            className="path-review-list-filters__library-btn"
            onClick={() => void openLoadRulesDialog()}
          >
            Load saved
          </button>
          <button
            type="button"
            className="path-review-list-filters__library-btn"
            onClick={() => setShowRuleExamples(true)}
          >
            See examples…
          </button>
        </div>

        {libraryError ? (
          <div className="path-review-list__error">{libraryError}</div>
        ) : null}

        <div className="path-review-list-filters__advanced-body">
          <FilterRulesBuilder
            ruleset={draftRuleset}
            onChange={setDraftRuleset}
            compact
            matchMode="search"
            isCopyPhase={isCopyPhase(migrationStatus)}
            isTraversalPhase={getDisplayPhase() === "traversal"}
            showCompatFields={showCompatUI}
            pathIssueCategories={pathIssueCategoryCounts.map(
              ([category, count]) => ({
                category,
                count,
                label: pathIssueShortLabel([{ category }]),
              })
            )}
          />
        </div>

        {showRuleExamples ? (
          <FilterRuleExamples
            onClose={() => setShowRuleExamples(false)}
            onUse={(ruleset) => {
              setDraftRuleset(ruleset);
              setShowRuleExamples(false);
            }}
          />
        ) : null}

        {showSaveRulesDialog ? (
          <div
            className="path-review-list__filter-modal-overlay"
            onClick={() => setShowSaveRulesDialog(false)}
          >
            <div
              className="path-review-list__filter-modal path-review-list__rules-dialog"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="path-review-list__filter-modal-header">
                <h2 className="path-review-list__filter-modal-title">
                  Save filters for later
                </h2>
                <button
                  type="button"
                  className="path-review-list__filter-modal-close"
                  onClick={() => setShowSaveRulesDialog(false)}
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="path-review-list__filter-modal-content">
                <div className="path-review-list__filter-menu-section">
                  <label
                    className="path-review-list__filter-menu-label"
                    htmlFor="save-rules-name"
                  >
                    Name
                  </label>
                  <input
                    id="save-rules-name"
                    className="path-review-list__filter-menu-input"
                    value={saveRulesName}
                    onChange={(e) => setSaveRulesName(e.target.value)}
                    placeholder="e.g. Large videos"
                  />
                </div>
                <div className="path-review-list__filter-menu-section">
                  <label
                    className="path-review-list__filter-menu-label"
                    htmlFor="save-rules-notes"
                  >
                    Notes
                  </label>
                  <textarea
                    id="save-rules-notes"
                    className="path-review-list__rules-dialog-notes"
                    value={saveRulesNotes}
                    onChange={(e) => setSaveRulesNotes(e.target.value)}
                    placeholder="Optional notes"
                    rows={3}
                  />
                </div>
                {saveRulesError ? (
                  <div className="path-review-list__error">{saveRulesError}</div>
                ) : null}
              </div>
              <div className="path-review-list__filter-modal-footer">
                <button
                  type="button"
                  className="path-review-list__filter-modal-button path-review-list__filter-modal-button--secondary"
                  onClick={() => setShowSaveRulesDialog(false)}
                  disabled={saveRulesBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="path-review-list__filter-modal-button path-review-list__filter-modal-button--primary"
                  onClick={() => void saveRulesToAccount()}
                  disabled={saveRulesBusy}
                >
                  {saveRulesBusy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showLoadRulesDialog ? (
          <div
            className="path-review-list__filter-modal-overlay"
            onClick={() => setShowLoadRulesDialog(false)}
          >
            <div
              className="path-review-list__filter-modal path-review-list__rules-dialog"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="path-review-list__filter-modal-header">
                <h2 className="path-review-list__filter-modal-title">
                  Load saved filters
                </h2>
                <button
                  type="button"
                  className="path-review-list__filter-modal-close"
                  onClick={() => setShowLoadRulesDialog(false)}
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="path-review-list__filter-modal-content">
                {libraryBusy ? (
                  <p className="path-review-list__filter-menu-hint">Loading…</p>
                ) : libraryRulesets.length === 0 ? (
                  <p className="path-review-list__filter-menu-hint">
                    No saved filter sets yet. Use Save for later to store one.
                  </p>
                ) : (
                  <div className="path-review-list__filter-menu-options">
                    {libraryRulesets.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="path-review-list__filter-menu-option"
                        disabled={libraryBusy}
                        onClick={() => void loadSavedRuleset(item.id)}
                      >
                        <span>{item.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {libraryError ? (
                  <div className="path-review-list__error">{libraryError}</div>
                ) : null}
              </div>
              <div className="path-review-list__filter-modal-footer">
                <button
                  type="button"
                  className="path-review-list__filter-modal-button path-review-list__filter-modal-button--secondary"
                  onClick={() => setShowLoadRulesDialog(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

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
            title="Select all visible"
            aria-label="Select all visible"
          />
          {showSelectAllMatchingEscalate({
            searchPredicateActive,
            allMatchingSelected,
            visibleCount: items.length,
            allVisibleSelected: items.every((item) =>
              explicitSelected.has(item.id)
            ),
          }) ? (
            <button
              type="button"
              className="path-review-list__select-matching-link"
              onClick={() => selectAllMatching()}
            >
              Select all that match this criteria
            </button>
          ) : null}
        </div>
        <div className="path-review-list__search-bar">
          {underPath.trim() !== "" && underPath.trim() !== "/" ? (
            <div className="path-review-list__under-path-chip" title={underPathLabel || underPath}>
              <span className="path-review-list__under-path-chip-label">
                In this folder: {underPathLabel || underPath}
              </span>
              <button
                type="button"
                className="path-review-list__under-path-chip-clear"
                title="Clear folder scope"
                aria-label="Clear folder scope"
                onClick={() => {
                  setUnderPath("");
                  setUnderPathLabel("");
                  setCurrentPage(0);
                }}
              >
                <X size={14} />
              </button>
            </div>
          ) : null}
          {sourceItemCount > 500_000 ? (
            <HelpTooltip
              tipId="path-review-large-search"
              category="path-review"
              position="below"
              content={
                <p>
                  This migration has a lot of items. Searching by name or path
                  across everything can be slow or time out. Browse into a
                  folder first and search from there, or filter by status.
                </p>
              }
            />
          ) : null}
          {searchField === "path" ? (
            <div className="path-review-list__path-segments">
              {pathSegments.map((seg, index) => (
                <div key={index} className="path-review-list__path-segment">
                  <input
                    type="text"
                    className="path-review-list__search-input path-review-list__path-segment-input"
                    placeholder={index === 0 ? "In path…" : "then…"}
                    value={seg}
                    onChange={(e) => {
                      const next = [...pathSegments];
                      next[index] = e.target.value;
                      setPathSegments(next);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canSubmitSearch) {
                        handleSearch();
                      }
                    }}
                    aria-label={`Path segment ${index + 1}`}
                  />
                  <div className="path-review-list__path-segment-actions">
                    <button
                      type="button"
                      className="path-review-list__path-segment-btn"
                      title="Move up"
                      aria-label={`Move segment ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => {
                        if (index === 0) return;
                        const next = [...pathSegments];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        setPathSegments(next);
                      }}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="path-review-list__path-segment-btn"
                      title="Move down"
                      aria-label={`Move segment ${index + 1} down`}
                      disabled={index >= pathSegments.length - 1}
                      onClick={() => {
                        if (index >= pathSegments.length - 1) return;
                        const next = [...pathSegments];
                        [next[index], next[index + 1]] = [next[index + 1], next[index]];
                        setPathSegments(next);
                      }}
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="path-review-list__path-segment-btn"
                      title="Remove segment"
                      aria-label={`Remove segment ${index + 1}`}
                      disabled={pathSegments.length <= 1}
                      onClick={() => {
                        if (pathSegments.length <= 1) return;
                        setPathSegments(pathSegments.filter((_, i) => i !== index));
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {pathSegments.length < MAX_PATH_SEGMENTS && (
                <button
                  type="button"
                  className="path-review-list__path-segment-add"
                  title="Add path segment"
                  aria-label="Add path segment"
                  onClick={() => setPathSegments([...pathSegments, ""])}
                >
                  <Plus size={16} />
                </button>
              )}
            </div>
          ) : (
            <input
              type="text"
              className="path-review-list__search-input"
              placeholder="Search by name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmitSearch) {
                  handleSearch();
                }
              }}
            />
          )}
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
          {showFilterMenu && (
            <div
              className="path-review-list__filter-modal-overlay"
              onClick={() => setShowFilterMenu(false)}
            >
              <div
                className="path-review-list__filter-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="path-review-list__filter-modal-header">
                  <h2 className="path-review-list__filter-modal-title">Filters</h2>
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
                  {basicFilterSections}
                </div>
                <div className="path-review-list__filter-modal-advanced">
                  <button
                    type="button"
                    className="path-review-list__filter-modal-button path-review-list__filter-modal-button--secondary path-review-list__filter-modal-advanced-button"
                    onClick={openAdvancedFiltersPage}
                  >
                    Advanced filter options
                    {draftAdvancedRulesActive ? " (active)" : ""}
                  </button>
                </div>
                <div className="path-review-list__filter-modal-footer">
                  <button
                    type="button"
                    className="path-review-list__filter-modal-button path-review-list__filter-modal-button--secondary"
                    onClick={() => {
                      clearAllFilters();
                    }}
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    className="path-review-list__filter-modal-button path-review-list__filter-modal-button--primary"
                    onClick={applyBasicFilters}
                    disabled={!canSubmitSearch}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}
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
            title={
              canSubmitSearch
                ? "Search"
                : "Add a text query or filter before searching"
            }
            disabled={!canSubmitSearch}
            aria-disabled={!canSubmitSearch}
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </div>

      {/* Background Task Status */}
      {(bulkLoading || serverBulkMutationInProgress) && (
        <div className="path-review-list__task-status" role="status">
          <div className="path-review-list__task-item">
            An exclude/unexclude is still running; list results may be stale until
            it finishes.
          </div>
        </div>
      )}
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
      {(allMatchingSelected ||
        explicitSelected.size > 0 ||
        getInheritedSelections(explicitSelected).size > 0) && (
        <div className="path-review-list__bulk-actions">
          <span className="path-review-list__bulk-count">
            {allMatchingSelected
              ? allMatchingSelectedLabel(calculatedTotal, calculatedTotalTruncated)
              : `${explicitSelected.size + getInheritedSelections(explicitSelected).size} item${
                  explicitSelected.size + getInheritedSelections(explicitSelected).size !== 1
                    ? "s"
                    : ""
                } selected`}
          </span>
          <div className="path-review-list__bulk-buttons">
            <div className="path-review-list__apply-action" ref={applyMenuRef}>
              <button
                type="button"
                className="glass-button glass-button--small"
                disabled={bulkLoading}
                onClick={() => setApplyMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={applyMenuOpen}
              >
                {bulkLoading ? "Working…" : "Apply action"}
                <ChevronDown size={14} style={{ marginLeft: "0.35rem" }} />
              </button>
              {applyMenuOpen ? (
                <div className="path-review-list__apply-action-menu" role="menu">
                  {(isCopyPlanView ||
                    (!isCopyPhase(migrationStatus) &&
                      !isDeletePhase(migrationStatus))) &&
                  !isSourceCleanupView ? (
                    <>
                      <button
                        type="button"
                        className="path-review-list__apply-action-option"
                        role="menuitem"
                        disabled={bulkLoading}
                        onClick={() => void handleApplyAction("exclude")}
                      >
                        {excludeApplyLabel(allMatchingSelected)}
                      </button>
                      <button
                        type="button"
                        className="path-review-list__apply-action-option"
                        role="menuitem"
                        disabled={bulkLoading}
                        onClick={() => void handleApplyAction("unexclude")}
                      >
                        {unexcludeApplyLabel(allMatchingSelected)}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="path-review-list__apply-action-option"
                    role="menuitem"
                    disabled={bulkLoading}
                    onClick={() => void handleApplyAction("mark_retry")}
                  >
                    Mark for retry
                  </button>
                  <button
                    type="button"
                    className="path-review-list__apply-action-option"
                    role="menuitem"
                    disabled={bulkLoading}
                    onClick={() => void handleApplyAction("mark_failed")}
                  >
                    Mark failed
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="path-review-list__clear-selection"
              onClick={clearSelection}
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Controls + icon legend (legend on its own full-width band) */}
      {!loading && searchPredicateActive && (
        <div className="path-review-list__legend-wrapper">
          <div className="path-review-list__legend-toolbar">
            <div className="path-review-list__legend-start">
              {items.length > 0 && onOpenIssuesPanel ? (
                <PathReviewIssuesButton
                  issueCount={issuesAttentionCount}
                  warningCount={issuesWarningCount}
                  active={issuesPanelOpen}
                  onClick={onOpenIssuesPanel}
                />
              ) : null}
            </div>
            <div className="path-review-list__legend-end">
              {(countError ||
                countingTotal ||
                calculatedTotal !== null) && (
                <div className="path-review-list__count-controls">
                  {calculatedTotal !== null && (
                    <span className="path-review-list__count-result">
                      {calculatedTotalTruncated
                        ? `At least ${calculatedTotal.toLocaleString()}`
                        : `${calculatedTotal.toLocaleString()} total`}
                    </span>
                  )}
                  {countError && (
                    <span className="path-review-list__count-error">{countError}</span>
                  )}
                  {(countingTotal || calculatedTotal !== null) && (
                    <span className="path-review-list__count-stale-note">
                      Count may go stale if items change.
                    </span>
                  )}
                </div>
              )}
              {pagination && items.length > 0 && (
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
                  onCalculateTotal={() => void handleCalculateTotal()}
                  calculatingTotal={countingTotal}
                  calculatedTotal={calculatedTotal}
                />
              )}
            </div>
          </div>
          {items.length > 0 ? (
            <div className="path-review-list__legend-row">
              <PathReviewLegend
                zoomLevel={1}
                phase={getDisplayPhase()}
                showDestinationOnly={includeDestinationOnly}
                showCompatibility={
                  showCompatUI && pathIssues.some((i) => !i.ignored)
                }
              />
            </div>
          ) : null}
        </div>
      )}

      {/* Items List */}
      <div className="path-review-list__items-container">
        {loading ? (
          <div className="path-review-list__empty">Loading...</div>
        ) : error ? (
          <div className="path-review-list__error">{error}</div>
        ) : !searchPredicateActive ? (
          <div className="path-review-list__empty path-review-list__empty--prompt">
            <p className="path-review-list__empty-title">
              Browse the tree, or add a list filter
            </p>
            <p className="path-review-list__empty-body">
              List search needs at least one filter (status, type, size, naming
              issue, or text). The tree stays the primary way to navigate.
            </p>
            <div className="path-review-list__empty-suggestions">
              <button
                type="button"
                className="path-review-list__empty-suggestion"
                onClick={() => applySuggestedFilter("failed")}
              >
                Failed
              </button>
              {showCompatUI ? (
                <button
                  type="button"
                  className="path-review-list__empty-suggestion"
                  onClick={() => applySuggestedFilter("naming")}
                >
                  Naming issues
                </button>
              ) : null}
              <button
                type="button"
                className="path-review-list__empty-suggestion path-review-list__empty-suggestion--secondary"
                onClick={() => setShowFilterMenu(true)}
              >
                Open filters
              </button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="path-review-list__empty">No items found.</div>
        ) : (
          <div
            ref={listItemsRef}
            className="path-review-list__items"
          >
            <PathReviewSizeColumnHeader variant="list" />
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
                  ? isDeletePendingExplicit(item.src?.deleteStatus)
                  : isTraversalRetryPending(item);

              const isInspectorFocused = inspectorItemId === item.id;

              return (
                <div
                  key={item.id}
                  className={`path-review-list__item ${
                    status.isExcluded ? "path-review-list__item--excluded" : ""
                  } ${
                    status.isTraversalSkipped
                      ? "path-review-list__item--traversal-skipped"
                      : ""
                  } ${
                    status.isDeleted ? "path-review-list__item--deleted" : ""
                  } ${
                    status.existsOnlyOnDst ? "path-review-list__item--destination-only" : ""
                  } ${
                    isExplicit ? "path-review-list__item--selected" : ""
                  } ${isInherited ? "path-review-list__item--inherited" : ""} ${
                    isInspectorFocused ? "path-review-list__item--inspector-focused" : ""
                  } ${
                    showCompatUI &&
                    item.pathIssueStatus === "manual_review" &&
                    !item.pathIssueIgnored
                      ? "path-review__item--path-issue"
                      : ""
                  }`}
                  onClick={() => onInspectorSelect?.(item)}
                  onContextMenu={(e) => {
                    const actions = buildListContextActions(item);
                    if (actions.length === 0) return;
                    e.preventDefault();
                    (onInspectorEnsure ?? onInspectorSelect)?.(item);
                    setContextMenu({ x: e.clientX, y: e.clientY, item });
                  }}
                >
                  {/* Checkbox */}
                  <div
                    className="path-review-list__item-checkbox"
                    onClick={(e) => e.stopPropagation()}
                  >
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
                  <div
                    className="path-review-list__item-status-icon-container"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PathReviewStatusIcon
                      item={item}
                      isMarkedForRetry={isMarkedForRetry}
                      isLocked={isLocked}
                      zoomLevel={1}
                      size={16}
                      className="path-review-list__item-status-icon"
                      phase={getDisplayPhase()}
                      opInProgressTitle={inFlightOpTitle(mutationOps, itemMutationIds(item))}
                      onRetryClick={handleRetryClick}
                      onExcludeClick={(item, currentChecked) => handleCheckboxChange(item, currentChecked)}
                      onSkipDeleteClick={onSkipDeleteClick}
                    />
                  </div>

                  {/* File/Folder Icon */}
                  <div className="path-review__item-icon path-review-list__item-icon">
                    {isFolder ? (
                      <Folder size={16} />
                    ) : (
                      <File size={16} />
                    )}
                  </div>

                  {/* Name Column */}
                  <div className="path-review-list__item-name-col">
                    <div className="path-review__item-name-row">
                      <div className="path-review-list__item-name">{item.name}</div>
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
                        className="path-review-list__item-failure-message"
                        title={failureMessage}
                      >
                        {failureMessage}
                      </div>
                    )}
                    {excludedByRuleText(item) ? (
                      <div
                        className="path-review-list__item-rule-exclusion"
                        title={excludedByRuleText(item)}
                      >
                        {excludedByRuleText(item)}
                      </div>
                    ) : null}
                  </div>

                  {/* Path Column */}
                  <div
                    className="path-review-list__item-path-col"
                    title={itemDisplayPath(item)}
                  >
                    <div className="path-review-list__item-path">{itemDisplayPath(item)}</div>
                  </div>

                  <ListItemMeta
                    className="path-review-list__item-meta-col"
                    lastUpdated={item.lastUpdated}
                    size={item.size}
                    type={isFolder ? "folder" : "file"}
                  />

                  {/* Navigate to Tree View Icon */}
                  <div
                    className="path-review-list__item-navigate"
                    onClick={(e) => e.stopPropagation()}
                  >
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

      {contextMenu && (
        <PathReviewContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={buildListContextActions(contextMenu.item)}
          onClose={() => setContextMenu(null)}
        />
      )}

    </div>
  );
}

