import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ExternalLink } from "lucide-react";
import codebergIcon from "../assets/external/codeberg.svg";
import discordIcon from "../assets/external/discord.svg";
import "../components/ConfirmDialog.css";
import "../components/HelpModal.css";

const SYLOS_WIKI_URL = "https://codeberg.org/Sylos/Sylos/wiki/";
const SYLOS_DISCORD_URL = "https://chat.sylos.io/";

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
    <div className="help-modal__links">
        <a
          className="help-modal__link-row"
          href={SYLOS_WIKI_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            event.preventDefault();
            window.open(SYLOS_WIKI_URL, "_blank", "noopener,noreferrer");
          }}
        >
          <span className="help-modal__brand-icon">
            <img src={codebergIcon} alt="" aria-hidden="true" />
          </span>
          <span className="help-modal__link-copy">
            <span className="help-modal__link-title">Sylos Wiki</span>
            <span className="help-modal__link-description">
              Documentation, setup guides, and usage help
            </span>
          </span>
          <span className="help-modal__external" aria-hidden="true">
            <ExternalLink size={16} />
          </span>
        </a>
        <a
          className="help-modal__link-row"
          href={SYLOS_DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            event.preventDefault();
            window.open(SYLOS_DISCORD_URL, "_blank", "noopener,noreferrer");
          }}
        >
          <span className="help-modal__brand-icon help-modal__brand-icon--discord">
            <img src={discordIcon} alt="" aria-hidden="true" />
          </span>
          <span className="help-modal__link-copy">
            <span className="help-modal__link-title">Sylos Discord</span>
            <span className="help-modal__link-description">
              Ask questions and connect with the community
            </span>
          </span>
          <span className="help-modal__external" aria-hidden="true">
            <ExternalLink size={16} />
          </span>
        </a>
    </div>
  );
}

export { SYLOS_DISCORD_URL, SYLOS_WIKI_URL };
