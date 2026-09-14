import { Navigate, useLocation } from "react-router";

import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, needsSetup } = useAuth();
  const location = useLocation();

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

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
