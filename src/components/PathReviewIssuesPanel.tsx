// Copyright 2025 Sylos contributors
// SPDX-License-Identifier: LGPL-2.1-or-later

import { useMemo, type ReactNode } from "react";
import { AlertCircle, ArrowRight, Pencil, X } from "lucide-react";
import { PathIssue } from "../api/services";
import HelpTooltip from "./HelpTooltip";
import {
  PATH_REVIEW_COPY,
  formatInvalidCharsDetail,
  pathIssueCategoryExplanation,
  pathIssueShortLabel,
  summarizePathIssues,
} from "../utils/pathReviewCopy";
import "./PathReviewIssuesPanel.css";

export type PathReviewListJumpTarget = {
  /** Copy/traversal status filter for list view (e.g. failed). */
  statusFilter?: string;
  /** Compatibility status filter (manual, issues, rejected, none). */
  pathIssueStatus?: string;
  /** Compat finding category (InvalidChar, …). */
  pathIssueCategory?: string;
  /** Folder + descendants scope (id_path). */
  underPath?: string;
  /** Friendly label for the underPath chip. */
  underPathLabel?: string;
  /** Prefill name contains-search (switches list search to name mode). */
  nameQuery?: string;
};

type PathReviewIssuesPanelProps = {
  failedCount: number;
  pathIssues: PathIssue[];
  onClose: () => void;
  onJump: (target: PathReviewListJumpTarget) => void;
};

function HelpContent({
  category,
  message,
  detail,
  docsURL,
}: {
  category?: string;
  message: string;
  detail?: string;
  docsURL?: string;
}) {
  const invalidChars =
    category === "InvalidChar" ? formatInvalidCharsDetail(detail) : "";

  return (
    <>
      {category === "InvalidChar" ? (
        <>
          <p>
            This name contains characters the destination doesn’t allow
            {invalidChars ? ":" : "."}
          </p>
          {invalidChars ? (
            <p className="path-review-issues-panel__invalid-chars">
              {invalidChars}
            </p>
          ) : null}
        </>
      ) : (
        <p>{message}</p>
      )}
      {docsURL ? (
        <p>
          <a href={docsURL} target="_blank" rel="noopener noreferrer">
            Naming rules
          </a>
        </p>
      ) : null}
    </>
  );
}

/** Right-rail overview of items that need attention, plus searchable compat reference. */
export default function PathReviewIssuesPanel({
  failedCount,
  pathIssues,
  onClose,
  onJump,
}: PathReviewIssuesPanelProps) {
  const { manualCount, categoryDetails } = useMemo(
    () => summarizePathIssues(pathIssues),
    [pathIssues]
  );

  const attentionTotal = failedCount + manualCount;
  const hasReference = categoryDetails.length > 0;

  return (
    <aside className="path-review-issues-panel" aria-label="Issues overview">
      <div className="path-review-issues-panel__header">
        <div className="path-review-issues-panel__header-text">
          <h2 className="path-review-issues-panel__title">
            {PATH_REVIEW_COPY.issuesPanelTitle}
          </h2>
          <p className="path-review-issues-panel__subtitle">
            {attentionTotal > 0
              ? PATH_REVIEW_COPY.issuesPanelAttentionSummary(attentionTotal)
              : PATH_REVIEW_COPY.issuesPanelNoneAttention}
          </p>
        </div>
        <button
          type="button"
          className="path-review-issues-panel__close"
          onClick={onClose}
          aria-label="Close issues panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="path-review-issues-panel__scroll">
        <section className="path-review-issues-panel__section">
          <h3 className="path-review-issues-panel__section-title">
            {PATH_REVIEW_COPY.issuesNeedsAttention}
          </h3>

          <IssueRow
            icon={<AlertCircle size={14} aria-hidden />}
            tone="failed"
            label="Failed"
            count={failedCount}
            tipId="path-review-issues-failed"
            tipCategory="path-review-issues-failed"
            tipContent={<p>{PATH_REVIEW_COPY.issuesHelpFailed}</p>}
            onJump={
              failedCount > 0
                ? () => onJump({ statusFilter: "failed" })
                : undefined
            }
          />

          <IssueRow
            icon={<Pencil size={14} aria-hidden />}
            tone="manual"
            label={PATH_REVIEW_COPY.compatibilityFilterManual}
            count={manualCount}
            tipId="path-review-issues-manual"
            tipCategory="path-review-issues-manual"
            tipContent={<p>{PATH_REVIEW_COPY.manualReviewTip}</p>}
            onJump={
              manualCount > 0
                ? () => onJump({ pathIssueStatus: "manual" })
                : undefined
            }
          />

          {attentionTotal === 0 ? (
            <p className="path-review-issues-panel__empty-note">
              {PATH_REVIEW_COPY.issuesPanelNoneAttentionDetail}
            </p>
          ) : null}
        </section>

        {hasReference ? (
          <section className="path-review-issues-panel__section">
            <div className="path-review-issues-panel__section-heading">
              <h3 className="path-review-issues-panel__section-title">
                {PATH_REVIEW_COPY.issuesReferenceTitle}
              </h3>
              <span className="path-review-issues-panel__tip">
                <HelpTooltip
                  tipId="path-review-issues-naming-warnings"
                  category="path-review-issues-naming-warnings"
                  position="left"
                  content={<p>{PATH_REVIEW_COPY.issuesHelpReference}</p>}
                />
              </span>
            </div>

            {categoryDetails.map((detail) => (
              <IssueRow
                key={detail.category}
                tone="compat"
                label={pathIssueShortLabel([{ category: detail.category }])}
                count={detail.count}
                tipId={`path-review-issues-cat-${detail.category}`}
                tipCategory={`path-review-issues-cat-${detail.category}`}
                tipContent={
                  <HelpContent
                    category={detail.category}
                    message={pathIssueCategoryExplanation(
                      detail.category,
                      detail.message
                    )}
                    detail={detail.detail}
                    docsURL={detail.docsURL}
                  />
                }
                onJump={() =>
                  onJump({
                    pathIssueStatus: "issues",
                    pathIssueCategory: detail.category,
                  })
                }
              />
            ))}
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function IssueRow({
  icon,
  tone,
  label,
  count,
  tipId,
  tipCategory,
  tipContent,
  onJump,
}: {
  icon?: ReactNode;
  tone: "failed" | "manual" | "compat";
  label: string;
  count: number;
  tipId?: string;
  tipCategory?: string;
  tipContent?: ReactNode;
  onJump?: () => void;
}) {
  const disabled = count <= 0 || !onJump;
  return (
    <div className="path-review-issues-panel__row-wrap">
      <div
        className={`path-review-issues-panel__row path-review-issues-panel__row--${tone}${
          disabled ? " path-review-issues-panel__row--muted" : ""
        }`}
      >
        <div className="path-review-issues-panel__row-main">
          {icon ? (
            <span className="path-review-issues-panel__row-icon">{icon}</span>
          ) : null}
          <span className="path-review-issues-panel__row-label">{label}</span>
          {tipId && tipCategory && tipContent ? (
            <span className="path-review-issues-panel__tip">
              <HelpTooltip
                tipId={tipId}
                category={tipCategory}
                position="left"
                content={tipContent}
              />
            </span>
          ) : null}
        </div>
        <div className="path-review-issues-panel__row-meta">
          <strong className="path-review-issues-panel__row-count">
            {count.toLocaleString()}
          </strong>
          <button
            type="button"
            className="path-review-issues-panel__jump"
            disabled={disabled}
            onClick={onJump}
            title={PATH_REVIEW_COPY.issuesJumpToList}
            aria-label={`${PATH_REVIEW_COPY.issuesJumpToList}: ${label}`}
          >
            <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
