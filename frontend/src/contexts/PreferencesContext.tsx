import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { UserPreferences, DEFAULT_PREFERENCES } from "../types/preferences";
import { getPreferences, savePreferences } from "../api/services";

interface PreferencesContextType {
  preferences: UserPreferences;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  isLoading: boolean;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    async function loadPrefs() {
      try {
        const prefs = await getPreferences();
        setPreferences(prefs);
      } catch (error) {
        console.error("Failed to load preferences, using defaults", error);
        setPreferences(DEFAULT_PREFERENCES);
      } finally {
        setIsLoading(false);
        setHasLoaded(true);
      }
    }

    loadPrefs();
  }, []);

  // Save preferences to API whenever they change (but not on initial load)
  useEffect(() => {
    if (hasLoaded) {
      savePreferences(preferences).catch((error) => {
        console.error("Failed to save preferences", error);
      });
    }
  }, [preferences, hasLoaded]);

  const updatePreferences = (updates: Partial<UserPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...updates }));
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
