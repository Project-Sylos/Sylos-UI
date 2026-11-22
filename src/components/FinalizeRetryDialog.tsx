import "./ConfirmDialog.css";
import "./FinalizeRetryDialog.css";

export type FinalizeRetryMode = "resume" | "refold";

type FinalizeRetryDialogProps = {
  errorMessage?: string | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (mode: FinalizeRetryMode) => void;
};

export default function FinalizeRetryDialog({
  errorMessage,
  busy = false,
  onCancel,
  onConfirm,
}: FinalizeRetryDialogProps) {
  return (
    <div className="confirm-dialog__overlay" onClick={busy ? undefined : onCancel}>
      <div
        className="confirm-dialog__content finalize-retry-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="finalize-retry-title"
      >
        <h2 id="finalize-retry-title" className="confirm-dialog__title">
          Retry database finalize?
        </h2>
        <p className="confirm-dialog__message">
          Queues finished, but sealing, folder-size totals, or checkpointing failed.
          Resume continues from the last sealed depth. Recalculate rebuilds all folder
          sizes from the discovered tree without re-running discovery.
        </p>
        {errorMessage ? (
          <p className="finalize-retry-dialog__error" role="status">
            {errorMessage}
          </p>
        ) : null}
        <div className="confirm-dialog__actions finalize-retry-dialog__actions">
          <button
            type="button"
            className="confirm-dialog__button confirm-dialog__button--cancel"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm-dialog__button confirm-dialog__button--secondary"
            disabled={busy}
            onClick={() => onConfirm("refold")}
          >
            {busy ? "Starting…" : "Recalculate folder sizes"}
          </button>
          <button
            type="button"
            className="confirm-dialog__button confirm-dialog__button--confirm"
            disabled={busy}
            onClick={() => onConfirm("resume")}
          >
            {busy ? "Starting…" : "Resume finalize"}
          </button>
        </div>
      </div>
    </div>
  );
}
