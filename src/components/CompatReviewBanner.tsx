// Copyright 2025 Sylos contributors
// SPDX-License-Identifier: LGPL-2.1-or-later

import { AlertTriangle, X } from "lucide-react";
import { PATH_REVIEW_COPY } from "../utils/pathReviewCopy";
import "./CompatReviewBanner.css";

type CompatReviewBannerProps = {
  count: number;
  onDismiss: () => void;
};

/** Dismissible alert that destination naming issues still need review before copy. */
export default function CompatReviewBanner({
  count,
  onDismiss,
}: CompatReviewBannerProps) {
  if (count <= 0) return null;

  return (
    <div className="compat-review-banner" role="alert">
      <AlertTriangle size={18} className="compat-review-banner__icon" aria-hidden />
      <p className="compat-review-banner__text">
        {PATH_REVIEW_COPY.requireReviewBeforeCopy(count)}
      </p>
      <button
        type="button"
        className="compat-review-banner__dismiss"
        onClick={onDismiss}
        aria-label="Dismiss"
        title="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
