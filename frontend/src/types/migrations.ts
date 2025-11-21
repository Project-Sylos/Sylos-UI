import { Folder } from "../types/services";

export interface MigrationRootRequest {
  migrationId?: string;
  role: "source" | "destination";
  serviceId?: string;
  connectionId?: string;
  root: Folder;
}

export interface MigrationRootResponse {
  migrationId: string;
  ready: boolean;
  rootSummary?: {
    srcRoots?: number;
    dstRoots?: number;
  };
  sourceConnectionId?: string;
  destinationConnectionId?: string;
}

export interface StartMigrationPayload {
  migrationId: string;
  options?: {
    databasePath?: string;
    sourceConnectionId?: string;
    destinationConnectionId?: string;
    workerCount?: number;
    maxRetries?: number;
    coordinatorLead?: number;
    logAddress?: string;
    logLevel?: string;
    enableLoggingTerminal?: boolean;
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

export interface MigrationDBFile {
  filename: string;
  path: string;
  size: number;
  modifiedAt: string;
}

export interface MigrationUploadResponse {
  success: boolean;
  path?: string;
  error?: string;
}

export interface MigrationStatusResponse extends MigrationResponse {
  completedAt?: string | null;
  result?: {
    rootSummary?: {
      srcRoots?: number;
      dstRoots?: number;
    };
    runtime?: {
      duration?: string;
      src?: {
        name?: string;
        round?: number;
        pending?: number;
        inProgress?: number;
        totalTracked?: number;
        workers?: number;
      };
      dst?: {
        name?: string;
        round?: number;
        pending?: number;
        inProgress?: number;
        totalTracked?: number;
        workers?: number;
      };
    };
    verification?: {
      srcTotal?: number;
      dstTotal?: number;
      srcPending?: number;
      dstPending?: number;
      srcFailed?: number;
      dstFailed?: number;
      dstNotOnSrc?: number;
    };
  };
}

export interface MigrationInspectResponse {
  srcTotal: number;
  dstTotal: number;
  srcPending: number;
  dstPending: number;
  srcFailed: number;
  dstFailed: number;
  minPendingDepthSrc: number;
  minPendingDepthDst: number;
}

export interface MigrationMetadata {
  id: string;
  name: string;
  configPath: string;
  createdAt: string;
}

export interface MigrationWithStatus extends MigrationMetadata {
  status?: string;
}

