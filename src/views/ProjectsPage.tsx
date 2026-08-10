import { useEffect, useState } from "react";
import { ProjectCard } from "../components/ProjectCard";
import { downloadBlob } from "../projects/download";
import { deleteProject, exportProjectPackage, listProjects, renameProject } from "../projects/projectRepository";
import type { ProjectManifest } from "../types/project";
import { readSettings } from "../settings/settingsStore";
import { deleteWorkspaceProjectData } from "../workspace/workspaceRepository";

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectManifest[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void refresh(); }, []);
  async function refresh(): Promise<void> { setProjects(await listProjects()); }

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

  const filtered = projects.filter((project) => `${project.name} ${project.sourceFilename}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));

  return (
    <div className="stack">
      <section className="projects-toolbar">
        <div><strong>{projects.length} local {projects.length === 1 ? "project" : "projects"}</strong><span>Stored only in this browser profile.</span></div>
        <input aria-label="Search projects" onChange={(event: { target: HTMLInputElement }) => setQuery(event.target.value)} placeholder="Search local projects" type="search" value={query} />
      </section>
      {error ? <div className="error-banner"><strong>Backup failed</strong><span>{error}</span></div> : null}
      {filtered.length ? <div className="project-grid project-grid--wide">{filtered.map((project) => <ProjectCard key={project.id} project={project} onBackup={(item) => void backup(item)} onDelete={(item) => void remove(item)} onRename={(item) => void rename(item)} />)}</div> : <div className="empty-state"><strong>No matching projects</strong><p>Try a different project name or filename.</p></div>}
    </div>
  );
}

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "-").trim() || "local-pdf-project";
}
