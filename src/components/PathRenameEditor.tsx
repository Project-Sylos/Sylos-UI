import { useEffect, useState } from "react";
import {
  DiffItem,
  PathIssue,
  validatePathProposal,
  acceptPathProposal,
  remapPathManual,
  resetPathRemap,
} from "../api/services";
import { PATH_REVIEW_COPY } from "../utils/pathReviewCopy";
import ConfirmDialog from "./ConfirmDialog";
import "./PathRenameEditor.css";

interface PathRenameEditorProps {
  migrationId: string;
  item: DiffItem;
  issue?: PathIssue | null;
  onClose: () => void;
  /** Called with the applied destination basename after a successful rename. */
  onApplied: (appliedName: string) => void;
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
    issue?.proposedPath || item.proposedPath || item.resolvedDstName || item.name || "";
  const [name, setName] = useState(initial);
  const [messages, setMessages] = useState<string[]>([]);
  const [valid, setValid] = useState(true);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showForceConfirm, setShowForceConfirm] = useState(false);

  const hasAcceptedRename = Boolean(
    item.resolvedDstName && item.resolvedDstName !== item.name
  );

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      const trimmed = name.trim();
      if (!trimmed) {
        setValid(false);
        setMessages(["The name can’t be empty."]);
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
      onApplied(proposed);
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
      onApplied(trimmed);
      onClose();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not rename this item.");
    } finally {
      setSubmitting(false);
      onBusy?.(null);
      setShowForceConfirm(false);
    }
  };

  const runReset = async () => {
    setSubmitting(true);
    onBusy?.(PATH_REVIEW_COPY.updatingRelatedPaths);
    try {
      const res = await resetPathRemap(migrationId, item.id);
      if (!res.success) {
        onError?.(res.message || "Could not reset name.");
        return;
      }
      onApplied("");
      onClose();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not reset name.");
    } finally {
      setSubmitting(false);
      onBusy?.(null);
    }
  };

  const hasSuggestion = !!(issue?.proposedPath || item.proposedPath);

  const handleApplyClick = () => {
    if (!name.trim() || submitting || checking) return;
    if (!valid) {
      setShowForceConfirm(true);
      return;
    }
    void runApply(false);
  };

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
            {item.copyStatus === "already_existed" ? (
              <>
                <br />
                {PATH_REVIEW_COPY.alreadyExistedAcceptHelp}
              </>
            ) : null}
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
            {hasAcceptedRename && (
              <button
                type="button"
                className="path-rename-editor__btn"
                onClick={() => void runReset()}
                disabled={submitting}
                title={PATH_REVIEW_COPY.resetDestinationNameTip}
              >
                {PATH_REVIEW_COPY.resetDestinationName}
              </button>
            )}
            {hasSuggestion && (
              <button
                type="button"
                className="path-rename-editor__btn"
                onClick={runAcceptSuggestion}
                disabled={submitting}
              >
                {item.copyStatus === "already_existed"
                  ? PATH_REVIEW_COPY.acceptRenameExisting
                  : PATH_REVIEW_COPY.acceptSuggestion}
              </button>
            )}
            <button
              type="button"
              className="path-rename-editor__btn path-rename-editor__btn--primary"
              onClick={handleApplyClick}
              disabled={submitting || !name.trim() || checking}
            >
              {PATH_REVIEW_COPY.apply}
            </button>
          </div>
        </div>
      </div>
      {showForceConfirm && (
        <ConfirmDialog
          title={PATH_REVIEW_COPY.forceTitle}
          message={PATH_REVIEW_COPY.forceConfirmSoft}
          confirmLabel="Use anyway"
          cancelLabel="Cancel"
          onConfirm={() => runApply(true)}
          onCancel={() => setShowForceConfirm(false)}
        />
      )}
    </>
  );
}
