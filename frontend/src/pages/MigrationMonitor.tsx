import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Activity, ArrowLeft, Terminal, FolderOpen, Cloud } from "lucide-react";

import {
  getMigrationStatus,
  getMigrationLogs,
  getMigrationQueueMetrics,
  fetchServices,
} from "../api/services";
import { MigrationLog, LogLevel } from "../types/migrations";
import { useSelection } from "../context/SelectionContext";
import "./MigrationMonitor.css";

const LOG_LEVELS: LogLevel[] = ["trace", "debug", "info", "warning", "error", "critical"];
const MAX_LOG_LINES = 10000;
const STATUS_POLL_INTERVAL = 200;
const LOG_POLL_INTERVAL = 500;

interface MergedLog extends MigrationLog {
  timestamp: number;
  displayTime: string;
}

export default function MigrationMonitor() {
  const { migrationId } = useParams<{ migrationId: string }>();
  const navigate = useNavigate();
  const { source, destination, services } = useSelection();

  const [status, setStatus] = useState<any>(null);
  const [queueMetrics, setQueueMetrics] = useState<any>(null);
  const [logs, setLogs] = useState<MergedLog[]>([]);
  const [filterLevel, setFilterLevel] = useState<LogLevel | "all">("all");
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const [isLogPollingPaused, setIsLogPollingPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allServices, setAllServices] = useState(services);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const isLogPollingPausedRef = useRef(false);
  const isTerminalStateRef = useRef(false);
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const queueMetricsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const logIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
      const metrics = await getMigrationQueueMetrics(migrationId);
      setQueueMetrics(metrics);
    } catch (err) {
      console.error("Failed to fetch queue metrics:", err);
    }
  }, [migrationId]);

  // Fetch logs - filter duplicates on frontend using in-memory map
  const fetchLogs = useCallback(async () => {
    if (!migrationId) return;

    try {
      // Fetch all logs without lastSeenIds - API returns up to 1K per level
      const response = await getMigrationLogs(migrationId, {});

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
    <section className="migration-monitor">
      <button
        type="button"
        className="migration-monitor__back"
        onClick={() => navigate("/")}
      >
        <ArrowLeft size={16} style={{ marginRight: "0.5rem" }} />
        Back to home
      </button>

      <div className="migration-monitor__content">
        <header className="migration-monitor__header">
          <h1>
            Migration <span className="migration-monitor__highlight">Monitor</span>
          </h1>
          <div className="migration-monitor__status-indicator">
            <Activity
              size={16}
              style={{
                color: getStatusColor(status?.status),
                marginRight: "0.5rem",
              }}
            />
            <span
              className="migration-monitor__status-text"
              style={{ color: getStatusColor(status?.status) }}
            >
              {status?.status?.toUpperCase() || "UNKNOWN"}
            </span>
            {status?.status === "running" && (
              <span className="migration-monitor__pulse" />
            )}
          </div>
        </header>

        {error && (
          <div className="migration-monitor__error">{error}</div>
        )}

        {/* Metrics Section */}
        {queueMetrics && (
          <div className="migration-monitor__metrics">
            <div className="migration-monitor__metric-card">
              <h3 className="migration-monitor__metric-title migration-monitor__metric-title--source">
                {getServiceIcon(getSourceServiceType())}
                Source
              </h3>
              {queueMetrics.srcTraversal ? (
                <div className="migration-monitor__metric-details">
                  <div className="migration-monitor__metric-row">
                    <span>Round:</span>
                    <span>{queueMetrics.srcTraversal.round}</span>
                  </div>
                  <div className="migration-monitor__metric-row">
                    <span>Pending:</span>
                    <span>{queueMetrics.srcTraversal.pending}</span>
                  </div>
                  <div className="migration-monitor__metric-row">
                    <span>In Progress:</span>
                    <span>{queueMetrics.srcTraversal.inProgress}</span>
                  </div>
                  <div className="migration-monitor__metric-row">
                    <span>Total Tracked:</span>
                    <span>{queueMetrics.srcTraversal.totalTracked}</span>
                  </div>
                  <div className="migration-monitor__metric-row">
                    <span>Workers:</span>
                    <span>{queueMetrics.srcTraversal.workers}</span>
                  </div>
                  {queueMetrics.srcTraversal.tasksPerSecond !== undefined && (
                    <div className="migration-monitor__metric-row">
                      <span>Tasks/sec:</span>
                      <span>{queueMetrics.srcTraversal.tasksPerSecond.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="migration-monitor__metric-empty">Not started</div>
              )}
            </div>

            <div className="migration-monitor__metric-card">
              <h3 className="migration-monitor__metric-title migration-monitor__metric-title--destination">
                {getServiceIcon(getDestinationServiceType())}
                Destination
              </h3>
              {queueMetrics.dstTraversal ? (
                <div className="migration-monitor__metric-details">
                  <div className="migration-monitor__metric-row">
                    <span>Round:</span>
                    <span>{queueMetrics.dstTraversal.round}</span>
                  </div>
                  <div className="migration-monitor__metric-row">
                    <span>Pending:</span>
                    <span>{queueMetrics.dstTraversal.pending}</span>
                  </div>
                  <div className="migration-monitor__metric-row">
                    <span>In Progress:</span>
                    <span>{queueMetrics.dstTraversal.inProgress}</span>
                  </div>
                  <div className="migration-monitor__metric-row">
                    <span>Total Tracked:</span>
                    <span>{queueMetrics.dstTraversal.totalTracked}</span>
                  </div>
                  <div className="migration-monitor__metric-row">
                    <span>Workers:</span>
                    <span>{queueMetrics.dstTraversal.workers}</span>
                  </div>
                  {queueMetrics.dstTraversal.tasksPerSecond !== undefined && (
                    <div className="migration-monitor__metric-row">
                      <span>Tasks/sec:</span>
                      <span>{queueMetrics.dstTraversal.tasksPerSecond.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="migration-monitor__metric-empty">Not started</div>
              )}
            </div>
          </div>
        )}

        {/* Log Terminal Section */}
        <div className="migration-monitor__terminal-section">
          <div className="migration-monitor__terminal-header">
            <div className="migration-monitor__terminal-title">
              <Terminal size={18} style={{ marginRight: "0.5rem" }} />
              Logs ({displayLogs.length.toLocaleString()})
            </div>
            <select
              className="migration-monitor__log-filter"
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value as LogLevel | "all")}
            >
              <option value="all">All Levels</option>
              {LOG_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div
            className="migration-monitor__terminal"
            ref={logContainerRef}
            onScroll={handleScroll}
          >
            {displayLogs.length === 0 ? (
              <div className="migration-monitor__terminal-empty">
                No logs available
              </div>
            ) : (
              displayLogs.map((log) => (
                <div
                  key={log.id}
                  className="migration-monitor__log-line"
                  style={{
                    borderLeftColor: getLogLevelColor(log.level),
                  }}
                >
                  <span className="migration-monitor__log-time">
                    {log.displayTime || "N/A"}
                  </span>
                  <span
                    className="migration-monitor__log-level"
                    style={{ color: getLogLevelColor(log.level) }}
                  >
                    [{log.level.toUpperCase()}]
                  </span>
                  <span className="migration-monitor__log-message">
                    {log.data?.message || JSON.stringify(log.data)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

