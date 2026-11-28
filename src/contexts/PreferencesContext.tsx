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

/** Partial preference patch; developer fields merge onto the current developer block. */
export type PreferencesUpdate = Omit<Partial<UserPreferences>, "developer"> & {
  developer?: Partial<NonNullable<UserPreferences["developer"]>>;
};

interface PreferencesContextType {
  preferences: UserPreferences;
  updatePreferences: (updates: PreferencesUpdate) => Promise<void>;
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

function applyPreferencesUpdate(
  previous: UserPreferences,
  updates: PreferencesUpdate
): UserPreferences {
  const baseDeveloper = previous.developer ?? DEFAULT_PREFERENCES.developer!;
  return {
    ...previous,
    ...updates,
    developer: updates.developer
      ? { ...baseDeveloper, ...updates.developer }
      : previous.developer,
  };
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
  /** Serializes preference PUTs so rapid toggles cannot overwrite newer values. */
  const saveChainRef = useRef(Promise.resolve());
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
    async (updates: PreferencesUpdate) => {
      const previous = preferencesRef.current;
      const newPrefs = applyPreferencesUpdate(previous, updates);
      const gateChanged = developerGateChanged(previous, newPrefs);
      dirtyRef.current = true;
      // Keep the ref ahead of React state so rapid patches merge onto the latest.
      preferencesRef.current = newPrefs;
      setPreferences(newPrefs);
      if (userIdRef.current) {
        writePreferencesCache(userIdRef.current, newPrefs);
      }
      if (user && !loadingRef.current) {
        const savePromise = saveChainRef.current.catch(() => undefined).then(async () => {
          // Always persist whatever is current after prior saves finish.
          const latest = preferencesRef.current;
          await savePreferences(latest);
          if (userIdRef.current) {
            writePreferencesCache(userIdRef.current, latest);
          }
        });
        saveChainRef.current = savePromise;
        try {
          await savePromise;
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
