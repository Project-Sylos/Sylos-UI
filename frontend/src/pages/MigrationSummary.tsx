import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowLeft } from "lucide-react";

import { useSelection } from "../context/SelectionContext";
import { startMigration } from "../api/services";
import "./MigrationSummary.css";

export default function MigrationSummary() {
  const navigate = useNavigate();
  const { source, destination, migration } = useSelection();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if source or destination is missing
  useEffect(() => {
    if (!source) {
      navigate("/connect");
      return;
    }
    if (!destination) {
      navigate("/destination");
      return;
    }
  }, [source, destination, navigate]);

  if (!source || !destination) {
    return null; // Will redirect
  }

  const handleStartDiscovery = async () => {
    if (!migration.migrationId) {
      setError("Migration ID is missing. Please go back and reselect your services.");
      return;
    }

    try {
      setIsStarting(true);
      setError(null);
      const run = await startMigration({ migrationId: migration.migrationId });
      
      // Navigate to the migration monitor page
      navigate(`/monitor/${run.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to start migration.";
      setError(message);
    } finally {
      setIsStarting(false);
    }
  };

  const formatPath = (root?: { displayName?: string; locationPath?: string }) => {
    if (!root) return "Not specified";
    return root.locationPath || root.displayName || "Not specified";
  };

  return (
    <section className="migration-summary">
      <button
        type="button"
        className="migration-summary__back"
        onClick={() => navigate("/destination")}
      >
        <ArrowLeft size={16} style={{ marginRight: "0.5rem" }} />
        Back to destination
      </button>

      <div className="migration-summary__content">
        <header className="migration-summary__header">
          <p className="migration-summary__eyebrow">Step 3</p>
          <h1>
            Review your <span className="migration-summary__highlight">migration</span>
          </h1>
          <p className="migration-summary__summary">
            Verify your source and destination selections before starting discovery.
          </p>
        </header>

        <div className="migration-summary__details">
          <div className="migration-summary__section">
            <h2 className="migration-summary__section-title">
              <span className="migration-summary__highlight--magenta">Source</span>
            </h2>
            <div className="migration-summary__info-card">
              <div className="migration-summary__info-row">
                <span className="migration-summary__info-label">Service:</span>
                <span className="migration-summary__info-value">
                  {source.service.displayName}
                </span>
              </div>
              <div className="migration-summary__info-row">
                <span className="migration-summary__info-label">Root Path:</span>
                <span className="migration-summary__info-value">
                  {formatPath(source.root)}
                </span>
              </div>
            </div>
          </div>

          <div className="migration-summary__arrow">→</div>

          <div className="migration-summary__section">
            <h2 className="migration-summary__section-title">
              <span className="migration-summary__highlight--cyan">Destination</span>
            </h2>
            <div className="migration-summary__info-card">
              <div className="migration-summary__info-row">
                <span className="migration-summary__info-label">Service:</span>
                <span className="migration-summary__info-value">
                  {destination.service.displayName}
                </span>
              </div>
              <div className="migration-summary__info-row">
                <span className="migration-summary__info-label">Root Path:</span>
                <span className="migration-summary__info-value">
                  {formatPath(destination.root)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="migration-summary__error">
            {error}
          </div>
        )}

        <div className="migration-summary__footer">
          <button
            type="button"
            className="migration-summary__start-button"
            onClick={handleStartDiscovery}
            disabled={isStarting}
          >
            <Search size={20} style={{ marginRight: "0.5rem" }} />
            {isStarting ? "Starting discovery..." : "Start discovery"}
          </button>
        </div>
      </div>
    </section>
  );
}

