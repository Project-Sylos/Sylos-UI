import { ReactNode } from "react";
import HelpTooltip, { HelpTooltipProps } from "./HelpTooltip";
import "./FormField.css";

export interface FormFieldProps {
  id: string;
  label: string;
  type?: "text" | "number" | "email" | "password";
  value: string | number;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  required?: boolean;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  disabled?: boolean;
  helpTooltip?: Omit<HelpTooltipProps, "content"> & { content: ReactNode };
  className?: string;
}

export default function FormField({
  id,
  label,
  type = "text",
  value,
  onChange,
  onBlur,
  placeholder,
  required = false,
  min,
  max,
  step,
  disabled = false,
  helpTooltip,
  className = "",
}: FormFieldProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className={`form-field ${className}`}>
      <label htmlFor={id} className={helpTooltip ? "form-field__label-with-tooltip" : ""}>
        {label}
        {helpTooltip && (
          <HelpTooltip
            tipId={helpTooltip.tipId}
            category={helpTooltip.category}
            position={helpTooltip.position}
            content={helpTooltip.content}
          />
        )}
      </label>
      <input
        type={type}
        id={id}
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="form-field__input"
      />
    </div>
  );
}
