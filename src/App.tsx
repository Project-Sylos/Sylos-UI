import "./App.css";
import "./oauthBootstrap";
import { HashRouter, Route, Routes } from "react-router-dom";

import { LoginRoute, SetupRoute } from "./components/AuthRoutes";
import ProtectedRoute from "./components/ProtectedRoute";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import { HelpModalProvider } from "./contexts/HelpModalContext";
import { SelectionProvider } from "./context/SelectionContext";
import { ZoomProvider } from "./contexts/ZoomContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import AnimatedBackground from "./components/AnimatedBackground";
import BackgroundCredit from "./components/BackgroundCredit";
import PreSplash from "./components/PreSplash";
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
import Users from "./pages/Users";

function AppShell() {
  return (
    <>
      <PreSplash />
      <BackgroundCredit />
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
        <Route
          path="/settings/users"
          element={
            <ProtectedRoute>
              <Users />
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
      <AuthProvider>
        <PreferencesProvider>
          <ThemeProvider>
            <AnimatedBackground />
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
      </AuthProvider>
    </HashRouter>
  );
}
