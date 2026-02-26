import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, FolderOpen, Cloud, Eye, Copy, ArrowRight } from "lucide-react";

import {
  getMigrationStatus,
  getMigrationQueueMetrics,
  fetchServices,
} from "../api/services";
import { useSelection } from "../context/SelectionContext";
import HelpTooltip from "../components/HelpTooltip";
import "./DiscoveryProgress.css";

const STATUS_POLL_INTERVAL = 1000;

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
  const [error, setError] = useState<string | null>(null);
  const [allServices, setAllServices] = useState(services);
  const [showResultsButton, setShowResultsButton] = useState(false);

  const isTerminalStateRef = useRef(false);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueMetricsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Phase detection helpers
  const isCopyPhase = (status?: string): boolean => {
    return status === "Awaiting-Copy-Review" || 
           status === "Preparing-For-Copy" || 
           status === "Copy-In-Progress" || 
           status === "Copy-Complete";
  };

  // Check if migration is in a terminal state (no longer running)
  const isTerminalState = (status?: string) => {
    return status === "Awaiting-Path-Review" || 
           status === "Awaiting-Copy-Review" || 
           status === "Complete" || 
           status === "failed" || 
           status === "suspended";
  };

  // Format bytes to human-readable format
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(2)} ${sizes[i]}`;
  };

  // Format bytes per second to human-readable format (e.g., "1.5 MB/s")
  const formatBytesPerSec = (bytesPerSec: number): string => {
    if (bytesPerSec === 0) return "0 B/s";
    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    const value = bytesPerSec / Math.pow(k, i);
    return `${value.toFixed(2)} ${sizes[i]}`;
  };

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

  // Check if migration is ready for path review to show results button
  // But block it if we're monitoring a retry sweep (wait for retry to complete)
  useEffect(() => {
    if (
      status?.status === "Awaiting-Path-Review" || 
      status?.status === "Awaiting-Copy-Review" || 
      status?.status === "Complete"
    ) {
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
    
    // Navigate when status changes to Awaiting-Path-Review (traversal complete)
    if (prevStatus !== "Awaiting-Path-Review" && (currentStatus === "Awaiting-Path-Review" || currentStatus === "Awaiting-Copy-Review")) {
      // Sweep completed successfully - navigate back to path review
      const nextIteration = reviewIteration + 1;
      setReviewIteration(nextIteration);
      navigate(`/path-review/${migrationId}?reviewIteration=${nextIteration}`);
    } else if (prevStatus === "running" && currentStatus === "failed") {
      // Sweep failed - show error but stay on monitor page
      setError("Sweep failed.");
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

    // Set up status polling (every 500ms) - always poll status to detect completion
    statusIntervalRef.current = setInterval(() => {
      fetchStatus();
    }, STATUS_POLL_INTERVAL);

    // Set up queue metrics polling (every 500ms) - only if not terminal
    queueMetricsIntervalRef.current = setInterval(() => {
      if (!isTerminalStateRef.current) {
        fetchQueueMetrics();
      }
    }, STATUS_POLL_INTERVAL);

    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
      if (queueMetricsIntervalRef.current) {
        clearInterval(queueMetricsIntervalRef.current);
      }
    };
  }, [migrationId, navigate, fetchStatus, fetchQueueMetrics]);

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
    <section className="discovery-progress">
      <div className="discovery-progress__content">
        <button
          type="button"
          className="discovery-progress__back"
          onClick={() => navigate("/")}
        >
          <ArrowLeft size={16} style={{ marginRight: "0.5rem" }} />
          Back to home
        </button>
        <header className="discovery-progress__header">
          <h1>
            {isCopyPhase(status?.status) ? (
              <>Copy <span className="discovery-progress__highlight">Progress</span></>
            ) : (
              <>Discovery <span className="discovery-progress__highlight">Progress</span></>
            )}
          </h1>
        </header>

        {error && (
          <div className="discovery-progress__error">{error}</div>
        )}

        {/* Metrics Section */}
        <div className="discovery-progress__metrics">
            <div className={`discovery-progress__metric-card ${isCopyPhase(status?.status) ? 'discovery-progress__metric-card--split' : ''}`}>
              {isCopyPhase(status?.status) ? (
                // Copy phase: split header with Source (left) and Destination (right)
                <>
                  <div className="discovery-progress__metric-header-split">
                    <div className="discovery-progress__metric-header-half discovery-progress__metric-header-half--source">
                      <div className="discovery-progress__metric-header-top">
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
                            <span className="discovery-progress__metric-context-value" title={source?.root?.locationPath || source?.root?.name || ""}>
                              {source?.root?.locationPath || source?.root?.name || "Not specified"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="discovery-progress__metric-context discovery-progress__metric-context--empty" />
                      )}
                    </div>
                    <div className="discovery-progress__metric-header-arrow">
                      <ArrowRight size={24} />
                    </div>
                    <div className="discovery-progress__metric-header-half discovery-progress__metric-header-half--destination">
                      <div className="discovery-progress__metric-header-top">
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
                            <span className="discovery-progress__metric-context-value" title={destination?.root?.locationPath || destination?.root?.name || ""}>
                              {destination?.root?.locationPath || destination?.root?.name || "Not specified"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="discovery-progress__metric-context discovery-progress__metric-context--empty" />
                      )}
                    </div>
                  </div>
                </>
              ) : (
                // Traversal phase: normal header
                <>
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
                        <span className="discovery-progress__metric-context-value" title={source?.root?.locationPath || source?.root?.name || ""}>
                          {source?.root?.locationPath || source?.root?.name || "Not specified"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="discovery-progress__metric-context discovery-progress__metric-context--empty" />
                  )}
                </>
              )}
              {isCopyPhase(status?.status) ? (
                // Copy phase: show simplified copy metrics from copy queue
                queueMetrics?.copy ? (
                  <div className="discovery-progress__metric-details">
                    {/* Totals */}
                    <div className="discovery-progress__metric-row">
                      <span>Folders:</span>
                      <span>{(queueMetrics.copy.folders || 0).toLocaleString()}</span>
                    </div>
                    <div className="discovery-progress__metric-row">
                      <span>Files:</span>
                      <span>{(queueMetrics.copy.files || 0).toLocaleString()}</span>
                    </div>
                    <div className="discovery-progress__metric-row">
                      <span>Total:</span>
                      <span>{(queueMetrics.copy.total || 0).toLocaleString()}</span>
                    </div>
                    {/* Total bytes moved - API may not return this yet, show 0 if not available */}
                    <div className="discovery-progress__metric-row">
                      <span>Bytes:</span>
                      <span>{formatBytes(
                        queueMetrics.copy.bytes_copied_total || 
                        queueMetrics.copy.total_bytes_copied || 
                        queueMetrics.copy.bytes_total || 
                        0
                      )}</span>
                    </div>
                    {/* Rates */}
                    <div className="discovery-progress__metric-row">
                      <span>Items/sec:</span>
                      <span>{(queueMetrics.copy.items_per_second || 0).toFixed(1)}</span>
                    </div>
                    {/* Bytes per second - API may not return this yet, show 0 if not available */}
                    <div className="discovery-progress__metric-row">
                      <span>Bytes/sec:</span>
                      <span>{formatBytesPerSec(
                        queueMetrics.copy.bytes_per_sec || 
                        queueMetrics.copy.copy_rate_bytes_per_sec || 
                        queueMetrics.copy.bytes_copied_per_sec || 
                        0
                      )}</span>
                    </div>
                  </div>
                ) : (
                  <div className="discovery-progress__metric-empty">Not started</div>
                )
              ) : (
                // Traversal phase: show discovery metrics from srcTraversal
                queueMetrics?.srcTraversal ? (
                  <div className="discovery-progress__metric-details">
                    {queueMetrics.srcTraversal.discovery_rate_items_per_sec !== undefined && (
                      <div className="discovery-progress__metric-row">
                        <span>
                          Discovery Rate:
                          <HelpTooltip
                            tipId="discovery-rate-explanation"
                            category="discovery-rate-source"
                            position="above"
                            content={
                              <p>
                                The discovery rate shows how many files and folders are being discovered per second. This is an exponentially weighted moving average (EMA) that smooths out short-term fluctuations to give you a more stable view of the discovery progress.
                              </p>
                            }
                          />
                        </span>
                        <span>{queueMetrics.srcTraversal.discovery_rate_items_per_sec.toFixed(1)} items/sec</span>
                      </div>
                    )}
                    {queueMetrics.srcTraversal.folders_discovered_total !== undefined && (
                      <div className="discovery-progress__metric-row">
                        <span>Folders Discovered:</span>
                        <span>{queueMetrics.srcTraversal.folders_discovered_total.toLocaleString()}</span>
                      </div>
                    )}
                    {queueMetrics.srcTraversal.files_discovered_total !== undefined && (
                      <div className="discovery-progress__metric-row">
                        <span>Files Discovered:</span>
                        <span>{queueMetrics.srcTraversal.files_discovered_total.toLocaleString()}</span>
                      </div>
                    )}
                    {queueMetrics.srcTraversal.total_discovered !== undefined && (
                      <div className="discovery-progress__metric-row">
                        <span>Total Discovered:</span>
                        <span>{queueMetrics.srcTraversal.total_discovered.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="discovery-progress__metric-empty">Not started</div>
                )
              )}
            </div>

            {/* Destination card - only show in traversal phase */}
            {!isCopyPhase(status?.status) && (
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
                      <span className="discovery-progress__metric-context-value" title={destination?.root?.locationPath || destination?.root?.name || ""}>
                        {destination?.root?.locationPath || destination?.root?.name || "Not specified"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="discovery-progress__metric-context discovery-progress__metric-context--empty" />
                )}
                {queueMetrics?.dstTraversal ? (
                  <div className="discovery-progress__metric-details">
                    {queueMetrics.dstTraversal.discovery_rate_items_per_sec !== undefined && (
                      <div className="discovery-progress__metric-row">
                        <span>
                          Discovery Rate:
                          <HelpTooltip
                            tipId="discovery-rate-explanation-dst"
                            category="discovery-rate-destination"
                            position="above"
                            content={
                              <p>
                                The discovery rate shows how many files and folders are being discovered per second. This is an exponentially weighted moving average (EMA) that smooths out short-term fluctuations to give you a more stable view of the discovery progress.
                              </p>
                            }
                          />
                        </span>
                        <span>{queueMetrics.dstTraversal.discovery_rate_items_per_sec.toFixed(1)} items/sec</span>
                      </div>
                    )}
                    {queueMetrics.dstTraversal.folders_discovered_total !== undefined && (
                      <div className="discovery-progress__metric-row">
                        <span>Folders Discovered:</span>
                        <span>{queueMetrics.dstTraversal.folders_discovered_total.toLocaleString()}</span>
                      </div>
                    )}
                    {queueMetrics.dstTraversal.files_discovered_total !== undefined && (
                      <div className="discovery-progress__metric-row">
                        <span>Files Discovered:</span>
                        <span>{queueMetrics.dstTraversal.files_discovered_total.toLocaleString()}</span>
                      </div>
                    )}
                    {queueMetrics.dstTraversal.total_discovered !== undefined && (
                      <div className="discovery-progress__metric-row">
                        <span>
                          Total Discovered:
                          <HelpTooltip
                            tipId="destination-total-discovered-explanation"
                            category="discovery-destination-total"
                            position="above"
                            content={
                              <p>This is specifically only the overlapping items explored, not the total items inside of your destination root folder.</p>
                            }
                          />
                        </span>
                        <span>{queueMetrics.dstTraversal.total_discovered.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="discovery-progress__metric-empty">Not started</div>
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
          
          {/* View Discovery Results or Copy Results Button (when traversal/copy completed) */}
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
              {isCopyPhase(status?.status) || status?.status === "Awaiting-Copy-Review"
                ? "View Copy Results"
                : "View Discovery Results"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

