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
    min_folders: number;
    max_folders: number;
    min_files: number;
    max_files: number;
    seed: number;
    db_path: string;
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
    min_folders: 4,
    max_folders: 8,
    min_files: 10,
    max_files: 20,
    seed: 0,
    db_path: "./spectra.db",
  },
  api: {
    host: "localhost",
    port: 8085,
  },
  secondary_tables: {
    s1: 0.9,
  },
};
