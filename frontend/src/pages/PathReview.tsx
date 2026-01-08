import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  Folder,
  File,
  Copy,
  RotateCw,
} from "lucide-react";
import { 
  getMigrationDiffs, 
  excludeNode, 
  unexcludeNode,
  markNodeForRetry,
  unmarkNodeForRetry,
  DiffItem,
  getPendingWork,
  changePhase,
  PendingWorkResponse,
  getPathReviewStats,
  PathReviewStats,
  PaginationInfo,
  getRunningBackgroundTasks,
  triggerRetrySweep,
} from "../api/services";
import { MigrationStatusResponse } from "../types/migrations";
import ItemHoverCard from "../components/ItemHoverCard";
import Toast from "../components/Toast";
import ConfirmDialog from "../components/ConfirmDialog";
import ZoomControl from "../components/ZoomControl";
import { useZoom } from "../contexts/ZoomContext";
import PathReviewListView from "./PathReviewListView";
import PathReviewStatusIcon from "../components/PathReviewStatusIcon";
import PathReviewLegend from "../components/PathReviewLegend";
import PathReviewFooterInfo from "../components/PathReviewFooterInfo";
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

export default function PathReview() {
  const { migrationId } = useParams<{ migrationId: string }>();
  const navigate = useNavigate();
  const { zoomLevel } = useZoom();
  const [activeTab, setActiveTab] = useState<"tree" | "list">("tree");
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
  const pendingUpdatesRef = useRef<Map<string, boolean>>(new Map());
  const pendingRetryUpdatesRef = useRef<Map<string, boolean>>(new Map());
  const statsPollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingStatsRef = useRef<boolean>(false);
  
  // Workflow state tracking
  const [reviewIteration, setReviewIteration] = useState(1);
  const [pendingWork, setPendingWork] = useState<PendingWorkResponse | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatusResponse | null>(null);
  const [isTriggeringSweep, setIsTriggeringSweep] = useState(false);
  const [stats, setStats] = useState<PathReviewStats | null>(null);
  const [showSelectionWarning, setShowSelectionWarning] = useState(false);
  const [listPagination, setListPagination] = useState<PaginationInfo | null>(null);
  const [listItemsPerPage, setListItemsPerPage] = useState<number>(100);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  
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
      const statsData = await getPathReviewStats(migrationId);
      // Always update stats from polling, but list view selection stats will override when items are selected
      // This ensures stats are always fresh when user deselects items
      setStats(statsData);
      // Don't reload items here - optimistic updates handle immediate UI changes
      // Items will refresh naturally on user navigation or explicit actions
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  };
  
  const checkCanStartCopy = (): boolean => {
    // Block if we have pending retries (requires explicit user action)
    if ((stats?.pendingRetriesCount ?? 0) > 0) return false;
    
    // Block if background tasks are running
    if (hasRunningTasks) return false;
    
    // Exclusion sweeps run automatically, so don't block on hasPendingExclusions
    // hasPathReviewChanges is informational - exclusion sweep will run automatically
    
    // Check migration status - use checkpointStatus if available, otherwise check status === 'completed'
    if (migrationStatus) {
      const checkpointStatus = (migrationStatus as any).checkpointStatus;
      if (checkpointStatus) {
        return checkpointStatus === "Awaiting-Path-Review";
      }
      // Fallback to status === 'completed'
      return migrationStatus.status === "completed";
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
    loadItems(undefined);  // undefined for root (children of all roots)
    
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

  // Handle stats change from list view (from API polling)
  const handleStatsChange = (newStats: PathReviewStats | null) => {
    if (newStats) {
      setStats(newStats);
    }
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

  // Determine if we're in traversal review mode
  const isTraversalReviewMode = () => {
    if (!migrationStatus) return true; // Default to traversal review mode
    const checkpointStatus = (migrationStatus as any).checkpointStatus;
    return checkpointStatus === "Awaiting-Path-Review";
  };

  // Get item status based on API data (copyStatus and traversalStatus)
  const getItemStatus = (item: DiffItem) => {
    const copyStatus = item.copyStatus || "pending";
    const isFailed = item.traversalStatus === "failed";
    const existsOnlyOnDst = item.traversalStatus === "not_on_src";
    
    // 1. Failed traversalStatus → failed
    // 2. Excluded copyStatus → excluded
    // 3. Pending copyStatus → pending
    // 4. Successful copyStatus → exists on both
    // 5. traversalStatus 'not_on_src' → exists only on destination
    
    const isExcluded = copyStatus === "exclusion_explicit" || copyStatus === "exclusion_inherited";
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
  };

  const loadItems = async (locationPath: string | undefined, append = false) => {
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
        locationPath: locationPath || "/",
        offset,
        limit: 100,
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
      if (!append) {
        const initialPending = new Set<string>();
        filteredItems.forEach((item) => {
          // Only check items that exist on src but NOT on dst (pending items to copy)
          if (item?.copyStatus === "pending") {
            initialPending.add(item.id);
          }
        });
        setPendingItems(initialPending);
      }

      if (append) {
        setItems((prev) => [...prev, ...filteredItems]);
      } else {
        setItems(filteredItems);
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
    
    // Don't allow navigation into folders that exist only on destination
    if (status.existsOnlyOnDst && item.type === "folder") {
      return;
    }
    
    const newBreadcrumb: BreadcrumbItem = {
      path: item.locationPath,  // locationPath for navigation
      name: item.name,
    };
    setBreadcrumbs((prev) => [...prev, newBreadcrumb]);
    loadItems(item.locationPath);  // Use locationPath
  };

  const handleBack = () => {
    if (breadcrumbs.length > 0) {
      const newBreadcrumbs = breadcrumbs.slice(0, -1);
      setBreadcrumbs(newBreadcrumbs);
      const targetLocationPath =
        newBreadcrumbs.length > 0
          ? newBreadcrumbs[newBreadcrumbs.length - 1].path
          : undefined;
      loadItems(targetLocationPath);
    } else {
      loadItems(undefined);  // Root (children of all roots)
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newBreadcrumbs);
    const targetLocationPath =
      newBreadcrumbs.length > 0
        ? newBreadcrumbs[newBreadcrumbs.length - 1].path
        : undefined;
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
    
    // Load items for the parent folder
    await loadItems(parentPath || undefined);
    
    // Highlight the item for 2 seconds
    setHighlightedItemId(item.id);
    setTimeout(() => {
      setHighlightedItemId(null);
    }, 2000);
  };

  const handleRetryClick = async (item: DiffItem) => {
    if (!migrationId) return;
    
    // Check both src and dst traversalStatus to determine which node needs retry action
    const srcTraversalStatus = item.src?.traversalStatus;
    const dstTraversalStatus = item.dst?.traversalStatus;
    const srcNodeId = item.src?.id;
    const dstNodeId = item.dst?.id;
    
    // Determine which node has failed or pending status (failed takes priority)
    let nodeIdToUpdate: string | null = null;
    let isMarkedForRetry = false;
    
    if (srcTraversalStatus === "failed" || dstTraversalStatus === "failed") {
      // If either node is failed, find the one that's failed
      if (srcTraversalStatus === "failed" && srcNodeId) {
        nodeIdToUpdate = srcNodeId;
        isMarkedForRetry = retryItems.has(item.id) || false; // Check if already marked for retry
      } else if (dstTraversalStatus === "failed" && dstNodeId) {
        nodeIdToUpdate = dstNodeId;
        isMarkedForRetry = retryItems.has(item.id) || false; // Check if already marked for retry
      }
    } else if (srcTraversalStatus === "pending" || dstTraversalStatus === "pending") {
      // If either node is pending (and neither is failed), find the one that's pending
      if (srcTraversalStatus === "pending" && srcNodeId) {
        nodeIdToUpdate = srcNodeId;
        isMarkedForRetry = retryItems.has(item.id) || true; // Pending means marked for retry
      } else if (dstTraversalStatus === "pending" && dstNodeId) {
        nodeIdToUpdate = dstNodeId;
        isMarkedForRetry = retryItems.has(item.id) || true; // Pending means marked for retry
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

    // Optimistically update item's traversalStatus in items array for immediate status icon update
    // Update the specific node (src or dst) that we're modifying
    setItems((prevItems) =>
      prevItems.map((i) => {
        if (i.id === item.id) {
          const updatedItem = { ...i };
          // Update the node we're modifying
          if (nodeIdToUpdate === srcNodeId && i.src) {
            updatedItem.src = {
              ...i.src,
              traversalStatus: isMarkedForRetry ? "failed" : "pending",
            };
            // Update primary traversalStatus if this is the primary node
            if (i.id === srcNodeId) {
              updatedItem.traversalStatus = isMarkedForRetry ? "failed" : "pending";
            }
          } else if (nodeIdToUpdate === dstNodeId && i.dst) {
            updatedItem.dst = {
              ...i.dst,
              traversalStatus: isMarkedForRetry ? "failed" : "pending",
            };
            // Update primary traversalStatus if this is the primary node
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
      // Mark or unmark for retry based on current state
      // Use ULID (id field) directly, not locationPath
      // API automatically handles the corresponding node, so we only need to call once
      // Only call for the node that has failed or pending status
      const result = isMarkedForRetry
        ? await unmarkNodeForRetry(migrationId, nodeIdToUpdate)
        : await markNodeForRetry(migrationId, nodeIdToUpdate);
      
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
      
      // Success
      pendingRetryUpdatesRef.current.delete(item.id);
      
      // Start polling stats based on background tasks (stats will update pendingRetriesCount)
      startStatsPolling();
      
      // Show success message
      setToast({
        message: newRetryState 
          ? "Item marked for retry" 
          : "Item unmarked for retry",
        type: "success",
      });
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
          return {
            ...i,
            copyStatus: isExcluding ? "exclusion_explicit" : "pending",
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
          setToast({
            message: srcResult.error || "Failed to update source node. Please try again.",
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
      
      // Start polling stats based on background tasks
      startStatsPolling();
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
    // Block if we have pending retries (requires explicit user action)
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
      
      // Navigate to discovery progress page
      navigate(`/discovery-progress/${migrationId}`);
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
        setToast({
          message: result.error || "Failed to start retry discovery",
          type: "error",
        });
        setIsTriggeringSweep(false);
        return;
      }
      
      // Navigate to discovery progress page
      navigate(`/discovery-progress/${migrationId}?isMonitoringSweep=true&sweepType=retry`);
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
      <div className="path-review__content path-review__content--with-button">
        <button
          type="button"
          className="path-review__back"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={16} style={{ marginRight: "0.5rem" }} />
          Back
        </button>
        <header className="path-review__header">
          <h1>
            Review the <span className="path-review__highlight">Action Plan</span>
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
              <ArrowLeft size={20 * zoomLevel} />
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
                <ChevronRight size={16 * zoomLevel} className="path-review__breadcrumb-separator" />
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

        {/* Status Legend */}
        {!loading && items.length > 0 && (
          <PathReviewLegend zoomLevel={zoomLevel} />
        )}

        {/* Items List */}
        <div className="path-review__list-container">
          <div 
            className="path-review__list" 
            style={{ 
              '--zoom': zoomLevel,
            } as React.CSSProperties}
          >
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
                  const srcTraversalStatus = item.src?.traversalStatus;
                  const dstTraversalStatus = item.dst?.traversalStatus;
                  const hasFailedStatus = srcTraversalStatus === "failed" || dstTraversalStatus === "failed";
                  const hasPendingStatus = (srcTraversalStatus === "pending" || dstTraversalStatus === "pending") && !hasFailedStatus;
                  const isMarkedForRetry = hasPendingStatus || (retryItems.has(item.id) && !hasFailedStatus);
                  const isHighlighted = highlightedItemId === item.id;
                  // isChecked is based on copyStatus: not excluded and not successful
                  const isChecked = !status.isExcluded && !status.isSuccessful;

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
                          zoomLevel={zoomLevel}
                          onRetryClick={handleRetryClick}
                          onExcludeClick={handleCheckboxChange}
                        />
                      </div>

                      <div className="path-review__item-icon">
                        {isFolder ? (
                          <Folder size={24 * zoomLevel} color="#ffffff" />
                        ) : (
                          <File size={24 * zoomLevel} color="#ffffff" />
                        )}
                      </div>

                      <div
                        className={`path-review__item-info ${isFolder ? "path-review__item-info--folder" : "path-review__item-info--file"}`}
                        onClick={() => {
                          if (isFolder && !status.isExcluded && !status.isFailed && !status.existsOnlyOnDst) {
                            handleFolderClick(item);
                          }
                        }}
                        style={{ 
                          cursor: isFolder && !status.isExcluded && !status.isFailed && !status.existsOnlyOnDst
                            ? "pointer" 
                            : (status.isExcluded || status.isFailed || status.existsOnlyOnDst) 
                            ? "not-allowed" 
                            : "default" 
                        }}
                      >
                        <div className={`path-review__item-name ${isFolder ? "path-review__item-name--folder" : ""}`}>{item.name}</div>
                        {!isFolder && item.size !== undefined && (
                          <div className="path-review__item-meta">
                            {(item.size / 1024 / 1024).toFixed(2)} MB
                          </div>
                        )}
                      </div>

                      {isFolder && (
                        <ChevronRight
                          size={20 * zoomLevel}
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
                    onClick={() => loadItems(currentNodeId, true)}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading..." : "Load More"}
                  </button>
                )}
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
              onItemUpdate={() => {
                // Reload items will trigger stats update automatically
                // Start polling stats based on background tasks
                startStatsPolling();
              }}
              onStatsChange={handleStatsChange}
              onSelectionStatsWarning={handleSelectionWarning}
              onPaginationChange={handlePaginationChange}
              onNavigateToTreeView={navigateToTreeView}
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
          <ZoomControl />
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
              <div className="path-review__iteration-counter" style={{ fontSize: `${zoomLevel * 0.9}rem` }}>
                Review {reviewIteration}
              </div>
            )}
            
            {/* Retry Discovery or Start Copying Button */}
            {(stats?.pendingRetriesCount ?? 0) > 0 ? (
              <button
                type="button"
                className="glass-button"
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
                className="glass-button"
                onClick={handleStartCopying}
                disabled={!checkCanStartCopy() || hasRunningTasks}
                title={
                  !checkCanStartCopy()
                    ? migrationStatus
                      ? (() => {
                          const checkpointStatus = (migrationStatus as any).checkpointStatus;
                          if (checkpointStatus && checkpointStatus !== "Awaiting-Path-Review") {
                            return `Migration checkpoint: ${checkpointStatus} (needs: Awaiting-Path-Review)`;
                          }
                          if (!checkpointStatus && migrationStatus.status !== "completed") {
                            return `Migration status: ${migrationStatus.status} (needs: completed)`;
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
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <ConfirmDialog
          title={confirmDialogType === "retry" ? "Retry Discovery" : "Confirm Copy"}
          message={
            confirmDialogType === "retry"
              ? "We'll try to discover what is in those folders that you marked to retry. We'll send you back here to review the results when the process is complete. Would you like to proceed?"
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