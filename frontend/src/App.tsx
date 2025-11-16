import "./App.css";
import { HashRouter, Route, Routes } from "react-router-dom";

import { SelectionProvider } from "./context/SelectionContext";
import ConnectSource from "./pages/ConnectSource";
import Destination from "./pages/Destination";
import Splash from "./pages/Splash";
import ChooseMigrationType from "./pages/ChooseMigrationType";
import ResumeMigration from "./pages/ResumeMigration";

export default function App() {
  return (
    <SelectionProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Splash />} />
          <Route path="/choose" element={<ChooseMigrationType />} />
          <Route path="/connect" element={<ConnectSource />} />
          <Route path="/destination" element={<Destination />} />
          <Route path="/resume" element={<ResumeMigration />} />
        </Routes>
      </HashRouter>
    </SelectionProvider>
  );
}
