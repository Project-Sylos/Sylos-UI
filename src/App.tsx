import "./App.css";
import "./oauthBootstrap";
import { HashRouter, Route, Routes } from "react-router-dom";

import { PreferencesProvider } from "./contexts/PreferencesContext";
import { HelpModalProvider } from "./contexts/HelpModalContext";
import { SelectionProvider } from "./context/SelectionContext";
import { ZoomProvider } from "./contexts/ZoomContext";
import { ThemeProvider } from "./contexts/ThemeContext";
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

export default function App() {
  return (
    <PreferencesProvider>
      <ThemeProvider>
        <SelectionProvider>
          <ZoomProvider>
            <HashRouter>
              <HelpModalProvider>
              <PreSplash />
              <AnimatedBackground />
              <BackgroundCredit />
              <Sidebar />
              <Routes>
                <Route path="/" element={<Splash />} />
                <Route path="/choose" element={<ChooseMigrationType />} />
                <Route path="/connect" element={<ConnectSource />} />
                <Route path="/spectra-config" element={<SpectraConfigPage />} />
                <Route path="/destination" element={<Destination />} />
                <Route path="/summary" element={<MigrationSummary />} />
                <Route path="/progress-monitor/:migrationId" element={<ProgressMonitor />} />
                <Route path="/path-review/:migrationId" element={<PathReview />} />
                <Route path="/resume" element={<ResumeMigration />} />
                <Route path="/browse" element={<BrowseFolder />} />
                <Route path="/browse-cloud" element={<BrowseCloudFolder />} />
                <Route path="/cloud/connect" element={<ConnectCloudAccount />} />
                <Route path="/oauth/callback" element={<OAuthCallback />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
              </HelpModalProvider>
            </HashRouter>
          </ZoomProvider>
        </SelectionProvider>
      </ThemeProvider>
    </PreferencesProvider>
  );
}
