import { ReactNode } from "react";
import { Cloud, Database, FolderOpen, Server } from "lucide-react";

import googleDriveLogo from "../assets/external/Google_Drive_Logo.svg";
import dropboxLogo from "../assets/external/dropbox-1-logo-png-transparent.png";
import oneDriveLogo from "../assets/external/onedrive.webp";
import sharePointLogo from "../assets/external/sharepoint.svg";
import boxLogo from "../assets/external/BOX.svg";

/** Theme-driven icon tones on selection cards (see SelectionPage.css) */
export type ServiceIconAccent = "a" | "b";

export type ServiceSelectionVisual = {
  icon: ReactNode;
  description?: string;
  iconAccent?: ServiceIconAccent;
};

export const defaultServiceSelectionOption: ServiceSelectionVisual = {
  icon: <Server size={40} />,
};

const googleDriveSelectionIcon = (
  <img
    src={googleDriveLogo}
    alt=""
    className="service-external-logo"
    width={44}
    height={44}
  />
);

const dropboxSelectionIcon = (
  <img
    src={dropboxLogo}
    alt=""
    className="service-external-logo"
    width={44}
    height={44}
  />
);

const oneDriveSelectionIcon = (
  <img
    src={oneDriveLogo}
    alt=""
    className="service-external-logo"
    width={44}
    height={44}
  />
);

const sharePointSelectionIcon = (
  <img
    src={sharePointLogo}
    alt=""
    className="service-external-logo"
    width={44}
    height={44}
  />
);

const boxSelectionIcon = (
  <img
    src={boxLogo}
    alt=""
    className="service-external-logo"
    width={44}
    height={44}
  />
);

export const serviceSelectionOptions: Record<string, ServiceSelectionVisual> = {
  local: {
    icon: <FolderOpen size={40} />,
    description:
      "Browse a directory on this machine. We need read access to this folder and its subcontents to scan metadata.",
    iconAccent: "a",
  },
  spectra: {
    icon: <Database size={40} />,
    iconAccent: "b",
  },
  cloud: {
    icon: <Cloud size={40} />,
    description:
      "Connect a cloud account and browse folders to choose a migration root.",
    iconAccent: "b",
  },
  "google-drive": {
    icon: googleDriveSelectionIcon,
    description:
      "Sign in with Google to browse My Drive, Shared with me, and Shared drives.",
  },
  dropbox: {
    icon: dropboxSelectionIcon,
    description:
      "Sign in with Dropbox to browse My Dropbox, team folders, and shared folders.",
  },
  onedrive: {
    icon: oneDriveSelectionIcon,
    description:
      "Sign in with Microsoft to browse OneDrive files and items shared with you.",
  },
  sharepoint: {
    icon: sharePointSelectionIcon,
    description:
      "Sign in with Microsoft to browse SharePoint sites and document libraries.",
  },
  box: {
    icon: boxSelectionIcon,
    description:
      "Sign in with Box to browse All Files and choose a migration root.",
  },
  sftp: {
    icon: <Server size={40} />,
    description:
      "Connect to a remote SFTP server with host and credentials, then browse folders to choose a root.",
    iconAccent: "b",
  },
};
