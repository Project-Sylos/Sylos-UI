import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { UserPreferences, DEFAULT_PREFERENCES, themeSupportsPreSplash } from "../types/preferences";
import { getPreferences, savePreferences } from "../api/services";
import { useAuth } from "./AuthContext";

interface PreferencesContextType {
  preferences: UserPreferences;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  isLoading: boolean;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setPreferences(DEFAULT_PREFERENCES);
      setIsLoading(false);
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
        }
      }
    }

    void loadPrefs();
    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading]);

  const updatePreferences = (updates: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const newPrefs = { ...prev, ...updates };
      if (!themeSupportsPreSplash(newPrefs.theme)) {
        newPrefs.preSplashEnabled = false;
      }
      if (user) {
        savePreferences(newPrefs).catch((error) => {
          console.error("Failed to save preferences", error);
        });
      }
      return newPrefs;
    });
  };

  return (
    <PreferencesContext.Provider value={{ preferences, updatePreferences, isLoading }}>
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
