import { useEffect, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  FolderUp,
  FileArchive,
  Download,
  CheckCircle2,
  RotateCcw,
  RefreshCw,
  ArrowUpRight,
  Trash2,
} from "lucide-react";

import "../App.css";
import OverwriteDialog from "../components/OverwriteDialog";
import PageContainer from "../components/PageContainer";
import {
  listMigrations,
  getMigrationStatus,
  uploadMigrationOps,
  downloadMigrationOpsExport,
  deleteMigration,
} from "../api/services";
import { clearAllMigrations } from "../api/admin";
import DestructiveConfirmDialog from "../components/CleanSlateDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import "../components/CleanSlateDialog.css";
import {
  MigrationStatusResponse,
  MigrationWithStatus,
  formatMigrationPhaseLabel,
  getMigrationPhase,
  migrationPhaseTone,
} from "../types/migrations";
import { formatDate } from "../utils/fileUpload";
import { pickOpsImport } from "../utils/opsImport";
import { SYLOS_WIKI_URL } from "../contexts/HelpModalContext";
import { useSelection } from "../context/SelectionContext";
import "./ResumeMigration.css";

export default function ResumeMigration() {
  const navigate = useNavigate();
  const { updateMigration, applyServerRoots } = useSelection();
  const [migrations, setMigrations] = useState<MigrationWithStatus[]>([]);
  const [openingMigrationId, setOpeningMigrationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MigrationWithStatus | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{
    zip: Blob;
    filename: string;
    label: string;
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

      const migrationsWithStatus: MigrationWithStatus[] = response.migrations.map((migration) => {
        return {
          id: migration.id,
          name: migration.name || migration.id,
          configPath: "",
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

  const runOpsUpload = async (
    zip: Blob,
    filename: string,
    label: string,
    overwrite: boolean
  ) => {
    setUploading(true);
    setError(null);
    setUploadSuccess(null);
    try {
      await uploadMigrationOps(zip, filename, overwrite);
      setUploadSuccess(
        overwrite
          ? `Successfully imported "${label}" (overwritten)`
          : `Successfully imported "${label}"`
      );
      setPendingUpload(null);
      await loadMigrations();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to import migration data.";
      if (!overwrite && errorMessage.includes("file already present on API")) {
        setPendingUpload({ zip, filename, label });
        setShowOverwriteDialog(true);
      } else {
        setError(errorMessage);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleImport = async (mode: "zip" | "folder") => {
    const picked = await pickOpsImport(mode);
    if (!picked || !picked.migrationId) {
      return;
    }
    await runOpsUpload(picked.zip, picked.migrationId, picked.label, false);
  };

  const handleOverwrite = async () => {
    if (!pendingUpload) {
      return;
    }
    setShowOverwriteDialog(false);
    await runOpsUpload(
      pendingUpload.zip,
      pendingUpload.filename,
      pendingUpload.label,
      true
    );
  };

  const handleCancelOverwrite = () => {
    setShowOverwriteDialog(false);
    setPendingUpload(null);
  };

  const handleExport = async (migrationId: string, e: MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setExportingId(migrationId);
    setError(null);
    try {
      await downloadMigrationOpsExport(migrationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export migration.");
    } finally {
      setExportingId(null);
    }
  };

  /** Progress-monitor mode query for a lifecycle phase. */
  const progressMonitorModeForPhase = (
    phase: string
  ): "discovery" | "copy" | "delete" => {
    if (
      phase === "copy-in-progress" ||
      phase === "copy-suspended" ||
      phase === "copy-finalizing" ||
      phase === "copy-finalize-failed" ||
      phase === "awaiting-copy-review"
    ) {
      return "copy";
    }
    if (
      phase === "delete-in-progress" ||
      phase === "delete-suspended" ||
      phase === "delete-finalizing" ||
      phase === "delete-finalize-failed" ||
      phase === "awaiting-delete-review"
    ) {
      return "delete";
    }
    return "discovery";
  };

  /**
   * Last known page for a migration: review / progress (stats + Resume when paused) /
   * summary for setup. Does not start or resume work - that stays on the destination page.
   */
  const navigationPathForStatus = (statusData: MigrationStatusResponse): string => {
    const phase = getMigrationPhase(statusData);
    const migrationId = statusData.id;

    switch (phase) {
      case "awaiting-traversal-review":
      case "awaiting-copy-review":
        return `/path-review/${migrationId}`;
      case "awaiting-delete-review":
        return `/path-review/${migrationId}/source-cleanup`;
      case "traversal-suspended":
      case "traversal-in-progress":
      case "traversal-finalizing":
      case "traversal-finalize-failed":
      case "copy-suspended":
      case "copy-in-progress":
      case "copy-finalizing":
      case "copy-finalize-failed":
      case "delete-suspended":
      case "delete-in-progress":
      case "delete-finalizing":
      case "delete-finalize-failed":
      case "failed": {
        const mode = progressMonitorModeForPhase(phase);
        return `/progress-monitor/${migrationId}?mode=${mode}`;
      }
      case "roots-set":
      case "filters-set":
        return `/summary`;
      default:
        break;
    }

    return `/summary`;
  };

  const openLabelForMigration = (migration: MigrationWithStatus): string => {
    const phase = getMigrationPhase(migration);
    if (phase === "awaiting-delete-review") return "Open source cleanup review";
    if (phase.startsWith("awaiting-") && phase.endsWith("-review")) {
      return "Open path review";
    }
    if (phase.includes("delete")) return "Open source cleanup progress";
    if (phase.includes("copy")) return "Open copy progress";
    if (phase.includes("traversal")) return "Open discovery progress";
    if (phase === "failed") return "Open progress";
    if (phase === "roots-set" || phase === "filters-set") return "Open migration summary";
    return "Open migration";
  };

  const handleOpenMigration = async (migrationId: string) => {
    if (!migrationId || openingMigrationId) {
      return;
    }

    setOpeningMigrationId(migrationId);
    setError(null);

    try {
      const statusData = await getMigrationStatus(migrationId);

      updateMigration({
        migrationId: statusData.id,
        sourceConnectionId: statusData.sourceRoot?.connectionId,
        destinationConnectionId: statusData.destinationRoot?.connectionId,
        ready:
          statusData.result?.rootSummary !== undefined ||
          Boolean(statusData.sourceRoot),
      });

      applyServerRoots(statusData.sourceRoot, statusData.destinationRoot, true);

      navigate(navigationPathForStatus(statusData));
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to get migration status.";

      if (errorMessage.includes("Migration not found")) {
        setError("Migration not found. It may have been deleted.");
        await loadMigrations();
      } else if (errorMessage.includes("Server error")) {
        setError("Server error while getting migration status. Please try again.");
      } else {
        setError(errorMessage);
      }
    } finally {
      setOpeningMigrationId(null);
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

  const handleDeleteClick = (migration: MigrationWithStatus, e: MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setPendingDelete(migration);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || deletingId) return;
    const id = pendingDelete.id;
    setDeletingId(id);
    setError(null);
    try {
      await deleteMigration(id);
      setPendingDelete(null);
      await loadMigrations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete migration.");
      setPendingDelete(null);
    } finally {
      setDeletingId(null);
    }
  };

  const busy =
    uploading ||
    Boolean(openingMigrationId) ||
    cleanSlateBusy ||
    Boolean(exportingId) ||
    Boolean(deletingId);

  return (
    <>
      <PageContainer
        className="resume-migration"
        contentClassName="resume-migration__content"
        onBack={() => navigate("/")}
        backTitle="Back to home"
      >
        <header className="resume-migration__header">
          <h1>Select Migration to Resume</h1>
          <p className="resume-migration__summary">
            Open a migration to continue from its last page. Import from a folder or
            upload a zip to add one (contents are copied into Sylos, not used in
            place).{" "}
            <a
              className="resume-migration__link"
              href={SYLOS_WIKI_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              How ops folders work (wiki)
            </a>
          </p>
        </header>

        {error && (
          <div className="resume-migration__error">{error}</div>
        )}

        {uploadSuccess && (
          <div className="resume-migration__success">{uploadSuccess}</div>
        )}

        <div className="resume-migration__actions">
          <button
            type="button"
            className="resume-migration__upload-button"
            onClick={() => void handleImport("folder")}
            disabled={busy}
            title="Select an unpacked .ops folder; contents are zipped and copied into Sylos"
          >
            <FolderUp size={20} />
            {uploading ? "Importing..." : "Import from folder"}
          </button>
          <button
            type="button"
            className="resume-migration__upload-button resume-migration__upload-button--secondary"
            onClick={() => void handleImport("zip")}
            disabled={busy}
            title="Select a Sylos .ops.zip export"
          >
            <FileArchive size={20} />
            Upload zip
          </button>
          <button
            type="button"
            className="resume-migration__refresh-button"
            onClick={loadMigrations}
            disabled={loading || busy}
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
              No migrations found. Import from a folder or upload a zip to get started, or
              click{" "}
              <Link to="/" className="resume-migration__link">here</Link> to
              start a new migration from scratch instead.
            </div>
          ) : (
            migrations.map((migration) => {
              const isOpening = openingMigrationId === migration.id;
              const openLabel = openLabelForMigration(migration);
              const isExporting = exportingId === migration.id;
              return (
                <div
                  key={migration.id}
                  className={`resume-migration__file-card ${
                    isOpening ? "resume-migration__file-card--selected" : ""
                  } ${openingMigrationId && !isOpening ? "resume-migration__file-card--disabled" : ""}`}
                  role="button"
                  tabIndex={busy ? -1 : 0}
                  aria-label={openLabel}
                  onClick={() => {
                    if (!busy) void handleOpenMigration(migration.id);
                  }}
                  onKeyDown={(e) => {
                    if (busy) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void handleOpenMigration(migration.id);
                    }
                  }}
                >
                  <div className="resume-migration__card-actions">
                    <button
                      type="button"
                      className="resume-migration__icon-corner resume-migration__icon-corner--danger"
                      title="Delete migration"
                      aria-label={`Delete ${migration.name || migration.id}`}
                      disabled={busy}
                      onClick={(e) => handleDeleteClick(migration, e)}
                    >
                      <Trash2
                        size={16}
                        aria-hidden="true"
                        className={
                          deletingId === migration.id
                            ? "resume-migration__refresh-icon--spinning"
                            : undefined
                        }
                      />
                    </button>
                    <button
                      type="button"
                      className="resume-migration__icon-corner"
                      title="Export ops zip"
                      aria-label={`Export ${migration.name || migration.id}`}
                      disabled={busy}
                      onClick={(e) => void handleExport(migration.id, e)}
                    >
                      <Download
                        size={16}
                        aria-hidden="true"
                        className={isExporting ? "resume-migration__refresh-icon--spinning" : undefined}
                      />
                    </button>
                    <button
                      type="button"
                      className="resume-migration__open-corner"
                      title={openLabel}
                      aria-label={openLabel}
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!busy) void handleOpenMigration(migration.id);
                      }}
                    >
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </button>
                  </div>
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
                      {isOpening && (
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
                        <span
                          className={`resume-migration__status resume-migration__status--${migrationPhaseTone(
                            migration.status
                          )}`}
                        >
                          {formatMigrationPhaseLabel(migration.status)}
                        </span>
                      )}
                      {migration.status && <span> • </span>}
                      Created: {formatDate(migration.createdAt)}
                      {isOpening && <span> • Opening…</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {canCleanSlate && (
          <div className="resume-migration__clear-all">
            <button
              type="button"
              className="resume-migration__danger-button"
              onClick={() => setShowCleanSlateDialog(true)}
              disabled={busy}
            >
              Clear all migration data
            </button>
            {cleanSlateMessage && (
              <p className="resume-migration__clear-all-message">{cleanSlateMessage}</p>
            )}
          </div>
        )}
      </PageContainer>

      {showCleanSlateDialog && (
        <DestructiveConfirmDialog
          title="Clear all migration data?"
          body="This permanently deletes every migration folder, ops store, and migration registry entry on this Sylos install. User accounts and cloud provider app settings are not removed. Running migrations are stopped first. For a full install reset including users, use Settings → Danger zone. This cannot be undone."
          confirmLabel="Clear all migration data"
          busy={cleanSlateBusy}
          onCancel={() => setShowCleanSlateDialog(false)}
          onConfirm={() => void handleClearMigrations()}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this migration?"
          message={`This permanently deletes "${
            pendingDelete.name && pendingDelete.name !== pendingDelete.id
              ? pendingDelete.name
              : pendingDelete.id
          }" including its ops store and registry entry. Running work is stopped first. This cannot be undone.`}
          confirmLabel={deletingId ? "Deleting…" : "Delete migration"}
          cancelLabel="Cancel"
          confirmTone="danger"
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => {
            if (!deletingId) setPendingDelete(null);
          }}
        />
      )}

      {showOverwriteDialog && pendingUpload && (
        <OverwriteDialog
          filename={pendingUpload.label}
          onConfirm={handleOverwrite}
          onCancel={handleCancelOverwrite}
        />
      )}
    </>
  );
}
