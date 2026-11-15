// Copyright 2025 Sylos contributors
// SPDX-License-Identifier: LGPL-2.1-or-later

import { AlertTriangle, Eye, EyeOff, Info, FilterX, Pencil } from "lucide-react";
import { DiffItem } from "../api/services";
import FileTypeIcon from "./FileTypeIcon";
import {
  PATH_REVIEW_COPY,
  destinationDisplayName,
  destinationDisplayPath,
  hasDestinationRename,
  isAutoHandledCompat,
  itemDisplayPath,
  needsManualCompatAction,
  pathIssueShortLabel,
} from "../utils/pathReviewCopy";
import { excludedByRuleText, isRuleExcluded } from "../utils/pathReviewRuleExclusion";
import "./PathReviewInspector.css";

export type PathReviewInspectorPhase =
  | "traversal"
  | "copy"
  | "copy-plan"
  | "source-cleanup"
  | "delete";

type PathReviewInspectorProps = {
  item: DiffItem;
  phase: PathReviewInspectorPhase;
  busy?: boolean;
  /** Show Exclude control for this phase (may be disabled). */
  showExclude?: boolean;
  canExclude?: boolean;
  excludeLabel?: string;
  excludeDisabledReason?: string | null;
  /** Show Retry control for this phase (may be disabled). */
  showRetry?: boolean;
  canRetry?: boolean;
  canForceReplace?: boolean;
  canUnforceReplace?: boolean;
  canUniqueName?: boolean;
  canUndoAcceptedRename?: boolean;
  uniqueNameSuggestion?: string | null;
  /** Overrides the retry button label (copy status cycle steps). */
  retryLabel?: string;
  retryDisabledReason?: string | null;
  isExcluded?: boolean;
  isMarkedForRetry?: boolean;
  canRename?: boolean;
  canToggleIgnoreWarning?: boolean;
  /** Show a disabled ignore control for blocking (manual_review) issues. */
  ignoreWarningBlocked?: boolean;
  onRename?: () => void;
  onToggleIgnoreWarning?: () => void;
  onExclude?: () => void;
  onRetry?: () => void;
  onForceReplace?: () => void;
  onUnforceReplace?: () => void;
  onUniqueName?: () => void;
  /** Opens rename editor prefilled with the unique suggestion. */
  onEditUniqueName?: () => void;
  onUndoAcceptedRename?: () => void;
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
 * Right-hand inspector for the currently selected Path Review row.
 * Mount only when an item is selected so the tree/list can use full width.
 */
export default function PathReviewInspector({
  item,
  phase = "traversal",
  busy = false,
  showExclude = false,
  canExclude = false,
  excludeLabel,
  excludeDisabledReason = null,
  showRetry = false,
  canRetry = false,
  canForceReplace = false,
  canUnforceReplace = false,
  canUniqueName = false,
  canUndoAcceptedRename = false,
  uniqueNameSuggestion = null,
  retryLabel,
  retryDisabledReason = null,
  isExcluded = false,
  isMarkedForRetry = false,
  canRename = false,
  canToggleIgnoreWarning = false,
  ignoreWarningBlocked = false,
  onRename,
  onToggleIgnoreWarning,
  onExclude,
  onRetry,
  onForceReplace,
  onUnforceReplace,
  onUniqueName,
  onEditUniqueName,
  onUndoAcceptedRename,
}: PathReviewInspectorProps) {
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
  const ruleExcluded = isRuleExcluded(item);
  const ruleExclusionText = excludedByRuleText(item);
  const destRenameLabel =
    phase === "copy"
      ? PATH_REVIEW_COPY.renamedTo
      : PATH_REVIEW_COPY.willBeCreatedAs;
  const pairedFileOverwrite =
    !isFolder &&
    inSrc &&
    inDst &&
    (phase === "copy-plan" || phase === "copy") &&
    (canForceReplace ||
      canUnforceReplace ||
      item.src?.copyStatus === "already_existed" ||
      item.copyStatus === "already_existed");

  return (
    <aside className="path-review-inspector" aria-label="Item details">
      <div className="path-review-inspector__header">
        <div className="path-review-inspector__header-icon" aria-hidden>
          <FileTypeIcon
            name={item.name}
            type={isFolder ? "folder" : "file"}
            size={20}
          />
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
        {pairedFileOverwrite ? (
          <section className="path-review-inspector__section path-review-inspector__section--overwrite">
            <h3 className="path-review-inspector__section-title">
              Exists on both sides
            </h3>
            <p className="path-review-inspector__muted">
              {PATH_REVIEW_COPY.overwriteDefaultNote}
            </p>
            <div className="path-review-inspector__pair-cards">
              <div className="path-review-inspector__pair-card">
                <h4 className="path-review-inspector__pair-card-title">Source</h4>
                <Detail label="Name" value={item.src!.name} />
                <Detail label="Size" value={formatSize(item.src!.size)} />
                <Detail
                  label="Last modified"
                  value={formatDate(item.src!.lastUpdated)}
                />
              </div>
              <div className="path-review-inspector__pair-card">
                <h4 className="path-review-inspector__pair-card-title">
                  Destination
                </h4>
                <Detail label="Name" value={destName} />
                <Detail label="Size" value={formatSize(item.dst!.size)} />
                <Detail
                  label="Last modified"
                  value={formatDate(item.dst!.lastUpdated)}
                />
              </div>
            </div>
          </section>
        ) : (
          <>
        <section className="path-review-inspector__section">
          <h3 className="path-review-inspector__section-title">Source</h3>
          {inSrc && item.src ? (
            <div className="path-review-inspector__section-body">
              <Detail label="Name" value={item.src.name} />
              <Detail
                label="Path"
                value={item.src.displayPath || item.src.locationPath}
                title={item.src.displayPath || item.src.locationPath}
              />
              <Detail label="Size" value={formatSize(item.src.size)} />
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
                <Detail label="Size" value={formatSize(item.dst.size)} />
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
                  value={itemDisplayPath(item)}
                  title={itemDisplayPath(item)}
                />
                <p className="path-review-inspector__muted">
                  Not present on destination yet
                </p>
              </>
            )}
          </div>
        </section>
        ) : null}
          </>
        )}

        {ruleExcluded && ruleExclusionText ? (
          <section className="path-review-inspector__section path-review-inspector__section--rule-exclusion">
            <h3 className="path-review-inspector__section-title">
              <FilterX size={14} aria-hidden />
              Filter exclusion
            </h3>
            <p className="path-review-inspector__compat-summary">{ruleExclusionText}</p>
            {item.src?.ruleExclusion?.evalPhase ? (
              <Detail label="Evaluated" value={item.src.ruleExclusion.evalPhase} />
            ) : null}
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
        {canUniqueName ? (
          <div className="path-review-inspector__action-row">
            <button
              type="button"
              className="action-button action-button--small"
              disabled={busy}
              onClick={onUniqueName}
              title={
                uniqueNameSuggestion
                  ? PATH_REVIEW_COPY.acceptUniqueName(uniqueNameSuggestion)
                  : PATH_REVIEW_COPY.useUniqueName
              }
            >
              {uniqueNameSuggestion
                ? PATH_REVIEW_COPY.acceptUniqueName(uniqueNameSuggestion)
                : PATH_REVIEW_COPY.useUniqueName}
            </button>
            {onEditUniqueName ? (
              <button
                type="button"
                className="action-button action-button--small path-review-inspector__icon-toggle"
                disabled={busy}
                onClick={onEditUniqueName}
                title={PATH_REVIEW_COPY.editUniqueNameTip}
                aria-label={PATH_REVIEW_COPY.editUniqueName}
              >
                <Pencil size={14} aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
        {canUndoAcceptedRename && (
          <button
            type="button"
            className="action-button action-button--small"
            disabled={busy}
            title={PATH_REVIEW_COPY.undoAcceptedRenameTip}
            onClick={onUndoAcceptedRename}
          >
            {PATH_REVIEW_COPY.undoAcceptedRename}
          </button>
        )}
        {canRename && (
          <button
            type="button"
            className="action-button action-button--small"
            disabled={busy}
            onClick={onRename}
          >
            {PATH_REVIEW_COPY.renameDestination}
          </button>
        )}
        {(showExclude || canExclude || canToggleIgnoreWarning || ignoreWarningBlocked) && (
          <div className="path-review-inspector__action-row">
            {(showExclude || canExclude) && (
              <button
                type="button"
                className="action-button action-button--small"
                disabled={busy || !canExclude}
                title={!canExclude ? excludeDisabledReason || undefined : undefined}
                onClick={onExclude}
              >
                {excludeLabel ?? (isExcluded ? "Unexclude" : "Exclude")}
              </button>
            )}
            {(canToggleIgnoreWarning || ignoreWarningBlocked) && (
              <button
                type="button"
                className="action-button action-button--small path-review-inspector__icon-toggle"
                disabled={busy || ignoreWarningBlocked}
                onClick={onToggleIgnoreWarning}
                title={
                  ignoreWarningBlocked
                    ? PATH_REVIEW_COPY.ignoreBlockedTip
                    : warningIgnored
                      ? PATH_REVIEW_COPY.unignoreWarning
                      : item.copyStatus === "already_existed"
                        ? PATH_REVIEW_COPY.ignoreKeepExistingName
                        : PATH_REVIEW_COPY.ignoreWarning
                }
                aria-label={
                  ignoreWarningBlocked
                    ? PATH_REVIEW_COPY.ignoreBlockedTip
                    : warningIgnored
                      ? PATH_REVIEW_COPY.unignoreWarning
                      : item.copyStatus === "already_existed"
                        ? PATH_REVIEW_COPY.ignoreKeepExistingName
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
        {(showRetry || canRetry) && (
          <button
            type="button"
            className="action-button action-button--small"
            disabled={busy || !canRetry}
            title={!canRetry ? retryDisabledReason || undefined : undefined}
            onClick={onRetry}
          >
            {retryLabel ?? (isMarkedForRetry ? "Unmark retry" : "Mark for retry")}
          </button>
        )}
        {canForceReplace && (
          <button
            type="button"
            className="action-button action-button--small"
            disabled={busy}
            onClick={onForceReplace}
          >
            {pairedFileOverwrite
              ? PATH_REVIEW_COPY.useSourceInstead
              : "Replace with source"}
          </button>
        )}
        {canUnforceReplace && (
          <button
            type="button"
            className="action-button action-button--small"
            disabled={busy}
            onClick={onUnforceReplace}
          >
            {pairedFileOverwrite
              ? PATH_REVIEW_COPY.keepDestination
              : "Keep destination (undo replace)"}
          </button>
        )}
      </div>
    </aside>
  );
}
