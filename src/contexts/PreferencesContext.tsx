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
import {
  clearPreferencesCache,
  readPreferencesCache,
  writePreferencesCache,
} from "../utils/preferencesCache";

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
  const [preferences, setPreferences] = useState<UserPreferences>(
    () => readPreferencesCache() ?? DEFAULT_PREFERENCES
  );
  const [isLoading, setIsLoading] = useState(true);
  const [preferencesRevision, setPreferencesRevision] = useState(0);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  /** Local edits made before / while the server load; must not be clobbered. */
  const dirtyRef = useRef(false);
  const loadingRef = useRef(true);
  const userIdRef = useRef<string | null>(null);
  const loadedUserIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  const bumpRevision = useCallback(() => {
    setPreferencesRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      dirtyRef.current = false;
      loadingRef.current = false;
      loadedUserIdRef.current = null;
      clearPreferencesCache();
      setPreferences(DEFAULT_PREFERENCES);
      setIsLoading(false);
      bumpRevision();
      return;
    }

    const userId = user.id;
    let cancelled = false;
    if (loadedUserIdRef.current !== userId) {
      dirtyRef.current = false;
      loadedUserIdRef.current = userId;
    }
    loadingRef.current = true;
    setIsLoading(true);

    const cached = readPreferencesCache(userId);
    if (cached) {
      setPreferences(cached);
    }

    async function loadPrefs() {
      try {
        const prefs = await getPreferences();
        if (cancelled) return;
        if (dirtyRef.current) {
          // Keep the user's in-session edits and push them once load finishes.
          try {
            await savePreferences(preferencesRef.current);
            writePreferencesCache(userId, preferencesRef.current);
          } catch (error) {
            console.error("Failed to save preferences after load", error);
          }
        } else {
          setPreferences(prefs);
          writePreferencesCache(userId, prefs);
        }
      } catch (error) {
        console.error("Failed to load preferences, using cache/defaults", error);
        if (!cancelled && !dirtyRef.current) {
          const fallback = readPreferencesCache(userId) ?? DEFAULT_PREFERENCES;
          setPreferences(fallback);
        }
      } finally {
        if (!cancelled) {
          loadingRef.current = false;
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
      dirtyRef.current = true;
      setPreferences(newPrefs);
      if (userIdRef.current) {
        writePreferencesCache(userIdRef.current, newPrefs);
      }
      if (user && !loadingRef.current) {
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
