import { sha256 } from "../core/checksum";
import { toOwnedArrayBuffer } from "../core/arrayBuffer";
import { inspectPdfBytes } from "../engines/pdfjs";
import { idbDelete, idbDeleteAllByIndex, idbGet, idbGetAll, idbPut } from "../storage/database";
import { deleteProjectFiles, readProjectSource, writeProjectSource } from "../storage/projectFiles";
import { PROJECT_SCHEMA_VERSION, type ProjectManifest, type ViewerPreferences } from "../types/project";
import { decodeProjectPackage, encodeProjectPackage, verifyProjectPackageIntegrity } from "./projectPackage";
import { deleteEditorState, listEditorAssets, readEditorState, writeEditorAsset, writeEditorState } from "../editor/editorRepository";
import { deleteSecurityState, readSecurityState, writeSecurityState } from "../security/securityRepository";
import { listOcrJobs, listOcrPages, writeOcrJob, writeOcrPage } from "../ocr/ocrRepository";
import { deleteNativeState, readNativeState, writeNativeState } from "../native/nativeRepository";
import { deleteComplianceState, readComplianceState, writeComplianceState } from "../compliance/complianceRepository";
import { recordProjectRevision, writeDocumentTransaction } from "../revisions/revisionRepository";
import type { DocumentTransaction } from "../types/revision";
import { isolateImportedEditorData } from "./importIsolation";
import { assertStorageBudget } from "../storage/budget";
import { migrateProjectManifestForSchema } from "./projectManifestMigration";

interface SourceFileRecord {
  projectId: string;
  bytes: ArrayBuffer;
}

function createId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function importPdfProject(file: File, password?: string): Promise<ProjectManifest> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return createProjectFromBytes(bytes, file.name, file.type || "application/pdf", password);
}

export interface CreateProjectOptions {
  deduplicate?: boolean;
  displayName?: string;
  lineage?: ProjectManifest["lineage"];
  operation?: string;
}

export interface ImportProjectPackageOptions {
  deduplicate?: boolean;
  displayName?: string;
  origin?: "package" | "checkpoint";
}

export async function createProjectFromBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType = "application/pdf",
  password?: string,
  options: CreateProjectOptions = {}
): Promise<ProjectManifest> {
  const checksum = await sha256(bytes);
  const deduplicate = options.deduplicate !== false;
  const existing = deduplicate ? (await idbGetAll<ProjectManifest>("projects")).find((project) => {
    if (project.checksum !== checksum) return false;
    // Never touch or reuse a manifest from a newer/invalid schema during checksum
    // deduplication. Opening it requires a newer build and must remain read-only here.
    return Number.isSafeInteger(project.schemaVersion) && project.schemaVersion >= 1 && project.schemaVersion <= PROJECT_SCHEMA_VERSION;
  }) : undefined;
  if (existing) {
    try {
      const compatibleExisting = migrateProjectManifestForSchema(existing, PROJECT_SCHEMA_VERSION, createId);
      const existingBytes = await loadProjectBytes(compatibleExisting);
      const existingChecksum = await sha256(existingBytes);
      if (existingChecksum === compatibleExisting.checksum) {
        const updated = { ...compatibleExisting, lastOpenedAt: Date.now(), updatedAt: Date.now() };
        await idbPut("projects", updated);
        try { localStorage.setItem("local-pdf-studio-last-project", existing.id); } catch { /* Storage may be blocked. */ }
        return updated;
      }
      // Preserve the suspect project for recovery instead of deleting it automatically.
      // The incoming bytes are stored as a fresh project below.
    } catch {
      // A transient OPFS/IndexedDB read failure must never destroy an existing project.
      // Fall through and create an independent project from the incoming bytes.
    }
  }
  await assertStorageBudget(bytes.byteLength, "store this PDF locally");
  const summary = await inspectPdfBytes(bytes, password);

  const id = createId();
  let storageKind: ProjectManifest["storageKind"] = "opfs";
  let sourcePath: string | undefined;
  try {
    sourcePath = await writeProjectSource(id, bytes);
  } catch {
    await deleteProjectFiles(id).catch(() => undefined);
    storageKind = "indexeddb";
    const transferable = toOwnedArrayBuffer(bytes);
    try {
      await idbPut<SourceFileRecord>("sourceFiles", { projectId: id, bytes: transferable });
    } catch (reason) {
      await Promise.allSettled([deleteProjectFiles(id), idbDelete("sourceFiles", id)]);
      throw reason;
    }
  }

  const now = Date.now();
  const parent = options.lineage?.parentProjectId ? await idbGet<ProjectManifest>("projects", options.lineage.parentProjectId) : undefined;
  const parentRevisionId = options.lineage?.sourceRevisionId ?? parent?.revision?.id;
  const project: ProjectManifest = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id,
    name: options.displayName?.trim() || filename.replace(/\.pdf$/i, "") || "Untitled PDF",
    sourceFilename: filename,
    mimeType,
    byteLength: bytes.byteLength,
    checksum,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    storageKind,
    sourcePath,
    summary,
    recovery: { dirty: false, lastValidSnapshotAt: now },
    lineage: options.lineage ?? { rootProjectId: id, origin: "import" },
    revision: {
      id: createId(),
      sequence: parent ? (parent.revision?.sequence ?? 0) + 1 : 0,
      createdAt: now,
      operation: options.operation ?? (parent ? "derived-output" : "source-import"),
      parentRevisionId
    }
  };
  try {
    await idbPut("projects", project);
    await recordProjectRevision(project);
    return project;
  } catch (reason) {
    await deleteProject(id);
    throw reason;
  }
}

export async function getProject(projectId: string): Promise<ProjectManifest | undefined> {
  const project = await idbGet<ProjectManifest>("projects", projectId);
  if (!project) return undefined;
  const migrated = migrateProjectManifestForSchema(project, PROJECT_SCHEMA_VERSION, createId);
  if (migrated !== project) { await idbPut("projects", migrated); await recordProjectRevision(migrated); }
  return migrated;
}

export async function listProjects(): Promise<ProjectManifest[]> {
  const projects = await idbGetAll<ProjectManifest>("projects");
  const migrated = projects.map((project) => {
    try { return migrateProjectManifestForSchema(project, PROJECT_SCHEMA_VERSION, createId); }
    catch { return project; } // Keep future/corrupt manifests untouched so an older build cannot rewrite them.
  });
  await Promise.all(migrated.filter((project, index) => project !== projects[index]).map(async (project) => { await idbPut("projects", project); await recordProjectRevision(project); }));
  return migrated.sort((left, right) => right.lastOpenedAt - left.lastOpenedAt);
}

export async function updateProject(project: ProjectManifest): Promise<void> {
  await idbPut("projects", { ...project, updatedAt: Date.now() });
}

export async function renameProject(projectId: string, name: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found.");
  await updateProject({ ...project, name: name.trim() || project.name });
}

export async function touchProject(projectId: string): Promise<void> {
  try { localStorage.setItem("local-pdf-studio-last-project", projectId); } catch { /* Storage may be blocked. */ }
  const project = await getProject(projectId);
  if (!project) return;
  const now = Date.now();
  await idbPut("projects", { ...project, lastOpenedAt: now, updatedAt: now });
}

export async function loadProjectBytes(project: ProjectManifest): Promise<Uint8Array> {
  if (project.storageKind === "opfs") return readProjectSource(project.id);
  const record = await idbGet<SourceFileRecord>("sourceFiles", project.id);
  if (!record) throw new Error("The local source file is missing. Restore the project from a backup or reopen the PDF.");
  return new Uint8Array(record.bytes.slice(0));
}

export async function deleteProject(projectId: string): Promise<void> {
  const stored = await idbGet<ProjectManifest>("projects", projectId);
  if (stored) {
    // Delete the authoritative PDF source first. If that fails, keep the manifest
    // so the user still has a visible reference and can retry deletion later.
    if (stored.storageKind === "opfs") {
      if (!("storage" in navigator) || !("getDirectory" in navigator.storage)) throw new Error("The browser cannot access this project's local PDF storage right now. The project was kept so deletion can be retried safely.");
      await deleteProjectFiles(projectId);
      await idbDelete("sourceFiles", projectId).catch(() => undefined);
    } else {
      await idbDelete("sourceFiles", projectId);
      await deleteProjectFiles(projectId).catch(() => undefined);
    }
  } else {
    // Cleanup path for a partially-created project that never received a manifest.
    await Promise.allSettled([deleteProjectFiles(projectId), idbDelete("sourceFiles", projectId)]);
  }
  await Promise.allSettled([
    idbDelete("viewerStates", projectId),
    deleteEditorState(projectId),
    deleteSecurityState(projectId),
    deleteNativeState(projectId),
    deleteComplianceState(projectId),
    idbDeleteAllByIndex("documentRevisions", "projectId", projectId),
    idbDeleteAllByIndex("documentTransactions", "projectId", projectId),
    idbDeleteAllByIndex("ocrPages", "projectId", projectId),
    idbDeleteAllByIndex("ocrJobs", "projectId", projectId)
  ]);
  await idbDelete("projects", projectId);
}

export async function readViewerPreferences(projectId: string): Promise<ViewerPreferences | undefined> {
  return idbGet<ViewerPreferences>("viewerStates", projectId);
}

export async function writeViewerPreferences(preferences: ViewerPreferences): Promise<void> {
  await idbPut("viewerStates", preferences);
}

export async function exportProjectPackage(project: ProjectManifest): Promise<Blob> {
  const [pdfBytes, viewerPreferences, editorState, assets, securityState, ocrJobs, nativeState, complianceState] = await Promise.all([
    loadProjectBytes(project),
    readViewerPreferences(project.id),
    readEditorState(project.id),
    listEditorAssets(project.id),
    readSecurityState(project.id),
    listOcrJobs(project.id),
    readNativeState(project.id),
    readComplianceState(project.id)
  ]);
  const actualChecksum = await sha256(pdfBytes);
  if (actualChecksum !== project.checksum) {
    throw new Error("The locally stored source PDF no longer matches this project’s integrity checksum. The project was not modified; restore from a trusted backup or reopen the original PDF.");
  }
  const ocrPages = (await Promise.all(ocrJobs.map((job) => listOcrPages(job.id)))).flat();
  return await encodeProjectPackage(project, pdfBytes, viewerPreferences, editorState, assets, securityState, ocrJobs, ocrPages, nativeState, complianceState);
}

export async function importProjectPackage(file: File, password?: string, options: ImportProjectPackageOptions = {}): Promise<ProjectManifest> {
  const decoded = decodeProjectPackage(new Uint8Array(await file.arrayBuffer()));
  await verifyProjectPackageIntegrity(decoded);
  const { header, pdfBytes, assets, ocrJobs, ocrPages } = decoded;
  let project: ProjectManifest | undefined;
  try {
    project = await createProjectFromBytes(
      pdfBytes,
      header.manifest.sourceFilename,
      header.manifest.mimeType,
      password,
      {
        deduplicate: options.deduplicate ?? false,
        displayName: options.displayName ?? header.manifest.name,
        lineage: {
          rootProjectId: header.manifest.lineage?.rootProjectId ?? header.manifest.id,
          parentProjectId: header.manifest.id,
          origin: options.origin ?? "package",
          sourceRevisionId: header.manifest.revision?.id
        },
        operation: options.origin === "checkpoint" ? "checkpoint-restore" : "package-import"
      }
    );
    if (header.viewerPreferences) await writeViewerPreferences({ ...header.viewerPreferences, projectId: project.id, updatedAt: Date.now() });

    const isolatedEditor = isolateImportedEditorData(project.id, header.editorState, assets, createId);
    if (isolatedEditor.state) await writeEditorState(isolatedEditor.state);
    for (const asset of isolatedEditor.assets) await writeEditorAsset(asset);

    if (header.securityState) await writeSecurityState({
      ...header.securityState,
      projectId: project.id,
      encryption: { ...header.securityState.encryption, userPassword: "", ownerPassword: "" },
      updatedAt: Date.now()
    });
    if (header.nativeState) await writeNativeState({ ...header.nativeState, projectId: project.id, updatedAt: Date.now() });
    if (header.complianceState) await writeComplianceState({ ...header.complianceState, projectId: project.id, updatedAt: Date.now() });
    const jobMap = new Map<string, string>();
    for (const sourceJob of ocrJobs) {
      const id = createId(); jobMap.set(sourceJob.id, id);
      await writeOcrJob({ ...sourceJob, id, projectId: project.id, outputProjectId: undefined, status: sourceJob.status === "running" ? "paused" : sourceJob.status, updatedAt: Date.now() });
    }
    for (const sourcePage of ocrPages) {
      const jobId = jobMap.get(sourcePage.jobId); if (!jobId) continue;
      await writeOcrPage({ ...sourcePage, id: `${jobId}:${sourcePage.pageNumber}`, jobId, projectId: project.id, updatedAt: Date.now() });
    }
    return project;
  } catch (reason) {
    if (project) await deleteProject(project.id);
    throw reason;
  }
}

export async function createDerivedProjectFromBytes(
  parentProjectId: string,
  bytes: Uint8Array,
  filename: string,
  operation: string,
  mimeType = "application/pdf",
  password?: string
): Promise<ProjectManifest> {
  const parent = await getProject(parentProjectId);
  if (!parent) throw new Error("Parent project not found.");
  const transaction: DocumentTransaction = {
    id: createId(),
    projectId: parentProjectId,
    sourceRevisionId: parent.revision?.id,
    operation,
    status: "preparing",
    startedAt: Date.now()
  };
  await writeDocumentTransaction(transaction);
  let created: ProjectManifest | undefined;
  try {
    created = await createProjectFromBytes(bytes, filename, mimeType, password, {
      deduplicate: false,
      lineage: {
        rootProjectId: parent.lineage?.rootProjectId ?? parent.id,
        parentProjectId: parent.id,
        origin: "derived",
        sourceRevisionId: parent.revision?.id
      },
      operation
    });
    await writeDocumentTransaction({ ...transaction, status: "committed", completedAt: Date.now(), outputProjectId: created.id, outputRevisionId: created.revision?.id });
    return created;
  } catch (reason) {
    if (created) await deleteProject(created.id);
    await writeDocumentTransaction({ ...transaction, status: "rolled-back", completedAt: Date.now(), error: reason instanceof Error ? reason.message : String(reason) });
    throw reason;
  }
}

export function getLastOpenedProjectId(): string | null {
  try { return localStorage.getItem("local-pdf-studio-last-project"); } catch { return null; }
}

