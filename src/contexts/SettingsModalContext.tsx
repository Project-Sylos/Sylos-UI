import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Settings, { type SettingsSection, isSettingsSection } from "../pages/Settings";
import "../pages/SettingsModal.css";

type SettingsModalContextValue = {
  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
  isOpen: boolean;
};

const SettingsModalContext = createContext<SettingsModalContextValue | null>(null);

export function SettingsModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SettingsSection | null>(null);

  const openSettings = useCallback((next?: SettingsSection) => {
    setSection(next && isSettingsSection(next) ? next : null);
    setOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setOpen(false);
    setSection(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSettings();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, closeSettings]);

  return (
    <SettingsModalContext.Provider value={{ openSettings, closeSettings, isOpen: open }}>
      {children}
      {open && (
        <div
          className="settings-modal__overlay"
          onClick={closeSettings}
          role="presentation"
        >
          <div
            className="settings-modal__panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
          >
            <Settings onClose={closeSettings} initialSection={section} />
          </div>
        </div>
      )}
    </SettingsModalContext.Provider>
  );
}

export function useSettingsModal(): SettingsModalContextValue {
  const ctx = useContext(SettingsModalContext);
  if (!ctx) {
    throw new Error("useSettingsModal must be used within SettingsModalProvider");
  }
  return ctx;
}

export function parseSettingsSection(raw: string | null | undefined): SettingsSection | undefined {
  const value = (raw ?? "").replace(/^#/, "").trim();
  return isSettingsSection(value) ? value : undefined;
}
