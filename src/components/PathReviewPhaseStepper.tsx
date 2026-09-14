import {
  PathReviewLifecycleStep,
  PathReviewStepperState,
} from "../utils/pathReviewPhase";
import "./PathReviewPhaseStepper.css";

const STEPS: { id: PathReviewLifecycleStep; label: string }[] = [
  { id: "discover", label: "Discover" },
  { id: "copy", label: "Copy" },
  { id: "remove", label: "Remove" },
];

export interface PathReviewPhaseStepperProps {
  state: PathReviewStepperState;
  className?: string;
}

/** Persistent Discover → Copy → Remove rail for Path Review. */
export default function PathReviewPhaseStepper({
  state,
  className = "",
}: PathReviewPhaseStepperProps) {
  return (
    <div
      className={`path-review-stepper ${className}`.trim()}
      role="navigation"
      aria-label="Migration review progress"
    >
      <ol className="path-review-stepper__list">
        {STEPS.map((step, index) => {
          const isActive = state.active === step.id;
          const isComplete = state.completed.includes(step.id);
          const status = isActive ? "active" : isComplete ? "complete" : "upcoming";
          return (
            <li
              key={step.id}
              className={`path-review-stepper__step path-review-stepper__step--${status}`}
              aria-current={isActive ? "step" : undefined}
            >
              {index > 0 && (
                <span className="path-review-stepper__connector" aria-hidden="true" />
              )}
              <span className="path-review-stepper__marker" aria-hidden="true">
                {isComplete && !isActive ? "✓" : index + 1}
              </span>
              <span className="path-review-stepper__label">{step.label}</span>
            </li>
          );
        })}
      </ol>
      {state.subtitle && (
        <p className="path-review-stepper__subtitle">{state.subtitle}</p>
      )}
    </div>
  );
}
