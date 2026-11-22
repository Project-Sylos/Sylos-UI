import { AlertTriangle, FolderInput, KeyRound } from "lucide-react";

import type { ImportScanReport, LocalRootProbe } from "../types/migrations";
import "./ImportAttentionWizard.css";

type Props = {
  migrationId: string;
  report: ImportScanReport;
  busy?: boolean;
  onFixCredentials: () => void;
  onRemapLocal: (probe: LocalRootProbe) => void;
  onSkipLocalRemap: () => void;
  onOpenMigration: () => void;
  onDismiss: () => void;
};

export default function ImportAttentionWizard({
  migrationId,
  report,
  busy,
  onFixCredentials,
  onRemapLocal,
  onSkipLocalRemap,
  onOpenMigration,
  onDismiss,
}: Props) {
  const needsCreds = Boolean(report.needsAttention);
  const localRoots = report.localRoots ?? [];
  const hasLocal = localRoots.length > 0;

  return (
    <div className="import-attention-wizard" role="dialog" aria-modal="true">
      <div className="import-attention-wizard__panel">
        <header className="import-attention-wizard__header">
          <AlertTriangle size={22} aria-hidden="true" />
          <div>
            <h2>Imported migration needs setup</h2>
            <p>
              <code>{migrationId}</code> was imported without usable provider
              credentials. You can open the migration and work in review, but
              discovery, copy, delete, and other live filesystem actions stay
              blocked until auth is fixed.
            </p>
          </div>
        </header>

        {needsCreds && (
          <section className="import-attention-wizard__section">
            <h3>
              <KeyRound size={16} aria-hidden="true" /> Re-authenticate providers
            </h3>
            <p>
              Cloud or SFTP credentials from the export cannot be used on this
              install. Open the confirm page and reconnect the same providers
              that were used for source and destination (you cannot switch
              providers for this imported migration).
            </p>
            <button
              type="button"
              className="import-attention-wizard__primary"
              disabled={busy}
              onClick={onFixCredentials}
            >
              Fix on confirm page
            </button>
          </section>
        )}

        {hasLocal && (
          <section className="import-attention-wizard__section">
            <h3>
              <FolderInput size={16} aria-hidden="true" /> Local path remap
              (optional)
            </h3>
            <p>
              Local absolute paths may differ on this machine. Remap is only
              offered during import.
            </p>
            <ul className="import-attention-wizard__roots">
              {localRoots.map((root) => (
                <li key={`${root.role}-${root.nativePath || ""}`}>
                  <div>
                    <strong>{root.role}</strong>:{" "}
                    <code>{root.nativePath || "(unknown path)"}</code>
                    <span
                      className={
                        root.pathExistsOnHost
                          ? "import-attention-wizard__hint--ok"
                          : "import-attention-wizard__hint--missing"
                      }
                    >
                      {root.pathExistsOnHost
                        ? " path found on this host"
                        : " path not found on this host"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="import-attention-wizard__secondary"
                    disabled={busy}
                    onClick={() => onRemapLocal(root)}
                  >
                    Remap {root.role}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="import-attention-wizard__ghost"
              disabled={busy}
              onClick={onSkipLocalRemap}
            >
              Keep existing local paths
            </button>
          </section>
        )}

        <footer className="import-attention-wizard__footer">
          <button
            type="button"
            className="import-attention-wizard__ghost"
            disabled={busy}
            onClick={onDismiss}
          >
            {needsCreds ? "Fix it later" : "Done"}
          </button>
          <button
            type="button"
            className="import-attention-wizard__secondary"
            disabled={busy}
            onClick={onOpenMigration}
          >
            Open migration
          </button>
        </footer>
      </div>
    </div>
  );
}
