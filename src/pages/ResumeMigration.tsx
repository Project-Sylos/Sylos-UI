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
  resumeMigration,
} from "../api/services";
import { clearAllMigrations } from "../api/admin";
import DestructiveConfirmDialog from "../components/CleanSlateDialog";
import "../components/CleanSlateDialog.css";
import {
  MigrationStatusResponse,
  MigrationWithStatus,
  getMigrationPhase,
  isMigrationLive,
} from "../types/migrations";
import { pickDBFile, formatDate } from "../utils/fileUpload";
import { useSelection } from "../context/SelectionContext";
import "./ResumeMigration.css";

export default function ResumeMigration() {
  const navigate = useNavigate();
  const { updateMigration, applyServerRoots } = useSelection();
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
  const [canCleanSlate, setCanCleanSlate] = useState(false);
  const [showCleanSlateDialog, setShowCleanSlateDialog] = useState(false);
  const [cleanSlateBusy, setCleanSlateBusy] = useState(false);
  const [cleanSlateMessage, setCleanSlateMessage] = useState<string | null>(null);

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
          name: migration.name || migration.id, // Fall back to ID when unnamed
          configPath: "", // API doesn't return configPath
          createdAt: migration.startedAt || new Date().toISOString(),
          status: migration.status,
          phase: migration.phase ?? migration.status,
          live: migration.live,
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
      setCanCleanSlate(response.capabilities?.cleanSlate === true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load migrations."
      );
      setMigrations([]);
      setCanCleanSlate(false);
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

  /** Progress-monitor mode query for a lifecycle phase. */
  const progressMonitorModeForPhase = (phase: string): "discovery" | "copy" | "delete" => {
    if (
      phase === "copy-in-progress" ||
      phase === "copy-suspended" ||
      phase === "awaiting-copy-review"
    ) {
      return "copy";
    }
    if (
      phase === "delete-in-progress" ||
      phase === "delete-suspended" ||
      phase === "awaiting-delete-review"
    ) {
      return "delete";
    }
    return "discovery";
  };

  /**
   * Determines the appropriate page to navigate to based on migration state.
   * Review → path-review; suspended / in-progress → progress-monitor; setup → summary.
   */
  const determineNavigationTarget = (
    statusData: MigrationStatusResponse
  ): { path: string; shouldCallResume: boolean } => {
    const phase = getMigrationPhase(statusData);
    const migrationId = statusData.id;

    switch (phase) {
      case "awaiting-traversal-review":
      case "awaiting-copy-review":
        return { path: `/path-review/${migrationId}`, shouldCallResume: false };
      case "awaiting-delete-review":
        return {
          path: `/path-review/${migrationId}/source-cleanup`,
          shouldCallResume: false,
        };
      case "traversal-suspended":
      case "copy-suspended":
      case "delete-suspended": {
        const mode = progressMonitorModeForPhase(phase);
        return {
          path: `/progress-monitor/${migrationId}?mode=${mode}&retry=1`,
          shouldCallResume: true,
        };
      }
      case "failed":
        return {
          path: `/progress-monitor/${migrationId}?retry=1`,
          shouldCallResume: true,
        };
      case "traversal-in-progress":
      case "copy-in-progress":
      case "delete-in-progress": {
        // Dead in-progress (not live) is normalized + resumed by the API.
        const mode = progressMonitorModeForPhase(phase);
        const live = isMigrationLive(statusData);
        return {
          path: `/progress-monitor/${migrationId}?mode=${mode}${live ? "" : "&retry=1"}`,
          shouldCallResume: !live,
        };
      }
      case "roots-set":
      case "filters-set":
        return { path: `/summary`, shouldCallResume: false };
      default:
        break;
    }

    return { path: `/summary`, shouldCallResume: false };
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
        sourceConnectionId: statusData.sourceRoot?.connectionId,
        destinationConnectionId: statusData.destinationRoot?.connectionId,
        ready: statusData.result?.rootSummary !== undefined || Boolean(statusData.sourceRoot),
      });

      // Rehydrate source/destination from the server so the summary / progress monitor
      // repopulates even when browser sessionStorage was cleared.
      applyServerRoots(statusData.sourceRoot, statusData.destinationRoot, true);

      const { path: targetPath, shouldCallResume } =
        determineNavigationTarget(statusData);

      if (shouldCallResume) {
        const result = await resumeMigration(migrationId);
        if (!result.success) {
          setError(result.error || "Failed to resume migration.");
          return;
        }
      }

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

  const handleClearMigrations = async () => {
    setCleanSlateBusy(true);
    setCleanSlateMessage(null);
    try {
      const result = await clearAllMigrations();
      setCleanSlateMessage(result.message);
      setShowCleanSlateDialog(false);
      await loadMigrations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear migration data.");
      setShowCleanSlateDialog(false);
    } finally {
      setCleanSlateBusy(false);
    }
  };

  const showsStopButton = (migration: MigrationWithStatus) => {
    if (isMigrationLive(migration)) return true;
    const phase = getMigrationPhase(migration);
    return (
      phase === "traversal-in-progress" ||
      phase === "copy-in-progress" ||
      phase === "delete-in-progress"
    );
  };

  return (
    <>
      <PageContainer
        className="resume-migration"
        contentClassName="resume-migration__content"
        onBack={() => navigate("/choose")}
        backTitle="Back to migration type"
      >
      <header className="resume-migration__header">
          <h1>Select Migration to Resume</h1>
          <p className="resume-migration__summary">
            Choose a migration below, or upload a database file to add one.
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
                    <span className="resume-migration__file-title">
                      {migration.name && migration.name !== migration.id
                        ? migration.name
                        : migration.id}
                    </span>
                    {selectedMigrationId === migration.id && (
                      <CheckCircle2
                        size={16}
                        className="resume-migration__check-icon"
                        style={{ flexShrink: 0 }}
                      />
                    )}
                  </div>
                  {migration.name && migration.name !== migration.id && (
                    <div className="resume-migration__file-id" title={migration.id}>
                      {migration.id}
                    </div>
                  )}
                  <div className="resume-migration__file-meta">
                    {migration.status && (
                      <span className={`resume-migration__status resume-migration__status--${(migration.status || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`}>{migration.status}</span>
                    )}
                    {migration.status && <span> • </span>}
                    Created: {formatDate(migration.createdAt)}
                  </div>
                </div>
                {(showsStopButton(migration)) ? (
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

        {canCleanSlate && (
          <div className="resume-migration__danger">
            <h2 className="resume-migration__danger-title">Danger zone</h2>
            <p className="resume-migration__danger-text">
              Clear every migration folder, migration database, and registry entry from this
              install. User accounts and cloud provider app settings are not removed. Running
              migrations are stopped first. For a full install reset including users, use Settings
              → Danger zone.
            </p>
            {cleanSlateMessage && (
              <p className="resume-migration__danger-text">{cleanSlateMessage}</p>
            )}
            <button
              type="button"
              className="resume-migration__danger-button"
              onClick={() => setShowCleanSlateDialog(true)}
              disabled={cleanSlateBusy || uploading || resuming || stopping}
            >
              Clear all migration data
            </button>
          </div>
        )}
      </PageContainer>

      {showCleanSlateDialog && (
        <DestructiveConfirmDialog
          title="Clear all migration data?"
          body="This permanently deletes every migration folder, migration database file, and migration registry entry on this Sylos install. User accounts, cloud provider app settings, and your login are kept. Running migrations are stopped first. This cannot be undone."
          confirmLabel="Clear all migration data"
          busy={cleanSlateBusy}
          onCancel={() => setShowCleanSlateDialog(false)}
          onConfirm={() => void handleClearMigrations()}
        />
      )}

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


