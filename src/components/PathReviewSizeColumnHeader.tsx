export default function PathReviewSizeColumnHeader({
  variant,
}: {
  variant: "tree" | "list";
}) {
  const lead = variant === "list" ? 5 : 4;
  return (
    <div
      className={`path-review-cols path-review-cols--${variant}`}
      role="row"
    >
      {Array.from({ length: lead }, (_, i) => (
        <span key={i} aria-hidden="true" />
      ))}
      <span className="path-review-cols__size">
        <span>Size</span>
      </span>
      <span aria-hidden="true" />
    </div>
  );
}
