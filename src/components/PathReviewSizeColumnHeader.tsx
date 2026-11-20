import HelpTooltip from "./HelpTooltip";
import { PATH_REVIEW_COPY } from "../utils/pathReviewCopy";

export const PATH_REVIEW_SIDE_HELP = {
  tipId: "path-review-side-column",
} as const;

/** Column header row aligned with Path Review tree/list item grids. */
export default function PathReviewSizeColumnHeader({
  variant,
  showSideColumn = false,
}: {
  variant: "tree" | "list";
  showSideColumn?: boolean;
}) {
  if (variant === "list") {
    // List rows still use a combined meta cell (size · modified).
    return (
      <div className="path-review-cols path-review-cols--list" role="row">
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span className="path-review-cols__label path-review-cols__label--name">
          Name
        </span>
        <span className="path-review-cols__label path-review-cols__label--path">
          Path
        </span>
        <span className="path-review-cols__label path-review-cols__label--size">
          Size
        </span>
        <span aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      className={`path-review-cols path-review-cols--tree${
        showSideColumn ? " path-review-cols--tree-with-side" : ""
      }`}
      role="row"
    >
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span className="path-review-cols__label path-review-cols__label--name">
        Name
      </span>
      {showSideColumn ? (
        <>
          <span className="path-review-cols__label path-review-cols__label--side">
            <span className="path-review-cols__side">
              {PATH_REVIEW_COPY.sideColumnHeader}
              <HelpTooltip
                tipId={PATH_REVIEW_SIDE_HELP.tipId}
                position="below"
              />
            </span>
          </span>
          <span aria-hidden="true" />
        </>
      ) : null}
      <span className="path-review-cols__label path-review-cols__label--modified">
        Modified
      </span>
      <span className="path-review-cols__label path-review-cols__label--size">
        Size
      </span>
      <span aria-hidden="true" />
    </div>
  );
}
