import type { WorkspaceMode } from "../types/workspace";
export type AppRoute =
  | { name: "home" }
  | { name: "workspace"; projectId: string; mode: WorkspaceMode }
  | { name: "viewer"; projectId: string }
  | { name: "editor"; projectId: string }
  | { name: "secure"; projectId: string }
  | { name: "ocr"; projectId: string }
  | { name: "compress"; projectId: string }
  | { name: "inspector"; projectId: string }
  | { name: "repair"; projectId: string }
  | { name: "professional"; projectId: string }
  | { name: "preservation"; projectId: string }
  | { name: "native"; projectId: string }
  | { name: "compliance"; projectId: string }
  | { name: "organizer"; projectId: string }
  | { name: "toolbox"; projectId: string }
  | { name: "tools"; taskId?: string }
  | { name: "merge" }
  | { name: "scan" }
  | { name: "batch" }
  | { name: "compare" }
  | { name: "create" }
  | { name: "projects" }
  | { name: "settings" }
  | { name: "storage" }
  | { name: "diagnostics"; lab?: string }
  | { name: "release" }
  | { name: "validation" }
  | { name: "activity" }
  | { name: "maintenance" }
  | { name: "help" };

export function readAppRoute(hash = window.location.hash): AppRoute {
  const clean = hash.replace(/^#\/?/, "");
  const [name = "home", id] = clean.split("/").filter(Boolean);

  if (name === "workspace" && id) {
    const parts = clean.split("/").filter(Boolean);
    return { name: "workspace", projectId: decodeURIComponent(id), mode: normalizeWorkspaceMode(parts[2]) };
  }
  if (name === "viewer" && id) return { name: "viewer", projectId: decodeURIComponent(id) };
  if (name === "editor" && id) return { name: "editor", projectId: decodeURIComponent(id) };
  if (name === "secure" && id) return { name: "secure", projectId: decodeURIComponent(id) };
  if (name === "ocr" && id) return { name: "ocr", projectId: decodeURIComponent(id) };
  if (name === "compress" && id) return { name: "compress", projectId: decodeURIComponent(id) };
  if (name === "inspector" && id) return { name: "inspector", projectId: decodeURIComponent(id) };
  if (name === "repair" && id) return { name: "repair", projectId: decodeURIComponent(id) };
  if (name === "professional" && id) return { name: "professional", projectId: decodeURIComponent(id) };
  if (name === "preservation" && id) return { name: "preservation", projectId: decodeURIComponent(id) };
  if (name === "native" && id) return { name: "native", projectId: decodeURIComponent(id) };
  if (name === "compliance" && id) return { name: "compliance", projectId: decodeURIComponent(id) };
  if (name === "organizer" && id) return { name: "organizer", projectId: decodeURIComponent(id) };
  if (name === "toolbox" && id) return { name: "toolbox", projectId: decodeURIComponent(id) };
  if (name === "tools") return { name: "tools", taskId: id ? decodeURIComponent(id) : undefined };
  if (name === "merge") return { name: "merge" };
  if (name === "scan") return { name: "scan" };
  if (name === "batch") return { name: "batch" };
  if (name === "compare") return { name: "compare" };
  if (name === "create") return { name: "create" };
  if (name === "projects") return { name: "projects" };
  if (name === "settings") return { name: "settings" };
  if (name === "storage") return { name: "storage" };
  if (name === "diagnostics") return { name: "diagnostics", lab: id };
  if (name === "release") return { name: "release" };
  if (name === "validation") return { name: "validation" };
  if (name === "activity") return { name: "activity" };
  if (name === "maintenance") return { name: "maintenance" };
  if (name === "help") return { name: "help" };
  return { name: "home" };
}

export function routeHref(route: AppRoute): string {
  switch (route.name) {
    case "workspace": return `#/workspace/${encodeURIComponent(route.projectId)}/${route.mode}`;
    case "viewer": return `#/workspace/${encodeURIComponent(route.projectId)}/viewer`;
    case "editor": return `#/workspace/${encodeURIComponent(route.projectId)}/editor`;
    case "secure": return `#/workspace/${encodeURIComponent(route.projectId)}/secure`;
    case "ocr": return `#/workspace/${encodeURIComponent(route.projectId)}/ocr`;
    case "compress": return `#/workspace/${encodeURIComponent(route.projectId)}/compress`;
    case "inspector": return `#/workspace/${encodeURIComponent(route.projectId)}/inspector`;
    case "repair": return `#/workspace/${encodeURIComponent(route.projectId)}/repair`;
    case "professional": return `#/workspace/${encodeURIComponent(route.projectId)}/professional`;
    case "preservation": return `#/workspace/${encodeURIComponent(route.projectId)}/preservation`;
    case "native": return `#/workspace/${encodeURIComponent(route.projectId)}/native`;
    case "compliance": return `#/workspace/${encodeURIComponent(route.projectId)}/compliance`;
    case "organizer": return `#/workspace/${encodeURIComponent(route.projectId)}/organizer`;
    case "toolbox": return `#/workspace/${encodeURIComponent(route.projectId)}/toolbox`;
    /* Legacy cases below remain accepted by readAppRoute. */
    case "tools": return `#/tools${route.taskId ? `/${encodeURIComponent(route.taskId)}` : ""}`;
    case "merge": return "#/merge";
    case "scan": return "#/scan";
    case "batch": return "#/batch";
    case "compare": return "#/compare";
    case "create": return "#/create";
    case "projects": return "#/projects";
    case "settings": return "#/settings";
    case "storage": return "#/storage";
    case "diagnostics": return `#/diagnostics${route.lab ? `/${route.lab}` : ""}`;
    case "release": return "#/release";
    case "validation": return "#/validation";
    case "activity": return "#/activity";
    case "maintenance": return "#/maintenance";
    case "help": return "#/help";
    default: return "#/home";
  }
}

export function navigateTo(route: AppRoute): void {
  window.location.hash = routeHref(route).slice(1);
}

function normalizeWorkspaceMode(value?: string): WorkspaceMode {
  const modes: WorkspaceMode[] = ["viewer", "editor", "organizer", "secure", "ocr", "compress", "inspector", "repair", "professional", "preservation", "native", "compliance", "toolbox"];
  return modes.includes(value as WorkspaceMode) ? value as WorkspaceMode : "viewer";
}
