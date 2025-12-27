import { Folder } from "../types/services";

const nowIso = () => new Date().toISOString();

export const presetRootsByType: Record<string, Folder> = {
  local: {
    ServiceID: "/",
    Id: "/",
    name: "Local Root",
    locationPath: "/",
    parentId: "",
    parentPath: "",
    lastUpdated: nowIso(),
    depthLevel: 0,
    type: "folder",
  },
  spectra: {
    ServiceID: "root",
    Id: "root",
    name: "Spectra Root",
    locationPath: "/",
    parentId: "",
    parentPath: "",
    lastUpdated: nowIso(),
    depthLevel: 0,
    type: "folder",
  },
};

export function getPresetRootForServiceType(type: string): Folder | undefined {
  const preset = presetRootsByType[type];
  if (!preset) return undefined;
  return { ...preset, lastUpdated: nowIso() };
}