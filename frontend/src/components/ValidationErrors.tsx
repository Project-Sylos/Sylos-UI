import "./ValidationErrors.css";

export interface ValidationErrorsProps {
  errors: string[];
  className?: string;
}

export default function ValidationErrors({
  errors,
  className = "",
}: ValidationErrorsProps) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className={`validation-errors ${className}`}>
      {errors.map((error, index) => (
        <div key={index} className="validation-errors__error">
          {error}
        </div>
      ))}
    </div>
  );
}
