import "./App.css";
import "./oauthBootstrap";
import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";

import { enhanceMomentumScrolling } from "./utils/momentumScroll";

import { LoginRoute, SetupRoute } from "./components/AuthRoutes";
import ProtectedRoute from "./components/ProtectedRoute";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import { HelpModalProvider } from "./contexts/HelpModalContext";
import { SelectionProvider } from "./context/SelectionContext";
import { ZoomProvider } from "./contexts/ZoomContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { RecoveryCodeProvider } from "./contexts/RecoveryCodeContext";
import ThemeBackground from "./components/ThemeBackground";
import Sidebar from "./components/Sidebar";
import ConnectSource from "./pages/ConnectSource";
import Destination from "./pages/Destination";
import Splash from "./pages/Splash";
import ChooseMigrationType from "./pages/ChooseMigrationType";
import ResumeMigration from "./pages/ResumeMigration";
import BrowseFolder from "./pages/BrowseFolder";
import BrowseCloudFolder from "./pages/BrowseCloudFolder";
import ConnectCloudAccount from "./pages/ConnectCloudAccount";
import OAuthCallback from "./pages/OAuthCallback";
import MigrationSummary from "./pages/MigrationSummary";
import ProgressMonitor from "./pages/ProgressMonitor";
import PathReview from "./pages/PathReview";
import Settings from "./pages/Settings";
import SpectraConfigPage from "./pages/SpectraConfig";
import Setup from "./pages/Setup";
import Login from "./pages/Login";

function MomentumScrollEnhancer() {
  useEffect(() => {
    enhanceMomentumScrolling();
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        enhanceMomentumScrolling();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}

function AppShell() {
  return (
    <>
      <Sidebar />
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Splash />
            </ProtectedRoute>
          }
        />
        <Route
          path="/choose"
          element={
            <ProtectedRoute>
              <ChooseMigrationType />
            </ProtectedRoute>
          }
        />
        <Route
          path="/connect"
          element={
            <ProtectedRoute>
              <ConnectSource />
            </ProtectedRoute>
          }
        />
        <Route
          path="/spectra-config"
          element={
            <ProtectedRoute>
              <SpectraConfigPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/destination"
          element={
            <ProtectedRoute>
              <Destination />
            </ProtectedRoute>
          }
        />
        <Route
          path="/summary"
          element={
            <ProtectedRoute>
              <MigrationSummary />
            </ProtectedRoute>
          }
        />
        <Route
          path="/progress-monitor/:migrationId"
          element={
            <ProtectedRoute>
              <ProgressMonitor />
            </ProtectedRoute>
          }
        />
        <Route
          path="/path-review/:migrationId/source-cleanup"
          element={
            <ProtectedRoute>
              <PathReview reviewView="source-cleanup" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/path-review/:migrationId"
          element={
            <ProtectedRoute>
              <PathReview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/resume"
          element={
            <ProtectedRoute>
              <ResumeMigration />
            </ProtectedRoute>
          }
        />
        <Route
          path="/browse"
          element={
            <ProtectedRoute>
              <BrowseFolder />
            </ProtectedRoute>
          }
        />
        <Route
          path="/browse-cloud"
          element={
            <ProtectedRoute>
              <BrowseCloudFolder />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cloud/connect"
          element={
            <ProtectedRoute>
              <ConnectCloudAccount />
            </ProtectedRoute>
          }
        />
        <Route
          path="/oauth/callback"
          element={
            <ProtectedRoute>
              <OAuthCallback />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <MomentumScrollEnhancer />
      <AuthProvider>
        <RecoveryCodeProvider>
        <PreferencesProvider>
          <ThemeProvider>
            <ThemeBackground />
            <SelectionProvider>
              <ZoomProvider>
                <HelpModalProvider>
                  <Routes>
                    <Route
                      path="/setup"
                      element={
                        <SetupRoute>
                          <Setup />
                        </SetupRoute>
                      }
                    />
                    <Route
                      path="/login"
                      element={
                        <LoginRoute>
                          <Login />
                        </LoginRoute>
                      }
                    />
                    <Route path="/*" element={<AppShell />} />
                  </Routes>
                </HelpModalProvider>
              </ZoomProvider>
            </SelectionProvider>
          </ThemeProvider>
        </PreferencesProvider>
        </RecoveryCodeProvider>
      </AuthProvider>
    </HashRouter>
  );
}
