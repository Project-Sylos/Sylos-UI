import { FormEvent, useEffect, useState } from "react";

import ConfirmDialog from "./ConfirmDialog";
import "./ConfirmDialog.css";

interface NewFolderModalProps {
  onConfirm: (name: string) => void;
  onCancel: () => void;
  submitting?: boolean;
}

export default function NewFolderModal({
  onConfirm,
  onCancel,
  submitting = false,
}: NewFolderModalProps) {
  const [name, setName] = useState("");

  useEffect(() => {
    setName("");
  }, []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) {
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <div className="confirm-dialog__overlay" onClick={onCancel}>
      <div
        className="confirm-dialog__content"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="confirm-dialog__title">New folder</h2>
        <form onSubmit={handleSubmit}>
          <label className="new-folder-modal__label">
            Folder name
            <input
              className="new-folder-modal__input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              disabled={submitting}
            />
          </label>
          <div className="confirm-dialog__actions">
            <button
              type="button"
              className="confirm-dialog__button confirm-dialog__button--cancel"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="confirm-dialog__button confirm-dialog__button--confirm"
              disabled={submitting || !name.trim()}
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
