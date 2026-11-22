export type AutoscalerRateSample = {
  at: string;
  itemsPerSec: number;
  bytesPerSec: number;
};

export type AutoscalerKnobView = {
  queue: string;
  knob: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  readOnly?: boolean;
};

export type AutoscalerMemorySample = {
  at: string;
  usedPercent: number;
  level: string;
  procRssGiB?: number;
};

export type AutoscalerSystemMemory = {
  usedPercent: number;
  level: string;
  yellowPercent: number;
  redPercent: number;
  procRssGiB?: number;
  usedGiB?: number;
  totalGiB?: number;
  history?: AutoscalerMemorySample[];
};

export type AutoscalerSealSample = {
  at: string;
  rows: number;
  threshold: number;
  atMax: boolean;
};

export type AutoscalerSealBuffer = {
  rows: number;
  threshold: number;
  hardCap?: number;
  history?: AutoscalerSealSample[];
  timeAtMaxPercent?: number;
  flushCount?: number;
  lastFlushRows?: number;
  lastFlushDurationMs?: number;
  probePending?: boolean;
  lastProbeResult?: string;
};

export type AutoscalerScalingEvent = {
  queue: string;
  knob: string;
  oldValue: number;
  newValue: number;
  pressure: string;
  at: string;
};

export type AutoscalerWaitBudget = {
  fsTotalMs: number;
  fsEmaMsPerSec: number;
  /** Hard-cap wait + forced flush (round seal / StopPhase). Display only. */
  backpressureTotalMs: number;
  backpressureEmaMsPerSec: number;
  /** Organic flush + frontier pull + pull-gate. */
  dbWorkTotalMs: number;
  dbWorkEmaMsPerSec: number;
  /** backpressure + dbWork aggregate. */
  dbTotalMs: number;
  dbEmaMsPerSec: number;
  dbHardCapWaitMs?: number;
  dbForcedFlushMs?: number;
  dbOrganicFlushMs?: number;
  dbFlushMs?: number;
  dbPullMs?: number;
  dbPullGateWaitMs?: number;
};

export type AutoscalerLiveSnapshot = {
  pressure: string;
  cooldownUntil?: string;
  knobs: AutoscalerKnobView[];
  waitBudget?: AutoscalerWaitBudget;
  systemMemory?: AutoscalerSystemMemory;
  sealBuffer?: AutoscalerSealBuffer;
  events: AutoscalerScalingEvent[];
  rates: Record<string, AutoscalerRateSample[]>;
};

export type MigrationAutoscalerView = {
  migrationId: string;
  snapshot: AutoscalerLiveSnapshot;
  /** Present after Apply when a value was clamped (e.g. buffer size over absolute max). */
  warnings?: string[];
};

export type AutoscalerKnobOverride = {
  queue: string;
  knob: string;
  min?: number;
  max?: number;
  value?: number;
};

export type SetMigrationAutoscalerRequest = {
  knobs: AutoscalerKnobOverride[];
};
