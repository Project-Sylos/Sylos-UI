import { MigrationRootRequestRoot } from "../types/migrations";
import { BrowseTrailItem, Folder } from "../types/services";
import { serviceIdToProviderId } from "./cloudProviders";

/** Cloud provider folder IDs. Not human-readable paths. */
const CLOUD_PROVIDER_FOLDER_IDS = new Set([
  "root",
  "sharedWithMe",
  "shared_with_me",
]);

export function isFilesystemNativePath(serviceId?: string): boolean {
  const s = (serviceId ?? "").trim();
  if (!s || s === "/") return false;
  if (CLOUD_PROVIDER_FOLDER_IDS.has(s)) return false;
  if (/^[A-Za-z]:/.test(s)) return true;
  if (s.startsWith("/") || s.startsWith("\\\\")) return true;
  return false;
}

export function folderToApiRoot(root: Folder): MigrationRootRequestRoot {
  return {
    id: root.ServiceID,
    parentId: root.parentId,
    parentPath: root.parentPath,
    displayName: root.name,
    locationPath: root.locationPath,
    lastUpdated: root.lastUpdated,
    depthLevel: root.depthLevel,
    type: root.type || "folder",
  };
}

export function formatMigrationPath(
  root?: { name?: string; locationPath?: string; ServiceID?: string }
): string {
  if (!root) return "Not specified";

  const location = root.locationPath?.trim();
  const name = root.name?.trim();
  const serviceId = root.ServiceID?.trim();

  const isAtServiceRoot = !location || location === "/";
  if (isAtServiceRoot) {
    if (isFilesystemNativePath(serviceId)) {
      return serviceId!;
    }
    if (name) return name;
    if (serviceId) return serviceId;
    return "Not specified";
  }

  return location || name || serviceId || "Not specified";
}

/** Combined "{service} · {drive/path}" label for a selected endpoint. */
export function formatServiceRootLabel(selected?: {
  service?: { displayName?: string };
  root?: { name?: string; locationPath?: string; ServiceID?: string };
}): string {
  const path = formatMigrationPath(selected?.root);
  const service = selected?.service?.displayName?.trim();
  if (service && path !== "Not specified") {
    return `${service} · ${path}`;
  }
  return path;
}

export function getBrowseTrailFromFolder(
  folder: Folder
): BrowseTrailItem[] {
  if (folder.browseTrail?.length) {
    return folder.browseTrail;
  }

  const id = folder.ServiceID;
  const locationPath = folder.locationPath || "/";

  if (locationPath === "/" || locationPath === "") {
    return [{ path: id, name: folder.name }];
  }

  const parts = locationPath.split("/").filter(Boolean);
  if (parts.length === 0) {
    return [{ path: id, name: folder.name }];
  }

  if (/^[A-Za-z]:/.test(id)) {
    const driveRoot = id.slice(0, 2) + "\\";
    const crumbs: BrowseTrailItem[] = [
      { path: driveRoot, name: id.slice(0, 2) },
    ];
    let built = id.slice(0, 2);

    for (let i = 0; i < parts.length; i++) {
      built += "\\" + parts[i];
      crumbs.push({
        path: i === parts.length - 1 ? id : built,
        name: i === parts.length - 1 ? folder.name : parts[i],
      });
    }

    return crumbs;
  }

  const crumbs: BrowseTrailItem[] = [{ path: "/", name: "/" }];
  let built = "";
  for (let i = 0; i < parts.length; i++) {
    built += "/" + parts[i];
    crumbs.push({
      path: i === parts.length - 1 ? id : built,
      name: i === parts.length - 1 ? folder.name : parts[i],
    });
  }

  return crumbs;
}

export function getEndpointEditNavigation(
  role: "source" | "destination",
  selected?: { service: { id: string; type: string }; root?: Folder },
  migration?: {
    sourceConnectionId?: string;
    destinationConnectionId?: string;
  }
): { path: string; state?: Record<string, unknown> } {
  const servicePicker = role === "source" ? "/connect" : "/destination";

  if (!selected?.service) {
    return { path: servicePicker };
  }

  if (selected.service.type === "spectra") {
    return {
      path: "/spectra-config",
      state: {
        serviceId: selected.service.id,
        returnTo: "/summary",
      },
    };
  }

  if (selected.service.type === "local" && selected.root) {
    const params = new URLSearchParams({
      serviceId: selected.service.id,
      role,
    });
    return {
      path: `/browse?${params.toString()}`,
      state: { resumeFolder: selected.root },
    };
  }

  if (selected.service.type === "cloud" && selected.root) {
    const connectionId =
      role === "source"
        ? migration?.sourceConnectionId
        : migration?.destinationConnectionId;
    if (!connectionId) {
      return { path: servicePicker };
    }
    const params = new URLSearchParams({
      providerId: serviceIdToProviderId(selected.service.id),
      connectionId,
      serviceId: selected.service.id,
      role,
    });
    return {
      path: `/browse-cloud?${params.toString()}`,
      state: { resumeFolder: selected.root },
    };
  }

  return { path: servicePicker };
}

export function isSpectraEligible(
  sourceRoot?: Folder,
  destinationRoot?: Folder,
  spectraLocked?: boolean
): boolean {
  if (spectraLocked) return false;
  return !sourceRoot && !destinationRoot;
}
