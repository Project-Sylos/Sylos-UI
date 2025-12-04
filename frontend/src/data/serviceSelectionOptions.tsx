import { ReactNode } from "react";
import { Database, FolderOpen, Server } from "lucide-react";

export type ServiceSelectionVisual = {
  icon: ReactNode;
  description: string;
};

export const defaultServiceSelectionOption: ServiceSelectionVisual = {
  icon: <Server size={40} color="#ffffff" />,
  description: "Connect to this service.",
};

export const serviceSelectionOptions: Record<string, ServiceSelectionVisual> = {
  local: {
    icon: <FolderOpen size={40} color="#00ffff" />,
    description: "Browse a directory on this machine. We need read access to this folder and its subcontents to scan metadata.",
  },
  spectra: {
    icon: <Database size={40} color="#ff00ff" />,
    description: "Connect to a Spectra environment.",
  },
};

