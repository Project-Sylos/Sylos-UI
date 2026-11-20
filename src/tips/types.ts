import type { ReactNode } from "react";

export type TipKind = "help" | "coach";

export type TipGroupId =
  | "progress-monitor"
  | "migration-setup"
  | "path-review"
  | "autoscaler"
  | "spectra"
  | "browse";

export type TipDef = {
  /** Unique instance id (a11y + registry lookup). */
  tipId: string;
  /** Library / grouping label key (not the dismiss prefs key; dismiss uses tipId). */
  category: string;
  kind: TipKind;
  groupId: TipGroupId;
  title: string;
  content: ReactNode;
};

export type TipGroupMeta = {
  id: TipGroupId;
  name: string;
  description: string;
};
