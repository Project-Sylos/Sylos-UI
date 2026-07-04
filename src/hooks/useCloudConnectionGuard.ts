import { useCallback, useEffect, useState } from "react";

import { ConnectionStatusResponse } from "../types/providers";
import { checkCloudConnection } from "../utils/cloudConnections";

interface UseCloudConnectionGuardOptions {
  providerId: string;
  connectionId: string;
  enabled?: boolean;
}

interface UseCloudConnectionGuardResult {
  checking: boolean;
  valid: boolean | null;
  status: ConnectionStatusResponse | null;
  error: string | null;
  recheck: () => Promise<boolean>;
}

export function useCloudConnectionGuard({
  providerId,
  connectionId,
  enabled = true,
}: UseCloudConnectionGuardOptions): UseCloudConnectionGuardResult {
  const [checking, setChecking] = useState(enabled);
  const [valid, setValid] = useState<boolean | null>(null);
  const [status, setStatus] = useState<ConnectionStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recheck = useCallback(async (): Promise<boolean> => {
    if (!enabled || !providerId || !connectionId) {
      setValid(null);
      setStatus(null);
      setError(null);
      setChecking(false);
      return false;
    }

    setChecking(true);
    setError(null);

    try {
      const nextStatus = await checkCloudConnection(providerId, connectionId);
      setStatus(nextStatus);
      setValid(nextStatus.valid);
      return nextStatus.valid;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to verify cloud connection.";
      setError(message);
      setValid(false);
      setStatus(null);
      return false;
    } finally {
      setChecking(false);
    }
  }, [connectionId, enabled, providerId]);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  return { checking, valid, status, error, recheck };
}
