import "./App.css";
import { HashRouter, Route, Routes } from "react-router-dom";

import { SelectionProvider } from "./context/SelectionContext";
import AnimatedBackground from "./components/AnimatedBackground";
import BackgroundCredit from "./components/BackgroundCredit";
import ConnectSource from "./pages/ConnectSource";
import Destination from "./pages/Destination";
import Splash from "./pages/Splash";
import ChooseMigrationType from "./pages/ChooseMigrationType";
import ResumeMigration from "./pages/ResumeMigration";
import BrowseFolder from "./pages/BrowseFolder";
import MigrationSummary from "./pages/MigrationSummary";
import DiscoveryProgress from "./pages/DiscoveryProgress";

export default function App() {
  return (
    <SelectionProvider>
      <HashRouter>
        <AnimatedBackground />
        <BackgroundCredit />
        <Routes>
          <Route path="/" element={<Splash />} />
          <Route path="/choose" element={<ChooseMigrationType />} />
          <Route path="/connect" element={<ConnectSource />} />
          <Route path="/destination" element={<Destination />} />
          <Route path="/summary" element={<MigrationSummary />} />
          <Route path="/discovery-progress/:migrationId" element={<DiscoveryProgress />} />
          <Route path="/resume" element={<ResumeMigration />} />
          <Route path="/browse" element={<BrowseFolder />} />
        </Routes>
      </HashRouter>
    </SelectionProvider>
  );
}
