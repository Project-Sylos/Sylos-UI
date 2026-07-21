import { useEffect, useState } from "react";
import {
  DiffItem,
  PathIssue,
  validatePathProposal,
  acceptPathProposal,
  remapPathManual,
} from "../api/services";
import { PATH_REVIEW_COPY } from "../utils/pathReviewCopy";
import ConfirmDialog from "./ConfirmDialog";
import "./PathRenameEditor.css";

interface PathRenameEditorProps {
  migrationId: string;
  item: DiffItem;
  issue?: PathIssue | null;
  onClose: () => void;
  onApplied: () => void;
  onBusy?: (message: string | null) => void;
  onError?: (message: string) => void;
}

export default function PathRenameEditor({
  migrationId,
  item,
  issue,
  onClose,
  onApplied,
  onBusy,
  onError,
}: PathRenameEditorProps) {
  const initial =
    issue?.proposedPath || item.proposedPath || item.name || "";
  const [name, setName] = useState(initial);
  const [messages, setMessages] = useState<string[]>([]);
  const [valid, setValid] = useState(true);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showForceConfirm, setShowForceConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      const trimmed = name.trim();
      if (!trimmed) {
        setValid(false);
        setMessages(["The destination name can’t be empty."]);
        return;
      }
      setChecking(true);
      try {
        const res = await validatePathProposal(migrationId, item.id, trimmed);
        if (cancelled) return;
        setValid(res.valid);
        setMessages((res.messages || []).map((m) => m.message));
      } catch (err) {
        if (cancelled) return;
        setValid(false);
        setMessages([
          err instanceof Error ? err.message : "Could not check this name.",
        ]);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [migrationId, item.id, name]);

  const runAcceptSuggestion = async () => {
    const proposed = (issue?.proposedPath || item.proposedPath || "").trim();
    if (!proposed) return;
    setSubmitting(true);
    onBusy?.(PATH_REVIEW_COPY.updatingRelatedPaths);
    try {
      const res = await acceptPathProposal(migrationId, item.id, proposed);
      if (!res.success) {
        onError?.(res.message || "Could not apply the suggested name.");
        return;
      }
      onApplied();
      onClose();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not apply the suggested name.");
    } finally {
      setSubmitting(false);
      onBusy?.(null);
    }
  };

  const runApply = async (force: boolean) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    if (!force) onBusy?.(PATH_REVIEW_COPY.updatingRelatedPaths);
    try {
      const res = await remapPathManual(migrationId, item.id, trimmed, force);
      if (!res.success) {
        onError?.(res.message || "Could not rename this item.");
        setMessages(res.message ? [res.message] : messages);
        setValid(false);
        return;
      }
      onApplied();
      onClose();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not rename this item.");
    } finally {
      setSubmitting(false);
      onBusy?.(null);
      setShowForceConfirm(false);
    }
  };

  const hasSuggestion = !!(issue?.proposedPath || item.proposedPath);

  return (
    <>
      <div className="path-rename-editor__overlay" onClick={onClose}>
        <div
          className="path-rename-editor"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-labelledby="path-rename-editor-title"
        >
          <h2 id="path-rename-editor-title" className="path-rename-editor__title">
            {PATH_REVIEW_COPY.fixDestinationName}
          </h2>
          <p className="path-rename-editor__hint">
            Current name: <strong>{item.name}</strong>
          </p>
          <label className="path-rename-editor__label" htmlFor="path-rename-input">
            Destination name
          </label>
          <input
            id="path-rename-input"
            className="path-rename-editor__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            disabled={submitting}
          />
          {(checking || messages.length > 0) && (
            <ul className="path-rename-editor__messages">
              {checking && messages.length === 0 ? (
                <li>{PATH_REVIEW_COPY.checkingDestinationNames}</li>
              ) : (
                messages.map((m) => <li key={m}>{m}</li>)
              )}
            </ul>
          )}
          <div className="path-rename-editor__actions">
            <button
              type="button"
              className="path-rename-editor__btn path-rename-editor__btn--ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            {hasSuggestion && (
              <button
                type="button"
                className="path-rename-editor__btn"
                onClick={runAcceptSuggestion}
                disabled={submitting}
              >
                {PATH_REVIEW_COPY.acceptSuggestion}
              </button>
            )}
            <button
              type="button"
              className="path-rename-editor__btn path-rename-editor__btn--primary"
              onClick={() => runApply(false)}
              disabled={submitting || !name.trim() || (!valid && !checking)}
            >
              {PATH_REVIEW_COPY.apply}
            </button>
            {!valid && !checking && name.trim() && (
              <button
                type="button"
                className="path-rename-editor__btn path-rename-editor__btn--danger"
                onClick={() => setShowForceConfirm(true)}
                disabled={submitting}
              >
                {PATH_REVIEW_COPY.useNameAnyway}
              </button>
            )}
          </div>
        </div>
      </div>
      {showForceConfirm && (
        <ConfirmDialog
          title={PATH_REVIEW_COPY.forceTitle}
          message={PATH_REVIEW_COPY.forceConfirm}
          confirmLabel="Use anyway"
          cancelLabel="Cancel"
          onConfirm={() => runApply(true)}
          onCancel={() => setShowForceConfirm(false)}
        />
      )}
    </>
  );
}
