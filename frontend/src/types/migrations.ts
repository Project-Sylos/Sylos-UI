import { Folder } from "./services";

export interface MigrationEndpointBase {
  serviceId: string;
  connectionId?: string;
}

export interface MigrationEndpointWithRoot extends MigrationEndpointBase {
  root: Folder;
}

export interface VerificationOptions {
  allowPending?: boolean;
  allowFailed?: boolean;
  allowNotOnSrc?: boolean;
}

export interface MigrationOptions {
  migrationId?: string;
  workerCount?: number;
  maxRetries?: number;
  coordinatorLead?: number;
  logAddress?: string;
  skipLogListener?: boolean;
  verification?: VerificationOptions;
  sourceConnectionId?: string;
  destinationConnectionId?: string;
}

export interface MigrationRootsPayload {
  migrationId?: string;
  source: MigrationEndpointWithRoot;
  destination: MigrationEndpointWithRoot;
  options?: MigrationOptions;
}

export interface MigrationRootsResponse {
  migrationId: string;
  databasePath: string;
  rootSummary?: {
    srcRoots?: number;
    dstRoots?: number;
  };
  sourceConnectionId?: string;
  destinationConnectionId?: string;
}

export interface StartMigrationPayload {
  source: MigrationEndpointBase;
  destination: MigrationEndpointBase;
  options?: {
    migrationId?: string;
    sourceConnectionId?: string;
    destinationConnectionId?: string;
  };
}

export interface MigrationResponse {
  id: string;
  sourceId: string;
  destinationId: string;
  startedAt: string;
  status: string;
  error?: string;
}

