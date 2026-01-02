import { ReactNode } from "react";

import "./SelectionPage.css";

export type SelectionOption = {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
};

export type SelectionPageProps = {
  eyebrow?: string;
  title: ReactNode;
  summary?: ReactNode;
  options: SelectionOption[];
  onSelect: (id: string) => void;
  onBack?: () => void;
  backLabel?: string;
  emptyMessage?: ReactNode;
  isBusy?: boolean;
};

export default function SelectionPage({
  eyebrow,
  title,
  summary,
  options,
  onSelect,
  onBack,
  backLabel = "← Back",
  emptyMessage,
  isBusy = false,
}: SelectionPageProps) {
  return (
    <section className="selection-page">
      <div className="selection-page__content">
        {onBack ? (
          <button
            type="button"
            className="selection-page__back"
            onClick={onBack}
          >
            {backLabel}
          </button>
        ) : null}
        <header className="selection-page__header">
          {eyebrow ? (
            <p className="selection-page__eyebrow">{eyebrow}</p>
          ) : null}
          <h1>{title}</h1>
          {summary ? (
            <p className="selection-page__summary">{summary}</p>
          ) : null}
        </header>

        <div className="selection-page__grid">
          {options.length > 0 ? (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`selection-page__card${
                  isBusy ? " selection-page__card--disabled" : ""
                }`}
                onClick={() => onSelect(option.id)}
                disabled={isBusy}
              >
                <span className="selection-page__icon">{option.icon}</span>
                <span className="selection-page__name">{option.name}</span>
                <span className="selection-page__description">
                  {option.description}
                </span>
              </button>
            ))
          ) : (
            <div className="selection-page__empty">
              {emptyMessage ?? "No services available."}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

