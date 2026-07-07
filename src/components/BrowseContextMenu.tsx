import { useEffect } from "react";

interface BrowseContextMenuProps {
  x: number;
  y: number;
  label: string;
  onDelete: () => void;
  onClose: () => void;
}

export default function BrowseContextMenu({
  x,
  y,
  label,
  onDelete,
  onClose,
}: BrowseContextMenuProps) {
  useEffect(() => {
    const handleDismiss = () => onClose();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("click", handleDismiss);
    window.addEventListener("scroll", handleDismiss, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleDismiss);
      window.removeEventListener("scroll", handleDismiss, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="browse-context-menu"
      style={{ top: y, left: x }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="browse-context-menu__item browse-context-menu__item--danger"
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        {label}
      </button>
    </div>
  );
}
