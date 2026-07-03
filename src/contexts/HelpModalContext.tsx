import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import "../components/ConfirmDialog.css";

const SYLOS_COMMUNITY_URL = "https://codeberg.org/Sylos";

export type HelpModalPayload = {
  title: string;
  body: ReactNode;
};

type HelpModalContextValue = {
  openHelp: (payload: HelpModalPayload) => void;
  closeHelp: () => void;
};

const HelpModalContext = createContext<HelpModalContextValue | null>(null);

export function HelpModalProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<HelpModalPayload | null>(null);

  const openHelp = useCallback((p: HelpModalPayload) => {
    setPayload(p);
  }, []);

  const closeHelp = useCallback(() => {
    setPayload(null);
  }, []);

  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeHelp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payload, closeHelp]);

  return (
    <HelpModalContext.Provider value={{ openHelp, closeHelp }}>
      {children}
      {payload && (
        <div className="confirm-dialog__overlay" onClick={closeHelp}>
          <div
            className="confirm-dialog__content"
            style={{ maxWidth: "min(520px, 92vw)" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-modal-title"
          >
            <h2 id="help-modal-title" className="confirm-dialog__title">
              {payload.title}
            </h2>
            <div className="confirm-dialog__message">{payload.body}</div>
            <div className="confirm-dialog__actions">
              <button
                type="button"
                className="confirm-dialog__button confirm-dialog__button--confirm"
                onClick={closeHelp}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </HelpModalContext.Provider>
  );
}

export function useHelpModal(): HelpModalContextValue {
  const ctx = useContext(HelpModalContext);
  if (!ctx) {
    throw new Error("useHelpModal must be used within HelpModalProvider");
  }
  return ctx;
}

export function defaultHelpModalBody(): ReactNode {
  return (
    <>
      <p>
        Documentation links are coming soon. For questions, bug reports, or to
        connect with others using Sylos, visit our community on Codeberg.
      </p>
      <p style={{ marginTop: "1rem" }}>
        <a
          href={SYLOS_COMMUNITY_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--accent-cyan, #22d3ee)" }}
        >
          Sylos on Codeberg →
        </a>
      </p>
    </>
  );
}

export { SYLOS_COMMUNITY_URL };
