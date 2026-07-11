import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  acknowledgeRecoveryCode,
  fetchRecoveryCodeStatus,
  regenerateRecoveryCode,
  type RecoveryCodeStatus,
} from "../api/auth";
import RecoveryCodeDialog from "../components/RecoveryCodeDialog";
import { useAuth } from "./AuthContext";

type DialogState = {
  code: string;
  title: string;
  description: string;
  mode: "acknowledge" | "handoff";
  onComplete?: () => void;
};

type RecoveryCodeContextValue = {
  status: RecoveryCodeStatus | null;
  needsAttention: boolean;
  refreshStatus: () => Promise<void>;
  showAcknowledgeDialog: (
    code: string,
    options?: { title?: string; description?: string; onComplete?: () => void }
  ) => void;
  showHandoffDialog: (
    code: string,
    options?: { title?: string; description?: string; onComplete?: () => void }
  ) => void;
  resolveRecoveryAttention: () => Promise<void>;
};

const RecoveryCodeContext = createContext<RecoveryCodeContextValue | null>(null);

export function RecoveryCodeProvider({ children }: { children: ReactNode }) {
  const { user, recoveryOffer, clearRecoveryOffer } = useAuth();
  const [status, setStatus] = useState<RecoveryCodeStatus | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!user) {
      setStatus(null);
      return;
    }
    try {
      setStatus(await fetchRecoveryCodeStatus());
    } catch {
      setStatus(null);
    }
  }, [user]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!recoveryOffer) return;
    setDialog({
      code: recoveryOffer.code,
      title: recoveryOffer.title ?? "Your new recovery code",
      description:
        recoveryOffer.description ??
        "Save this code somewhere safe. You will need it to recover your account if you are locked out.",
      mode: "acknowledge",
      onComplete: () => {
        clearRecoveryOffer();
      },
    });
  }, [recoveryOffer, clearRecoveryOffer]);

  const showAcknowledgeDialog = useCallback(
    (
      code: string,
      options?: { title?: string; description?: string; onComplete?: () => void }
    ) => {
      setDialog({
        code,
        title: options?.title ?? "Save your recovery code",
        description:
          options?.description ??
          "Store this code somewhere safe. You will need it to recover your account if you are locked out.",
        mode: "acknowledge",
        onComplete: options?.onComplete,
      });
    },
    []
  );

  const showHandoffDialog = useCallback(
    (
      code: string,
      options?: { title?: string; description?: string; onComplete?: () => void }
    ) => {
      setDialog({
        code,
        title: options?.title ?? "User recovery code",
        description:
          options?.description ??
          "Give this code to the user once. They should store it safely to recover their account if locked out.",
        mode: "handoff",
        onComplete: options?.onComplete,
      });
    },
    []
  );

  const resolveRecoveryAttention = useCallback(async () => {
    if (!status?.needsAttention) return;
    if (!status.hasRecoveryCode) {
      const code = await regenerateRecoveryCode();
      showAcknowledgeDialog(code);
      return;
    }
    if (
      !window.confirm(
        "Generate a new recovery code to view and save? Your current code will stop working."
      )
    ) {
      return;
    }
    const code = await regenerateRecoveryCode();
    showAcknowledgeDialog(code);
  }, [showAcknowledgeDialog, status]);

  const handleAcknowledge = async () => {
    if (dialog?.mode === "acknowledge") {
      await acknowledgeRecoveryCode();
      await refreshStatus();
    }
    dialog?.onComplete?.();
    setDialog(null);
    clearRecoveryOffer();
  };

  const handleCloseHandoff = () => {
    dialog?.onComplete?.();
    setDialog(null);
  };

  const value = useMemo(
    () => ({
      status,
      needsAttention: status?.needsAttention === true,
      refreshStatus,
      showAcknowledgeDialog,
      showHandoffDialog,
      resolveRecoveryAttention,
    }),
    [status, refreshStatus, showAcknowledgeDialog, showHandoffDialog, resolveRecoveryAttention]
  );

  return (
    <RecoveryCodeContext.Provider value={value}>
      {children}
      {dialog && (
        <RecoveryCodeDialog
          recoveryCode={dialog.code}
          title={dialog.title}
          description={dialog.description}
          mode={dialog.mode}
          onAcknowledge={() => void handleAcknowledge()}
          onClose={handleCloseHandoff}
        />
      )}
    </RecoveryCodeContext.Provider>
  );
}

export function useRecoveryCode(): RecoveryCodeContextValue {
  const ctx = useContext(RecoveryCodeContext);
  if (!ctx) {
    throw new Error("useRecoveryCode must be used within RecoveryCodeProvider");
  }
  return ctx;
}
