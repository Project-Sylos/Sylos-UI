// Copyright 2025 Sylos contributors
// SPDX-License-Identifier: LGPL-2.1-or-later

import { PATH_REVIEW_COPY, unpairedSide } from "../utils/pathReviewCopy";

type UnpairedSideChipProps = {
  item: {
    src?: unknown | null;
    dst?: unknown | null;
    traversalStatus?: string;
  };
  existsOnlyOnDst?: boolean;
};

/** Compact side marker for unpaired rows; not part of the item name. */
export default function UnpairedSideChip({
  item,
  existsOnlyOnDst,
}: UnpairedSideChipProps) {
  const side = unpairedSide({ ...item, existsOnlyOnDst });
  if (!side) return null;
  const label =
    side === "dst" ? PATH_REVIEW_COPY.sideChipDst : PATH_REVIEW_COPY.sideChipSrc;
  const tip =
    side === "dst"
      ? PATH_REVIEW_COPY.sideChipDstTip
      : PATH_REVIEW_COPY.sideChipSrcTip;
  return (
    <span
      className={`path-review__side-chip path-review__side-chip--${side}`}
      title={tip}
      aria-label={tip}
    >
      {label}
    </span>
  );
}
