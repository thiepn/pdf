export const DOCUMENT_REVISION_SCHEMA_VERSION = 1;

export interface DocumentRevision {
  schemaVersion: number;
  id: string;
  projectId: string;
  rootProjectId: string;
  sequence: number;
  parentRevisionId?: string;
  parentProjectId?: string;
  operation: string;
  checksum: string;
  byteLength: number;
  createdAt: number;
}

export type DocumentTransactionStatus = "preparing" | "committed" | "rolled-back";

export interface DocumentTransaction {
  id: string;
  projectId: string;
  sourceRevisionId?: string;
  operation: string;
  status: DocumentTransactionStatus;
  startedAt: number;
  completedAt?: number;
  outputProjectId?: string;
  outputRevisionId?: string;
  error?: string;
}
