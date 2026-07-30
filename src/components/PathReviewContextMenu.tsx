import { useEffect } from "react";
import "./PathReviewContextMenu.css";

export type PathReviewContextAction = {
  key: string;
  label: string;
  onClick: () => void;
};

interface PathReviewContextMenuProps {
  x: number;
  y: number;
  actions: PathReviewContextAction[];
  onClose: () => void;
}

export default function PathReviewContextMenu({
  x,
  y,
  actions,
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

  if (actions.length === 0) return null;

  return (
    <div
      className="path-review-context-menu"
      style={{ top: y, left: x }}
      onClick={(e) => e.stopPropagation()}
      role="menu"
    >
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          className="path-review-context-menu__item"
          role="menuitem"
          onClick={() => {
            action.onClick();
            onClose();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
