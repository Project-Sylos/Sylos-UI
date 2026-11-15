import { useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";

import type { Folder } from "../types/services";
import { originalRootFields } from "../utils/previousRoot";
import "./OriginalRootCard.css";

type OriginalRootCardProps = {
  root: Folder | null | undefined;
  /** When true, the current browse location is the original root. */
  viewingOriginal?: boolean;
};

export default function OriginalRootCard({
  root,
  viewingOriginal = false,
}: OriginalRootCardProps) {
  const fields = originalRootFields(root);
  const [open, setOpen] = useState(true);

  if (fields.length === 0) return null;

  return (
    <div
      className={`original-root-card${
        viewingOriginal ? " original-root-card--here" : ""
      }`}
    >
      <button
        type="button"
        className="original-root-card__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <MapPin size={16} aria-hidden="true" />
        <span className="original-root-card__title">
          {viewingOriginal ? "You are on the original root" : "Original root"}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`original-root-card__chevron${
            open ? " original-root-card__chevron--open" : ""
          }`}
        />
      </button>
      {open && (
        <dl className="original-root-card__fields">
          {fields.map((field) => (
            <div key={field.label} className="original-root-card__row">
              <dt>{field.label}</dt>
              <dd title={field.value}>{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

type PreviousRootBadgeProps = {
  className?: string;
};

export function PreviousRootBadge({ className = "" }: PreviousRootBadgeProps) {
  return (
    <span
      className={`browse-folder__previous-root-badge ${className}`.trim()}
      title="This is the original migration root"
    >
      Previous root
    </span>
  );
}
