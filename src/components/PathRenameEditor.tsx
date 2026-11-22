import { useEffect, useState } from "react";
import {
  DiffItem,
  PathIssue,
  PathIssueMessage,
  PathRenameProgress,
  validatePathProposal,
  acceptPathProposal,
  remapPathManual,
  resetPathRemap,
  getPathRenameProgress,
  softStopPathRename,
  hardStopPathRename,
} from "../api/services";
import { PATH_REVIEW_COPY } from "../utils/pathReviewCopy";
import ConfirmDialog from "./ConfirmDialog";
import "./PathRenameEditor.css";

interface PathRenameEditorProps {
  migrationId: string;
  item: DiffItem;
  issue?: PathIssue | null;
  /** Override the starting destination name (e.g. suggested unique name). */
  initialName?: string;
  onClose: () => void;
  /** Called with the applied destination basename after a successful rename. */
  onApplied: (appliedName: string) => void;
  /** Fired when a long-running rename cascade starts/stops (for the active-tasks dock). */
  onCascadeActiveChange?: (active: boolean) => void;
  /** Increment to bring a hidden in-progress dialog back to the foreground. */
  revealNonce?: number;
  onError?: (message: string) => void;
}

export default function PathRenameEditor({
  migrationId,
  item,
  issue,
  initialName,
  onClose,
  onApplied,
  onCascadeActiveChange,
  revealNonce = 0,
  onError,
}: PathRenameEditorProps) {
  const seed =
    (initialName || "").trim() ||
    issue?.proposedPath ||
    item.proposedPath ||
    item.resolvedDstName ||
    item.name ||
    "";
  const [name, setName] = useState(seed);
  const [messages, setMessages] = useState<PathIssueMessage[]>([]);
  const [valid, setValid] = useState(true);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  const [showSiblingConfirm, setShowSiblingConfirm] = useState(false);
  const [progress, setProgress] = useState<PathRenameProgress | null>(null);
  const [stopBusy, setStopBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (revealNonce > 0) setHidden(false);
  }, [revealNonce]);

  const hasAcceptedRename = Boolean(
    item.resolvedDstName && item.resolvedDstName !== item.name
  );

  const hasSiblingCollision = messages.some(
    (m) => m.category === "SiblingCollision"
  );

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      const trimmed = name.trim();
      if (!trimmed) {
        setValid(false);
        setMessages([{ message: "The name can’t be empty." }]);
        return;
      }
      setChecking(true);
      try {
        const res = await validatePathProposal(migrationId, item.id, trimmed);
        if (cancelled) return;
        setValid(res.valid);
        setMessages(res.messages?.length ? res.messages : []);
      } catch (err) {
        if (cancelled) return;
        setValid(false);
        setMessages([
          {
            message:
              err instanceof Error ? err.message : "Could not check this name.",
          },
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

  useEffect(() => {
    if (!submitting) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    let sawServerProgress = false;
    setProgress({
      active: true,
      phase: "starting",
      message: PATH_REVIEW_COPY.updatingRelatedPaths,
      done: 0,
      total: 0,
      canSoftStop: false,
      canHardStop: false,
    });
    const tick = async () => {
      try {
        const p = await getPathRenameProgress(migrationId);
        if (cancelled) return;
        if (p.active) {
          sawServerProgress = true;
          setProgress(p);
          return;
        }
        if (!sawServerProgress) {
          return;
        }
        setProgress((prev) =>
          prev
            ? { ...prev, canSoftStop: false, canHardStop: false }
            : prev
        );
      } catch {
        /* ignore */
      }
    };
    void tick();
    const handle = setInterval(() => {
      void tick();
    }, 750);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [submitting, migrationId]);

  const beginCascade = () => {
    setSubmitting(true);
    onCascadeActiveChange?.(true);
  };

  const endCascade = () => {
    setSubmitting(false);
    setProgress(null);
    setStopBusy(false);
    onCascadeActiveChange?.(false);
  };

  const runAcceptSuggestion = async () => {
    const proposed = (issue?.proposedPath || item.proposedPath || "").trim();
    if (!proposed) return;
    beginCascade();
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
      endCascade();
    }
  };

  const runApply = async (force: boolean) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    beginCascade();
    try {
      const res = await remapPathManual(migrationId, item.id, trimmed, force);
      if (!res.success) {
        onError?.(res.message || "Could not rename this item.");
        setMessages(res.message ? [{ message: res.message }] : messages);
        setValid(false);
        return;
      }
      onApplied(trimmed);
      onClose();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not rename this item.");
    } finally {
      endCascade();
      setShowForceConfirm(false);
      setShowSiblingConfirm(false);
    }
  };

  const runReset = async () => {
    beginCascade();
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
      endCascade();
    }
  };

  const hasSuggestion = !!(issue?.proposedPath || item.proposedPath);

  const handleApplyClick = () => {
    if (!name.trim() || submitting || checking) return;
    if (hasSiblingCollision) {
      setShowSiblingConfirm(true);
      return;
    }
    if (!valid) {
      setShowForceConfirm(true);
      return;
    }
    void runApply(false);
  };

  const handleClose = () => {
    // Keep the cascade running in the background; reopen via Active tasks.
    if (submitting) {
      setHidden(true);
      return;
    }
    onClose();
  };

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : null;

  if (hidden) {
    return null;
  }

  return (
    <>
      <div className="path-rename-editor__overlay" onClick={handleClose}>
        <div
          className="path-rename-editor"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-labelledby="path-rename-editor-title"
        >
          <h2 id="path-rename-editor-title" className="path-rename-editor__title">
            {PATH_REVIEW_COPY.fixDestinationName}
          </h2>

          {submitting ? (
            <div className="path-rename-editor__progress">
              <p className="path-rename-editor__progress-msg">
                {progress?.message || PATH_REVIEW_COPY.updatingRelatedPaths}
              </p>
              <div className="path-rename-editor__progress-counts">
                {progress?.phase === "starting"
                  ? "Starting…"
                  : progress?.phase === "refresh"
                    ? "Working…"
                    : progress && progress.total > 0
                      ? `${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
                      : progress && progress.done > 0
                        ? `${progress.done.toLocaleString()} checked`
                        : "Starting…"}
              </div>
              <div
                className={
                  pct != null
                    ? "path-rename-editor__bar"
                    : "path-rename-editor__bar path-rename-editor__bar--indeterminate"
                }
                role="progressbar"
                aria-valuenow={pct ?? undefined}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="path-rename-editor__bar-fill"
                  style={pct != null ? { width: `${pct}%` } : undefined}
                />
              </div>
              <div className="path-rename-editor__actions">
                {progress?.canSoftStop ? (
                  <button
                    type="button"
                    className="path-rename-editor__btn"
                    disabled={stopBusy}
                    onClick={() => {
                      setStopBusy(true);
                      void softStopPathRename(migrationId)
                        .catch((err) =>
                          onError?.(
                            err instanceof Error
                              ? err.message
                              : "Could not stop rename."
                          )
                        )
                        .finally(() => setStopBusy(false));
                    }}
                  >
                    Stop & revert
                  </button>
                ) : null}
                {progress?.canHardStop ? (
                  <button
                    type="button"
                    className="path-rename-editor__btn path-rename-editor__btn--danger"
                    disabled={stopBusy}
                    onClick={() => {
                      setStopBusy(true);
                      void hardStopPathRename(migrationId)
                        .catch((err) =>
                          onError?.(
                            err instanceof Error
                              ? err.message
                              : "Could not hard-stop rename."
                          )
                        )
                        .finally(() => setStopBusy(false));
                    }}
                  >
                    Hard stop
                  </button>
                ) : null}
                <button
                  type="button"
                  className="path-rename-editor__btn path-rename-editor__btn--ghost"
                  onClick={handleClose}
                >
                  Hide
                </button>
              </div>
              <p className="path-rename-editor__progress-hint">
                Hide keeps this running. Open it again from Active tasks.
              </p>
            </div>
          ) : (
            <>
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
              />
              {(checking || messages.length > 0) && (
                <ul className="path-rename-editor__messages">
                  {checking && messages.length === 0 ? (
                    <li>{PATH_REVIEW_COPY.checkingDestinationNames}</li>
                  ) : (
                    messages.map((m) => (
                      <li key={`${m.category || ""}:${m.message}`}>
                        {m.message}
                      </li>
                    ))
                  )}
                </ul>
              )}
              <div className="path-rename-editor__actions">
                <button
                  type="button"
                  className="path-rename-editor__btn path-rename-editor__btn--ghost"
                  onClick={onClose}
                >
                  Cancel
                </button>
                {hasAcceptedRename && (
                  <button
                    type="button"
                    className="path-rename-editor__btn"
                    onClick={() => void runReset()}
                    title={PATH_REVIEW_COPY.resetDestinationNameTip}
                  >
                    {PATH_REVIEW_COPY.resetDestinationName}
                  </button>
                )}
                {hasSuggestion && !initialName && (
                  <button
                    type="button"
                    className="path-rename-editor__btn"
                    onClick={runAcceptSuggestion}
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
                  disabled={!name.trim() || checking}
                >
                  {PATH_REVIEW_COPY.apply}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {showSiblingConfirm && (
        <ConfirmDialog
          title={PATH_REVIEW_COPY.siblingCollisionConfirmTitle}
          message={PATH_REVIEW_COPY.siblingCollisionConfirm}
          confirmLabel={PATH_REVIEW_COPY.siblingCollisionConfirmKeep}
          cancelLabel={PATH_REVIEW_COPY.siblingCollisionConfirmEdit}
          onConfirm={() => runApply(true)}
          onCancel={() => setShowSiblingConfirm(false)}
        />
      )}
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
