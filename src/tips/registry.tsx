import type { ReactNode } from "react";
import { PATH_REVIEW_COPY } from "../utils/pathReviewCopy";
import type { TipDef } from "./types";

const QUEUE_TASK_KIND: Record<string, string> = {
  src: "source discovery",
  dst: "destination discovery",
  copy: "copy",
  delete: "delete",
};

/** Shared selection gestures (browse + path review). Fresh nodes each call. */
export function selectionHelpCore(): ReactNode {
  return (
    <>
      <p>Click to select; click again to deselect. Double-click a folder to open it.</p>
      <p>Ctrl/Cmd+click or Shift+click to multi-select.</p>
      <p>Hold Alt to select text in a row.</p>
    </>
  );
}

function fsStorageTip(): ReactNode {
  return (
    <p>
      Capacity reported by the filesystem or cloud account for this service. It is
      the total free and used space on that drive or account, not the size of the
      specific folder you selected.
    </p>
  );
}

function discoveryRateTip(): ReactNode {
  return (
    <p>
      How many files and folders are processed per second (windowed). During
      discovery this is newly found children, or list-task completions when those
      are faster (leaf folders).
    </p>
  );
}

function discoveryBatchTip(): ReactNode {
  return (
    <p>
      Current scan chunk. The bar and ETA reset when the next batch starts; totals
      keep growing.
    </p>
  );
}

/**
 * Autoscaler knob copy by category. WorkerCount text is queue-aware via
 * {@link autoscalerWorkerContent}.
 */
export function autoscalerWorkerContent(queue: string): string {
  const kind = QUEUE_TASK_KIND[queue] || "migration";
  return `How many ${kind} tasks can run at the same time. Raising the max lets Sylos try more work in parallel, which can speed things up, but setting it too high may hit cloud rate limits or use more memory.`;
}

export function autoscalerKnobContent(
  knob: string,
  queue: string
): { category: string; content: string } | null {
  switch (knob) {
    case "WorkerCount":
      return {
        category: "autoscaler-workers",
        content: autoscalerWorkerContent(queue),
      };
    case "LeaseBatchSize":
      return {
        category: "autoscaler-queue-tasks",
        content:
          "How many tasks this queue may keep ready in memory. When that list runs low (about 25% full), Sylos pulls more from the database in chunks of about 25% of this size. Larger values can keep workers busier but use more RAM.",
      };
    case "InterOpDelayMs":
      return {
        category: "autoscaler-interop",
        content:
          "A short pause between storage operations on a single worker. You can edit this only when workers is 1 (a slow-lane throttle). With more than one worker, Sylos manages any delay automatically.",
      };
    case "SealRowThreshold":
      return {
        category: "autoscaler-db-buffer",
        content:
          "How many finished results to hold in the database memory buffer before preferring a flush to disk. Default soft size is 50k rows; absolute max (and hard cap) is 250k. When the buffer stays at max with free memory, Sylos may raise this size and keep the raise only if flush cost (time per row) or producer stall wait improves; otherwise it rolls back. Manual Apply above 250k is capped with a warning.",
      };
    case "SealFlushIntervalMs":
      return {
        category: "autoscaler-db-flush",
        content:
          "The longest Sylos will wait before flushing the database memory buffer. Shorter means progress is saved more often; longer can mean fewer, larger writes.",
      };
    case "MemoryKnobCooldownMs":
      return {
        category: "autoscaler-memory-bounce",
        content:
          "After Sylos cuts queue or buffer sizes because of memory pressure, it waits this long before cutting or raising those sizes again. That avoids thrashing when memory is tight.",
      };
    case "ProbeCooldownMs":
      return {
        category: "autoscaler-worker-bounce",
        content:
          "After Sylos reduces workers because the storage provider is rate-limiting, it waits this long before trying to add workers again.",
      };
    default:
      return null;
  }
}

export const TIP_REGISTRY: TipDef[] = [
  // Progress monitor
  {
    tipId: "progress-rate-limited",
    category: "progress-rate-limited",
    kind: "help",
    groupId: "progress-monitor",
    title: "Rate limited",
    content: (
      <p>
        The storage service asked Sylos to slow down for a short time. Work
        resumes automatically when the wait ends. This is normal and helps avoid
        getting blocked by the provider.
      </p>
    ),
  },
  {
    tipId: "progress-pacing",
    category: "progress-pacing",
    kind: "help",
    groupId: "progress-monitor",
    title: "Pacing",
    content: (
      <p>
        Sylos is inserting short pauses between operations so it stays within the
        provider&apos;s limits. Throughput may look slower, but the migration is
        still making progress.
      </p>
    ),
  },
  {
    tipId: "copy-items-per-sec-explanation",
    category: "copy-items-per-sec",
    kind: "help",
    groupId: "progress-monitor",
    title: "Copy items/sec",
    content: (
      <p>
        A low items/sec rate is not necessarily a concern. Migrations that move
        large files often complete fewer items while still transferring a lot of
        data. Check Bytes/sec for transfer throughput.
      </p>
    ),
  },
  {
    tipId: "discovery-rate-explanation",
    category: "discovery-rate-source",
    kind: "help",
    groupId: "progress-monitor",
    title: "Source discovery rate",
    content: discoveryRateTip(),
  },
  {
    tipId: "discovery-rate-explanation-dst",
    category: "discovery-rate-destination",
    kind: "help",
    groupId: "progress-monitor",
    title: "Destination discovery rate",
    content: discoveryRateTip(),
  },
  {
    tipId: "discovery-batch-explanation",
    category: "discovery-batch",
    kind: "help",
    groupId: "progress-monitor",
    title: "Discovery batch",
    content: discoveryBatchTip(),
  },
  {
    tipId: "discovery-batch-explanation-dst",
    category: "discovery-batch",
    kind: "help",
    groupId: "progress-monitor",
    title: "Discovery batch (destination)",
    content: discoveryBatchTip(),
  },
  {
    tipId: "destination-total-discovered-explanation",
    category: "discovery-destination-total",
    kind: "help",
    groupId: "progress-monitor",
    title: "Destination total discovered",
    content: (
      <p>
        This is specifically only the overlapping items explored, not the total
        items inside of your destination root folder.
      </p>
    ),
  },

  // Migration setup
  {
    tipId: "migration-setup-persist-log-level",
    category: "migration-setup",
    kind: "help",
    groupId: "migration-setup",
    title: "Persist log level",
    content: (
      <p>
        Adjusts the threshold for which logs are saved to disk. Saving more
        detail keeps a fuller historical record, but can slow discovery and copy
        as more lines are written. The live log window still shows all emitted
        levels.
      </p>
    ),
  },
  {
    tipId: "migration-setup-overwrite-policy",
    category: "migration-setup",
    kind: "help",
    groupId: "migration-setup",
    title: "Overwrite policy",
    content: (
      <p>
        This only sets the default for name collisions during discovery. In copy
        review you can still change the decision for any individual file or
        folder, so this choice is not locked in.
      </p>
    ),
  },
  {
    tipId: "migration-setup-hash-verify",
    category: "migration-setup",
    kind: "help",
    groupId: "migration-setup",
    title: "Double-read content verification",
    content: (
      <>
        <p>
          Discovery already pairs files by name and modified time. Enabling this
          also reads each paired source and destination file and compares SHA-256
          hashes (bytes are discarded, not saved).
        </p>
        <p>
          That can surface same-name files whose contents differ even when size
          or timestamps look similar, before you reach copy review. It is also
          much slower than listing alone, because every paired file is opened on
          both sides. Prefer it for smaller trees, or when content accuracy
          matters more than discovery speed.
        </p>
      </>
    ),
  },
  {
    tipId: "migration-source-local-os",
    category: "migration-setup",
    kind: "help",
    groupId: "migration-setup",
    title: "Source OS",
    content: (
      <p>
        Label which OS this local path lives on. Destination name checks follow
        the destination OS. The source OS is only used to skip those checks when
        both sides match.
      </p>
    ),
  },
  {
    tipId: "migration-destination-local-os-on",
    category: "migration-setup",
    kind: "help",
    groupId: "migration-setup",
    title: "Destination OS (checks on)",
    content: (
      <>
        <p>
          During discovery, Sylos checks each file and folder name against this
          destination OS.
        </p>
        <p>
          Illegal characters, reserved names, length limits, and naming
          collisions are flagged on the review screen so you can rename them
          before copying starts.
        </p>
      </>
    ),
  },
  {
    tipId: "migration-destination-local-os-off",
    category: "migration-setup",
    kind: "help",
    groupId: "migration-setup",
    title: "Destination OS (checks skipped)",
    content: (
      <>
        <p>
          Source and destination use the same OS naming rules, so names that
          already work on the source should work on the destination.
        </p>
        <p>
          If the destination is actually a different OS (for example Linux files
          going onto a Windows volume), change the destination OS here to turn
          checks on.
        </p>
      </>
    ),
  },
  {
    tipId: "migration-summary-src-storage",
    category: "migration-setup-storage",
    kind: "help",
    groupId: "migration-setup",
    title: "Source storage",
    content: fsStorageTip(),
  },
  {
    tipId: "migration-summary-dst-storage",
    category: "migration-setup-storage",
    kind: "help",
    groupId: "migration-setup",
    title: "Destination storage",
    content: fsStorageTip(),
  },

  // Browse
  {
    tipId: "browse-folder-selection",
    category: "browse-folder-selection",
    kind: "help",
    groupId: "browse",
    title: "Browse selection",
    content: (
      <>
        <p>
          Click a folder to open it. Navigation does not change what will be
          migrated.
        </p>
        <p>
          Use Set as root when you are in the folder you want. Everything inside
          starts included; uncheck items to leave them out, then Done.
        </p>
        <p>
          Right-click to delete selected items, or the clicked item if none are
          selected. Hold Alt to select text in a row.
        </p>
      </>
    ),
  },

  // Path review
  {
    tipId: "path-review-selection",
    category: "path-review-selection",
    kind: "help",
    groupId: "path-review",
    title: "Selection",
    content: selectionHelpCore(),
  },
  {
    tipId: "path-review-side-column",
    category: "path-review-side-column",
    kind: "help",
    groupId: "path-review",
    title: "Side column",
    content: (
      <>
        <p>Marks whether an item exists on one side or both.</p>
        <p>
          <strong>{PATH_REVIEW_COPY.sideChipSrc}</strong>:{" "}
          {PATH_REVIEW_COPY.sideChipSrcTip.toLowerCase()}.
        </p>
        <p>
          <strong>{PATH_REVIEW_COPY.sideChipDst}</strong>:{" "}
          {PATH_REVIEW_COPY.sideChipDstTip.toLowerCase()}.
        </p>
        <p>No label: exists on both source and destination.</p>
      </>
    ),
  },
  {
    tipId: "path-review-dst-size-explanation",
    category: "path-review-dst-size",
    kind: "help",
    groupId: "path-review",
    title: "Size (Dst)",
    content: (
      <p>
        This is only the cumulative size of all the overlapping items between the
        source and the destination. Not the total potential size of everything
        inside of your destination root folder.
      </p>
    ),
  },
  {
    tipId: "path-review-free-dst-explanation",
    category: "path-review-free-dst",
    kind: "help",
    groupId: "path-review",
    title: "Free (Dst)",
    content: (
      <p>
        Best-effort free space on the destination. Shared folders and some cloud
        spaces do not expose their own quota, so this can show Unavailable even
        when your account has plenty of space. Local FUSE/network mounts may also
        be unable to report it.
      </p>
    ),
  },
  {
    tipId: "path-review-large-search",
    category: "path-review",
    kind: "help",
    groupId: "path-review",
    title: "Large migration search",
    content: (
      <p>
        This migration has a lot of items. Searching by name or path across
        everything can be slow or time out. Browse into a folder first and search
        from there, or filter by status.
      </p>
    ),
  },
  {
    tipId: "path-review-issues-failed",
    category: "path-review-issues-failed",
    kind: "help",
    groupId: "path-review",
    title: "Failed items",
    content: <p>{PATH_REVIEW_COPY.issuesHelpFailed}</p>,
  },
  {
    tipId: "path-review-issues-manual",
    category: "path-review-issues-manual",
    kind: "help",
    groupId: "path-review",
    title: "Manual rename",
    content: <p>{PATH_REVIEW_COPY.manualReviewTip}</p>,
  },
  {
    tipId: "path-review-issues-naming-warnings",
    category: "path-review-issues-naming-warnings",
    kind: "help",
    groupId: "path-review",
    title: "Naming warnings",
    content: <p>{PATH_REVIEW_COPY.issuesHelpReference}</p>,
  },
  {
    tipId: "path-review-issues-categories",
    category: "path-review-issues-categories",
    kind: "help",
    groupId: "path-review",
    title: "Naming issue categories",
    content: <p>{PATH_REVIEW_COPY.issuesHelpCategories}</p>,
  },
  {
    tipId: "path-review-status-exclude",
    category: "path-review-status-exclude",
    kind: "coach",
    groupId: "path-review",
    title: "Exclude from plan",
    content: (
      <p>
        Click this icon to leave the item out of the plan. You can click again
        later to put it back.
      </p>
    ),
  },
  {
    tipId: "path-review-status-include",
    category: "path-review-status-include",
    kind: "coach",
    groupId: "path-review",
    title: "Include in plan",
    content: (
      <p>This item is left out. Click the icon to put it back in the plan.</p>
    ),
  },
  {
    tipId: "path-review-status-mark-retry",
    category: "path-review-status-mark-retry",
    kind: "coach",
    groupId: "path-review",
    title: "Mark for retry",
    content: <p>Click this icon to mark the item for retry. Click again to undo.</p>,
  },
  {
    tipId: "path-review-status-undo-retry",
    category: "path-review-status-undo-retry",
    kind: "coach",
    groupId: "path-review",
    title: "Undo retry",
    content: <p>Marked for retry. Click to undo and leave it as it was.</p>,
  },
  {
    tipId: "list-density-control",
    category: "list-density-control",
    kind: "coach",
    groupId: "path-review",
    title: "Row size",
    content: (
      <p>Make list rows bigger or smaller. Your choice is saved for next time.</p>
    ),
  },

  // Autoscaler
  {
    tipId: "autoscaler-overview",
    category: "autoscaler-overview",
    kind: "help",
    groupId: "autoscaler",
    title: "Autoscaler overview",
    content: (
      <p>
        You do not need to change anything here for a normal migration. Sylos
        already tunes workers and related limits on its own. These controls are
        only for finer tuning when you know what you are adjusting.
      </p>
    ),
  },
  {
    tipId: "autoscaler-wait-budget",
    category: "autoscaler-wait-budget",
    kind: "help",
    groupId: "autoscaler",
    title: "Bottleneck wait",
    content: (
      <p>
        Totals are overlap wall-clock: time when at least one worker was busy in
        that category. Parallel waiters in the same second count once, so totals
        stay at or under elapsed run time. FS / provider is adapter calls. DB
        backpressure is hard-cap wait and/or forced flush (round seal). DB flush /
        pull is organic flush and/or frontier pulls. EMA is busy milliseconds per
        wall-clock second (about 0 to 1000).
      </p>
    ),
  },
  {
    tipId: "autoscaler-system-memory",
    category: "autoscaler-system-memory",
    kind: "help",
    groupId: "autoscaler",
    title: "System memory",
    content: (
      <p>
        Host RAM used percent from Sylos autoscaler samples (same tick cadence as
        throughput), not a live OS monitor. Desktop task managers often differ
        because of cache accounting and sample timing. Color bands follow the
        yellow and red thresholds shown on the chart (or when reclaimable RAM is
        critically low). Sylos process RSS and host used/total are shown beside
        the graph for context; process RSS does not drive the color alone.
      </p>
    ),
  },
  {
    tipId: "autoscaler-seal-buffer",
    category: "autoscaler-seal-buffer",
    kind: "help",
    groupId: "autoscaler",
    title: "Buffer fill",
    content: (
      <p>
        Rows waiting in the database memory buffer between flushes, sampled on
        each autoscaler tick (peak within the tick when available). Red stretches
        are at or above the soft buffer size that prefers a flush. When fill stays
        at max with free memory, Sylos may raise buffer size and keep it only if
        flush efficiency improves. Hard cap is shown on the live chart.
      </p>
    ),
  },
  {
    tipId: "autoscaler-workers",
    category: "autoscaler-workers",
    kind: "help",
    groupId: "autoscaler",
    title: "Workers",
    content: <p>{autoscalerWorkerContent("copy")}</p>,
  },
  {
    tipId: "autoscaler-queue-tasks",
    category: "autoscaler-queue-tasks",
    kind: "help",
    groupId: "autoscaler",
    title: "Queue tasks in memory",
    content: (
      <p>{autoscalerKnobContent("LeaseBatchSize", "copy")!.content}</p>
    ),
  },
  {
    tipId: "autoscaler-interop",
    category: "autoscaler-interop",
    kind: "help",
    groupId: "autoscaler",
    title: "Inter-op delay",
    content: <p>{autoscalerKnobContent("InterOpDelayMs", "copy")!.content}</p>,
  },
  {
    tipId: "autoscaler-db-buffer",
    category: "autoscaler-db-buffer",
    kind: "help",
    groupId: "autoscaler",
    title: "DB buffer size",
    content: (
      <p>{autoscalerKnobContent("SealRowThreshold", "copy")!.content}</p>
    ),
  },
  {
    tipId: "autoscaler-db-flush",
    category: "autoscaler-db-flush",
    kind: "help",
    groupId: "autoscaler",
    title: "DB flush interval",
    content: (
      <p>{autoscalerKnobContent("SealFlushIntervalMs", "copy")!.content}</p>
    ),
  },
  {
    tipId: "autoscaler-memory-bounce",
    category: "autoscaler-memory-bounce",
    kind: "help",
    groupId: "autoscaler",
    title: "Memory bounce cooldown",
    content: (
      <p>{autoscalerKnobContent("MemoryKnobCooldownMs", "copy")!.content}</p>
    ),
  },
  {
    tipId: "autoscaler-worker-bounce",
    category: "autoscaler-worker-bounce",
    kind: "help",
    groupId: "autoscaler",
    title: "Worker bounce cooldown",
    content: <p>{autoscalerKnobContent("ProbeCooldownMs", "copy")!.content}</p>,
  },

  // Spectra
  {
    tipId: "spectra-ephemeral-mode",
    category: "spectra-config",
    kind: "help",
    groupId: "spectra",
    title: "Ephemeral mode",
    content: (
      <>
        <p>
          When enabled, Spectra will run in ephemeral mode, skipping database
          operations in spectra&apos;s internals.
        </p>
        <p style={{ marginTop: "0.5rem" }}>
          This automatically disables caching and destination probability since
          ephemeral mode doesn&apos;t persist data between sessions.
        </p>
      </>
    ),
  },
  {
    tipId: "spectra-diverging-tree-mode",
    category: "spectra-config",
    kind: "help",
    groupId: "spectra",
    title: "Diverging tree mode",
    content: (
      <p>
        When enabled, and if ephermal mode is selected, the tree structure may
        diverge. Without ephemeral, trees diverge by default.
      </p>
    ),
  },
  {
    tipId: "spectra-item-name-style",
    category: "spectra-config",
    kind: "help",
    groupId: "spectra",
    title: "Item name style",
    content: (
      <>
        <p>
          Numbered names (folder_1, file_1.txt) are the default and fine for
          small or medium trees.
        </p>
        <p style={{ marginTop: "0.5rem" }}>
          Choose Unique ID names for larger datasets so each node uses its
          Spectra ID (files keep a .txt suffix). That avoids flooding review
          trigram indexes with shared numbered-name grams.
        </p>
      </>
    ),
  },
  {
    tipId: "spectra-destination-probability",
    category: "spectra-config",
    kind: "help",
    groupId: "spectra",
    title: "Destination probability",
    content: (
      <p>
        This is the chance each item has for existing on the destination once
        it&apos;s created in the source world.
      </p>
    ),
  },
  {
    tipId: "spectra-auth-ttl",
    category: "spectra-config",
    kind: "help",
    groupId: "spectra",
    title: "Access token TTL",
    content: (
      <p>
        Access token lifetime in seconds. Use -1 for tokens that never expire.
        Refresh tokens always last forever.
      </p>
    ),
  },
];

const byId = new Map<string, TipDef>(
  TIP_REGISTRY.map((tip) => [tip.tipId, tip])
);

export function getTip(tipId: string): TipDef | undefined {
  return byId.get(tipId);
}

/** Prefer registry content; optional override for live dynamic wording. */
export function resolveTipContent(
  tipId: string,
  contentOverride?: ReactNode
): ReactNode | undefined {
  if (contentOverride !== undefined && contentOverride !== null) {
    return contentOverride;
  }
  return getTip(tipId)?.content;
}

export function resolveTipCategory(
  tipId: string,
  categoryOverride?: string
): string {
  return getTip(tipId)?.category ?? categoryOverride ?? tipId;
}
