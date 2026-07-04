import { ArrowLeft } from "lucide-react";

import "../styles/components/back-button.css";

export type PageBackButtonProps = {
  onClick: () => void;
  title: string;
  className?: string;
  iconSize?: number;
};

export default function PageBackButton({
  onClick,
  title,
  className = "",
  iconSize = 20,
}: PageBackButtonProps) {
  return (
    <button
      type="button"
      className={`page-back-button ${className}`.trim()}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      <ArrowLeft size={iconSize} strokeWidth={2} />
    </button>
  );
}
