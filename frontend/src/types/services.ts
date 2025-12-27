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

