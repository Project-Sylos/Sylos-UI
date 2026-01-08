import "./App.css";
import { HashRouter, Route, Routes } from "react-router-dom";

import { PreferencesProvider } from "./contexts/PreferencesContext";
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
import MigrationSummary from "./pages/MigrationSummary";
import DiscoveryProgress from "./pages/DiscoveryProgress";
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
                <Route path="/discovery-progress/:migrationId" element={<DiscoveryProgress />} />
                <Route path="/path-review/:migrationId" element={<PathReview />} />
                <Route path="/resume" element={<ResumeMigration />} />
                <Route path="/browse" element={<BrowseFolder />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </HashRouter>
          </ZoomProvider>
        </SelectionProvider>
      </ThemeProvider>
    </PreferencesProvider>
  );
}
