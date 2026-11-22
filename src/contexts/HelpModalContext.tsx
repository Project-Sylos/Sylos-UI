import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpen,
  Bug,
  ExternalLink,
  Lightbulb,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import TipsLibraryModal from "../components/TipsLibraryModal";
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
  openTipsLibrary: () => void;
  closeTipsLibrary: () => void;
};

const HelpModalContext = createContext<HelpModalContextValue | null>(null);

export function HelpModalProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<HelpModalPayload | null>(null);
  const [tipsOpen, setTipsOpen] = useState(false);

  const openHelp = useCallback((p: HelpModalPayload) => {
    setPayload(p);
  }, []);

  const closeHelp = useCallback(() => {
    setPayload(null);
  }, []);

  const openTipsLibrary = useCallback(() => {
    setTipsOpen(true);
  }, []);

  const closeTipsLibrary = useCallback(() => {
    setTipsOpen(false);
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
    <HelpModalContext.Provider
      value={{ openHelp, closeHelp, openTipsLibrary, closeTipsLibrary }}
    >
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
      <TipsLibraryModal open={tipsOpen} onClose={closeTipsLibrary} />
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

/** Default Help body with wiki links plus Tips library entry. */
export function DefaultHelpBody() {
  const { openTipsLibrary, closeHelp } = useHelpModal();

  return (
    <div className="help-modal__links">
      <button
        type="button"
        className="help-modal__link-row help-modal__link-row--button"
        onClick={() => {
          closeHelp();
          openTipsLibrary();
        }}
      >
        <span className="help-modal__brand-icon" aria-hidden="true">
          <Lightbulb size={20} strokeWidth={1.8} />
        </span>
        <span className="help-modal__link-copy">
          <span className="help-modal__link-title">Tips</span>
          <span className="help-modal__link-description">
            Browse, restore, or reset contextual help tips
          </span>
        </span>
      </button>
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

/** @deprecated Prefer {@link DefaultHelpBody} so Tips can open the library. */
export function defaultHelpModalBody(): ReactNode {
  return <DefaultHelpBody />;
}
