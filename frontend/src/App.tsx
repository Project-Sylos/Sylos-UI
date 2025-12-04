import "./App.css";
import { HashRouter, Route, Routes } from "react-router-dom";

import { SelectionProvider } from "./context/SelectionContext";
import AnimatedBackground from "./components/AnimatedBackground";
import ConnectSource from "./pages/ConnectSource";
import Destination from "./pages/Destination";
import Splash from "./pages/Splash";
import ChooseMigrationType from "./pages/ChooseMigrationType";
import ResumeMigration from "./pages/ResumeMigration";
import BrowseFolder from "./pages/BrowseFolder";
import MigrationSummary from "./pages/MigrationSummary";
import MigrationMonitor from "./pages/MigrationMonitor";

export default function App() {
  return (
    <SelectionProvider>
      <HashRouter>
        <AnimatedBackground />
        <Routes>
          <Route path="/" element={<Splash />} />
          <Route path="/choose" element={<ChooseMigrationType />} />
          <Route path="/connect" element={<ConnectSource />} />
          <Route path="/destination" element={<Destination />} />
          <Route path="/summary" element={<MigrationSummary />} />
          <Route path="/monitor/:migrationId" element={<MigrationMonitor />} />
          <Route path="/resume" element={<ResumeMigration />} />
          <Route path="/browse" element={<BrowseFolder />} />
        </Routes>
      </HashRouter>
    </SelectionProvider>
  );
}
