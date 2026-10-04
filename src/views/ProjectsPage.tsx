import { useEffect, useState } from "react";
import { ProjectCard } from "../components/ProjectCard";
import { downloadBlob } from "../projects/download";
import { deleteProject, exportProjectPackage, listProjects, renameProject } from "../projects/projectRepository";
import type { ProjectManifest } from "../types/project";
import { readSettings } from "../settings/settingsStore";
import { deleteWorkspaceProjectData } from "../workspace/workspaceRepository";
import { authorizeExternalBackupDirectory, chooseExternalBackupDirectory, readNativeFileStatus, writeExternalProjectBackup, type NativeFileStatus } from "../files/nativeFileWorkflow";

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectManifest[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nativeStatus, setNativeStatus] = useState<Record<string, NativeFileStatus>>({});

  useEffect(() => { void refresh(); }, []);
  async function refresh(): Promise<void> {
    const next = await listProjects();
    setProjects(next);
    const statuses = await Promise.all(next.map(async (project) => {
      try { return [project.id, await readNativeFileStatus(project.id)] as const; }
      catch { return null; }
    }));
    setNativeStatus(Object.fromEntries(statuses.filter((entry): entry is readonly [string, NativeFileStatus] => entry !== null)));
  }

  async function remove(project: ProjectManifest): Promise<void> {
    if (readSettings().confirmDestructive && !window.confirm(`Delete the local project “${project.name}”? The original file outside this app is not affected.`)) return;
    await deleteProject(project.id);
    await deleteWorkspaceProjectData(project.id);
    await refresh();
  }

  async function rename(project: ProjectManifest): Promise<void> {
    const value = window.prompt("Project name", project.name);
    if (value === null) return;
    await renameProject(project.id, value);
    await refresh();
  }

  async function backup(project: ProjectManifest): Promise<void> {
    setError(null);
    try {
      const blob = await exportProjectPackage(project);
      downloadBlob(blob, `${safeName(project.name)}.lpsproject`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function externalBackup(project: ProjectManifest, chooseFolder = false): Promise<void> {
    setError(null);
    try {
      if (chooseFolder) {
        const selected = await chooseExternalBackupDirectory(project.id);
        if (!selected) throw new Error("Folder backups are not supported by this browser. Download a project backup instead.");
      } else if (!(await authorizeExternalBackupDirectory(project.id))) {
        throw new Error("Write permission was not granted for the external backup folder.");
      }
      const blob = await exportProjectPackage(project);
      const written = await writeExternalProjectBackup(project.id, blob, `${safeName(project.name)}.lpsproject`);
      if (!written) throw new Error("Choose an external backup folder first.");
      await refresh();
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const filtered = projects.filter((project) => `${project.name} ${project.sourceFilename}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));

  return (
    <div className="stack">
      <section className="projects-toolbar">
        <div><strong>{projects.length} local {projects.length === 1 ? "project" : "projects"}</strong><span>Stored only in this browser profile.</span></div>
        <input aria-label="Search projects" onChange={(event: { target: HTMLInputElement }) => setQuery(event.target.value)} placeholder="Search local projects" type="search" value={query} />
      </section>
      {error ? <div className="error-banner"><strong>Project action failed</strong><span>{error}</span></div> : null}
      {filtered.length ? <div className="project-grid project-grid--wide">{filtered.map((project) => <ProjectCard key={project.id} project={project} nativeFileStatus={nativeStatus[project.id]} onBackup={(item) => void backup(item)} onChooseExternalBackup={(item) => void externalBackup(item, true)} onDelete={(item) => void remove(item)} onExternalBackup={(item) => void externalBackup(item)} onRename={(item) => void rename(item)} />)}</div> : <div className="empty-state"><strong>No matching projects</strong><p>Try a different project name or filename.</p></div>}
    </div>
  );
}

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "-").trim() || "local-pdf-project";
}
