export type ServiceType = "local" | "spectra" | string;

export interface ServiceDescriptor {
  id: string;
  displayName: string;
  type: ServiceType;
  metadata?: Record<string, unknown>;
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
}

export interface Drive {
  path: string;
  name: string;
  type: string;
}

export interface PaginationInfo {
  offset: number;
  limit: number;
  total: number;
  totalFolders: number;
  totalFiles: number;
  hasMore: boolean;
}

export interface ChildrenResponse {
  folders: Folder[];
  files: any[]; // File objects if needed
  pagination?: PaginationInfo;
}

export interface SpectraConfig {
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
    // Cache configuration (optional, defaults to false)
    enable_cache?: boolean;
  };
  api: {
    host: string;
    port: number;
  };
  secondary_tables: Record<string, number>;
}

export const DEFAULT_SPECTRA_CONFIG: SpectraConfig = {
  seed: {
    max_depth: 4,
    max_folders: 8,
    folder_backoff_factor: 0.5,
    folder_depth_decay_factor: 0.8,
    max_files: 20,
    file_backoff_factor: 0.5,
    file_depth_decay_factor: 0.8,
    seed: 0,
    db_path: "./spectra.db",
    enable_cache: true,
  },
  api: {
    host: "localhost",
    port: 8085,
  },
  secondary_tables: {
    s1: 0.9,
  },
};
