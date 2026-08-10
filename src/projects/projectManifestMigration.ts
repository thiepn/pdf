import type { ProjectManifest } from "../types/project";

export function assertReadableProjectManifestSchema(value: unknown, currentSchemaVersion: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error("This local project has an invalid schema version and was not modified.");
  }
  const version = value as number;
  if (version > currentSchemaVersion) {
    throw new Error(`This project was created by a newer PDF Studio version (project schema ${version}; this build supports ${currentSchemaVersion}). Update the app before opening it. The project was not modified.`);
  }
  return version;
}


export function migrateProjectManifestForSchema(
  project: ProjectManifest,
  currentSchemaVersion: number,
  createRevisionId: () => string,
  now = Date.now()
): ProjectManifest {
  const schemaVersion = assertReadableProjectManifestSchema(project.schemaVersion, currentSchemaVersion);
  if (schemaVersion === currentSchemaVersion) return project;
  return {
    ...project,
    schemaVersion: currentSchemaVersion,
    recovery: {
      dirty: project.recovery?.dirty ?? false,
      lastValidSnapshotAt: project.recovery?.lastValidSnapshotAt ?? project.updatedAt ?? project.createdAt,
      interruptedJob: project.recovery?.interruptedJob
    },
    lineage: project.lineage ?? { rootProjectId: project.id, origin: "import" },
    revision: project.revision ?? { id: createRevisionId(), sequence: 0, createdAt: project.createdAt, operation: "legacy-source" },
    updatedAt: now
  };
}
