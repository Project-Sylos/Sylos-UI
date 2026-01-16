import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, CheckCircle2, RotateCcw, RefreshCw, Square } from "lucide-react";

import "../App.css";
import OverwriteDialog from "../components/OverwriteDialog";
import PageContainer from "../components/PageContainer";
import {
  listMigrations,
  stopMigration,
  getMigrationStatus,
  uploadMigrationDB,
} from "../api/services";
import { MigrationWithStatus } from "../types/migrations";
import { pickDBFile, formatDate } from "../utils/fileUpload";
import { useSelection } from "../context/SelectionContext";
import "./ResumeMigration.css";

export default function ResumeMigration() {
  const navigate = useNavigate();
  const { updateMigration } = useSelection();
  const [migrations, setMigrations] = useState<MigrationWithStatus[]>([]);
  const [selectedMigrationId, setSelectedMigrationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [resumeSuccess, setResumeSuccess] = useState<string | null>(null);
  const [stopSuccess, setStopSuccess] = useState<string | null>(null);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{
    file: File;
    filename: string;
  } | null>(null);

  useEffect(() => {
    loadMigrations();
  }, []);

  const loadMigrations = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listMigrations();
      
      // Transform the API response to MigrationWithStatus format
      const migrationsWithStatus: MigrationWithStatus[] = response.migrations.map((migration) => {
        return {
          id: migration.id,
          name: migration.id, // Use ID as name since API doesn't return name
          configPath: "", // API doesn't return configPath
          createdAt: migration.startedAt || new Date().toISOString(),
          status: migration.status,
          sourceId: migration.sourceId,
          destinationId: migration.destinationId,
          startedAt: migration.startedAt,
          completedAt: migration.completedAt,
          error: migration.error,
          result: migration.result,
        } as MigrationWithStatus;
      });
      
      // Sort by createdAt or startedAt, newest first
      const sorted = migrationsWithStatus.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.startedAt || 0).getTime();
        const dateB = new Date(b.createdAt || b.startedAt || 0).getTime();
        return dateB - dateA;
      });
      setMigrations(sorted);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load migrations."
      );
      setMigrations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    const file = await pickDBFile("Select migration database file");
    if (!file) {
      return;
    }

    const filename = file.name.endsWith(".db")
      ? file.name.slice(0, -3)
      : file.name;

    setUploading(true);
    setError(null);
    setUploadSuccess(null);

    try {
      await uploadMigrationDB(file, filename, false);
      setUploadSuccess(`Successfully uploaded "${file.name}"`);
      // Refresh migrations list after upload
      await loadMigrations();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to upload file.";
      if (errorMessage.includes("file already present on API")) {
        setPendingUpload({ file, filename });
        setShowOverwriteDialog(true);
      } else {
        setError(errorMessage);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleOverwrite = async () => {
    if (!pendingUpload) {
      return;
    }

    setShowOverwriteDialog(false);
    setUploading(true);
    setError(null);
    setUploadSuccess(null);

    try {
      await uploadMigrationDB(
        pendingUpload.file,
        pendingUpload.filename,
        true
      );
      setUploadSuccess(
        `Successfully uploaded "${pendingUpload.file.name}" (overwritten)`
      );
      setPendingUpload(null);
      // Refresh migrations list after upload
      await loadMigrations();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to overwrite file."
      );
    } finally {
      setUploading(false);
    }
  };

  const handleCancelOverwrite = () => {
    setShowOverwriteDialog(false);
    setPendingUpload(null);
  };

  /**
   * Determines the appropriate page to navigate to based on migration state
   */
  const determineNavigationTarget = (statusData: any): string => {
    const status = statusData.status;
    const statusLower = status?.toLowerCase();
    const hasRoots = statusData.result?.rootSummary !== undefined;
    const hasRuntime = statusData.result?.runtime !== undefined;
    const migrationId = statusData.id;

    // Checkpoint statuses that come from the API
    const checkpointStatuses = [
      "Roots-Set",
      "Filters-Set",
      "Traversal-In-Progress",
      "Awaiting-Path-Review",
      "Preparing-For-Copy",
      "Copy-In-Progress",
      "Copy-Complete",
      "Awaiting-Copy-Review",
      "Complete"
    ];

    // Priority 1: Check checkpoint status (now in status field)
    if (status && checkpointStatuses.includes(status)) {
      switch (status) {
        case "Awaiting-Path-Review":
        case "Awaiting-Copy-Review":
          return `/path-review/${migrationId}`;
        case "Traversal-In-Progress":
        case "Preparing-For-Copy":
        case "Copy-In-Progress":
        case "Copy-Complete":
          return `/discovery-progress/${migrationId}`;
        case "Complete":
          return `/path-review/${migrationId}`; // Completed migrations can still review paths
        case "Roots-Set":
        case "Filters-Set":
          // Roots are set but traversal hasn't started - go to summary to review and start
          return `/summary`;
        default:
          // Unknown checkpoint status, fall through
          break;
      }
    }

    // Priority 2: Check fallback statuses
    if (statusLower === "running") {
      return `/discovery-progress/${migrationId}`;
    }

    if (statusLower === "completed") {
      return `/path-review/${migrationId}`;
    }

    // Priority 3: Check runtime data to infer state
    if (hasRuntime) {
      // If status is suspended/failed but traversal might have completed, try path review
      // (path review page will handle if traversal isn't actually complete)
      if (statusLower === "suspended" || statusLower === "failed") {
        return `/path-review/${migrationId}`;
      }
      // Otherwise, if it has runtime but isn't running/completed, go to discovery to restart
      return `/discovery-progress/${migrationId}`;
    }

    // Priority 4: Check if roots are set
    if (hasRoots) {
      return `/summary`;
    }

    // Default: no roots set, go to connect page to set up
    return "/connect";
  };

  const handleResume = async (migrationId: string) => {
    if (!migrationId) {
      setError("Please select a migration to resume.");
      return;
    }

    setSelectedMigrationId(migrationId);
    setResuming(true);
    setError(null);
    setResumeSuccess(null);
    setStopSuccess(null);

    try {
      // Get full migration status to determine where we are in the pipeline
      const statusData = await getMigrationStatus(migrationId);
      
      // Update the migration context with the migration info
      // The migrationId is the most important - source/destination will be reselected if needed
      updateMigration({
        migrationId: statusData.id,
        ready: statusData.result?.rootSummary !== undefined,
      });
      
      // Determine the appropriate page to navigate to
      const targetPath = determineNavigationTarget(statusData);
      
      // Navigate directly to the appropriate page - no need to "load" the migration
      // The target page will handle loading the migration data it needs
      navigate(targetPath);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to get migration status.";

      // Handle specific error cases
      if (errorMessage.includes("Migration not found")) {
        setError("Migration not found. It may have been deleted.");
        // Refresh the list in case it was deleted
        await loadMigrations();
      } else if (errorMessage.includes("Server error")) {
        setError("Server error while getting migration status. Please try again.");
      } else {
        setError(errorMessage);
      }
    } finally {
      setResuming(false);
      setSelectedMigrationId(null);
    }
  };

  const handleStop = async (migrationId: string) => {
    if (!migrationId) {
      setError("Please select a migration to stop.");
      return;
    }

    setSelectedMigrationId(migrationId);
    setStopping(true);
    setError(null);
    setResumeSuccess(null);
    setStopSuccess(null);

    try {
      const response = await stopMigration(migrationId);
      
      setStopSuccess(
        `Migration "${response.id}" stopped successfully! Status: ${response.status}`
      );
      
      // Refresh the migrations list to get updated status
      await loadMigrations();
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to stop migration.";

      // Handle specific error cases
      if (errorMessage.includes("Migration not found") || errorMessage.includes("not running")) {
        setError("Migration not found or not running. It may have already stopped.");
        // Refresh the list
        await loadMigrations();
      } else if (errorMessage.includes("Server error")) {
        setError("Server error while stopping migration. Please try again.");
      } else {
        setError(errorMessage);
      }
    } finally {
      setStopping(false);
      setSelectedMigrationId(null);
    }
  };

  return (
    <>
      <PageContainer
        className="resume-migration"
        contentClassName="resume-migration__content"
        onBack={() => navigate("/choose")}
        backLabel="← Back"
      >
      <header className="resume-migration__header">
          <p className="resume-migration__eyebrow">Resume Migration</p>
          <h1>Select Migration to Resume</h1>
          <p className="resume-migration__summary">
            Choose an existing migration to resume from, or upload a new database file.
          </p>
        </header>

        {error && (
          <div className="resume-migration__error">{error}</div>
        )}

        {uploadSuccess && (
          <div className="resume-migration__success">{uploadSuccess}</div>
        )}

        {resumeSuccess && (
          <div className="resume-migration__success">{resumeSuccess}</div>
        )}

        {stopSuccess && (
          <div className="resume-migration__success">{stopSuccess}</div>
        )}

        <div className="resume-migration__actions">
          <button
            type="button"
            className="resume-migration__upload-button"
            onClick={handleUpload}
            disabled={uploading || resuming || stopping}
          >
            <Upload size={20} />
            {uploading ? "Uploading..." : "Upload New DB File"}
          </button>
          <button
            type="button"
            className="resume-migration__refresh-button"
            onClick={loadMigrations}
            disabled={loading || resuming || stopping}
            title="Refresh migrations list"
          >
            <RefreshCw size={20} className={loading ? "resume-migration__refresh-icon--spinning" : ""} />
            Refresh
          </button>
        </div>

        <div className="resume-migration__list">
          {loading ? (
            <div className="resume-migration__empty">Loading migrations...</div>
          ) : !Array.isArray(migrations) || migrations.length === 0 ? (
            <div className="resume-migration__empty">
              No migrations found. Upload a database file to get started, or click{" "}
              <Link to="/choose" className="resume-migration__link">here</Link> to
              start a new migration from scratch instead.
            </div>
          ) : (
            migrations.map((migration) => (
              <div
                key={migration.id}
                className={`resume-migration__file-card ${
                  selectedMigrationId === migration.id
                    ? "resume-migration__file-card--selected"
                    : ""
                } ${resuming ? "resume-migration__file-card--disabled" : ""}`}
              >
                <div className="resume-migration__file-icon">
                  <RotateCcw size={24} color="#ffffff" />
                </div>
                <div className="resume-migration__file-info">
                  <div className="resume-migration__file-name">
                    <span>{migration.name || migration.id}</span>
                    {selectedMigrationId === migration.id && (
                      <CheckCircle2
                        size={16}
                        color="#00ffff"
                        className="resume-migration__check-icon"
                        style={{ flexShrink: 0 }}
                      />
                    )}
                  </div>
                  <div className="resume-migration__file-meta">
                    {migration.status && (
                      <span className={`resume-migration__status resume-migration__status--${(migration.status || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`}>{migration.status}</span>
                    )}
                    {migration.status && <span> • </span>}
                    Created: {formatDate(migration.createdAt)}
                  </div>
                </div>
                {(migration.status === "running" || 
                  migration.status === "Traversal-In-Progress" || 
                  migration.status === "Preparing-For-Copy" ||
                  migration.status === "Copy-In-Progress" ||
                  migration.status === "Copy-Complete") ? (
                  <button
                    type="button"
                    className="resume-migration__stop-button-inline"
                    onClick={() => !stopping && handleStop(migration.id)}
                    disabled={stopping || loading}
                  >
                    {stopping && selectedMigrationId === migration.id ? (
                      <>
                        <Square size={16} />
                        Stopping...
                      </>
                    ) : (
                      <>
                        <Square size={16} />
                        Stop
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="glass-button glass-button--inline"
                    onClick={() => !resuming && handleResume(migration.id)}
                    disabled={resuming || stopping || loading}
                  >
                    {resuming && selectedMigrationId === migration.id
                      ? "Resuming..."
                      : "Resume"}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </PageContainer>

      {showOverwriteDialog && pendingUpload && (
        <OverwriteDialog
          filename={pendingUpload.file.name}
          onConfirm={handleOverwrite}
          onCancel={handleCancelOverwrite}
        />
      )}
    </>
  );
}


