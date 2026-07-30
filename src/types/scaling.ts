export const WORKER_CAP_MODES = [
  "traversal",
  "copy_folders",
  "copy_files",
  "delete",
] as const;

export type WorkerCapMode = (typeof WORKER_CAP_MODES)[number];

export const WORKER_CAP_MODE_LABELS: Record<WorkerCapMode, string> = {
  traversal: "Traversal (list)",
  copy_folders: "Copy folders",
  copy_files: "Copy files",
  delete: "Delete",
};

export const ABSOLUTE_MAX_WORKERS = 256;

export type ModeWorkerCaps = {
  min_workers: number;
  max_workers: number;
  default_workers: number;
};

export type ProviderWorkerCaps = {
  provider_id: string;
  modes: Partial<Record<WorkerCapMode, ModeWorkerCaps>>;
};

export type ScalingOverrideEntry = {
  scope: "provider" | "sftp_host";
  scopeKey: string;
  modes: Partial<Record<WorkerCapMode, number>>;
  updatedAt?: string;
};

export type MigrationScalingView = {
  migrationId: string;
  modes: Partial<Record<WorkerCapMode, number>>;
};

export type SetMigrationScalingRequest = {
  modes: Partial<Record<WorkerCapMode, number>>;
  persist?: boolean;
  persistTarget?: "provider" | "sftp_host";
  persistKey?: string;
};
