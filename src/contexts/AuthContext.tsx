import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import {
  SylosUser,
  RecoveryCodeOffer,
  fetchCurrentUser,
  fetchSetupStatus,
  login as loginRequest,
  logout as logoutRequest,
  setupAdmin,
} from "../api/auth";
import { clearAuthToken, getAuthToken, setUnauthorizedHandler } from "../api/client";

interface AuthContextValue {
  user: SylosUser | null;
  isLoading: boolean;
  needsSetup: boolean;
  recoveryOffer: RecoveryCodeOffer | null;
  clearRecoveryOffer: () => void;
  login: (username: string, password: string, remember?: boolean) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<SylosUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [recoveryOffer, setRecoveryOffer] = useState<RecoveryCodeOffer | null>(null);

  const clearRecoveryOffer = useCallback(() => {
    setRecoveryOffer(null);
  }, []);

  const handleUnauthorized = useCallback(() => {
    clearAuthToken();
    setUser(null);
    navigate("/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    setUnauthorizedHandler(handleUnauthorized);
    return () => setUnauthorizedHandler(null);
  }, [handleUnauthorized]);

  const refresh = useCallback(async () => {
    const status = await fetchSetupStatus();
    setNeedsSetup(status.needsSetup);

    if (status.needsSetup) {
      setUser(null);
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setUser(null);
      return;
    }

    const current = await fetchCurrentUser();
    setUser(current);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        await refresh();
      } catch {
        if (!cancelled) {
          clearAuthToken();
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const path = location.pathname;
    if (needsSetup && path !== "/setup") {
      navigate("/setup", { replace: true });
      return;
    }

    if (!needsSetup && !user && path !== "/login" && path !== "/setup") {
      navigate("/login", { replace: true });
    }
  }, [isLoading, needsSetup, user, location.pathname, navigate]);

  const login = useCallback(async (username: string, password: string, remember = false) => {
    const data = await loginRequest(username, password, remember);
    await refresh();
    setNeedsSetup(false);
    if (data.recoveryCode) {
      setRecoveryOffer({
        code: data.recoveryCode,
        title: "Your new recovery code",
        description:
          "You used a recovery code to reset your password. Save this new code somewhere safe. It replaces the old one and will not be shown again.",
      });
    }
  }, [refresh]);

  const setup = useCallback(async (username: string, password: string) => {
    const data = await setupAdmin(username, password);
    await refresh();
    setNeedsSetup(false);
    if (data.recoveryCode) {
      setRecoveryOffer({
        code: data.recoveryCode,
        title: "Save your recovery code",
        description:
          "Store this code somewhere safe. You will need it to recover your account if you are locked out.",
      });
    }
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      clearAuthToken();
      setUser(null);
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      needsSetup,
      recoveryOffer,
      clearRecoveryOffer,
      login,
      setup,
      logout,
      refresh,
    }),
    [user, isLoading, needsSetup, recoveryOffer, clearRecoveryOffer, login, setup, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
