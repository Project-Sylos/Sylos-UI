import "./ConfirmDialog.css";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional third action (shown between cancel and confirm). */
  secondaryLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  onSecondary?: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Yes",
  cancelLabel = "No",
  secondaryLabel,
  onConfirm,
  onCancel,
  onSecondary,
}: ConfirmDialogProps) {
  return (
    <div className="confirm-dialog__overlay" onClick={onCancel}>
      <div
        className="confirm-dialog__content"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="confirm-dialog__title">{title}</h2>
        <p className="confirm-dialog__message">{message}</p>
        <div
          className={`confirm-dialog__actions${
            secondaryLabel ? " confirm-dialog__actions--stacked" : ""
          }`}
        >
          <button
            type="button"
            className="confirm-dialog__button confirm-dialog__button--cancel"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          {secondaryLabel && onSecondary ? (
            <button
              type="button"
              className="confirm-dialog__button confirm-dialog__button--secondary"
              onClick={onSecondary}
            >
              {secondaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="confirm-dialog__button confirm-dialog__button--confirm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
