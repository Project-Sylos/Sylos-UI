import { useState } from "react";
import "./CleanSlateDialog.css";

export type DestructiveConfirmDialogProps = {
  title: string;
  body: string;
  confirmLabel: string;
  confirmPhrase?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
};

export default function DestructiveConfirmDialog({
  title,
  body,
  confirmLabel,
  confirmPhrase = "DELETE",
  onConfirm,
  onCancel,
  busy = false,
}: DestructiveConfirmDialogProps) {
  const [typed, setTyped] = useState("");

  return (
    <div className="clean-slate-dialog__overlay" role="presentation">
      <div
        className="clean-slate-dialog"
        role="dialog"
        aria-labelledby="destructive-confirm-title"
        aria-modal="true"
      >
        <h2 id="destructive-confirm-title" className="clean-slate-dialog__title">
          {title}
        </h2>
        <p className="clean-slate-dialog__body">{body}</p>
        <label className="clean-slate-dialog__confirm-label">
          Type <strong>{confirmPhrase}</strong> to confirm
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
            disabled={busy || typed !== confirmPhrase}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
