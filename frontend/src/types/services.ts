export type ServiceType = "local" | "spectra" | string;

export interface ServiceDescriptor {
  id: string;
  displayName: string;
  type: ServiceType;
  metadata?: Record<string, unknown>;
}

export interface Folder {
  id: string;
  displayName: string;
  locationPath: string;
  parentId?: string;
  parentPath?: string;
  lastUpdated?: string;
  depthLevel?: number;
  type: string;
}

