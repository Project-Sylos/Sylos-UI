import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, Database, CheckCircle2 } from "lucide-react";

import "../App.css";
import AnimatedBackground from "../components/AnimatedBackground";
import OverwriteDialog from "../components/OverwriteDialog";
import {
  listMigrationDBs,
  uploadMigrationDB,
  startMigration,
} from "../api/services";
import { MigrationDBFile } from "../types/migrations";
import { pickDBFile, formatFileSize, formatDate } from "../utils/fileUpload";
import "./ResumeMigration.css";

export default function ResumeMigration() {
  const navigate = useNavigate();
  const [dbFiles, setDbFiles] = useState<MigrationDBFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{
    file: File;
    filename: string;
  } | null>(null);

  useEffect(() => {
    loadDBFiles();
  }, []);

  const loadDBFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const files = await listMigrationDBs();
      // Ensure we always set an array, even if API returns null/undefined
      setDbFiles(Array.isArray(files) ? files : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load migration databases."
      );
      // Set empty array on error to prevent null issues
      setDbFiles([]);
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
      await loadDBFiles();
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
      await loadDBFiles();
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

  const handleResume = async () => {
    if (!selectedFile) {
      setError("Please select a database file to resume from.");
      return;
    }

    const selected = dbFiles.find((f) => f.path === selectedFile);
    if (!selected) {
      setError("Selected file not found.");
      return;
    }

    setResuming(true);
    setError(null);

    try {
      const migrationId = `resume-${Date.now()}`;
      const response = await startMigration({
        migrationId,
        options: {
          databasePath: selected.path,
        },
      });

      alert(
        `Migration started!\nID: ${response.id}\nStatus: ${response.status}`
      );
      navigate("/");
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to start migration. Please check the database file is valid.";

      if (errorMessage.includes("database schema invalid")) {
        setError(
          "This database file is not compatible. Please use a valid migration database."
        );
      } else if (errorMessage.includes("database is empty")) {
        setError(
          "This database is empty. Please set roots first or use a different database."
        );
      } else if (errorMessage.includes("database file not found")) {
        setError("Database file not found. Please upload it first.");
      } else {
        setError(errorMessage);
      }
    } finally {
      setResuming(false);
    }
  };

  return (
    <section className="resume-migration">
      <AnimatedBackground />

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
          <h1>Select Migration Database</h1>
          <p className="resume-migration__summary">
            Choose an existing migration database file to resume from, or upload
            a new one.
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
            onClick={handleUpload}
            disabled={uploading || resuming}
          >
            <Upload size={20} />
            {uploading ? "Uploading..." : "Upload New DB File"}
          </button>
        </div>

        <div className="resume-migration__list">
          {loading ? (
            <div className="resume-migration__empty">Loading databases...</div>
          ) : !Array.isArray(dbFiles) || dbFiles.length === 0 ? (
            <div className="resume-migration__empty">
              No migration databases found. Upload a database file to get
              started, or click <Link to="/choose" className="resume-migration__link">here</Link> to start a new migration from scratch instead.
            </div>
          ) : (
            dbFiles.map((file) => (
              <button
                key={file.path}
                type="button"
                className={`resume-migration__file-card ${
                  selectedFile === file.path
                    ? "resume-migration__file-card--selected"
                    : ""
                } ${resuming ? "resume-migration__file-card--disabled" : ""}`}
                onClick={() => !resuming && setSelectedFile(file.path)}
                disabled={resuming}
              >
                <div className="resume-migration__file-icon">
                  <Database size={32} color="#ffffff" />
                </div>
                <div className="resume-migration__file-info">
                  <div className="resume-migration__file-name">
                    {file.filename}
                    {selectedFile === file.path && (
                      <CheckCircle2
                        size={20}
                        color="#00ffff"
                        className="resume-migration__check-icon"
                      />
                    )}
                  </div>
                  <div className="resume-migration__file-meta">
                    {file.size != null && formatFileSize(file.size)} • Modified:{" "}
                    {file.modifiedAt && formatDate(file.modifiedAt)}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="resume-migration__footer">
          <button
            type="button"
            className="resume-migration__resume-button"
            onClick={handleResume}
            disabled={!selectedFile || resuming || loading}
          >
            {resuming ? "Starting..." : "Resume Migration"}
          </button>
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

