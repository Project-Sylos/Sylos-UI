import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Activity, ArrowLeft, ChevronDown, ChevronRight, FolderOpen, Cloud, Eye } from "lucide-react";

import {
  getMigrationStatus,
  getMigrationLogs,
  getMigrationQueueMetrics,
  fetchServices,
} from "../api/services";
import { MigrationLog, LogLevel } from "../types/migrations";
import { useSelection } from "../context/SelectionContext";
import "./DiscoveryProgress.css";

const LOG_LEVELS: LogLevel[] = ["trace", "debug", "info", "warning", "error", "critical"];
const MAX_LOG_LINES = 10000;
const STATUS_POLL_INTERVAL = 200;
const LOG_POLL_INTERVAL = 500;

interface MergedLog extends MigrationLog {
  timestamp: number;
  displayTime: string;
}

export default function DiscoveryProgress() {
  const { migrationId } = useParams<{ migrationId: string }>();
  const navigate = useNavigate();
  const { source, destination, services } = useSelection();
  const [searchParams] = useSearchParams();

  // Sweep monitoring state
  const phase = searchParams.get("phase");
  const sweepType = searchParams.get("type");
  const isMonitoringSweep = phase === "sweep" && (sweepType === "exclusion" || sweepType === "retry");
  const [reviewIteration, setReviewIteration] = useState(1);
  const prevStatusRef = useRef<string | null>(null);

  const [status, setStatus] = useState<any>(null);
  const [queueMetrics, setQueueMetrics] = useState<any>(null);
  const [logs, setLogs] = useState<MergedLog[]>([]);
  const [filterLevel, setFilterLevel] = useState<LogLevel | "all">("all");
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const [isLogPollingPaused, setIsLogPollingPaused] = useState(false);
  const [isLogsCollapsed, setIsLogsCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allServices, setAllServices] = useState(services);
  const [showResultsButton, setShowResultsButton] = useState(false);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const isLogPollingPausedRef = useRef(false);
  const isTerminalStateRef = useRef(false);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueMetricsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check if migration is in a terminal state (no longer running)
  const isTerminalState = (status?: string) => {
    return status === "completed" || status === "failed" || status === "suspended";
  };

  // Format timestamp for display
  const formatTimestamp = (timestamp?: string): string => {
    if (!timestamp) return "";
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3,
      });
    } catch {
      return timestamp;
    }
  };

  // Merge and sort logs by timestamp
  const mergeAndSortLogs = useCallback((newLogs: MigrationLog[], existingLogs: MergedLog[]): MergedLog[] => {
    const merged: MergedLog[] = newLogs.map((log) => {
      const timestamp = log.data?.timestamp
        ? new Date(log.data.timestamp).getTime()
        : Date.now();
      return {
        ...log,
        timestamp,
        displayTime: formatTimestamp(log.data?.timestamp),
      };
    });

    // Combine with existing logs
    const combined = [...existingLogs, ...merged];
    
    // Remove duplicates by ID
    const uniqueLogs = Array.from(
      new Map(combined.map((log) => [log.id, log])).values()
    );

    // Sort by timestamp descending (newest first)
    uniqueLogs.sort((a, b) => b.timestamp - a.timestamp);

    // Keep only the most recent MAX_LOG_LINES
    return uniqueLogs.slice(0, MAX_LOG_LINES);
  }, []);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    if (!migrationId) return;

    try {
      const statusData = await getMigrationStatus(migrationId);
      setStatus(statusData);
      
      // Update terminal state ref
      const isTerminal = isTerminalState(statusData.status);
      isTerminalStateRef.current = isTerminal;
      
      // Stop all polling if migration reached terminal state
      if (isTerminal) {
        if (statusIntervalRef.current) {
          clearInterval(statusIntervalRef.current);
          statusIntervalRef.current = null;
        }
        if (queueMetricsIntervalRef.current) {
          clearInterval(queueMetricsIntervalRef.current);
          queueMetricsIntervalRef.current = null;
        }
        if (logIntervalRef.current) {
          clearInterval(logIntervalRef.current);
          logIntervalRef.current = null;
        }
      }
    } catch (err) {
      console.error("Failed to fetch status:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    }
  }, [migrationId]);

  // Fetch queue metrics
  const fetchQueueMetrics = useCallback(async () => {
    if (!migrationId) return;

    try {
      const response = await getMigrationQueueMetrics(migrationId);
      
      // Handle structured response - ignore non-critical database errors
      if (!response.success) {
        if (response.errorCode === "DATABASE_NOT_AVAILABLE") {
          // Database closed after migration completed - this is expected, ignore it
          return;
        }
        // Other errors - log but don't throw
        console.warn("Queue metrics error:", response.errorCode, response.error);
        return;
      }
      
      // Only update if we have valid data
      if (response.srcTraversal !== undefined || response.dstTraversal !== undefined) {
        setQueueMetrics({
          srcTraversal: response.srcTraversal ?? null,
          dstTraversal: response.dstTraversal ?? null,
          copy: response.copy ?? null,
        });
      }
    } catch (err) {
      // Only log actual network/HTTP errors
      console.error("Failed to fetch queue metrics:", err);
    }
  }, [migrationId]);

  // Fetch logs - filter duplicates on frontend using in-memory map
  const fetchLogs = useCallback(async () => {
    if (!migrationId) return;

    try {
      // Fetch all logs without lastSeenIds - API returns up to 1K per level
      const response = await getMigrationLogs(migrationId, {});

      // Handle structured response - ignore non-critical database errors
      if (!response.success) {
        if (response.errorCode === "DATABASE_NOT_AVAILABLE") {
          // Database closed after migration completed - this is expected, ignore it
          return;
        }
        // Other errors - log but don't throw
        console.warn("Logs error:", response.errorCode, response.error);
        return;
      }

      // Only process if we have valid logs data
      if (!response.logs) {
        return;
      }

      // Collect all logs and filter out duplicates using our in-memory map
      const allLogs: MigrationLog[] = [];
      Object.entries(response.logs).forEach(([level, levelLogs]) => {
        if (levelLogs && levelLogs.length > 0) {
          allLogs.push(...levelLogs);
        }
      });

      if (allLogs.length > 0) {
        setLogs((prevLogs) => {
          // Filter out logs we've already seen by checking IDs
          const existingIds = new Set(prevLogs.map((log) => log.id));
          const newLogs = allLogs.filter((log) => !existingIds.has(log.id));
          
          if (newLogs.length > 0) {
            return mergeAndSortLogs(newLogs, prevLogs);
          }
          return prevLogs;
        });
      }
    } catch (err) {
      // Only log actual network/HTTP errors
      console.error("Failed to fetch logs:", err);
    }
  }, [migrationId, mergeAndSortLogs]);

  // Handle scroll to detect user scrolling up
  const handleScroll = useCallback(() => {
    if (!logContainerRef.current) return;

    const container = logContainerRef.current;
    const isAtBottom =
      container.scrollHeight - container.scrollTop <= container.clientHeight + 10;

    if (isAtBottom) {
      const wasPaused = isLogPollingPausedRef.current;
      setIsAutoScrolling(true);
      setIsLogPollingPaused(false);
      isLogPollingPausedRef.current = false;
      userScrolledRef.current = false;
      
      // If we were paused and now resumed, fetch logs immediately to catch up
      if (wasPaused && migrationId) {
        fetchLogs();
      }
    } else {
      setIsAutoScrolling(false);
      setIsLogPollingPaused(true);
      isLogPollingPausedRef.current = true;
      userScrolledRef.current = true;
    }
  }, [migrationId, fetchLogs]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isAutoScrolling && logContainerRef.current && !userScrolledRef.current) {
      const container = logContainerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [logs, isAutoScrolling]);

  // Check if migration is completed to show results button
  // But block it if we're monitoring a retry sweep (wait for retry to complete)
  useEffect(() => {
    if (status?.status === "completed") {
      // If monitoring a retry sweep, don't show results button yet
      // Wait for the retry to complete and navigate back to path review
      if (isMonitoringSweep && sweepType === "retry") {
        setShowResultsButton(false);
      } else {
        setShowResultsButton(true);
      }
    } else {
      setShowResultsButton(false);
    }
  }, [status?.status, isMonitoringSweep, sweepType]);
  
  // Handle sweep completion - navigate back to path review
  useEffect(() => {
    if (!isMonitoringSweep || !status?.status) return;
    
    const currentStatus = status.status;
    const prevStatus = prevStatusRef.current;
    
    // Only navigate when status changes from running to completed
    if (prevStatus === "running" && currentStatus === "completed") {
      // Sweep completed successfully - navigate back to path review
      const nextIteration = reviewIteration + 1;
      setReviewIteration(nextIteration);
      navigate(`/path-review/${migrationId}?reviewIteration=${nextIteration}`);
    } else if (prevStatus === "running" && currentStatus === "failed") {
      // Sweep failed - show error but stay on monitor page
      setError("Sweep failed. Please check the logs for details.");
    }
    
    prevStatusRef.current = currentStatus;
  }, [isMonitoringSweep, status?.status, migrationId, navigate, reviewIteration]);

  // Set up polling intervals
  useEffect(() => {
    if (!migrationId) {
      navigate("/");
      return;
    }

    // Initial fetch
    fetchStatus();
    fetchQueueMetrics();
    fetchLogs();

    // Set up status polling (every 200ms) - always poll status to detect completion
    statusIntervalRef.current = setInterval(() => {
      fetchStatus();
    }, STATUS_POLL_INTERVAL);

    // Set up queue metrics polling (every 200ms) - only if not terminal
    queueMetricsIntervalRef.current = setInterval(() => {
      if (!isTerminalStateRef.current) {
        fetchQueueMetrics();
      }
    }, STATUS_POLL_INTERVAL);

    // Set up log polling (every 500ms) - only if not terminal and not paused
    logIntervalRef.current = setInterval(() => {
      if (!isTerminalStateRef.current && !isLogPollingPausedRef.current) {
        fetchLogs();
      }
    }, LOG_POLL_INTERVAL);

    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
      if (queueMetricsIntervalRef.current) {
        clearInterval(queueMetricsIntervalRef.current);
      }
      if (logIntervalRef.current) {
        clearInterval(logIntervalRef.current);
      }
    };
  }, [migrationId, navigate, fetchStatus, fetchQueueMetrics, fetchLogs]);

  // Filter logs by level
  const filteredLogs = logs.filter((log) => {
    if (filterLevel === "all") return true;
    return log.level === filterLevel;
  });

  // Reverse for display (oldest first)
  const displayLogs = [...filteredLogs].reverse();

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "running":
        return "#60a5fa";
      case "completed":
        return "#34d399";
      case "suspended":
        return "#fbbf24";
      case "failed":
        return "#f87171";
      default:
        return "#94a3b8";
    }
  };

  const getLogLevelColor = (level: LogLevel) => {
    switch (level) {
      case "trace":
        return "#94a3b8";
      case "debug":
        return "#60a5fa";
      case "info":
        return "#34d399";
      case "warning":
        return "#fbbf24";
      case "error":
        return "#f87171";
      case "critical":
        return "#dc2626";
      default:
        return "#f8fafc";
    }
  };

  if (!migrationId) {
    return null;
  }

  // Fetch services if not available in context
  useEffect(() => {
    if (services.length > 0) {
      setAllServices(services);
    } else if (allServices.length === 0) {
      fetchServices().then(setAllServices).catch(console.error);
    }
  }, [services, allServices.length]);

  // Get service type from status or context
  const getSourceServiceType = () => {
    if (source?.service?.type) return source.service.type;
    if (status?.sourceId) {
      const service = allServices.find((s) => s.id === status.sourceId);
      return service?.type;
    }
    return undefined;
  };

  const getDestinationServiceType = () => {
    if (destination?.service?.type) return destination.service.type;
    if (status?.destinationId) {
      const service = allServices.find((s) => s.id === status.destinationId);
      return service?.type;
    }
    return undefined;
  };

  // Determine icons based on service type
  const getServiceIcon = (serviceType?: string) => {
    if (serviceType === "local") {
      return <FolderOpen size={18} style={{ marginRight: "0.5rem" }} />;
    }
    return <Cloud size={18} style={{ marginRight: "0.5rem" }} />;
  };

  return (
    <section className={`discovery-progress ${!isLogsCollapsed ? 'discovery-progress--logs-expanded' : ''}`}>
      <button
        type="button"
        className="discovery-progress__back"
        onClick={() => navigate("/")}
      >
        <ArrowLeft size={16} style={{ marginRight: "0.5rem" }} />
        Back to home
      </button>

      <div className={`discovery-progress__content ${isLogsCollapsed ? 'discovery-progress__content--logs-collapsed' : ''}`}>
        <header className="discovery-progress__header">
          <h1>
            Discovery <span className="discovery-progress__highlight">Progress</span>
          </h1>
          <div className="discovery-progress__status-indicator">
            <Activity
              size={16}
              style={{
                color: getStatusColor(status?.status),
                marginRight: "0.5rem",
              }}
            />
            <span
              className="discovery-progress__status-text"
              style={{ color: getStatusColor(status?.status) }}
            >
              {isMonitoringSweep
                ? sweepType === "exclusion"
                  ? "Exclusion sweep in progress..."
                  : sweepType === "retry"
                  ? "Retry sweep in progress..."
                  : status?.status?.toUpperCase() || "UNKNOWN"
                : status?.status?.toUpperCase() || "UNKNOWN"}
            </span>
            {status?.status === "running" && (
              <span className="discovery-progress__pulse" />
            )}
          </div>
        </header>

        {error && (
          <div className="discovery-progress__error">{error}</div>
        )}

        {/* Metrics Section */}
        {queueMetrics && (
          <div className="discovery-progress__metrics">
            <div className="discovery-progress__metric-card">
              <div className="discovery-progress__metric-header">
                <div className="discovery-progress__metric-service">
                  {getServiceIcon(getSourceServiceType())}
                  <span>{source?.service?.displayName || status?.sourceId || "Unknown"}</span>
                </div>
                <h3 className="discovery-progress__metric-title discovery-progress__metric-title--source">
                  Source
                </h3>
              </div>
              {(source?.root?.locationPath && source.root.locationPath !== '/') ? (
                <div className="discovery-progress__metric-context">
                  <div className="discovery-progress__metric-context-row">
                    <span className="discovery-progress__metric-context-label">Root Path:</span>
                    <span className="discovery-progress__metric-context-value" title={source?.root?.locationPath || source?.root?.displayName || ""}>
                      {source?.root?.locationPath || source?.root?.displayName || "Not specified"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="discovery-progress__metric-context discovery-progress__metric-context--empty" />
              )}
              {queueMetrics.srcTraversal ? (
                <div className="discovery-progress__metric-details">
                  <div className="discovery-progress__metric-row">
                    <span>Round:</span>
                    <span>{queueMetrics.srcTraversal.round}</span>
                  </div>
                  <div className="discovery-progress__metric-row">
                    <span>Pending:</span>
                    <span>{queueMetrics.srcTraversal.pending}</span>
                  </div>
                  <div className="discovery-progress__metric-row">
                    <span>In Progress:</span>
                    <span>{queueMetrics.srcTraversal.inProgress}</span>
                  </div>
                  <div className="discovery-progress__metric-row">
                    <span>Total Tracked:</span>
                    <span>{queueMetrics.srcTraversal.totalTracked}</span>
                  </div>
                  <div className="discovery-progress__metric-row">
                    <span>Workers:</span>
                    <span>{queueMetrics.srcTraversal.workers}</span>
                  </div>
                  {queueMetrics.srcTraversal.tasksPerSecond !== undefined && (
                    <div className="discovery-progress__metric-row">
                      <span>Tasks/sec:</span>
                      <span>{queueMetrics.srcTraversal.tasksPerSecond.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="discovery-progress__metric-empty">Not started</div>
              )}
            </div>

            <div className="discovery-progress__metric-card">
              <div className="discovery-progress__metric-header">
                <div className="discovery-progress__metric-service">
                  {getServiceIcon(getDestinationServiceType())}
                  <span>{destination?.service?.displayName || status?.destinationId || "Unknown"}</span>
                </div>
                <h3 className="discovery-progress__metric-title discovery-progress__metric-title--destination">
                  Destination
                </h3>
              </div>
              {(destination?.root?.locationPath && destination.root.locationPath !== '/') ? (
                <div className="discovery-progress__metric-context">
                  <div className="discovery-progress__metric-context-row">
                    <span className="discovery-progress__metric-context-label">Root Path:</span>
                    <span className="discovery-progress__metric-context-value" title={destination?.root?.locationPath || destination?.root?.displayName || ""}>
                      {destination?.root?.locationPath || destination?.root?.displayName || "Not specified"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="discovery-progress__metric-context discovery-progress__metric-context--empty" />
              )}
              {queueMetrics.dstTraversal ? (
                <div className="discovery-progress__metric-details">
                  <div className="discovery-progress__metric-row">
                    <span>Round:</span>
                    <span>{queueMetrics.dstTraversal.round}</span>
                  </div>
                  <div className="discovery-progress__metric-row">
                    <span>Pending:</span>
                    <span>{queueMetrics.dstTraversal.pending}</span>
                  </div>
                  <div className="discovery-progress__metric-row">
                    <span>In Progress:</span>
                    <span>{queueMetrics.dstTraversal.inProgress}</span>
                  </div>
                  <div className="discovery-progress__metric-row">
                    <span>Total Tracked:</span>
                    <span>{queueMetrics.dstTraversal.totalTracked}</span>
                  </div>
                  <div className="discovery-progress__metric-row">
                    <span>Workers:</span>
                    <span>{queueMetrics.dstTraversal.workers}</span>
                  </div>
                  {queueMetrics.dstTraversal.tasksPerSecond !== undefined && (
                    <div className="discovery-progress__metric-row">
                      <span>Tasks/sec:</span>
                      <span>{queueMetrics.dstTraversal.tasksPerSecond.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="discovery-progress__metric-empty">Not started</div>
              )}
            </div>
          </div>
        )}

        {/* Log Terminal Section */}
        <div className="discovery-progress__terminal-section">
          <div className="discovery-progress__terminal-header">
            <div 
              className="discovery-progress__terminal-title"
              onClick={() => setIsLogsCollapsed(!isLogsCollapsed)}
            >
              {isLogsCollapsed ? (
                <ChevronRight size={18} style={{ marginRight: "0.5rem" }} />
              ) : (
                <ChevronDown size={18} style={{ marginRight: "0.5rem" }} />
              )}
              Logs ({displayLogs.length.toLocaleString()})
            </div>
            {!isLogsCollapsed && (
              <select
                className="discovery-progress__log-filter"
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value as LogLevel | "all")}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="all">All Levels</option>
                {LOG_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level.toUpperCase()}
                  </option>
                ))}
              </select>
            )}
          </div>
          {!isLogsCollapsed && (
            <div
              className="discovery-progress__terminal"
              ref={logContainerRef}
              onScroll={handleScroll}
            >
            {displayLogs.length === 0 ? (
              <div className="discovery-progress__terminal-empty">
                No logs available
              </div>
            ) : (
              displayLogs.map((log) => (
                <div
                  key={log.id}
                  className="discovery-progress__log-line"
                  style={{
                    borderLeftColor: getLogLevelColor(log.level),
                  }}
                >
                  <span className="discovery-progress__log-time">
                    {log.displayTime || "N/A"}
                  </span>
                  <span
                    className="discovery-progress__log-level"
                    style={{ color: getLogLevelColor(log.level) }}
                  >
                    [{log.level.toUpperCase()}]
                  </span>
                  <span className="discovery-progress__log-message">
                    {log.data?.message || JSON.stringify(log.data)}
                  </span>
                </div>
              ))
            )}
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="discovery-progress__footer">
          {/* Return to Path Review Button (when monitoring sweep) */}
          {isMonitoringSweep && (
            <button
              type="button"
              className="discovery-progress__return-button glass-button glass-button--secondary"
              onClick={() => {
                if (migrationId) {
                  navigate(`/path-review/${migrationId}`);
                }
              }}
              title={status?.status === "running" ? "Sweep is still in progress. You can return to review, but the sweep will continue." : "Return to path review"}
            >
              <ArrowLeft size={20} style={{ marginRight: "0.5rem" }} />
              Return to Path Review
            </button>
          )}
          
          {/* See Results Button (when discovery completed) */}
          {!isMonitoringSweep && (
            <button
              type="button"
              className={`discovery-progress__see-results ${
                showResultsButton ? "discovery-progress__see-results--enabled" : ""
              }`}
              onClick={() => {
                if (showResultsButton && migrationId) {
                  navigate(`/path-review/${migrationId}`);
                }
              }}
              disabled={!showResultsButton}
            >
              <Eye size={20} style={{ marginRight: "0.5rem" }} />
              See Results
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

