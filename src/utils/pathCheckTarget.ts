/** Local filesystem OS subtypes for destination-name path rules. */
export type LocalOsSubtype = "linux" | "windows" | "macos";

export const LOCAL_OS_SUBTYPE_OPTIONS: { value: LocalOsSubtype; label: string }[] = [
  { value: "linux", label: "Linux" },
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" },
];

function normalizeProviderKey(raw?: string): string {
  return (raw || "").trim().toLowerCase().replace(/[-\s]/g, "_");
}

/** Best-effort provider id from a UI service descriptor. */
export function providerIdFromService(service?: {
  id?: string;
  type?: string;
  displayName?: string;
}): string {
  if (!service) return "";
  const type = normalizeProviderKey(service.type);
  if (type === "local" || type === "spectra") return type;
  if (type && type !== "cloud") return type;
  const id = normalizeProviderKey(service.id);
  const name = normalizeProviderKey(service.displayName);
  for (const key of [
    "dropbox",
    "box",
    "onedrive",
    "one_drive",
    "sharepoint",
    "share_point",
    "sharefile",
    "egnyte",
    "google_drive",
    "gdrive",
  ]) {
    if (id.includes(key) || name.includes(key)) {
      if (key === "one_drive") return "onedrive";
      if (key === "share_point") return "sharepoint";
      if (key === "gdrive") return "google_drive";
      return key;
    }
  }
  return id || type;
}

export function isLocalFilesystemService(service?: {
  type?: string;
  id?: string;
}): boolean {
  const type = normalizeProviderKey(service?.type);
  if (type === "local") return true;
  const id = normalizeProviderKey(service?.id);
  return id === "local" || id.startsWith("local");
}

/** Detect the browser/OS host for default local subtype. */
export function detectHostLocalOs(): LocalOsSubtype {
  const platform = (navigator.platform || "").toLowerCase();
  const ua = (navigator.userAgent || "").toLowerCase();
  if (platform.includes("win") || ua.includes("windows")) return "windows";
  if (platform.includes("mac") || ua.includes("mac os") || ua.includes("macintosh")) {
    return "macos";
  }
  return "linux";
}

/**
 * Resolve engine pathCheckTarget from endpoint providers + local OS subtypes.
 * Path rules always follow the destination. Same local OS on both sides disables checks.
 */
export function resolvePathCheckTargetFromEndpoints(args: {
  sourceProvider: string;
  destinationProvider: string;
  sourceIsLocal: boolean;
  destinationIsLocal: boolean;
  sourceLocalOs: LocalOsSubtype;
  destinationLocalOs: LocalOsSubtype;
}): string {
  const src = normalizeProviderKey(args.sourceProvider);
  const dst = normalizeProviderKey(args.destinationProvider);

  if (args.destinationIsLocal) {
    // Same local environment (e.g. linux -> linux): skip checks; subtype is still labeled.
    if (args.sourceIsLocal && args.sourceLocalOs === args.destinationLocalOs) {
      return "none";
    }
    return args.destinationLocalOs;
  }

  // Non-local destination: skip when service types match, otherwise use destination rules.
  if (src && dst && src === dst) return "none";
  return "auto";
}
