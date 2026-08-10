import { idbGetAll, idbGetAllByIndex, idbPut } from "../storage/database";
import type { ProjectManifest } from "../types/project";
import { DOCUMENT_REVISION_SCHEMA_VERSION, type DocumentRevision, type DocumentTransaction } from "../types/revision";
import { matchInterruptedTransactions } from "./transactionRecovery";
export { matchInterruptedTransactions } from "./transactionRecovery";

export async function recordProjectRevision(project: ProjectManifest): Promise<DocumentRevision | undefined> {
  if (!project.revision) return undefined;
  const revision: DocumentRevision = {
    schemaVersion: DOCUMENT_REVISION_SCHEMA_VERSION,
    id: project.revision.id,
    projectId: project.id,
    rootProjectId: project.lineage?.rootProjectId ?? project.id,
    sequence: project.revision.sequence,
    parentRevisionId: project.revision.parentRevisionId,
    parentProjectId: project.lineage?.parentProjectId,
    operation: project.revision.operation,
    checksum: project.checksum,
    byteLength: project.byteLength,
    createdAt: project.revision.createdAt
  };
  await idbPut("documentRevisions", revision);
  return revision;
}

export async function listProjectRevisions(projectId: string): Promise<DocumentRevision[]> {
  const revisions = await idbGetAllByIndex<DocumentRevision>("documentRevisions", "projectId", projectId);
  return revisions.sort((left, right) => right.sequence - left.sequence || right.createdAt - left.createdAt);
}

export async function listDocumentLineage(rootProjectId: string): Promise<DocumentRevision[]> {
  const revisions = await idbGetAll<DocumentRevision>("documentRevisions");
  return revisions
    .filter((revision) => (revision.rootProjectId ?? revision.projectId) === rootProjectId)
    .sort((left, right) => right.createdAt - left.createdAt || right.sequence - left.sequence);
}

export async function writeDocumentTransaction(transaction: DocumentTransaction): Promise<void> {
  await idbPut("documentTransactions", transaction);
}

export async function listDocumentTransactions(projectId: string): Promise<DocumentTransaction[]> {
  const transactions = await idbGetAllByIndex<DocumentTransaction>("documentTransactions", "projectId", projectId);
  return transactions.sort((left, right) => right.startedAt - left.startedAt);
}
export async function reconcileInterruptedTransactions(projectId: string): Promise<DocumentTransaction[]> {
  const transactions = await listDocumentTransactions(projectId);
  const interrupted = transactions.filter((transaction) => transaction.status === "preparing");
  if (!interrupted.length) return [];
  const projects = await idbGetAll<ProjectManifest>("projects");
  const recovered: DocumentTransaction[] = [];
  for (const { transaction, output } of matchInterruptedTransactions(projectId, interrupted, projects)) {
    const next: DocumentTransaction = output
      ? { ...transaction, status: "committed", completedAt: output.createdAt, outputProjectId: output.id, outputRevisionId: output.revision?.id }
      : { ...transaction, status: "rolled-back", completedAt: Date.now(), error: "Recovered an interrupted transaction; no unique committed output project was found." };
    await writeDocumentTransaction(next);
    recovered.push(next);
  }
  return recovered;
}
