import { useEffect, useRef, useState } from "react";

import "./FilterRulesBuilder.css";

interface TokenListInputProps {
  label: string;
  placeholder: string;
  tokens: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Cleans a typed entry before it is stored, e.g. dropping the dot from ".pdf". */
  normalize?: (raw: string) => string;
  /** Formats a stored entry for its chip, e.g. showing "pdf" as ".pdf". */
  renderToken?: (token: string) => string;
}

function defaultNormalize(raw: string): string {
  return raw.trim();
}

/** Text field that collects a list of entries, one per Enter press. */
export default function TokenListInput({
  label,
  placeholder,
  tokens,
  onChange,
  disabled = false,
  normalize = defaultNormalize,
  renderToken,
}: TokenListInputProps) {
  const [draft, setDraft] = useState("");
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const normalizeRef = useRef(normalize);
  normalizeRef.current = normalize;

  const commitDraft = () => {
    const token = normalizeRef.current(draftRef.current);
    setDraft("");
    draftRef.current = "";
    if (!token || tokensRef.current.includes(token)) return;
    onChangeRef.current([...tokensRef.current, token]);
  };

  // Flush a typed-but-not-submitted chip when the editor becomes read-only
  // (e.g. leaving the browse filter page), so Filter in/out patterns are not dropped.
  useEffect(() => {
    if (!disabled) return;
    if (!draftRef.current.trim()) return;
    commitDraft();
  }, [disabled]);

  return (
    <label className="filter-rules-token-input">
      <span className="filter-rules-builder__label">{label}</span>
      {tokens.length > 0 && (
        <div className="filter-rules-chip-list">
          {tokens.map((token) => (
            <span key={token} className="filter-rules-chip">
              {renderToken ? renderToken(token) : token}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${token}`}
                  onClick={() =>
                    onChange(tokens.filter((item) => item !== token))
                  }
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="filter-rules-token-input__entry">
        <input
          className="filter-rules-builder__input"
          type="text"
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
            }
          }}
        />
        <button
          type="button"
          className="filter-rules-token-input__add"
          disabled={disabled}
          onClick={commitDraft}
        >
          Add
        </button>
      </div>
      <span className="filter-rules-builder__hint">
        Press Enter to add another. Any one of them counts as a match.
      </span>
    </label>
  );
}
