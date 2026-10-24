export type TipCategory = {
  id: string;
  name: string;
  description: string;
};

export type TipGroup = {
  id: string;
  name: string;
  description: string;
  categories: TipCategory[];
};

export const TIP_GROUPS: TipGroup[] = [
  {
    id: "discovery",
    name: "Progress monitor",
    description: "Tips shown on the progress monitor during discovery, copy, and delete.",
    categories: [
      {
        id: "discovery-rate-source",
        name: "Source rate",
        description: "Discovery rate metric for the source traversal queue.",
      },
      {
        id: "discovery-rate-destination",
        name: "Destination rate",
        description: "Discovery rate metric for the destination traversal queue.",
      },
      {
        id: "discovery-destination-total",
        name: "Destination total",
        description: "Total discovered count for the destination traversal queue.",
      },
      {
        id: "discovery-batch",
        name: "Discovery batch",
        description: "Current scan batch number and what the batch progress bar means.",
      },
      {
        id: "progress-rate-limited",
        name: "Rate limited",
        description: "Badge when a provider asks Sylos to wait before continuing.",
      },
      {
        id: "progress-pacing",
        name: "Pacing",
        description: "Badge when Sylos inserts short pauses to stay within provider limits.",
      },
    ],
  },
  {
    id: "path-review",
    name: "Path review",
    description: "Legend and footer tips on the path review screen.",
    categories: [
      {
        id: "path-review-status-exclude",
        name: "Leave out of plan",
        description:
          "First visible pending icon (clock / trash): click to leave the item out of the plan.",
      },
      {
        id: "path-review-status-include",
        name: "Put back in plan",
        description:
          "First visible excluded icon: click to put the item back in the plan.",
      },
      {
        id: "path-review-status-mark-retry",
        name: "Mark for retry",
        description:
          "First visible failed or skipped icon: click to mark for retry.",
      },
      {
        id: "path-review-status-undo-retry",
        name: "Undo retry mark",
        description:
          "First visible retry spinner: click to undo the retry mark.",
      },
      {
        id: "path-review-pending",
        name: "Pending",
        description: "Pending item icons in the path review legend.",
      },
      {
        id: "path-review-excluded",
        name: "Excluded",
        description: "Excluded item icons in the path review legend.",
      },
      {
        id: "path-review-destination-only",
        name: "Destination only",
        description: "Destination-only item icons in the path review legend.",
      },
      {
        id: "path-review-failed",
        name: "Failed",
        description: "Failed item icons in the path review legend.",
      },
      {
        id: "path-review-retry",
        name: "Retry",
        description: "Retry item icons in the path review legend.",
      },
      {
        id: "path-review-dst-size",
        name: "Destination size",
        description: "Destination size statistic in the path review footer.",
      },
      {
        id: "path-review-selected-size",
        name: "Selected size",
        description:
          "Pending copy or removal bytes on plan review (opens a breakdown card on hover/click).",
      },
      {
        id: "path-review-free-dst",
        name: "Dst free space",
        description: "Free space on the destination in the path review footer.",
      },
    ],
  },
  {
    id: "browse",
    name: "Folder browser",
    description: "Tips while choosing source or destination roots.",
    categories: [
      {
        id: "browse-folder-selection",
        name: "Selection",
        description: "How to select and delete items while browsing folders.",
      },
      {
        id: "migration-setup-storage",
        name: "Endpoint storage",
        description:
          "Storage meter on the migration setup cards (filesystem or account capacity).",
      },
    ],
  },
];

/** Flat list of every tip category id (for bulk enable/disable). */
export const ALL_TIP_CATEGORY_IDS = TIP_GROUPS.flatMap((group) =>
  group.categories.map((category) => category.id)
);
