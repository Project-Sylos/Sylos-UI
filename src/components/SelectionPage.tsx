import { ReactNode } from "react";

import PageBackButton from "./PageBackButton";
import { GlassSurfacePanel } from "./GlassSurfacePanel";
import "./SelectionPage.css";

export type SelectionIconAccent = "a" | "b";

export type SelectionOption = {
  id: string;
  name: string;
  description?: string;
  icon: ReactNode;
  /** Maps to theme accent tokens (a ≈ cyan, b ≈ magenta) */
  iconAccent?: SelectionIconAccent;
};

export type SelectionPageProps = {
  title: ReactNode;
  options: SelectionOption[];
  onSelect: (id: string) => void;
  onBack?: () => void;
  backTitle?: string;
  error?: ReactNode;
  emptyMessage?: ReactNode;
  isBusy?: boolean;
};

export default function SelectionPage({
  title,
  options,
  onSelect,
  onBack,
  backTitle = "Go back",
  error,
  emptyMessage,
  isBusy = false,
}: SelectionPageProps) {
  return (
    <section className="selection-page">
      <GlassSurfacePanel className="selection-page__content">
        {onBack ? (
          <PageBackButton
            onClick={onBack}
            title={backTitle}
            className="selection-page__back"
          />
        ) : null}
        <header className="selection-page__header">
          <h1>{title}</h1>
          {error ? (
            <div className="selection-page__error">{error}</div>
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
                <span
                  className={[
                    "selection-page__icon",
                    option.iconAccent === "a" && "selection-page__icon--accent-a",
                    option.iconAccent === "b" && "selection-page__icon--accent-b",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {option.icon}
                </span>
                <span className="selection-page__name">{option.name}</span>
                {option.description ? (
                  <span className="selection-page__description">
                    {option.description}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <div className="selection-page__empty">
              {emptyMessage ?? "No services available."}
            </div>
          )}
        </div>
      </GlassSurfacePanel>
    </section>
  );
}
