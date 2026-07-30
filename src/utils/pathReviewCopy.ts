/** User-facing copy for destination compatibility review (never say GPL). */
export const PATH_REVIEW_COPY = {
  suggestedRename: "Suggested rename",
  nameAlreadyUsed: "Name already used in this folder",
  fixDestinationName: "Fix destination name",
  renameDestination: "Rename destination…",
  showInTreeView: "Show in Tree View",
  openFolder: "Open folder",
  acceptSuggestedName: "Accept suggested name",
  acceptRenameExisting: "Rename existing destination item",
  ignoreWarning: "Ignore this error",
  ignoreKeepExistingName: "Keep current destination name",
  unignoreWarning: "Show this error again",
  useNameAnyway: "Use this name anyway",
  updatingRelatedPaths: "Updating related paths…",
  checkingDestinationNames: "Checking destination names…",
  someNeedAttention: "Some items still have compatibility issues.",
  someItemsStillNeedFixes: "Some items still have destination compatibility issues.",
  warningDismissedSubtree: "Warning dismissed for this folder and its contents.",
  warningRestoredSubtree: "Warning restored for this folder and its contents.",
  willBeCreatedAs: "Will be created as",
  renamedTo: "Renamed to",
  suggestedName: "Suggested name",
  /** Traversal / pre-copy: planned destination basename. */
  willBeCreatedAsLabel: "Will be created as:",
  /** Copy review: destination basename after remap was applied. */
  renamedToLabel: "Renamed to:",
  requireReviewBeforeCopy: (n: number) =>
    `${n} item${n === 1 ? "" : "s"} require${n === 1 ? "s" : ""} review before copy`,
  confirmCopyTitle: "Confirm Copy",
  confirmCopyMessage:
    "Are you sure you'd like to start copying these items?",
  confirmCopyWithSuggestions: (n: number) =>
    `Sylos will apply ${n} suggested destination name${n === 1 ? "" : "s"}, then start copying. You can ignore the warnings instead if you want to keep the original names.`,
  confirmCopyWithManualOnly: (n: number) =>
    `${n} item${n === 1 ? "" : "s"} still need${n === 1 ? "s" : ""} a manual rename before copying. Rename ${n === 1 ? "it" : "them"} in Path Review, or ignore the warnings to keep the original names.`,
  confirmCopyAcceptLabel: "Accept suggestions and copy",
  confirmCopyIgnoreLabel: "Ignore warnings and copy",
  ignoreRemainingTitle: "Dismiss remaining compatibility warnings?",
  ignoreRemainingConfirm: (n: number) =>
    `There ${n === 1 ? "is" : "are"} still ${n} item${n === 1 ? "" : "s"} with compatibility warnings. Dismiss them and start copying?`,
  forceTitle: "Use this name anyway?",
  forceConfirm:
    "This name may cause problems on the destination. We’ll keep it and dismiss warnings for this item and everything inside it.",
  forceConfirmSoft:
    "This name still has destination naming problems. Keep it anyway? Warnings will be dismissed for this item and everything inside it.",
  resetDestinationName: "Reset to original name",
  resetDestinationNameTip:
    "Clear the destination rename and check the original name again.",
  /** Heads-up when a suggested rename will be applied automatically. */
  compatAutoHandledSummary: (issueCount: number, resolution: string) => {
    const issues =
      issueCount <= 1
        ? "a naming issue"
        : `${issueCount} naming issues`;
    return `This item had ${issues}. It will be handled as “${resolution}”.`;
  },
  compatAutoHandledDetail:
    "No action needed. The suggested name is applied automatically when you start copying. You can still rename it or ignore the warning if you prefer.",
  alreadyExistedAcceptHelp:
    "This name already exists on the destination. Accepting renames that existing item to the suggested name. Ignoring keeps the current destination name.",
  compatibilityLabel: "Compatibility",
  compatibilityWarningLabel: "Naming warning",
  compatibilityNeedsActionLabel: "Needs attention",
  compatibilityIgnoredLabel: "Warning ignored",
  compatIgnoredDetail:
    "This naming warning is hidden for copy. The original name will be kept. Click the eye icon to show it again.",
  compatibilityFilterLabel: "Compatibility",
  compatibilityFilterAll: "All",
  compatibilityFilterIssues: "All naming warnings",
  compatibilityFilterManual: "Needs manual rename",
  compatibilityFilterRejected: "Rejected",
  compatibilityFilterNone: "No compatibility issues",
  compatibilityFilterByType: "By warning type",
  compatibilityLegendTip:
    "Info marks names that will be auto-corrected on copy. Yellow caution marks names that need a manual rename. Select a row for details. Hover the status legend for icon meanings.",
  compatibilityLegendAutoTip:
    "Destination name will be adjusted automatically when you start copying (unless you ignore the warning or rename it yourself).",
  compatibilityLegendManualTip:
    "This destination name cannot be fixed automatically. Open the item and rename it, or ignore the warning to keep the original name.",
  compatibilityIssuesStat: "Compatibility",
  issuesButtonLabel: "Issues",
  issuesButtonLabelWithCounts: (issues: number, warnings: number) =>
    `Issues ${issues} · Warnings ${warnings}`,
  issuesButtonTip:
    "Open a breakdown of failed items and destination naming issues. Jump to list view to inspect them.",
  issuesPanelTitle: "Issues",
  issuesPanelAttentionSummary: (n: number) =>
    `${n} item${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} attention before you continue.`,
  issuesPanelNoneAttention: "Nothing needs attention right now.",
  issuesPanelNoneAttentionDetail:
    "Failed items and names that require a manual rename show up here.",
  issuesNeedsAttention: "Needs attention",
  issuesReferenceTitle: "Naming warnings",
  issuesJumpToList: "Show in list view",
  issuesHelpFailed:
    "These items failed during discovery or copy. Open list view to inspect them and mark retries if needed.",
  issuesHelpReference:
    "These names will be adjusted automatically when you start copying. Use these links if you want to review them first.",
  issuesHelpCategories:
    "Counts by destination naming rule. Jump to list view to browse items with that warning type.",
  manualReviewRequired: (n: number) =>
    `${n} item${n === 1 ? "" : "s"} require${n === 1 ? "s" : ""} manual rename`,
  manualReviewTip:
    "These destination names cannot be fixed automatically. Open each item and rename it yourself.",
  renamedOnDestination: "Renamed on destination",
  renamedOnDestinationTip:
    "This name was changed for the destination. Select the row to compare source and destination names.",
  apply: "Apply",
  acceptSuggestion: "Accept suggestion",
} as const;

/** Short inline reason labels for destination naming categories (never say GPL). */
const PATH_ISSUE_SHORT_LABELS: Record<string, string> = {
  InvalidChar: "Invalid character",
  ControlChar: "Control character",
  ReservedName: "Reserved name",
  Length: "Name too long",
  TrailingDot: "Trailing period",
  TrailingSpace: "Trailing whitespace",
  EmptyPart: "Needs manual rename",
  Absolute: "Absolute path",
  SiblingCollision: "Name already used",
};

export type PathIssueSummaryInput = {
  status?: string;
  proposedPath?: string;
  category?: string;
  ignored?: boolean;
  messages?: {
    category?: string;
    message?: string;
    detail?: string;
    docsURL?: string;
  }[] | null;
};

export type PathIssueCategorySummary = {
  category: string;
  count: number;
  message?: string;
  /** Aggregated GPL Detail attrs (e.g. unique invalid chars across items). */
  detail?: string;
  docsURL?: string;
};

function issuePrimaryCategory(issue: PathIssueSummaryInput): string {
  const fromMsg = issue.messages?.find((m) => m.category)?.category;
  if (fromMsg) return fromMsg;
  if (issue.category) return issue.category;
  return "Other";
}

/** Space-separated unique runes from a GPL InvalidChar detail string. */
export function formatInvalidCharsDetail(detail?: string): string {
  if (!detail) return "";
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const ch of detail) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    parts.push(ch);
  }
  return parts.join(" ");
}

/** Merge InvalidChar detail strings into one unique-rune string. */
export function mergeInvalidCharsDetail(a?: string, b?: string): string {
  if (!a) return b || "";
  if (!b) return a;
  return [...a, ...b].join("");
}

/** Fallback explanations aligned with engine FriendlyPathIssueMessage (never say GPL). */
const PATH_ISSUE_EXPLANATIONS: Record<string, string> = {
  InvalidChar: "Contains characters the destination doesn’t allow.",
  ControlChar: "Contains characters the destination doesn’t allow.",
  ReservedName: "This name is reserved on the destination.",
  Length: "This name is too long for the destination.",
  TrailingDot: "Names can’t end with a period on the destination.",
  TrailingSpace: "Names can’t end with a space on the destination.",
  EmptyPart: "This name needs a manual rename; it can’t be left empty or removed.",
  Absolute: "Enter a name, not a full path.",
  SiblingCollision: "Name already used in this folder.",
};

/** Human-friendly explanation for a naming category (API message preferred when available). */
export function pathIssueCategoryExplanation(
  category: string,
  message?: string
): string {
  const fromApi = message?.trim();
  if (fromApi) return fromApi;
  return (
    PATH_ISSUE_EXPLANATIONS[category] ||
    "This destination name isn’t allowed."
  );
}

/** Counts for Issues panel / legend / Compatibility filter options. */
export function summarizePathIssues(pathIssues: PathIssueSummaryInput[]): {
  manualCount: number;
  suggestionCount: number;
  categoryCounts: [string, number][];
  categoryDetails: PathIssueCategorySummary[];
} {
  let manual = 0;
  let suggestions = 0;
  const cats = new Map<string, PathIssueCategorySummary>();
  for (const issue of pathIssues) {
    if (issue.ignored) continue;
    if (issue.status === "manual_review") {
      manual += 1;
      continue;
    }
    if (issue.status === "pending" || issue.status === "collision") {
      if (issue.proposedPath) suggestions += 1;
      const cat = issuePrimaryCategory(issue);
      const msg =
        issue.messages?.find((m) => m.category === cat) ||
        issue.messages?.find((m) => m.message?.trim());
      const existing = cats.get(cat);
      if (existing) {
        existing.count += 1;
        if (!existing.message && msg?.message) existing.message = msg.message;
        if (!existing.docsURL && msg?.docsURL) existing.docsURL = msg.docsURL;
        if (msg?.detail) {
          existing.detail = mergeInvalidCharsDetail(existing.detail, msg.detail);
        }
      } else {
        cats.set(cat, {
          category: cat,
          count: 1,
          message: msg?.message,
          detail: msg?.detail,
          docsURL: msg?.docsURL,
        });
      }
    }
  }
  const categoryDetails = [...cats.values()].sort((a, b) => b.count - a.count);
  return {
    manualCount: manual,
    suggestionCount: suggestions,
    categoryCounts: categoryDetails.map((d) => [d.category, d.count]),
    categoryDetails,
  };
}

/** Returns a short reason for the first message category, or a generic fallback. */
export function pathIssueShortLabel(
  messages?: { category?: string; message?: string }[] | null
): string {
  const cat = messages?.find((m) => m.category)?.category;
  if (cat && PATH_ISSUE_SHORT_LABELS[cat]) return PATH_ISSUE_SHORT_LABELS[cat];
  const first = messages?.find((m) => m.message?.trim())?.message?.trim();
  if (first) {
    const cut = first.split(/[.!]/)[0]?.trim();
    if (cut && cut.length <= 40) return cut;
  }
  return "Needs review";
}

/** True when a suggested destination name will be applied automatically. */
export function isAutoHandledCompat(item: {
  pathIssueStatus?: string;
  proposedPath?: string;
  pathIssueIgnored?: boolean;
}): boolean {
  if (item.pathIssueIgnored) return false;
  return (
    Boolean(item.proposedPath) && item.pathIssueStatus !== "manual_review"
  );
}

/** True when the user must rename (or ignore) before copy. */
export function needsManualCompatAction(item: {
  pathIssueStatus?: string;
  proposedPath?: string;
  pathIssueIgnored?: boolean;
}): boolean {
  if (item.pathIssueIgnored) return false;
  if (item.pathIssueStatus === "manual_review") return true;
  return Boolean(item.pathIssueStatus) && !item.proposedPath;
}

/** Effective destination basename: pending proposal, then accepted remap, then dst/src name. */
export function destinationDisplayName(item: {
  name: string;
  proposedPath?: string;
  resolvedDstName?: string;
  dst?: { name?: string } | null;
}): string {
  return (
    item.proposedPath ||
    item.resolvedDstName ||
    item.dst?.name ||
    item.name
  );
}

/** True when destination basename differs from the source/display name. */
export function hasDestinationRename(item: {
  name: string;
  proposedPath?: string;
  resolvedDstName?: string;
  dst?: { name?: string } | null;
}): boolean {
  const dest =
    item.proposedPath ||
    item.resolvedDstName ||
    (item.dst?.name && item.dst.name !== item.name ? item.dst.name : undefined);
  return Boolean(dest && dest !== item.name);
}

/** Full destination path using remapped basename when present. */
export function destinationDisplayPath(item: {
  name: string;
  locationPath: string;
  parentPath?: string;
  proposedPath?: string;
  resolvedDstName?: string;
  dst?: { name?: string; locationPath?: string } | null;
}): string {
  const destName = destinationDisplayName(item);
  if (destName === item.name) {
    return item.dst?.locationPath || item.locationPath;
  }
  const parent =
    item.parentPath ||
    (item.locationPath.includes("/")
      ? item.locationPath.slice(0, item.locationPath.lastIndexOf("/")) || "/"
      : "/");
  return parent === "/" ? `/${destName}` : `${parent}/${destName}`;
}
