import { ReactNode } from "react";
import { Database, FolderOpen, Server } from "lucide-react";

/** Theme-driven icon tones on selection cards (see SelectionPage.css) */
export type ServiceIconAccent = "a" | "b";

export type ServiceSelectionVisual = {
  icon: ReactNode;
  description: string;
  iconAccent?: ServiceIconAccent;
};

export const defaultServiceSelectionOption: ServiceSelectionVisual = {
  icon: <Server size={40} />,
  description: "Connect to this service.",
};

export const serviceSelectionOptions: Record<string, ServiceSelectionVisual> = {
  local: {
    icon: <FolderOpen size={40} />,
    description:
      "Browse a directory on this machine. We need read access to this folder and its subcontents to scan metadata.",
    iconAccent: "a",
  },
  spectra: {
    icon: <Database size={40} />,
    description: "Connect to a Spectra environment.",
    iconAccent: "b",
  },
};

