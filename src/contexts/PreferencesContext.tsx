import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { UserPreferences, DEFAULT_PREFERENCES } from "../types/preferences";
import { getPreferences, savePreferences } from "../api/services";
import { useAuth } from "./AuthContext";

interface PreferencesContextType {
  preferences: UserPreferences;
  updatePreferences: (updates: Partial<UserPreferences>) => Promise<void>;
  isLoading: boolean;
  /**
   * Bumps after prefs load, logout, or when developer/Spectra gating is persisted.
   * Safe signal for refetching preference-gated APIs (e.g. /api/services).
   */
  preferencesRevision: number;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

function developerGateChanged(prev: UserPreferences, next: UserPreferences): boolean {
  return (
    prev.developer?.enabled !== next.developer?.enabled ||
    prev.developer?.showSpectraService !== next.developer?.showSpectraService
  );
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [preferencesRevision, setPreferencesRevision] = useState(0);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  const bumpRevision = useCallback(() => {
    setPreferencesRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setPreferences(DEFAULT_PREFERENCES);
      setIsLoading(false);
      bumpRevision();
      return;
    }

    let cancelled = false;

    async function loadPrefs() {
      setIsLoading(true);
      try {
        const prefs = await getPreferences();
        if (!cancelled) {
          setPreferences(prefs);
        }
      } catch (error) {
        console.error("Failed to load preferences, using defaults", error);
        if (!cancelled) {
          setPreferences(DEFAULT_PREFERENCES);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          bumpRevision();
        }
      }
    }

    void loadPrefs();
    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading, bumpRevision]);

  const updatePreferences = useCallback(
    async (updates: Partial<UserPreferences>) => {
      const previous = preferencesRef.current;
      const newPrefs = { ...previous, ...updates };
      const gateChanged = developerGateChanged(previous, newPrefs);
      setPreferences(newPrefs);
      if (user) {
        try {
          await savePreferences(newPrefs);
        } catch (error) {
          console.error("Failed to save preferences", error);
          throw error;
        } finally {
          // Bump only after persist so /api/services sees the new gate.
          if (gateChanged) {
            bumpRevision();
          }
        }
        return;
      }
      if (gateChanged) {
        bumpRevision();
      }
    },
    [user, bumpRevision]
  );

  return (
    <PreferencesContext.Provider
      value={{ preferences, updatePreferences, isLoading, preferencesRevision }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error("usePreferences must be used within a PreferencesProvider");
  }
  return context;
}
