import type { FSHealthReport, FSHealthSideReport } from "../api/services";
import type { CloudConnectionCheckResult, CloudEndpointRole } from "./cloudConnections";
import { serviceIdToProviderId } from "./cloudProviders";

function sideReport(
  report: FSHealthReport,
  role: CloudEndpointRole
): FSHealthSideReport | undefined {
  if (role === "source") {
    return report.source ?? report.sides?.source;
  }
  return report.destination ?? report.sides?.destination;
}

function classificationMessage(side: FSHealthSideReport): string {
  const stepErr = Object.values(side.steps ?? {})
    .map((s) => s.error)
    .find((e) => Boolean(e));
  switch (side.classification) {
    case "auth_failed":
      return stepErr || "Cloud credentials are no longer valid";
    case "permission_denied":
      return stepErr || "Insufficient permissions on this root";
    case "transient":
      return stepErr || "Provider temporarily unavailable; retry shortly";
    case "not_configured":
      return stepErr || "Root is not configured";
    default:
      return stepErr || "Filesystem health check failed";
  }
}

/** Map a failed FS health report into reconnect-card rows (cloud/SFTP with connection ids). */
export function cloudIssuesFromFSHealth(
  report: FSHealthReport,
  labels?: { source?: string; destination?: string }
): CloudConnectionCheckResult[] {
  const out: CloudConnectionCheckResult[] = [];
  for (const role of ["source", "destination"] as CloudEndpointRole[]) {
    const side = sideReport(report, role);
    if (!side || side.ok) continue;
    const serviceId = side.serviceId || "";
    const connectionId = side.connectionId || "";
    const reconnectable =
      Boolean(connectionId) &&
      (side.serviceType === "cloud" || side.classification === "auth_failed");
    out.push({
      role,
      serviceId,
      providerId: serviceId ? serviceIdToProviderId(serviceId) : "",
      connectionId: reconnectable ? connectionId : "",
      label:
        (role === "source" ? labels?.source : labels?.destination) ||
        (role === "source" ? "Source" : "Destination"),
      valid: false,
      error: classificationMessage(side),
    });
  }
  return out;
}

export function formatFSHealthFailure(report: FSHealthReport): string {
  const parts: string[] = [];
  for (const role of ["source", "destination"] as CloudEndpointRole[]) {
    const side = sideReport(report, role);
    if (!side || side.ok) continue;
    const label = role === "source" ? "Source" : "Destination";
    parts.push(`${label}: ${classificationMessage(side)}`);
  }
  return parts.join(" ") || "Filesystem health check failed.";
}

export function fsHealthNeedsReconnect(report: FSHealthReport): boolean {
  return cloudIssuesFromFSHealth(report).some((i) => Boolean(i.connectionId));
}
