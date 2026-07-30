export type ServiceType = "local" | "spectra" | string;

export interface ServiceDescriptor {
  id: string;
  displayName: string;
  type: ServiceType;
  metadata?: Record<string, unknown>;
}

export interface BrowseTrailItem {
  path: string;
  name: string;
}

export interface Folder {
  ServiceID: string;
  Id: string;
  name: string;
  locationPath: string;
  parentId?: string;
  parentPath?: string;
  lastUpdated?: string;
  depthLevel?: number;
  type: string;
  size?: number;
  /** Captured from the folder browser so edits can reopen the same location. */
  browseTrail?: BrowseTrailItem[];
}

export interface Drive {
  path: string;
  /** Primary label; mapped from API `displayName` when present. */
  name: string;
  displayName?: string;
  type: string;
  mountPoint?: string;
  device?: string;
  fileSystem?: string;
  mounted?: boolean;
  label?: string;
  totalBytes?: number;
  freeBytes?: number;
  usedBytes?: number;
}

export interface PaginationInfo {
  offset: number;
  limit: number;
  /** Present when known; omit when the server did not compute a count. */
  total?: number;
  totalFolders?: number;
  totalFiles?: number;
  hasMore: boolean;
}

export interface ChildrenResponse {
  folders: Folder[];
  files: any[]; // File objects if needed
  pagination?: PaginationInfo;
}

export interface SpectraChaosCallLimit {
  calls_per_second: number;
  burst?: number;
}

export interface SpectraChaosConfig {
  enabled: boolean;
  rate_limits: {
    poll_interval_ms: number;
    global: SpectraChaosCallLimit;
    operations: Record<string, SpectraChaosCallLimit>;
    bandwidth: {
      bytes_per_second: number;
      burst_bytes?: number;
    };
  };
  backoff: {
    base_retry_after_ms: number;
    exponential_factor: number;
  };
  latency: {
    list_children_ms: number;
    jitter_ms: number;
  };
  packet_loss: {
    probability: number;
    retry_after_ms: number;
  };
}

export interface SpectraAuthConfig {
  enabled: boolean;
  /** -1 = never expire; > 0 = TTL in seconds */
  access_token_ttl_seconds: number;
}

export interface SpectraConfig {
  mode: "ephemeral" | "persistent";
  seed: {
    max_depth: number;
    db_path: string;
    seed?: number;
    // Old format (deprecated, kept for backwards compatibility)
    min_folders?: number;
    min_files?: number;
    // New format - weighted distribution (required)
    max_folders: number;
    folder_backoff_factor?: number;
    folder_depth_decay_factor?: number;
    max_files: number;
    file_backoff_factor?: number;
    file_depth_decay_factor?: number;
    diverging_tree_mode?: boolean;
  };
  api: {
    host: string;
    port: number;
  };
  secondary_tables: Record<string, number>;
  chaos?: SpectraChaosConfig;
  auth?: SpectraAuthConfig;
}

export const DEFAULT_SPECTRA_CHAOS: SpectraChaosConfig = {
  enabled: false,
  rate_limits: {
    poll_interval_ms: 1000,
    global: { calls_per_second: 0, burst: 0 },
    operations: {
      list_children: { calls_per_second: 5000, burst: 5000 },
      get_node: { calls_per_second: 5000, burst: 5000 },
      get_file_data: { calls_per_second: 1000, burst: 1000 },
      create_folder: { calls_per_second: 5000, burst: 5000 },
      upload_file: { calls_per_second: 1000, burst: 1000 },
    },
    bandwidth: {
      bytes_per_second: 1073741824,
      burst_bytes: 1073741824,
    },
  },
  backoff: {
    base_retry_after_ms: 100,
    exponential_factor: 2,
  },
  latency: {
    list_children_ms: 0,
    jitter_ms: 0,
  },
  packet_loss: {
    probability: 0,
    retry_after_ms: 500,
  },
};

export const DEFAULT_SPECTRA_AUTH: SpectraAuthConfig = {
  enabled: false,
  access_token_ttl_seconds: 3600,
};

export const DEFAULT_SPECTRA_CONFIG: SpectraConfig = {
  mode: "ephemeral",
  seed: {
    max_depth: 6,
    max_folders: 20,
    folder_backoff_factor: 0.9,
    folder_depth_decay_factor: 0.9,
    max_files: 50,
    file_backoff_factor: 0.9,
    file_depth_decay_factor: 0.9,
    seed: 0,
    db_path: "./spectra.db",
    diverging_tree_mode: true,
  },
  api: {
    host: "localhost",
    port: 8085,
  },
  secondary_tables: {
    s1: 0.9,
  },
  chaos: { ...DEFAULT_SPECTRA_CHAOS },
  auth: { ...DEFAULT_SPECTRA_AUTH },
};
