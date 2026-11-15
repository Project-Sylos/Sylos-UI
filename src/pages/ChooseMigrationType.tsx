import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { PlayCircle, RotateCcw, X } from "lucide-react";

import SelectionPage from "../components/SelectionPage";
import { useSelection } from "../context/SelectionContext";
import {
  fetchLiveMigrations,
  postLoginPathForLiveMigrations,
  type LiveMigrationSummary,
} from "../utils/liveMigrations";
import "./ChooseMigrationType.css";

export default function ChooseMigrationType() {
  const navigate = useNavigate();
  const { clearSelections } = useSelection();
  const [liveMigrations, setLiveMigrations] = useState<LiveMigrationSummary[]>(
    []
  );
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    clearSelections();
  }, [clearSelections]);

  useEffect(() => {
    let cancelled = false;
    void fetchLiveMigrations()
      .then((live) => {
        if (!cancelled) setLiveMigrations(live);
      })
      .catch(() => {
        if (!cancelled) setLiveMigrations([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(
    () => [
      {
        id: "new",
        name: "Start a new migration",
        description:
          "Pick a source and destination, then discover what to move.",
        icon: <PlayCircle size={40} strokeWidth={1.6} />,
        iconAccent: "a",
      },
      {
        id: "resume",
        name: "Resume an existing one",
        description:
          "Continue a saved migration, or import from a folder / upload a zip to pick back up.",
        icon: <RotateCcw size={40} strokeWidth={1.6} />,
        iconAccent: "b",
      },
    ],
    []
  );

  const handleSelect = (id: string) => {
    if (id === "new") {
      clearSelections();
      navigate("/summary");
    } else if (id === "resume") {
      navigate("/resume");
    }
  };

  const liveHref = postLoginPathForLiveMigrations(liveMigrations);
  const showLiveBanner =
    !bannerDismissed && liveMigrations.length > 0;

  return (
    <div className="choose-migration-type">
      {showLiveBanner ? (
        <div className="choose-migration-type__live-banner" role="status">
          <p className="choose-migration-type__live-banner-text">
            {liveMigrations.length === 1 ? (
              <>
                1 migration is still running.{" "}
                <Link to={liveHref}>Open Progress Monitor</Link>
              </>
            ) : (
              <>
                {liveMigrations.length} migrations are still running.{" "}
                <Link to={liveHref}>View them</Link>
              </>
            )}
          </p>
          <button
            type="button"
            className="choose-migration-type__live-banner-dismiss"
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss"
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      <SelectionPage
        variant="brand"
        title={
          <>
            Let's get <span className="selection-page__highlight">started</span>
          </>
        }
        options={options}
        onSelect={handleSelect}
      />
    </div>
  );
}
