import { Navigate } from "react-router";

import { useAuth } from "../contexts/AuthContext";

export function SetupRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, needsSetup, user } = useAuth();

  if (isLoading) {
    return (
      <div className="App-root">
        <div className="App-card">
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (!needsSetup) {
    return <Navigate to={user ? "/" : "/login"} replace />;
  }

  return <>{children}</>;
}

export function LoginRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, needsSetup, user } = useAuth();

  if (isLoading) {
    return (
      <div className="App-root">
        <div className="App-card">
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
