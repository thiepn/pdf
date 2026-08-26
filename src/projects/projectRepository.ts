import { recordRuntimeMetric } from "../performance/runtimeMetrics";
import type { ProjectManifest } from "../types/project";
import * as base from "./projectRepositoryBase";

export * from "./projectRepositoryBase";

const MAX_SOURCE_SESSIONS = 6;
const sourceSessions = new Map<string, { checksum: string; bytes: Uint8Array }>();

function rememberSource(project: ProjectManifest, bytes: Uint8Array): Uint8Array {
  sourceSessions.delete(project.id);
  sourceSessions.set(project.id, { checksum: project.checksum, bytes });
  while (sourceSessions.size > MAX_SOURCE_SESSIONS) {
    const oldest = sourceSessions.keys().next().value as string | undefined;
    if (!oldest) break;
    sourceSessions.delete(oldest);
  }
  return bytes;
}

/**
 * Recovery P2 treats a project's source PDF as immutable session data. All
 * document modes receive the same byte view, regardless of whether the browser
 * stores the project in OPFS or IndexedDB, so Read → Edit → Pages does not read
 * the complete source file from local storage again for each mode.
 */
export async function loadProjectBytes(project: ProjectManifest): Promise<Uint8Array> {
  const cached = sourceSessions.get(project.id);
  if (cached?.checksum === project.checksum) {
    sourceSessions.delete(project.id);
    sourceSessions.set(project.id, cached);
    recordRuntimeMetric("storage", "projectBytes.session.hit", 0, undefined, {
      byteLength: cached.bytes.byteLength,
      storageKind: project.storageKind
    });
    return cached.bytes;
  }
  if (cached) sourceSessions.delete(project.id);
  recordRuntimeMetric("storage", "projectBytes.session.miss", 0, undefined, {
    byteLength: project.byteLength,
    storageKind: project.storageKind
  });
  return rememberSource(project, await base.loadProjectBytes(project));
}

export async function deleteProject(projectId: string): Promise<void> {
  sourceSessions.delete(projectId);
  await base.deleteProject(projectId);
}
