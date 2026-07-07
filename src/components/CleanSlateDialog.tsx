import { useState } from "react";
import "./CleanSlateDialog.css";

type CleanSlateDialogProps = {
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
};

export default function CleanSlateDialog({
  onConfirm,
  onCancel,
  busy = false,
}: CleanSlateDialogProps) {
  const [typed, setTyped] = useState("");

  return (
    <div className="clean-slate-dialog__overlay" role="presentation">
      <div
        className="clean-slate-dialog"
        role="dialog"
        aria-labelledby="clean-slate-title"
        aria-modal="true"
      >
        <h2 id="clean-slate-title" className="clean-slate-dialog__title">
          Remove all migration data?
        </h2>
        <p className="clean-slate-dialog__body">
          This permanently deletes every migration folder, migration database file, and
          migration registry entry on this Sylos install. User accounts, cloud provider app
          settings, and your login are kept. Running migrations are stopped first. This
          cannot be undone.
        </p>
        <label className="clean-slate-dialog__confirm-label">
          Type <strong>DELETE</strong> to confirm
          <input
            type="text"
            className="clean-slate-dialog__input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </label>
        <div className="clean-slate-dialog__actions">
          <button
            type="button"
            className="clean-slate-dialog__cancel"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="clean-slate-dialog__confirm"
            onClick={onConfirm}
            disabled={busy || typed !== "DELETE"}
          >
            {busy ? "Removing..." : "Remove all migration data"}
          </button>
        </div>
      </div>
    </div>
  );
}
