import "./OverwriteDialog.css";

interface OverwriteDialogProps {
  filename: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function OverwriteDialog({
  filename,
  onConfirm,
  onCancel,
}: OverwriteDialogProps) {
  return (
    <div className="overwrite-dialog__overlay" onClick={onCancel}>
      <div
        className="overwrite-dialog__content"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="overwrite-dialog__title">File Already Exists</h2>
        <p className="overwrite-dialog__message">
          The file <strong>"{filename}"</strong> already exists on the server.
        </p>
        <p className="overwrite-dialog__message">
          Do you want to overwrite it?
        </p>
        <div className="overwrite-dialog__actions">
          <button
            type="button"
            className="overwrite-dialog__button overwrite-dialog__button--cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="overwrite-dialog__button overwrite-dialog__button--confirm"
            onClick={onConfirm}
          >
            Overwrite
          </button>
        </div>
      </div>
    </div>
  );
}

