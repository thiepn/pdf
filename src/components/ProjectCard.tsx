import type { ProjectManifest } from "../types/project";
import { routeHref } from "../core/appRouter";

interface ProjectCardProps {
  project: ProjectManifest;
  onDelete?: (project: ProjectManifest) => void;
  onRename?: (project: ProjectManifest) => void;
  onBackup?: (project: ProjectManifest) => void;
}

export function ProjectCard({ project, onDelete, onRename, onBackup }: ProjectCardProps) {
  return (
    <article className="project-card">
      <a className="project-card__preview" href={routeHref({ name: "viewer", projectId: project.id })}>
        <span className="project-card__sheet">
          <strong>{project.summary.pageCount}</strong>
          <small>{project.summary.pageCount === 1 ? "page" : "pages"}</small>
        </span>
      </a>
      <div className="project-card__body">
        <div>
          <h3>{project.name}</h3>
          <p>{formatBytes(project.byteLength)} · Opened {formatRelative(project.lastOpenedAt)}</p>
        </div>
        <div className="project-card__badges">
          <span>{project.storageKind === "opfs" ? "Local file storage" : "Local browser storage"}</span>
          {project.summary.encrypted ? <span>Protected</span> : null}
          {project.recovery.dirty ? <span className="warning-chip">Local edits</span> : null}
        </div>
        <div className="project-card__actions">
          <a className="button button--small" href={routeHref({ name: "workspace", projectId: project.id, mode: "viewer" })}>Open workspace</a>
          {onRename ? <button className="button button--ghost button--small" onClick={() => onRename(project)} type="button">Rename</button> : null}
          {onBackup ? <button className="button button--ghost button--small" onClick={() => onBackup(project)} type="button">Backup</button> : null}
          {onDelete ? <button className="button button--danger-ghost button--small" onClick={() => onDelete(project)} type="button">Delete</button> : null}
        </div>
      </div>
    </article>
  );
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let current = value / 1024;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${current.toFixed(current >= 100 ? 0 : 1)} ${units[index]}`;
}

function formatRelative(timestamp: number): string {
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
