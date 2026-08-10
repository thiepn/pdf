import { sha256 } from "../core/checksum";
import { listEditorAssets, readEditorState } from "../editor/editorRepository";
import { listOcrJobs, listOcrPages } from "../ocr/ocrRepository";
import { getProject, listProjects, loadProjectBytes, updateProject } from "../projects/projectRepository";
import { idbDelete, idbDeleteAllByIndex, idbGetAll, idbPut } from "./database";
import type { EditorAssetRecord } from "../types/editor";
import type { OcrJob, OcrPageResult } from "../types/ocr";
import type { WorkspaceCheckpoint, WorkspaceEvent, WorkspaceSession } from "../types/workspace";
import type { DocumentRevision, DocumentTransaction } from "../types/revision";

export type HealthSeverity = "pass" | "warning" | "error";

export interface ProjectHealthIssue {
  id: string;
  projectId?: string;
  projectName?: string;
  severity: HealthSeverity;
  code: string;
  message: string;
  repairable: boolean;
}

export interface StorageHealthReport {
  startedAt: number;
  completedAt: number;
  projectCount: number;
  checkedBytes: number;
  issues: ProjectHealthIssue[];
}

function issue(input: Omit<ProjectHealthIssue, "id">): ProjectHealthIssue {
  return { ...input, id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}` };
}

export async function runStorageHealthCheck(): Promise<StorageHealthReport> {
  const startedAt = Date.now();
  const projects = await listProjects();
  const issues: ProjectHealthIssue[] = [];
  let checkedBytes = 0;
  for (const project of projects) {
    try {
      const bytes = await loadProjectBytes(project);
      checkedBytes += bytes.byteLength;
      if (bytes.byteLength !== project.byteLength) issues.push(issue({ projectId: project.id, projectName: project.name, severity: "error", code: "source-size", message: `Stored source size is ${bytes.byteLength} bytes; the manifest expects ${project.byteLength}. Restore this project from a trusted backup.`, repairable: false }));
      const checksum = await sha256(bytes);
      if (checksum !== project.checksum) issues.push(issue({ projectId: project.id, projectName: project.name, severity: "error", code: "source-checksum", message: "The stored source checksum does not match the project manifest. Restore this project from a trusted backup.", repairable: false }));
    } catch (reason) {
      issues.push(issue({ projectId: project.id, projectName: project.name, severity: "error", code: "source-missing", message: reason instanceof Error ? reason.message : String(reason), repairable: false }));
      continue;
    }

    const [editorState, assets, jobs] = await Promise.all([readEditorState(project.id), listEditorAssets(project.id), listOcrJobs(project.id)]);
    const assetIds = new Set(assets.map((asset) => asset.id));
    for (const object of editorState.objects) {
      if (object.type === "image" && !assetIds.has(object.assetId)) issues.push(issue({ projectId: project.id, projectName: project.name, severity: "error", code: "editor-asset-missing", message: `Image object “${object.name}” references a missing local asset.`, repairable: false }));
    }
    for (const job of jobs) {
      const pages = await listOcrPages(job.id);
      if (job.completedPages !== pages.filter((page) => page.status === "complete").length) issues.push(issue({ projectId: project.id, projectName: project.name, severity: "warning", code: "ocr-count", message: `OCR job “${job.name}” has inconsistent completion counters.`, repairable: true }));
    }
    if (project.recovery.interruptedJob) issues.push(issue({ projectId: project.id, projectName: project.name, severity: "warning", code: "interrupted-job", message: `An interrupted operation is recorded: ${project.recovery.interruptedJob}.`, repairable: true }));
  }

  const [allAssets, allJobs, allPages, workspaceEvents, workspaceCheckpoints, workspaceSessions, documentRevisions, documentTransactions] = await Promise.all([
    idbGetAll<EditorAssetRecord>("editorAssets"),
    idbGetAll<OcrJob>("ocrJobs"),
    idbGetAll<OcrPageResult>("ocrPages"),
    idbGetAll<WorkspaceEvent>("workspaceEvents"),
    idbGetAll<WorkspaceCheckpoint>("workspaceCheckpoints"),
    idbGetAll<WorkspaceSession>("workspaceSessions"),
    idbGetAll<DocumentRevision>("documentRevisions"),
    idbGetAll<DocumentTransaction>("documentTransactions")
  ]);
  const projectIds = new Set(projects.map((project) => project.id));
  const jobIds = new Set(allJobs.map((job) => job.id));
  const orphanAssets = allAssets.filter((asset) => !projectIds.has(asset.projectId));
  const orphanJobs = allJobs.filter((job) => job.projectId && !projectIds.has(job.projectId));
  const orphanPages = allPages.filter((page) => !jobIds.has(page.jobId) || (page.projectId && !projectIds.has(page.projectId)));
  if (orphanAssets.length) issues.push(issue({ severity: "warning", code: "orphan-assets", message: `${orphanAssets.length} editor asset(s) are not attached to an existing project.`, repairable: true }));
  if (orphanJobs.length) issues.push(issue({ severity: "warning", code: "orphan-ocr-jobs", message: `${orphanJobs.length} OCR job(s) are not attached to an existing project.`, repairable: true }));
  if (orphanPages.length) issues.push(issue({ severity: "warning", code: "orphan-ocr-pages", message: `${orphanPages.length} OCR page result(s) are orphaned.`, repairable: true }));
  const orphanWorkspaceEvents = workspaceEvents.filter((event) => !projectIds.has(event.projectId));
  const orphanWorkspaceCheckpoints = workspaceCheckpoints.filter((checkpoint) => !projectIds.has(checkpoint.projectId));
  const staleWorkspaceTabs = workspaceSessions.flatMap((session) => [...session.tabs, ...session.recentlyClosed]).filter((tab) => !projectIds.has(tab.projectId));
  const orphanDocumentRevisions = documentRevisions.filter((revision) => !projectIds.has(revision.projectId));
  const orphanDocumentTransactions = documentTransactions.filter((transaction) => !projectIds.has(transaction.projectId));
  if (orphanWorkspaceEvents.length) issues.push(issue({ severity: "warning", code: "orphan-workspace-events", message: `${orphanWorkspaceEvents.length} workspace event(s) reference removed projects.`, repairable: true }));
  if (orphanWorkspaceCheckpoints.length) issues.push(issue({ severity: "warning", code: "orphan-workspace-checkpoints", message: `${orphanWorkspaceCheckpoints.length} checkpoint(s) reference removed projects.`, repairable: true }));
  if (staleWorkspaceTabs.length) issues.push(issue({ severity: "warning", code: "stale-workspace-tabs", message: `${staleWorkspaceTabs.length} document tab record(s) reference removed projects.`, repairable: true }));
  if (orphanDocumentRevisions.length) issues.push(issue({ severity: "warning", code: "orphan-document-revisions", message: `${orphanDocumentRevisions.length} document revision record(s) reference removed projects.`, repairable: true }));
  if (orphanDocumentTransactions.length) issues.push(issue({ severity: "warning", code: "orphan-document-transactions", message: `${orphanDocumentTransactions.length} document transaction record(s) reference removed projects.`, repairable: true }));

  if (!issues.length) issues.push(issue({ severity: "pass", code: "healthy", message: "All project sources, checksums, editor assets, OCR references, workspace records, revisions, and transactions are consistent.", repairable: false }));
  return { startedAt, completedAt: Date.now(), projectCount: projects.length, checkedBytes, issues };
}

export async function repairHealthIssue(item: ProjectHealthIssue): Promise<void> {
  if (!item.repairable) throw new Error("This issue requires restoring the project from a backup.");
  if (item.projectId && item.code === "interrupted-job") {
    const project = await getProject(item.projectId);
    if (project) await updateProject({ ...project, recovery: { ...project.recovery, interruptedJob: undefined } });
    return;
  }
  if (item.projectId && item.code === "ocr-count") {
    const jobs = await listOcrJobs(item.projectId);
    for (const job of jobs) {
      const pages = await listOcrPages(job.id);
      const completedPages = pages.filter((page) => page.status === "complete").length;
      const { writeOcrJob } = await import("../ocr/ocrRepository");
      await writeOcrJob({ ...job, completedPages, updatedAt: Date.now() });
    }
    return;
  }
  if (item.code === "orphan-assets") {
    const projects = await listProjects(); const valid = new Set(projects.map((project) => project.id));
    const assets = await idbGetAll<EditorAssetRecord>("editorAssets");
    await Promise.all(assets.filter((asset) => !valid.has(asset.projectId)).map((asset) => idbDelete("editorAssets", asset.id)));
    return;
  }
  if (item.code === "orphan-ocr-jobs" || item.code === "orphan-ocr-pages") {
    const projects = await listProjects(); const valid = new Set(projects.map((project) => project.id));
    const jobs = await idbGetAll<OcrJob>("ocrJobs");
    for (const job of jobs.filter((entry) => entry.projectId && !valid.has(entry.projectId))) {
      await idbDeleteAllByIndex("ocrPages", "jobId", job.id);
      await idbDelete("ocrJobs", job.id);
    }
    const currentJobs = await idbGetAll<OcrJob>("ocrJobs");
    const validJobIds = new Set(currentJobs.map((job) => job.id));
    const pages = await idbGetAll<OcrPageResult>("ocrPages");
    await Promise.all(pages.filter((page) => !validJobIds.has(page.jobId) || (page.projectId && !valid.has(page.projectId))).map((page) => idbDelete("ocrPages", page.id)));
    return;
  }
  if (["orphan-workspace-events", "orphan-workspace-checkpoints", "stale-workspace-tabs", "orphan-document-revisions", "orphan-document-transactions"].includes(item.code)) {
    const projects = await listProjects();
    const valid = new Set(projects.map((project) => project.id));
    if (item.code === "orphan-workspace-events") {
      const events = await idbGetAll<WorkspaceEvent>("workspaceEvents");
      await Promise.all(events.filter((event) => !valid.has(event.projectId)).map((event) => idbDelete("workspaceEvents", event.id)));
    }
    if (item.code === "orphan-workspace-checkpoints") {
      const checkpoints = await idbGetAll<WorkspaceCheckpoint>("workspaceCheckpoints");
      await Promise.all(checkpoints.filter((checkpoint) => !valid.has(checkpoint.projectId)).map((checkpoint) => idbDelete("workspaceCheckpoints", checkpoint.id)));
    }
    if (item.code === "stale-workspace-tabs") {
      const sessions = await idbGetAll<WorkspaceSession>("workspaceSessions");
      await Promise.all(sessions.map((session) => idbPut("workspaceSessions", {
        ...session,
        tabs: session.tabs.filter((tab) => valid.has(tab.projectId)),
        recentlyClosed: session.recentlyClosed.filter((tab) => valid.has(tab.projectId)),
        activeProjectId: session.activeProjectId && valid.has(session.activeProjectId) ? session.activeProjectId : undefined,
        updatedAt: Date.now()
      })));
    }
    if (item.code === "orphan-document-revisions") {
      const revisions = await idbGetAll<DocumentRevision>("documentRevisions");
      await Promise.all(revisions.filter((revision) => !valid.has(revision.projectId)).map((revision) => idbDelete("documentRevisions", revision.id)));
    }
    if (item.code === "orphan-document-transactions") {
      const transactions = await idbGetAll<DocumentTransaction>("documentTransactions");
      await Promise.all(transactions.filter((transaction) => !valid.has(transaction.projectId)).map((transaction) => idbDelete("documentTransactions", transaction.id)));
    }
    return;
  }
}
