import type { ProjectManifest } from "../types/project.ts";
import type { DocumentTransaction } from "../types/revision.ts";

export interface InterruptedTransactionRecovery {
  transaction: DocumentTransaction;
  output?: ProjectManifest;
}

/**
 * Matches interrupted transaction journals to committed derived projects one-to-one.
 * Newer transactions claim ambiguous outputs first so one derived project can never
 * be reported as the successful result of multiple interrupted operations.
 */
export function matchInterruptedTransactions(
  projectId: string,
  transactions: DocumentTransaction[],
  projects: ProjectManifest[]
): InterruptedTransactionRecovery[] {
  const interrupted = transactions
    .filter((transaction) => transaction.status === "preparing")
    .sort((left, right) => right.startedAt - left.startedAt);
  const usedOutputs = new Set<string>();
  return interrupted.map((transaction) => {
    const output = projects
      .filter((project) => !usedOutputs.has(project.id))
      .filter((project) => project.lineage?.parentProjectId === projectId)
      .filter((project) => !transaction.sourceRevisionId || project.revision?.parentRevisionId === transaction.sourceRevisionId)
      .filter((project) => project.revision?.operation === transaction.operation && project.createdAt >= transaction.startedAt)
      .sort((left, right) => left.createdAt - right.createdAt)[0];
    if (output) usedOutputs.add(output.id);
    return { transaction, output };
  });
}
