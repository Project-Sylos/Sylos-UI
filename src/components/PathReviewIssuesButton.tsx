// Copyright 2025 Sylos contributors
// SPDX-License-Identifier: LGPL-2.1-or-later

import { AlertOctagon } from "lucide-react";
import { PATH_REVIEW_COPY } from "../utils/pathReviewCopy";
import "./PathReviewIssuesButton.css";

type PathReviewIssuesButtonProps = {
  /** Failed + needs manual rename. */
  issueCount: number;
  /** Auto-fixable naming warning count (informational). */
  warningCount: number;
  active?: boolean;
  onClick: () => void;
};

/** Legend-bar control that opens the Issues overview panel. */
export default function PathReviewIssuesButton({
  issueCount,
  warningCount,
  active = false,
  onClick,
}: PathReviewIssuesButtonProps) {
  const hasAttention = issueCount > 0;
  const label = PATH_REVIEW_COPY.issuesButtonLabelWithCounts(
    issueCount,
    warningCount
  );

  return (
    <button
      type="button"
      className={`path-review-issues-button${
        active ? " path-review-issues-button--active" : ""
      }${hasAttention ? " path-review-issues-button--attention" : ""}${
        !hasAttention && warningCount > 0
          ? " path-review-issues-button--warnings"
          : ""
      }`}
      onClick={onClick}
      title={PATH_REVIEW_COPY.issuesButtonTip}
      aria-label={label}
      aria-pressed={active}
    >
      <AlertOctagon size={14} aria-hidden />
      <span className="path-review-issues-button__label">
        <span className="path-review-issues-button__stat">
          Issues {issueCount > 99 ? "99+" : issueCount}
        </span>
        <span className="path-review-issues-button__sep" aria-hidden>
          ·
        </span>
        <span className="path-review-issues-button__stat">
          Warnings {warningCount > 99 ? "99+" : warningCount}
        </span>
      </span>
    </button>
  );
}
