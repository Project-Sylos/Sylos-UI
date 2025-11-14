import "./App.css";
import { HashRouter, Route, Routes } from "react-router-dom";

import { SelectionProvider } from "./context/SelectionContext";
import ConnectSource from "./pages/ConnectSource";
import Destination from "./pages/Destination";
import Splash from "./pages/Splash";

export default function App() {
  return (
    <SelectionProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Splash />} />
          <Route path="/connect" element={<ConnectSource />} />
          <Route path="/destination" element={<Destination />} />
        </Routes>
      </HashRouter>
    </SelectionProvider>
  );
}
