import { useEffect } from "react";
import { PATH_REVIEW_COPY } from "../utils/pathReviewCopy";
import "./PathReviewContextMenu.css";

interface PathReviewContextMenuProps {
  x: number;
  y: number;
  onRename: () => void;
  onClose: () => void;
}

export default function PathReviewContextMenu({
  x,
  y,
  onRename,
  onClose,
}: PathReviewContextMenuProps) {
  useEffect(() => {
    const dismiss = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("click", dismiss);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="path-review-context-menu"
      style={{ top: y, left: x }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="path-review-context-menu__item"
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        {PATH_REVIEW_COPY.renameDestination}
      </button>
    </div>
  );
}
