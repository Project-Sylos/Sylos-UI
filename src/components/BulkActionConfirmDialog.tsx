import type { BulkInvalidItem } from "../utils/bulkActionEligibility";
import FileTypeIcon from "./FileTypeIcon";
import "./BulkActionConfirmDialog.css";

interface BulkActionConfirmDialogProps {
  actionLabel: string;
  validCount: number;
  invalid: BulkInvalidItem[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function BulkActionConfirmDialog({
  actionLabel,
  validCount,
  invalid,
  onConfirm,
  onCancel,
}: BulkActionConfirmDialogProps) {
  return (
    <div className="bulk-action-dialog__overlay" onClick={onCancel}>
      <div
        className="bulk-action-dialog__content"
        role="dialog"
        aria-modal="true"
        aria-label={`${actionLabel}: some items cannot be included`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="bulk-action-dialog__title">
          Some items can&apos;t be included
        </h2>
        <p className="bulk-action-dialog__message">
          {invalid.length} of the selected item{invalid.length === 1 ? " is" : "s are"}{" "}
          not in a state where <strong>{actionLabel}</strong> can be applied:
        </p>
        <ul className="bulk-action-dialog__list">
          {invalid.map(({ item, reason }) => (
            <li key={item.id} className="bulk-action-dialog__item">
              <FileTypeIcon
                name={item.name}
                type={item.type === "folder" ? "folder" : "file"}
                size={16}
              />
              <span className="bulk-action-dialog__item-name">{item.name}</span>
              <span className="bulk-action-dialog__item-reason">{reason}</span>
            </li>
          ))}
        </ul>
        <p className="bulk-action-dialog__message">
          {actionLabel} will be applied to the remaining {validCount} item
          {validCount === 1 ? "" : "s"}. Leave the items above out and continue?
        </p>
        <div className="bulk-action-dialog__actions">
          <button
            type="button"
            className="bulk-action-dialog__button bulk-action-dialog__button--cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="bulk-action-dialog__button bulk-action-dialog__button--confirm"
            onClick={onConfirm}
          >
            Remove invalid and apply
          </button>
        </div>
      </div>
    </div>
  );
}
