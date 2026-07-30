// Copyright 2025 Sylos contributors
// SPDX-License-Identifier: LGPL-2.1-or-later

import { AlertTriangle, X } from "lucide-react";
import { PATH_REVIEW_COPY } from "../utils/pathReviewCopy";
import "./CompatReviewBanner.css";

type CompatReviewBannerProps = {
  count?: number;
  message?: string;
  onDismiss: () => void;
};

/** Dismissible alert for path-review heads-ups (naming issues, capacity, etc.). */
export default function CompatReviewBanner({
  count = 0,
  message,
  onDismiss,
}: CompatReviewBannerProps) {
  const text =
    message ||
    (count > 0 ? PATH_REVIEW_COPY.requireReviewBeforeCopy(count) : "");
  if (!text) return null;

  return (
    <div className="compat-review-banner" role="alert">
      <AlertTriangle size={18} className="compat-review-banner__icon" aria-hidden />
      <p className="compat-review-banner__text">{text}</p>
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
