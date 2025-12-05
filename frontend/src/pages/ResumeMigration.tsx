import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, CheckCircle2, RotateCcw, RefreshCw, Square } from "lucide-react";

import "../App.css";
import OverwriteDialog from "../components/OverwriteDialog";
import {
  listMigrations,
  loadMigration,
  stopMigration,
  getMigrationStatus,
  uploadMigrationDB,
} from "../api/services";
import { MigrationWithStatus } from "../types/migrations";
import { pickDBFile, formatDate } from "../utils/fileUpload";
import "./ResumeMigration.css";

export default function ResumeMigration() {
  const navigate = useNavigate();
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
      const data = await listMigrations();
      
      // Fetch status for each migration
      const migrationsWithStatus = await Promise.all(
        data.map(async (migration) => {
          try {
            const status = await getMigrationStatus(migration.id);
            return {
              ...migration,
              status: status.status,
            } as MigrationWithStatus;
          } catch {
            // If status fetch fails, just use the migration without status
            return {
              ...migration,
              status: undefined,
            } as MigrationWithStatus;
          }
        })
      );
      
      // Sort by createdAt, newest first
      const sorted = migrationsWithStatus.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
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
      const response = await loadMigration(migrationId);
      
      setResumeSuccess(
        `Migration "${response.id}" resumed successfully! Status: ${response.status}`
      );
      
      // Refresh the migrations list to get updated status
      await loadMigrations();
      
      // Optionally navigate after a short delay to show success message
      setTimeout(() => {
        navigate("/");
      }, 2000);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to resume migration.";

      // Handle specific error cases
      if (errorMessage.includes("Migration not found")) {
        setError("Migration not found. It may have been deleted.");
        // Refresh the list in case it was deleted
        await loadMigrations();
      } else if (errorMessage.includes("Server error")) {
        setError("Server error while resuming migration. Please try again.");
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
    <section className="resume-migration">
      <button
        type="button"
        className="resume-migration__back"
        onClick={() => navigate("/choose")}
      >
        ← Back
      </button>

      <div className="resume-migration__content">
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
                  <RotateCcw size={32} color="#ffffff" />
                </div>
                <div className="resume-migration__file-info">
                  <div className="resume-migration__file-name">
                    {migration.name || migration.id}
                    {selectedMigrationId === migration.id && (
                      <CheckCircle2
                        size={20}
                        color="#00ffff"
                        className="resume-migration__check-icon"
                      />
                    )}
                  </div>
                  <div className="resume-migration__file-meta">
                    ID: {migration.id} • Created:{" "}
                    {formatDate(migration.createdAt)}
                    {migration.status && (
                      <> • Status: <span className={`resume-migration__status resume-migration__status--${migration.status.toLowerCase()}`}>{migration.status}</span></>
                    )}
                  </div>
                </div>
                {migration.status === "running" ? (
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
      </div>

      {showOverwriteDialog && pendingUpload && (
        <OverwriteDialog
          filename={pendingUpload.file.name}
          onConfirm={handleOverwrite}
          onCancel={handleCancelOverwrite}
        />
      )}
    </section>
  );
}


