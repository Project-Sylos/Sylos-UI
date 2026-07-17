import { ConnectionStatusResponse } from "../types/providers";

/** Prefer email, then display name. */
export function formatCloudAccountLabel(status?: {
  accountEmail?: string;
  accountDisplayName?: string;
} | null): string {
  if (!status) return "";
  const email = status.accountEmail?.trim();
  if (email) return email;
  return status.accountDisplayName?.trim() ?? "";
}

export function accountFieldsFromStatus(
  role: "source" | "destination",
  status: ConnectionStatusResponse | null | undefined
): {
  sourceAccountEmail?: string;
  sourceAccountDisplayName?: string;
  destinationAccountEmail?: string;
  destinationAccountDisplayName?: string;
} {
  const email = status?.accountEmail?.trim() || undefined;
  const displayName = status?.accountDisplayName?.trim() || undefined;
  if (role === "source") {
    return {
      sourceAccountEmail: email,
      sourceAccountDisplayName: displayName,
    };
  }
  return {
    destinationAccountEmail: email,
    destinationAccountDisplayName: displayName,
  };
}

export function clearAccountFields(role: "source" | "destination"): {
  sourceAccountEmail?: undefined;
  sourceAccountDisplayName?: undefined;
  destinationAccountEmail?: undefined;
  destinationAccountDisplayName?: undefined;
} {
  if (role === "source") {
    return {
      sourceAccountEmail: undefined,
      sourceAccountDisplayName: undefined,
    };
  }
  return {
    destinationAccountEmail: undefined,
    destinationAccountDisplayName: undefined,
  };
}

export function clearEndpointCloudState(role: "source" | "destination"): {
  sourceConnectionId?: undefined;
  destinationConnectionId?: undefined;
  sourceAccountEmail?: undefined;
  sourceAccountDisplayName?: undefined;
  destinationAccountEmail?: undefined;
  destinationAccountDisplayName?: undefined;
} {
  if (role === "source") {
    return {
      sourceConnectionId: undefined,
      ...clearAccountFields("source"),
    };
  }
  return {
    destinationConnectionId: undefined,
    ...clearAccountFields("destination"),
  };
}

export function accountLabelForRole(
  role: "source" | "destination",
  migration: {
    sourceAccountEmail?: string;
    sourceAccountDisplayName?: string;
    destinationAccountEmail?: string;
    destinationAccountDisplayName?: string;
  }
): string {
  if (role === "source") {
    return formatCloudAccountLabel({
      accountEmail: migration.sourceAccountEmail,
      accountDisplayName: migration.sourceAccountDisplayName,
    });
  }
  return formatCloudAccountLabel({
    accountEmail: migration.destinationAccountEmail,
    accountDisplayName: migration.destinationAccountDisplayName,
  });
}
