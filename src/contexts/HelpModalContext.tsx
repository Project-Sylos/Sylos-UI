import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { BookOpen, Bug, ExternalLink, MessagesSquare, type LucideIcon } from "lucide-react";
import "../components/ConfirmDialog.css";
import "../components/HelpModal.css";

export const SYLOS_WIKI_URL = "https://github.com/Project-Sylos/Sylos/wiki";
export const SYLOS_ISSUES_URL = "https://github.com/Project-Sylos/Sylos/issues";
export const SYLOS_DISCUSSIONS_URL = "https://github.com/orgs/Project-Sylos/discussions";

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

type HelpLink = {
  href: string;
  title: string;
  description: string;
  Icon: LucideIcon;
};

const HELP_LINKS: HelpLink[] = [
  {
    href: SYLOS_WIKI_URL,
    title: "Sylos Wiki",
    description: "Documentation, setup guides, and usage help",
    Icon: BookOpen,
  },
  {
    href: SYLOS_ISSUES_URL,
    title: "Report a bug",
    description: "File an issue on the Sylos hub repository",
    Icon: Bug,
  },
  {
    href: SYLOS_DISCUSSIONS_URL,
    title: "Discussions",
    description: "Need to talk something through? Start a discussion with the community",
    Icon: MessagesSquare,
  },
];

export function defaultHelpModalBody(): ReactNode {
  return (
    <div className="help-modal__links">
      {HELP_LINKS.map(({ href, title, description, Icon }) => (
        <a
          key={href}
          className="help-modal__link-row"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            event.preventDefault();
            window.open(href, "_blank", "noopener,noreferrer");
          }}
        >
          <span className="help-modal__brand-icon" aria-hidden="true">
            <Icon size={20} strokeWidth={1.8} />
          </span>
          <span className="help-modal__link-copy">
            <span className="help-modal__link-title">{title}</span>
            <span className="help-modal__link-description">{description}</span>
          </span>
          <span className="help-modal__external" aria-hidden="true">
            <ExternalLink size={16} />
          </span>
        </a>
      ))}
    </div>
  );
}
