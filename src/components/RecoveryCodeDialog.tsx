import { useState } from "react";
import "./RecoveryCodeDialog.css";

type RecoveryCodeDialogProps = {
  recoveryCode: string;
  title?: string;
  description?: string;
  mode?: "acknowledge" | "handoff";
  onAcknowledge?: () => void;
  onClose?: () => void;
};

export default function RecoveryCodeDialog({
  recoveryCode,
  title = "Save your recovery code",
  description = "Store this code somewhere safe (password manager, printed copy, etc.). You can use it once to reset your password if you are locked out. It will not be shown again.",
  mode = "acknowledge",
  onAcknowledge,
  onClose,
}: RecoveryCodeDialogProps) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(mode === "handoff");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleOverlayClick = () => {
    if (mode === "handoff") {
      onClose?.();
    }
  };

  return (
    <div
      className="recovery-code-dialog__overlay"
      role="presentation"
      onClick={handleOverlayClick}
    >
      <div
        className="recovery-code-dialog"
        role="dialog"
        aria-labelledby="recovery-code-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="recovery-code-title" className="recovery-code-dialog__title">
          {title}
        </h2>
        <p className="recovery-code-dialog__body">{description}</p>
        <button
          type="button"
          className={`recovery-code-dialog__code ${revealed ? "recovery-code-dialog__code--revealed" : ""}`}
          onClick={() => setRevealed(true)}
          aria-label={revealed ? "Recovery code" : "Click to reveal recovery code"}
        >
          {revealed ? recoveryCode : "Click to reveal code"}
        </button>
        <div className="recovery-code-dialog__actions">
          <button type="button" className="recovery-code-dialog__copy" onClick={() => void handleCopy()}>
            {copied ? "Copied" : "Copy to clipboard"}
          </button>
          {mode === "acknowledge" ? (
            <button
              type="button"
              className="recovery-code-dialog__close"
              onClick={() => onAcknowledge?.()}
            >
              Acknowledge
            </button>
          ) : (
            <button type="button" className="recovery-code-dialog__close" onClick={() => onClose?.()}>
              I saved it
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
