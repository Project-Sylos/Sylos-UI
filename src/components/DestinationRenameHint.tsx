import { CornerDownRight } from "lucide-react";
import { DiffItem } from "../api/services";
import {
  PATH_REVIEW_COPY,
  destinationDisplayName,
  hasDestinationRename,
} from "../utils/pathReviewCopy";
import type { PathReviewDisplayPhase } from "../utils/pathReviewPhase";
import "./DestinationRenameHint.css";

type DestinationRenameHintProps = {
  item: DiffItem;
  /** Review phase — drives label and whether the hint is shown. */
  phase?: PathReviewDisplayPhase;
  /** Sibling rows in the current folder (detect soft proposal collisions). */
  folderPeers?: DiffItem[];
};

/**
 * Remapped destination name under the primary source name.
 * Traversal: “Will be created as: …”; copy review: “Renamed to: …”.
 * Hidden in delete / source-cleanup review.
 */
export default function DestinationRenameHint({
  item,
  phase = "traversal",
  folderPeers = [],
}: DestinationRenameHintProps) {
  if (phase === "delete" || phase === "source-cleanup") return null;
  if (!hasDestinationRename(item, folderPeers)) return null;

  const dest = destinationDisplayName(item);
  if (!dest || dest === item.name) return null;

  const label =
    phase === "copy"
      ? PATH_REVIEW_COPY.renamedToLabel
      : PATH_REVIEW_COPY.willBeCreatedAsLabel;

  return (
    <span
      className="destination-rename-hint"
      aria-label={`${label} ${dest}`}
      title={`${PATH_REVIEW_COPY.renamedOnDestinationTip} ${label} ${dest}`}
    >
      <CornerDownRight
        size={12}
        aria-hidden
        className="destination-rename-hint__arrow"
      />
      <span className="destination-rename-hint__label">
        {label}{" "}
        <span className="destination-rename-hint__name">{dest}</span>
      </span>
    </span>
  );
}
