// Copyright 2025 Sylos contributors
// SPDX-License-Identifier: LGPL-2.1-or-later

import { AlertTriangle, Eye, EyeOff, File, Folder, Info } from "lucide-react";
import { DiffItem } from "../api/services";
import {
  PATH_REVIEW_COPY,
  destinationDisplayName,
  destinationDisplayPath,
  hasDestinationRename,
  isAutoHandledCompat,
  needsManualCompatAction,
  pathIssueShortLabel,
} from "../utils/pathReviewCopy";
import "./PathReviewInspector.css";

export type PathReviewInspectorPhase =
  | "traversal"
  | "copy"
  | "source-cleanup"
  | "delete";

type PathReviewInspectorProps = {
  item: DiffItem | null;
  phase: PathReviewInspectorPhase;
  busy?: boolean;
  canExclude?: boolean;
  canRetry?: boolean;
  isExcluded?: boolean;
  isMarkedForRetry?: boolean;
  canRename?: boolean;
  canToggleIgnoreWarning?: boolean;
  onRename?: () => void;
  onToggleIgnoreWarning?: () => void;
  onExclude?: () => void;
  onRetry?: () => void;
};

function formatDate(dateString?: string): string {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

function formatSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return "N/A";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function Detail({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="path-review-inspector__detail">
      <span className="path-review-inspector__detail-label">{label}</span>
      <span className="path-review-inspector__detail-value" title={title || value}>
        {value}
      </span>
    </div>
  );
}

/**
 * Persistent right-hand inspector for Path Review selection.
 * Shows source/destination context, compatibility details, and phase-aware actions.
 */
export default function PathReviewInspector({
  item,
  phase = "traversal",
  busy = false,
  canExclude = false,
  canRetry = false,
  isExcluded = false,
  isMarkedForRetry = false,
  canRename = false,
  canToggleIgnoreWarning = false,
  onRename,
  onToggleIgnoreWarning,
  onExclude,
  onRetry,
}: PathReviewInspectorProps) {
  if (!item) {
    return (
      <aside className="path-review-inspector" aria-label="Item details">
        <div className="path-review-inspector__empty">
          <p className="path-review-inspector__empty-title">Select an item</p>
          <p className="path-review-inspector__empty-body">
            Click a row to review source, destination, and naming details. Use the
            chevron or double-click a folder to open it.
          </p>
        </div>
      </aside>
    );
  }

  const inSrc = !!item.src;
  const inDst = !!item.dst;
  const hideCompat =
    phase === "delete" || phase === "source-cleanup";
  const warningIgnored = !!item.pathIssueIgnored;
  const hasCompat =
    !hideCompat && Boolean(item.pathIssueStatus || item.proposedPath);
  const autoCompat = !warningIgnored && isAutoHandledCompat(item);
  const manualCompat = !warningIgnored && needsManualCompatAction(item);
  const renamed = hasDestinationRename(item);
  const destName = destinationDisplayName(item);
  const destPath = destinationDisplayPath(item);
  const shortLabel = pathIssueShortLabel(item.pathIssueMessages);
  const docsURL = item.pathIssueMessages?.find((m) => m.docsURL)?.docsURL;
  const explanations =
    item.pathIssueMessages?.filter((m) => m.message?.trim()).slice(0, 6) ?? [];
  const isFolder = item.type === "folder";
  const issueCount = Math.max(1, explanations.length || (hasCompat ? 1 : 0));
  const destRenameLabel =
    phase === "copy"
      ? PATH_REVIEW_COPY.renamedTo
      : PATH_REVIEW_COPY.willBeCreatedAs;

  return (
    <aside className="path-review-inspector" aria-label="Item details">
      <div className="path-review-inspector__header">
        <div className="path-review-inspector__header-icon" aria-hidden>
          {isFolder ? <Folder size={18} /> : <File size={18} />}
        </div>
        <div className="path-review-inspector__header-text">
          <h2 className="path-review-inspector__title" title={item.name}>
            {item.name}
          </h2>
          <p className="path-review-inspector__type">
            {isFolder ? "Folder" : "File"}
          </p>
        </div>
      </div>

      <div className="path-review-inspector__scroll">
        <section className="path-review-inspector__section">
          <h3 className="path-review-inspector__section-title">Source</h3>
          {inSrc && item.src ? (
            <div className="path-review-inspector__section-body">
              <Detail label="Name" value={item.src.name} />
              <Detail
                label="Path"
                value={item.src.locationPath}
                title={item.src.locationPath}
              />
              {item.src.type === "file" && (
                <Detail label="Size" value={formatSize(item.src.size)} />
              )}
              <Detail
                label="Last modified"
                value={formatDate(item.src.lastUpdated)}
              />
            </div>
          ) : (
            <p className="path-review-inspector__muted">Not present on source</p>
          )}
        </section>

        {!hideCompat ? (
        <section className="path-review-inspector__section">
          <h3 className="path-review-inspector__section-title">Destination</h3>
          <div className="path-review-inspector__section-body">
            {item.proposedPath || (renamed && !inDst) ? (
              <>
                <Detail label={destRenameLabel} value={destName} />
                <Detail label="Path" value={destPath} title={destPath} />
              </>
            ) : inDst && item.dst ? (
              <>
                <Detail label="Name" value={destName} />
                <Detail label="Path" value={destPath} title={destPath} />
                {renamed ? (
                  <p className="path-review-inspector__rename-note">
                    <Info size={13} aria-hidden />
                    {phase === "copy"
                      ? `${PATH_REVIEW_COPY.renamedTo}: ${destName}`
                      : PATH_REVIEW_COPY.renamedOnDestination}
                  </p>
                ) : null}
                {item.dst.type === "file" && (
                  <Detail label="Size" value={formatSize(item.dst.size)} />
                )}
                <Detail
                  label="Last modified"
                  value={formatDate(item.dst.lastUpdated)}
                />
              </>
            ) : (
              <>
                <Detail label="Name" value={item.name} />
                <Detail
                  label="Path"
                  value={item.locationPath}
                  title={item.locationPath}
                />
                <p className="path-review-inspector__muted">
                  Not present on destination yet
                </p>
              </>
            )}
          </div>
        </section>
        ) : null}

        {hasCompat && (
          <section
            className={`path-review-inspector__section path-review-inspector__section--compat${
              autoCompat ? " path-review-inspector__section--compat-info" : ""
            }${
              manualCompat ? " path-review-inspector__section--compat-action" : ""
            }${
              warningIgnored
                ? " path-review-inspector__section--compat-ignored"
                : ""
            }`}
          >
            <h3 className="path-review-inspector__section-title">
              {warningIgnored ? (
                <EyeOff size={14} aria-hidden />
              ) : autoCompat ? (
                <Info size={14} aria-hidden />
              ) : (
                <AlertTriangle size={14} aria-hidden />
              )}
              {warningIgnored
                ? PATH_REVIEW_COPY.compatibilityIgnoredLabel
                : autoCompat
                  ? PATH_REVIEW_COPY.compatibilityWarningLabel
                  : PATH_REVIEW_COPY.compatibilityNeedsActionLabel}
            </h3>
            {warningIgnored ? (
              <>
                <p className="path-review-inspector__muted">
                  {PATH_REVIEW_COPY.compatIgnoredDetail}
                </p>
                {explanations.length > 0 ? (
                  <ul className="path-review-inspector__reasons path-review-inspector__reasons--muted">
                    {explanations.map((msg, idx) => (
                      <li key={`insp-${idx}`}>{msg.message}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : autoCompat ? (
              <>
                <p className="path-review-inspector__compat-summary">
                  {PATH_REVIEW_COPY.compatAutoHandledSummary(
                    issueCount,
                    destName
                  )}
                </p>
                <p className="path-review-inspector__muted">
                  {PATH_REVIEW_COPY.compatAutoHandledDetail}
                </p>
                {explanations.length > 0 ? (
                  <ul className="path-review-inspector__reasons path-review-inspector__reasons--muted">
                    {explanations.map((msg, idx) => (
                      <li key={`insp-${idx}`}>{msg.message}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <>
                <p className="path-review-inspector__compat-short">{shortLabel}</p>
                {explanations.length > 0 ? (
                  <ul className="path-review-inspector__reasons">
                    {explanations.map((msg, idx) => (
                      <li key={`insp-${idx}`}>{msg.message}</li>
                    ))}
                  </ul>
                ) : item.pathIssueStatus === "manual_review" ? (
                  <p className="path-review-inspector__muted">
                    {PATH_REVIEW_COPY.manualReviewTip}
                  </p>
                ) : (
                  <p className="path-review-inspector__muted">
                    This name needs a change to work on the destination.
                  </p>
                )}
              </>
            )}
            {docsURL ? (
              <a
                className="path-review-inspector__docs"
                href={docsURL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Naming rules
              </a>
            ) : null}
          </section>
        )}
      </div>

      <div className="path-review-inspector__actions">
        {(canRename || canToggleIgnoreWarning) && (
          <div className="path-review-inspector__action-row">
            {canRename && (
              <button
                type="button"
                className="glass-button glass-button--small"
                disabled={busy}
                onClick={onRename}
              >
                {PATH_REVIEW_COPY.renameDestination}
              </button>
            )}
            {canToggleIgnoreWarning && (
              <button
                type="button"
                className="glass-button glass-button--small path-review-inspector__icon-toggle"
                disabled={busy}
                onClick={onToggleIgnoreWarning}
                title={
                  warningIgnored
                    ? PATH_REVIEW_COPY.unignoreWarning
                    : PATH_REVIEW_COPY.ignoreWarning
                }
                aria-label={
                  warningIgnored
                    ? PATH_REVIEW_COPY.unignoreWarning
                    : PATH_REVIEW_COPY.ignoreWarning
                }
                aria-pressed={warningIgnored}
              >
                {warningIgnored ? (
                  <EyeOff size={16} aria-hidden />
                ) : (
                  <Eye size={16} aria-hidden />
                )}
              </button>
            )}
          </div>
        )}
        {canExclude && (
          <button
            type="button"
            className="glass-button glass-button--small"
            disabled={busy}
            onClick={onExclude}
          >
            {isExcluded ? "Unexclude" : "Exclude"}
          </button>
        )}
        {canRetry && (
          <button
            type="button"
            className="glass-button glass-button--small"
            disabled={busy}
            onClick={onRetry}
          >
            {isMarkedForRetry ? "Unmark retry" : "Mark for retry"}
          </button>
        )}
      </div>
    </aside>
  );
}
