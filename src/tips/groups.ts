import type { TipGroupId, TipGroupMeta } from "./types";

export const TIP_GROUP_META: Record<TipGroupId, TipGroupMeta> = {
  "progress-monitor": {
    id: "progress-monitor",
    name: "Progress monitor",
    description: "Tips during discovery, copy, and delete.",
  },
  "migration-setup": {
    id: "migration-setup",
    name: "Migration setup",
    description: "Tips when configuring source, destination, and advanced options.",
  },
  "path-review": {
    id: "path-review",
    name: "Path review",
    description: "Tips on the path review and list filters screens.",
  },
  autoscaler: {
    id: "autoscaler",
    name: "Autoscaler",
    description: "Tips on the live autoscaler panel and knobs.",
  },
  spectra: {
    id: "spectra",
    name: "Spectra",
    description: "Tips on the Spectra test filesystem config.",
  },
  browse: {
    id: "browse",
    name: "Folder browser",
    description: "Tips while choosing source or destination roots.",
  },
};

export const TIP_GROUP_ORDER: TipGroupId[] = [
  "progress-monitor",
  "migration-setup",
  "browse",
  "path-review",
  "autoscaler",
  "spectra",
];
