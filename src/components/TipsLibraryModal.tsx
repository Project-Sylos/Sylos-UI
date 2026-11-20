import { useEffect, useState } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { usePreferences } from "../contexts/PreferencesContext";
import {
  categoriesEnabledMap,
  tipsByGroup,
  type TipDef,
} from "../tips";
import "./ConfirmDialog.css";
import "./TipsLibraryModal.css";

type TipsLibraryModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function TipsLibraryModal({ open, onClose }: TipsLibraryModalProps) {
  const { preferences, updatePreferences } = usePreferences();
  const sections = tipsByGroup();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const tipsEnabled = preferences.tips?.enabled !== false;
  const categories = preferences.tips?.categories || {};

  const setTipsPrefs = (
    next: Partial<{ enabled: boolean; categories: Record<string, boolean> }>
  ) => {
    const current = preferences.tips || { enabled: true, categories: {} };
    void updatePreferences({
      tips: {
        ...current,
        enabled: next.enabled ?? current.enabled ?? true,
        categories: next.categories
          ? { ...(current.categories || {}), ...next.categories }
          : current.categories || {},
      },
    });
  };

  const handleEnableTips = (enabled: boolean) => {
    setTipsPrefs({
      enabled,
      categories: categoriesEnabledMap(enabled),
    });
  };

  const handleResetAll = () => {
    setTipsPrefs({
      enabled: true,
      categories: categoriesEnabledMap(true),
    });
  };

  const handleShowAgain = (tipId: string) => {
    setTipsPrefs({ categories: { [tipId]: true } });
  };

  const isDismissed = (tip: TipDef) => categories[tip.tipId] === false;

  return (
    <div className="confirm-dialog__overlay" onClick={onClose}>
      <div
        className="confirm-dialog__content tips-library"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tips-library-title"
      >
        <div className="tips-library__header">
          <div className="tips-library__header-text">
            <h2 id="tips-library-title" className="confirm-dialog__title tips-library__title">
              <Lightbulb size={22} aria-hidden />
              Tips
            </h2>
            <p className="tips-library__subtitle">
              Browse every tip. Dismissed tips stay readable here; use Show again
              to restore them in context.
            </p>
          </div>
          <div className="tips-library__header-actions">
            <label className="tips-library__enable">
              <span className="tips-library__enable-label">Enable tips</span>
              <span className="tips-library__toggle">
                <input
                  type="checkbox"
                  checked={tipsEnabled}
                  onChange={(e) => handleEnableTips(e.target.checked)}
                  className="tips-library__toggle-input"
                />
                <span className="tips-library__toggle-slider" />
              </span>
            </label>
            <button
              type="button"
              className="confirm-dialog__button tips-library__reset"
              onClick={handleResetAll}
            >
              Reset all tips
            </button>
          </div>
        </div>

        <div className="tips-library__body">
          {sections.map(({ meta, tips }) => {
            const isOpen = expanded[meta.id] === true;
            return (
              <section key={meta.id} className="tips-library__group">
                <button
                  type="button"
                  className="tips-library__group-header"
                  onClick={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [meta.id]: !isOpen,
                    }))
                  }
                  aria-expanded={isOpen}
                >
                  <span className="tips-library__group-main">
                    <span className="tips-library__group-name">{meta.name}</span>
                    <span className="tips-library__group-meta">
                      {tips.length} tip{tips.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <ChevronDown
                    size={18}
                    className={`tips-library__chevron${
                      isOpen ? " tips-library__chevron--open" : ""
                    }`}
                    aria-hidden
                  />
                </button>
                {isOpen ? (
                  <ul className="tips-library__list">
                    {tips.map((tip) => {
                      const dismissed = isDismissed(tip);
                      return (
                        <li key={tip.tipId} className="tips-library__tip">
                          <div className="tips-library__tip-head">
                            <div className="tips-library__tip-titles">
                              <span className="tips-library__tip-title">
                                {tip.title}
                              </span>
                              {dismissed ? (
                                <span className="tips-library__tip-kind">
                                  Dismissed
                                </span>
                              ) : null}
                            </div>
                            {dismissed ? (
                              <button
                                type="button"
                                className="confirm-dialog__button tips-library__show-again"
                                onClick={() => handleShowAgain(tip.tipId)}
                              >
                                Show again
                              </button>
                            ) : null}
                          </div>
                          <div className="tips-library__tip-content">{tip.content}</div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>

        <div className="tips-library__actions">
          <button
            type="button"
            className="tips-library__close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
