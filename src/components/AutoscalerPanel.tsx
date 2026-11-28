import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Unlock } from "lucide-react";
import {
  getMigrationAutoscaler,
  putMigrationAutoscaler,
} from "../api/scaling";
import HelpTooltip from "./HelpTooltip";
import { autoscalerKnobContent } from "../tips";
import type {
  AutoscalerKnobOverride,
  AutoscalerKnobView,
  AutoscalerLiveSnapshot,
  AutoscalerMemorySample,
  AutoscalerRateSample,
  AutoscalerSealBuffer,
  AutoscalerSealSample,
  AutoscalerSystemMemory,
  AutoscalerWaitBudget,
} from "../types/autoscaler";
import { waitBudgetDominant } from "../utils/waitBudgetActivity";
import "./AutoscalerPanel.css";

const POLL_MS = 1000;
const AUTOSCALER_GUIDE_URL =
  "https://github.com/Project-Sylos/Sylos/wiki/Understanding-the-Sylos-autoscaler";

function lockStorageKey(migrationId: string): string {
  return `sylos.autoscaler.locked:${migrationId}`;
}

function readLocked(migrationId: string): boolean {
  if (!migrationId || typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(lockStorageKey(migrationId));
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    /* ignore quota / private mode */
  }
  return true;
}

function writeLocked(migrationId: string, locked: boolean): void {
  if (!migrationId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lockStorageKey(migrationId), locked ? "1" : "0");
  } catch {
    /* ignore */
  }
}

const QUEUE_ORDER = ["src", "dst", "copy", "delete", "seal", "autoscaler"];

/** Major operator knobs only (matches ME snapshot). */
const KNOB_ORDER: Record<string, string[]> = {
  src: ["WorkerCount", "LeaseBatchSize", "InterOpDelayMs"],
  dst: ["WorkerCount", "LeaseBatchSize", "InterOpDelayMs"],
  copy: ["WorkerCount", "LeaseBatchSize", "InterOpDelayMs"],
  delete: ["WorkerCount", "LeaseBatchSize", "InterOpDelayMs"],
  seal: ["SealRowThreshold", "SealFlushIntervalMs"],
  autoscaler: ["MemoryKnobCooldownMs", "ProbeCooldownMs"],
};

const KNOB_LABELS: Record<string, string> = {
  WorkerCount: "Workers",
  // Lease batch = max in-memory pending tasks; refill pull size is always 25% of this.
  LeaseBatchSize: "Queue tasks",
  InterOpDelayMs: "Inter-op delay",
  SealRowThreshold: "Buffer size",
  SealFlushIntervalMs: "Flush interval",
  MemoryKnobCooldownMs: "Memory bounce",
  ProbeCooldownMs: "Worker bounce",
};

const QUEUE_TITLES: Record<string, string> = {
  src: "src",
  dst: "dst",
  copy: "copy",
  delete: "delete",
  seal: "database memory buffer",
  autoscaler: "bounce timers",
};


/** Knobs stored as ms in the API; UI shows/edits decimal seconds. */
const MS_KNOBS = new Set([
  "InterOpDelayMs",
  "SealFlushIntervalMs",
  "MemoryKnobCooldownMs",
  "ProbeCooldownMs",
]);

type AutoscalerPanelProps = {
  migrationId: string;
  enabled: boolean;
};

type Draft = { min: string; max: string; period: string };

function knobKey(queue: string, knob: string) {
  return `${queue}/${knob}`;
}

function isBounceKnob(knob: string): boolean {
  return knob === "MemoryKnobCooldownMs" || knob === "ProbeCooldownMs";
}

function isMsKnob(knob: string): boolean {
  return MS_KNOBS.has(knob);
}

function msToSecStr(ms: number): string {
  if (!Number.isFinite(ms)) return "0";
  const sec = ms / 1000;
  if (Number.isInteger(sec)) return String(sec);
  // Trim trailing zeros without scientific notation for typical timer ranges.
  return String(Number(sec.toFixed(3)));
}

function secStrToMs(raw: string): number | null {
  const sec = Number.parseFloat(raw);
  if (!Number.isFinite(sec) || sec < 0) return null;
  return Math.round(sec * 1000);
}

function displayUnit(knob: string, unit?: string): string | undefined {
  if (isMsKnob(knob)) return "s";
  return unit || undefined;
}

function formatRate(n: number, bytes: boolean): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (!bytes) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    if (n >= 100) return n.toFixed(0);
    if (n >= 10) return n.toFixed(1);
    return n.toFixed(2);
  }
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB/s`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB/s`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB/s`;
  return `${n.toFixed(0)} B/s`;
}

function sortQueues(names: string[]): string[] {
  const rank = (q: string) => {
    const i = QUEUE_ORDER.indexOf(q);
    return i >= 0 ? i : QUEUE_ORDER.length;
  };
  return [...names].sort((a, b) => {
    const d = rank(a) - rank(b);
    return d !== 0 ? d : a.localeCompare(b);
  });
}

function sortKnobs(queue: string, knobs: AutoscalerKnobView[]): AutoscalerKnobView[] {
  const order = KNOB_ORDER[queue] || [];
  const allowed = new Set(order);
  return [...knobs]
    .filter((k) => allowed.has(k.knob))
    .sort((a, b) => order.indexOf(a.knob) - order.indexOf(b.knob));
}

function memLevelClass(level: string): string {
  if (level === "red") return "autoscaler-panel__mem--red";
  if (level === "yellow") return "autoscaler-panel__mem--yellow";
  return "autoscaler-panel__mem--green";
}

function memStroke(level: string): string {
  if (level === "red") return "var(--ui-status-danger, #c44)";
  if (level === "yellow") return "var(--ui-status-warning, #c8a028)";
  return "var(--ui-status-success, #3a9a5a)";
}

function memFill(level: string): string {
  if (level === "red") return "rgba(196, 68, 68, 0.28)";
  if (level === "yellow") return "rgba(200, 160, 40, 0.28)";
  return "rgba(58, 154, 90, 0.22)";
}

function formatMemPct(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(n >= 10 ? 0 : 1)}%`;
}

function formatGiB(n: number | undefined): string {
  if (!Number.isFinite(n) || n == null || n < 0) return "n/a";
  if (n < 0.1) return `${(n * 1024).toFixed(0)} MiB`;
  if (n < 10) return `${n.toFixed(2)} GiB`;
  return `${n.toFixed(1)} GiB`;
}

function formatRows(n: number | undefined): string {
  if (!Number.isFinite(n) || n == null || n < 0) return "n/a";
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function formatDurationMs(ms: number | undefined): string {
  if (!Number.isFinite(ms) || ms == null || ms < 0) return "n/a";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(sec >= 10 ? 0 : 1)} s`;
  const min = sec / 60;
  if (min < 60) return `${min.toFixed(min >= 10 ? 0 : 1)} min`;
  return `${(min / 60).toFixed(1)} h`;
}

function formatWaitRate(msPerSec: number | undefined): string {
  if (!Number.isFinite(msPerSec) || msPerSec == null || msPerSec < 0) {
    return "0 ms/s";
  }
  if (msPerSec < 1000) return `${msPerSec.toFixed(msPerSec >= 100 ? 0 : 1)} ms/s`;
  const secPerSec = msPerSec / 1000;
  return `${secPerSec.toFixed(secPerSec >= 10 ? 0 : 1)} s/s`;
}

function WaitBudgetCard({ budget }: { budget: AutoscalerWaitBudget }) {
  const dominant = waitBudgetDominant(budget);
  const badgeClass =
    dominant === "fs"
      ? "autoscaler-panel__wait-badge autoscaler-panel__wait-badge--fs"
      : dominant === "backpressure"
        ? "autoscaler-panel__wait-badge autoscaler-panel__wait-badge--bp"
        : "autoscaler-panel__wait-badge autoscaler-panel__wait-badge--db";
  const badgeLabel =
    dominant === "fs"
      ? "FS heavier now"
      : dominant === "backpressure"
        ? "DB backpressure heavier"
        : "DB flush/pull heavier";
  return (
    <div className="autoscaler-panel__wait">
      <div className="autoscaler-panel__wait-head">
        <h4 className="autoscaler-panel__wait-title">
          Bottleneck wait
          <HelpTooltip tipId="autoscaler-wait-budget" position="above" />
        </h4>
        <span className={badgeClass}>{badgeLabel}</span>
      </div>
      <div className="autoscaler-panel__wait-rows">
        <div className="autoscaler-panel__wait-row">
          <span className="autoscaler-panel__wait-label">FS / provider</span>
          <span className="autoscaler-panel__wait-total">
            wall {formatDurationMs(budget.fsTotalMs)}
          </span>
          <span className="autoscaler-panel__wait-ema">
            EMA {formatWaitRate(budget.fsEmaMsPerSec)}
          </span>
        </div>
        <div className="autoscaler-panel__wait-row">
          <span className="autoscaler-panel__wait-label">
            DB backpressure
          </span>
          <span className="autoscaler-panel__wait-total">
            wall {formatDurationMs(budget.backpressureTotalMs)}
          </span>
          <span className="autoscaler-panel__wait-ema">
            EMA {formatWaitRate(budget.backpressureEmaMsPerSec)}
          </span>
        </div>
        <div className="autoscaler-panel__wait-row">
          <span className="autoscaler-panel__wait-label">DB flush / pull</span>
          <span className="autoscaler-panel__wait-total">
            wall {formatDurationMs(budget.dbWorkTotalMs)}
          </span>
          <span className="autoscaler-panel__wait-ema">
            EMA {formatWaitRate(budget.dbWorkEmaMsPerSec)}
          </span>
        </div>
      </div>
      {(budget.dbHardCapWaitMs ||
        budget.dbForcedFlushMs ||
        budget.dbOrganicFlushMs ||
        budget.dbPullMs ||
        budget.dbPullGateWaitMs) ? (
        <div className="autoscaler-panel__wait-break">
          hard-cap {formatDurationMs(budget.dbHardCapWaitMs)} · round seal{" "}
          {formatDurationMs(budget.dbForcedFlushMs)} · organic flush{" "}
          {formatDurationMs(budget.dbOrganicFlushMs)} · pull{" "}
          {formatDurationMs(budget.dbPullMs)} · gate{" "}
          {formatDurationMs(budget.dbPullGateWaitMs)}
        </div>
      ) : null}
    </div>
  );
}

function sealLevelRuns(
  samples: AutoscalerSealSample[]
): { level: string; start: number; end: number }[] {
  if (!samples.length) return [];
  const runs: { level: string; start: number; end: number }[] = [];
  let start = 0;
  let level = samples[0].atMax ? "red" : "green";
  for (let i = 1; i < samples.length; i++) {
    const next = samples[i].atMax ? "red" : "green";
    if (next !== level) {
      runs.push({ level, start, end: i - 1 });
      start = i;
      level = next;
    }
  }
  runs.push({ level, start, end: samples.length - 1 });
  return runs;
}

/** Contiguous history runs sharing the same pressure level (for multi-color fill). */
function memoryLevelRuns(
  samples: AutoscalerMemorySample[]
): { level: string; start: number; end: number }[] {
  if (!samples.length) return [];
  const runs: { level: string; start: number; end: number }[] = [];
  let start = 0;
  let level = samples[0].level || "green";
  for (let i = 1; i < samples.length; i++) {
    const next = samples[i].level || "green";
    if (next !== level) {
      runs.push({ level, start, end: i - 1 });
      start = i;
      level = next;
    }
  }
  runs.push({ level, start, end: samples.length - 1 });
  return runs;
}

function SystemMemoryChart({ mem }: { mem: AutoscalerSystemMemory }) {
  const history = mem.history || [];
  const yellow = Number.isFinite(mem.yellowPercent) ? mem.yellowPercent : 80;
  const red = Number.isFinite(mem.redPercent) ? mem.redPercent : 90;
  const vals = useMemo(
    () => history.map((s) => Math.max(0, Math.min(100, s.usedPercent || 0))),
    [history]
  );
  const latest = Number.isFinite(mem.usedPercent) ? mem.usedPercent : 0;
  const peak = vals.length ? Math.max(...vals) : latest;
  const w = 320;
  const h = 88;
  const padL = 44;
  const padR = 8;
  const padT = 8;
  const padB = 16;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const yAt = (pct: number) => padT + plotH - (pct / 100) * plotH;
  const xAt = (i: number, n: number) =>
    padL + (n <= 1 ? plotW : (i / (n - 1)) * plotW);

  const runs = useMemo(() => memoryLevelRuns(history), [history]);

  const areaPaths = useMemo(() => {
    if (!vals.length) return [];
    const n = vals.length;
    return runs.map((run) => {
      // Overlap one sample with the next run so the fill meets without a gap.
      const lo = run.start;
      const hi = Math.min(n - 1, run.end + (run.end < n - 1 ? 1 : 0));
      const top: string[] = [];
      for (let i = lo; i <= hi; i++) {
        top.push(`${xAt(i, n).toFixed(1)},${yAt(vals[i]).toFixed(1)}`);
      }
      const baseR = `${xAt(hi, n).toFixed(1)},${(padT + plotH).toFixed(1)}`;
      const baseL = `${xAt(lo, n).toFixed(1)},${(padT + plotH).toFixed(1)}`;
      return {
        level: run.level,
        d: `M ${top.join(" L ")} L ${baseR} L ${baseL} Z`,
        line: top.join(" "),
      };
    });
  }, [vals, runs, plotH, plotW, padL, padT]);

  return (
    <div className="autoscaler-panel__chart autoscaler-panel__mem-chart">
      <div className="autoscaler-panel__chart-head">
        <span className="autoscaler-panel__chart-label">
          system memory
          <HelpTooltip
            tipId="autoscaler-system-memory"
            position="above"
            content={
              <p>
                Host RAM used percent from Sylos autoscaler samples (same tick
                cadence as throughput), not a live OS monitor. Desktop task
                managers often differ because of cache accounting and sample
                timing. Green under {formatMemPct(yellow)}, yellow from there
                to {formatMemPct(red)}, red at or above {formatMemPct(red)}{" "}
                (or when reclaimable RAM is critically low). Sylos process RSS
                and host used/total are shown beside the graph for context;
                process RSS does not drive the color alone.
              </p>
            }
          />
        </span>
        <span className="autoscaler-panel__chart-stats">
          <span
            className={memLevelClass(mem.level || "green")}
            title="Latest sample"
          >
            now {formatMemPct(latest)}
          </span>
          <span title="Peak in window">peak {formatMemPct(peak)}</span>
        </span>
      </div>
      <div className="autoscaler-panel__mem-body">
      {!vals.length ? (
        <div className="autoscaler-panel__chart-empty">no samples yet</div>
      ) : (
        <svg
          className="autoscaler-panel__chart-svg"
          viewBox={`0 0 ${w} ${h}`}
          width="100%"
          height={h}
          role="img"
          aria-label={`system memory: now ${formatMemPct(latest)}, peak ${formatMemPct(peak)}, ${mem.level}`}
        >
          <line
            x1={padL}
            y1={padT}
            x2={padL}
            y2={padT + plotH}
            className="autoscaler-panel__chart-axis"
          />
          <line
            x1={padL}
            y1={padT + plotH}
            x2={padL + plotW}
            y2={padT + plotH}
            className="autoscaler-panel__chart-axis"
          />
          <line
            x1={padL}
            y1={yAt(yellow)}
            x2={padL + plotW}
            y2={yAt(yellow)}
            className="autoscaler-panel__mem-threshold autoscaler-panel__mem-threshold--yellow"
          />
          <line
            x1={padL}
            y1={yAt(red)}
            x2={padL + plotW}
            y2={yAt(red)}
            className="autoscaler-panel__mem-threshold autoscaler-panel__mem-threshold--red"
          />
          <text
            x={padL - 4}
            y={padT + 4}
            textAnchor="end"
            className="autoscaler-panel__chart-tick"
          >
            100%
          </text>
          <text
            x={padL - 4}
            y={padT + plotH}
            textAnchor="end"
            className="autoscaler-panel__chart-tick"
          >
            0%
          </text>
          {areaPaths.map((p, i) => (
            <g key={`${p.level}-${i}`}>
              <path d={p.d} fill={memFill(p.level)} stroke="none" />
              <polyline
                fill="none"
                points={p.line}
                stroke={memStroke(p.level)}
                strokeWidth="2"
              />
            </g>
          ))}
        </svg>
      )}
        <div className="autoscaler-panel__mem-nums">
          <div className="autoscaler-panel__mem-num">
            <span className="autoscaler-panel__mem-num-label">sylos</span>
            <span className="autoscaler-panel__mem-num-value">
              {formatGiB(mem.procRssGiB)}
            </span>
          </div>
          <div className="autoscaler-panel__mem-num">
            <span className="autoscaler-panel__mem-num-label">host</span>
            <span className="autoscaler-panel__mem-num-value">
              {formatGiB(mem.usedGiB)} / {formatGiB(mem.totalGiB)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SealBufferChart({ seal }: { seal: AutoscalerSealBuffer }) {
  const history = seal.history || [];
  const threshold =
    Number.isFinite(seal.threshold) && seal.threshold > 0
      ? seal.threshold
      : 50_000;
  const vals = useMemo(
    () => history.map((s) => Math.max(0, s.rows || 0)),
    [history]
  );
  const latest = Number.isFinite(seal.rows) ? seal.rows : 0;
  const peak = vals.length ? Math.max(...vals, threshold) : threshold;
  const yMax = Math.max(peak, threshold, 1);
  const atMaxNow = latest >= threshold;
  const w = 320;
  const h = 88;
  const padL = 44;
  const padR = 8;
  const padT = 8;
  const padB = 16;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const yAt = (rows: number) => padT + plotH - (rows / yMax) * plotH;
  const xAt = (i: number, n: number) =>
    padL + (n <= 1 ? plotW : (i / (n - 1)) * plotW);
  const runs = useMemo(() => sealLevelRuns(history), [history]);

  const areaPaths = useMemo(() => {
    if (!vals.length) return [];
    const n = vals.length;
    return runs.map((run) => {
      const lo = run.start;
      const hi = Math.min(n - 1, run.end + (run.end < n - 1 ? 1 : 0));
      const top: string[] = [];
      for (let i = lo; i <= hi; i++) {
        top.push(`${xAt(i, n).toFixed(1)},${yAt(vals[i]).toFixed(1)}`);
      }
      const baseR = `${xAt(hi, n).toFixed(1)},${(padT + plotH).toFixed(1)}`;
      const baseL = `${xAt(lo, n).toFixed(1)},${(padT + plotH).toFixed(1)}`;
      return {
        level: run.level,
        d: `M ${top.join(" L ")} L ${baseR} L ${baseL} Z`,
        line: top.join(" "),
      };
    });
  }, [vals, runs, plotH, plotW, padL, padT, yMax]);

  return (
    <div className="autoscaler-panel__chart autoscaler-panel__mem-chart">
      <div className="autoscaler-panel__chart-head">
        <span className="autoscaler-panel__chart-label">
          buffer fill
          <HelpTooltip
            tipId="autoscaler-seal-buffer"
            position="above"
            content={
              <p>
                Rows waiting in the database memory buffer between flushes,
                sampled on each autoscaler tick (peak within the tick when
                available). Red stretches are at or above the soft buffer size
                that prefers a flush. When fill stays at max with free memory,
                Sylos may raise buffer size and keep it only if flush efficiency
                improves. Hard cap is {formatRows(seal.hardCap)} rows.
                {seal.probePending
                  ? " A buffer-size probe is in progress."
                  : seal.lastProbeResult
                    ? ` Last probe: ${seal.lastProbeResult}.`
                    : ""}
              </p>
            }
          />
        </span>
        <span className="autoscaler-panel__chart-stats">
          <span
            className={atMaxNow ? "autoscaler-panel__mem--red" : "autoscaler-panel__mem--green"}
            title="Latest sample"
          >
            now {formatRows(latest)}
          </span>
          <span title="Peak in window">peak {formatRows(peak)}</span>
        </span>
      </div>
      <div className="autoscaler-panel__mem-body">
        {!vals.length ? (
          <div className="autoscaler-panel__chart-empty">no samples yet</div>
        ) : (
          <svg
            className="autoscaler-panel__chart-svg"
            viewBox={`0 0 ${w} ${h}`}
            width="100%"
            height={h}
            role="img"
            aria-label={`seal buffer: now ${formatRows(latest)}, peak ${formatRows(peak)}`}
          >
            <line
              x1={padL}
              y1={padT}
              x2={padL}
              y2={padT + plotH}
              className="autoscaler-panel__chart-axis"
            />
            <line
              x1={padL}
              y1={padT + plotH}
              x2={padL + plotW}
              y2={padT + plotH}
              className="autoscaler-panel__chart-axis"
            />
            <line
              x1={padL}
              y1={yAt(threshold)}
              x2={padL + plotW}
              y2={yAt(threshold)}
              className="autoscaler-panel__mem-threshold autoscaler-panel__mem-threshold--red"
            />
            <text
              x={padL - 4}
              y={padT + 4}
              textAnchor="end"
              className="autoscaler-panel__chart-tick"
            >
              {formatRows(yMax)}
            </text>
            <text
              x={padL - 4}
              y={padT + plotH}
              textAnchor="end"
              className="autoscaler-panel__chart-tick"
            >
              0
            </text>
            {areaPaths.map((p, i) => (
              <g key={`${p.level}-${i}`}>
                <path d={p.d} fill={memFill(p.level)} stroke="none" />
                <polyline
                  fill="none"
                  points={p.line}
                  stroke={memStroke(p.level)}
                  strokeWidth="2"
                />
              </g>
            ))}
          </svg>
        )}
        <div className="autoscaler-panel__mem-nums">
          <div className="autoscaler-panel__mem-num">
            <span className="autoscaler-panel__mem-num-label">fill</span>
            <span className="autoscaler-panel__mem-num-value">
              {formatRows(latest)} / {formatRows(threshold)}
            </span>
          </div>
          <div className="autoscaler-panel__mem-num">
            <span className="autoscaler-panel__mem-num-label">at max</span>
            <span className="autoscaler-panel__mem-num-value">
              {Number.isFinite(seal.timeAtMaxPercent)
                ? `${(seal.timeAtMaxPercent || 0).toFixed(0)}%`
                : "n/a"}
            </span>
          </div>
          {Number.isFinite(seal.lastFlushRows) && (seal.lastFlushRows || 0) > 0 ? (
            <div className="autoscaler-panel__mem-num">
              <span className="autoscaler-panel__mem-num-label">last flush</span>
              <span className="autoscaler-panel__mem-num-value">
                {formatRows(seal.lastFlushRows)}
                {seal.lastFlushDurationMs
                  ? ` · ${formatDurationMs(seal.lastFlushDurationMs)}`
                  : ""}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RateChart({
  samples,
  field,
  label,
}: {
  samples: AutoscalerRateSample[];
  field: "itemsPerSec" | "bytesPerSec";
  label: string;
}) {
  const bytes = field === "bytesPerSec";
  const vals = useMemo(
    () => samples.map((s) => Math.max(0, s[field] || 0)),
    [samples, field]
  );
  const latest = vals.length ? vals[vals.length - 1] : 0;
  const peak = vals.length ? Math.max(...vals) : 0;
  const max = Math.max(peak, 1e-9);
  const w = 320;
  const h = 88;
  const padL = 44;
  const padR = 8;
  const padT = 8;
  const padB = 16;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const points = useMemo(() => {
    if (!vals.length) return "";
    return vals
      .map((v, i) => {
        const x =
          padL + (vals.length === 1 ? plotW : (i / (vals.length - 1)) * plotW);
        const y = padT + plotH - (v / max) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [vals, max, padL, padT, plotW, plotH]);

  return (
    <div className="autoscaler-panel__chart">
      <div className="autoscaler-panel__chart-head">
        <span className="autoscaler-panel__chart-label">{label}</span>
        <span className="autoscaler-panel__chart-stats">
          <span title="Latest">now {formatRate(latest, bytes)}</span>
          <span title="Peak in window">peak {formatRate(peak, bytes)}</span>
        </span>
      </div>
      {!vals.length ? (
        <div className="autoscaler-panel__chart-empty">no samples yet</div>
      ) : (
        <svg
          className="autoscaler-panel__chart-svg"
          viewBox={`0 0 ${w} ${h}`}
          width="100%"
          height={h}
          role="img"
          aria-label={`${label}: now ${formatRate(latest, bytes)}, peak ${formatRate(peak, bytes)}`}
        >
          <line
            x1={padL}
            y1={padT}
            x2={padL}
            y2={padT + plotH}
            className="autoscaler-panel__chart-axis"
          />
          <line
            x1={padL}
            y1={padT + plotH}
            x2={padL + plotW}
            y2={padT + plotH}
            className="autoscaler-panel__chart-axis"
          />
          <text
            x={padL - 4}
            y={padT + 4}
            textAnchor="end"
            className="autoscaler-panel__chart-tick"
          >
            {formatRate(peak, bytes)}
          </text>
          <text
            x={padL - 4}
            y={padT + plotH}
            textAnchor="end"
            className="autoscaler-panel__chart-tick"
          >
            0
          </text>
          <polyline
            fill="none"
            className="autoscaler-panel__chart-line"
            strokeWidth="2"
            points={points}
          />
        </svg>
      )}
    </div>
  );
}

function formatEventTime(at: string): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleTimeString();
}

function floorMin(knob: string, min: number): number {
  if (!Number.isFinite(min) || min < 0) return 0;
  if (knob === "WorkerCount" && min < 1) return 1;
  return min;
}

export default function AutoscalerPanel({
  migrationId,
  enabled,
}: AutoscalerPanelProps) {
  const [snapshot, setSnapshot] = useState<AutoscalerLiveSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [locked, setLocked] = useState(() => readLocked(migrationId));
  const [unlockOpen, setUnlockOpen] = useState(false);
  const dirtyRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    setLocked(readLocked(migrationId));
  }, [migrationId]);

  const setLockedPersist = (next: boolean) => {
    setLocked(next);
    writeLocked(migrationId, next);
  };

  const syncDrafts = useCallback((knobs: AutoscalerKnobView[]) => {
    const dirtyMap = dirtyRef.current;
    setDrafts((prev) => {
      const next: Record<string, Draft> = {};
      for (const k of knobs) {
        const key = knobKey(k.queue, k.knob);
        const asSec = isMsKnob(k.knob);
        const live = {
          min: asSec ? msToSecStr(k.min) : String(k.min),
          max: asSec ? msToSecStr(k.max) : String(k.max),
          period: asSec ? msToSecStr(k.value) : String(k.value),
        };
        next[key] = dirtyMap[key] && prev[key] ? prev[key] : live;
      }
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!migrationId) return;
    try {
      const view = await getMigrationAutoscaler(migrationId);
      setSnapshot(view.snapshot);
      setError(null);
      syncDrafts(view.snapshot.knobs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load autoscaler");
    }
  }, [migrationId, syncDrafts]);

  useEffect(() => {
    if (!enabled || !migrationId) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, migrationId, refresh]);

  const grouped = useMemo(() => {
    const map = new Map<string, AutoscalerKnobView[]>();
    for (const k of snapshot?.knobs || []) {
      const list = map.get(k.queue) || [];
      list.push(k);
      map.set(k.queue, list);
    }
    return sortQueues([...map.keys()])
      .map((queue) => [queue, sortKnobs(queue, map.get(queue) || [])] as const)
      .filter(([, knobs]) => knobs.length > 0);
  }, [snapshot]);

  const rateQueues = useMemo(() => {
    const rates = snapshot?.rates || {};
    const present = Object.keys(rates).filter(
      (q) => q !== "seal" && q !== "autoscaler" && (rates[q] || []).length > 0
    );
    return sortQueues(present);
  }, [snapshot]);

  const recentEvents = useMemo(() => {
    const events = snapshot?.events || [];
    return events.slice(-12).reverse();
  }, [snapshot]);

  const setDraftField = (key: string, field: keyof Draft, raw: string) => {
    dirtyRef.current = { ...dirtyRef.current, [key]: true };
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { min: "", max: "", period: "" }),
        [field]: raw,
      },
    }));
  };

  const applyKnob = async (k: AutoscalerKnobView) => {
    const key = knobKey(k.queue, k.knob);
    const draft = drafts[key];
    if (!draft || k.readOnly || locked) return;
    const ov: AutoscalerKnobOverride = { queue: k.queue, knob: k.knob };

    if (isBounceKnob(k.knob)) {
      const periodMs = secStrToMs(draft.period);
      if (periodMs == null || periodMs === k.value) return;
      ov.value = periodMs;
    } else if (isMsKnob(k.knob)) {
      const minMs = secStrToMs(draft.min);
      const maxMs = secStrToMs(draft.max);
      if (minMs != null) {
        const min = floorMin(k.knob, minMs);
        if (min !== k.min) ov.min = min;
      }
      if (maxMs != null && maxMs !== k.max) {
        ov.max = maxMs;
      }
      if (ov.max != null && k.value > ov.max) {
        ov.value = ov.max;
      } else if (ov.min != null && k.value < ov.min) {
        ov.value = ov.min;
      }
    } else {
      let min = Number.parseInt(draft.min, 10);
      let max = Number.parseInt(draft.max, 10);
      if (Number.isFinite(min)) {
        min = floorMin(k.knob, min);
        if (min !== k.min) ov.min = min;
      }
      if (Number.isFinite(max) && max !== k.max) {
        ov.max = Math.max(0, max);
      }
      // Seal "Buffer size" max is the soft threshold itself: Apply sets current
      // to that max so the graph moves immediately. Other knobs only clamp
      // current down when max is lowered below live value.
      if (k.queue === "seal" && ov.max != null) {
        ov.value = ov.max;
      } else if (ov.max != null && k.value > ov.max) {
        ov.value = ov.max;
      } else if (ov.min != null && k.value < ov.min) {
        ov.value = ov.min;
      }
    }
    if (ov.min == null && ov.max == null && ov.value == null) return;
    try {
      setBusyKey(key);
      setError(null);
      const view = await putMigrationAutoscaler(migrationId, { knobs: [ov] });
      setSnapshot(view.snapshot);
      const nextDirty = { ...dirtyRef.current };
      delete nextDirty[key];
      dirtyRef.current = nextDirty;
      syncDrafts(view.snapshot.knobs || []);
      if (view.warnings && view.warnings.length > 0) {
        setError(view.warnings.join(" · "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setBusyKey(null);
    }
  };

  if (!enabled) return null;

  const renderKnobRows = (queue: string, knobs: AutoscalerKnobView[]) => (
    <div className="autoscaler-panel__knobs">
      <div
        className="autoscaler-panel__knob autoscaler-panel__knob--head"
        aria-hidden
      >
        <div className="autoscaler-panel__knob-name">knob</div>
        <div className="autoscaler-panel__field">current</div>
        {queue === "autoscaler" ? (
          <div className="autoscaler-panel__field">period</div>
        ) : (
          <>
            <div className="autoscaler-panel__field">min</div>
            <div className="autoscaler-panel__field">max</div>
          </>
        )}
        <div className="autoscaler-panel__apply-spacer" />
      </div>
      {knobs.map((k) => {
        const key = knobKey(k.queue, k.knob);
        const asSec = isMsKnob(k.knob);
        const draft = drafts[key] || {
          min: asSec ? msToSecStr(k.min) : String(k.min),
          max: asSec ? msToSecStr(k.max) : String(k.max),
          period: asSec ? msToSecStr(k.value) : String(k.value),
        };
        const bounce = isBounceKnob(k.knob);
        const fieldLocked =
          locked || !!k.readOnly || busyKey === key;
        const label = KNOB_LABELS[k.knob] || k.knob;
        const unit = displayUnit(k.knob, k.unit);
        const step = asSec ? "0.001" : "1";
        const tip = autoscalerKnobContent(k.knob, k.queue);
        return (
          <div
            key={key}
            className={`autoscaler-panel__knob${
              bounce ? " autoscaler-panel__knob--bounce" : ""
            }`}
          >
            <div className="autoscaler-panel__knob-name" title={k.knob}>
              <span className="autoscaler-panel__knob-name-text">{label}</span>
              {unit ? (
                <span className="autoscaler-panel__knob-unit">{unit}</span>
              ) : null}
              {tip ? (
                <HelpTooltip
                  tipId={tip.category}
                  position="above"
                  content={<p>{tip.content}</p>}
                />
              ) : null}
              {k.readOnly && k.knob === "InterOpDelayMs" ? (
                <span
                  className="autoscaler-panel__knob-hint"
                  title="Editable only when workers = 1"
                >
                  workers&gt;1
                </span>
              ) : null}
            </div>
            <div className="autoscaler-panel__current" title="Current">
              {asSec ? msToSecStr(k.value) : k.value.toLocaleString()}
            </div>
            {bounce ? (
              <label className="autoscaler-panel__field">
                <span className="autoscaler-panel__field-label">period</span>
                <input
                  type="number"
                  min={0}
                  step={step}
                  disabled={fieldLocked}
                  value={draft.period}
                  onChange={(e) => setDraftField(key, "period", e.target.value)}
                />
              </label>
            ) : (
              <>
                <label className="autoscaler-panel__field">
                  <span className="autoscaler-panel__field-label">min</span>
                  <input
                    type="number"
                    min={0}
                    step={step}
                    disabled={fieldLocked}
                    value={draft.min}
                    onChange={(e) => setDraftField(key, "min", e.target.value)}
                  />
                </label>
                <label className="autoscaler-panel__field">
                  <span className="autoscaler-panel__field-label">max</span>
                  <input
                    type="number"
                    min={0}
                    step={step}
                    disabled={fieldLocked}
                    value={draft.max}
                    onChange={(e) => setDraftField(key, "max", e.target.value)}
                  />
                </label>
              </>
            )}
            <button
              type="button"
              className="autoscaler-panel__apply"
              disabled={fieldLocked}
              onClick={() => void applyKnob(k)}
            >
              Apply
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={`autoscaler-panel${locked ? " autoscaler-panel--locked" : ""}`}>
      <div className="autoscaler-panel__header">
        <button
          type="button"
          className="autoscaler-panel__lock"
          onClick={() => {
            if (locked) {
              setUnlockOpen(true);
              return;
            }
            setLockedPersist(true);
          }}
          title={locked ? "Unlock autoscaler controls" : "Lock autoscaler controls"}
          aria-label={locked ? "Unlock autoscaler controls" : "Lock autoscaler controls"}
        >
          {locked ? <Lock size={14} /> : <Unlock size={14} />}
          <span>{locked ? "Locked" : "Unlocked"}</span>
        </button>
        <a
          className="autoscaler-panel__guide-link"
          href={AUTOSCALER_GUIDE_URL}
          target="_blank"
          rel="noreferrer"
        >
          Guide
        </a>
      </div>

      {error ? <p className="autoscaler-panel__error">{error}</p> : null}

      {unlockOpen ? (
        <div
          className="autoscaler-panel__modal-overlay"
          onClick={() => setUnlockOpen(false)}
        >
          <div
            className="autoscaler-panel__modal"
            role="dialog"
            aria-labelledby="autoscaler-unlock-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="autoscaler-unlock-title" className="autoscaler-panel__modal-title">
              Unlock autoscaler controls?
            </h2>
            <div className="autoscaler-panel__modal-warning" role="alert">
              <strong>NOT RECOMMENDED.</strong> Raising min/max can trigger
              provider rate limits, memory pressure, stalls, or account
              restrictions. Only change this if you know what you are doing.
            </div>
            <p className="autoscaler-panel__modal-body">
              If you need help understanding these fields, read the{" "}
              <a
                href={AUTOSCALER_GUIDE_URL}
                target="_blank"
                rel="noreferrer"
              >
                autoscaler guide
              </a>{" "}
              before changing anything.
            </p>
            <div className="autoscaler-panel__modal-actions">
              <button
                type="button"
                className="autoscaler-panel__modal-cancel"
                onClick={() => setUnlockOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="autoscaler-panel__modal-confirm"
                onClick={() => {
                  setLockedPersist(false);
                  setUnlockOpen(false);
                }}
              >
                Confirm unlock
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!snapshot || !(snapshot.knobs || []).length ? (
        <p className="autoscaler-panel__empty">
          Loading autoscaler settings…
        </p>
      ) : (
        <>
          {snapshot.waitBudget ? (
            <WaitBudgetCard budget={snapshot.waitBudget} />
          ) : null}

          {rateQueues.length > 0 ? (
          <div className="autoscaler-panel__throughput">
            <div className="autoscaler-panel__throughput-head">
              <h4 className="autoscaler-panel__throughput-title">Throughput</h4>
              <span className="autoscaler-panel__throughput-badge">
                {rateQueues.length} queues
              </span>
            </div>
            <div className="autoscaler-panel__rates">
              {rateQueues.map((queue) => {
                const samples = snapshot.rates?.[queue] || [];
                const showBytes = queue === "copy" || queue === "delete";
                return (
                  <div key={queue} className="autoscaler-panel__rate-card">
                    <div className="autoscaler-panel__rate-label">{queue}</div>
                    <RateChart
                      samples={samples}
                      field="itemsPerSec"
                      label="items/s"
                    />
                    {showBytes ? (
                      <RateChart
                        samples={samples}
                        field="bytesPerSec"
                        label="bytes/s"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          ) : (
            <p className="autoscaler-panel__empty">
              Paused or idle. Edits are saved and applied when the next phase
              starts.
            </p>
          )}

          {snapshot.systemMemory ? (
            <div className="autoscaler-panel__block">
              <h4 className="autoscaler-panel__block-title">System memory</h4>
              <SystemMemoryChart mem={snapshot.systemMemory} />
            </div>
          ) : null}

          {grouped.map(([queue, knobs]) => (
            <div key={queue} className="autoscaler-panel__block">
              <h4 className="autoscaler-panel__block-title">
                {QUEUE_TITLES[queue] || queue}
              </h4>
              {queue === "seal" && snapshot.sealBuffer ? (
                <SealBufferChart seal={snapshot.sealBuffer} />
              ) : null}
              {renderKnobRows(queue, knobs)}
            </div>
          ))}

          <div className="autoscaler-panel__block">
            <h4 className="autoscaler-panel__block-title">Recent events</h4>
            {recentEvents.length === 0 ? (
              <p className="autoscaler-panel__empty">No scaling events yet.</p>
            ) : (
              <ul className="autoscaler-panel__event-list">
                {recentEvents.map((ev, i) => (
                  <li key={`${ev.at}-${ev.queue}-${ev.knob}-${i}`}>
                    <span className="autoscaler-panel__event-time">
                      {formatEventTime(ev.at)}
                    </span>{" "}
                    <span className="autoscaler-panel__event-body">
                      {ev.queue}/{ev.knob}: {ev.oldValue}→{ev.newValue} (
                      {ev.pressure})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
