import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { readAppRoute, routeHref, type AppRoute } from "../core/appRouter";
import type { WorkspaceMode } from "../types/workspace";
import { workspaceModeLabel } from "../workspace/workspaceRepository";
import { useModalFocus } from "../accessibility/modalFocus";

const globalCommands: Array<{ label: string; description: string; route: AppRoute; keywords: string }> = [
  { label: "Home", description: "Open or continue a local document", route: { name: "home" }, keywords: "start open" },
  { label: "Tools", description: "Merge, scan, batch, compare, create, and convert PDFs", route: { name: "tools" }, keywords: "merge scan batch compare create" },
  { label: "Documents", description: "Manage local projects and backups", route: { name: "projects" }, keywords: "projects backup restore local" },
  { label: "Download history", description: "Review locally recorded downloads and file fingerprints", route: { name: "activity" }, keywords: "checksum receipt history export" },
  { label: "Troubleshooting & recovery", description: "Safe mode, offline repair, and support information", route: { name: "maintenance" }, keywords: "safe mode repair cache support" },
  { label: "Help", description: "Plain-language workflows, limitations, and shortcuts", route: { name: "help" }, keywords: "guide documentation shortcuts" },
  { label: "App self-check", description: "Run local browser and storage checks", route: { name: "validation" }, keywords: "validate test engines storage" },
  { label: "Settings", description: "Appearance, recovery, workspace, and privacy controls", route: { name: "settings" }, keywords: "theme privacy updates adaptive performance accessibility" }
];

const workspaceModes: WorkspaceMode[] = ["viewer", "editor", "organizer", "toolbox", "compress", "secure", "ocr", "compliance", "professional", "inspector", "repair", "preservation"];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closePalette = useCallback(() => setOpen(false), []);
  useModalFocus(open, dialogRef, closePalette, inputRef);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const commands = useMemo(() => {
    const route = readAppRoute();
    const documentRoute = "projectId" in route ? route : null;
    if (!documentRoute) return globalCommands;
    return [
      ...workspaceModes.map((mode) => ({
        label: `${workspaceModeLabel(mode)} current PDF`,
        description: `Switch the active document to ${workspaceModeLabel(mode)} mode`,
        route: { name: "workspace", projectId: documentRoute.projectId, mode } as AppRoute,
        keywords: `workspace document ${mode}`
      })),
      ...globalCommands
    ];
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((item) => `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(needle));
  }, [commands, query]);

  if (!open) return <button aria-haspopup="dialog" aria-label="Open command palette" className="command-palette-trigger" onClick={() => setOpen(true)} type="button"><span>Search commands</span><kbd>Ctrl K</kbd></button>;
  return <div className="command-palette-backdrop" onMouseDown={(event: MouseEvent<HTMLDivElement>) => { if (event.currentTarget === event.target) closePalette(); }} role="presentation">
    <section aria-describedby="command-palette-help" aria-labelledby="command-palette-title" aria-modal="true" className="command-palette" ref={dialogRef} role="dialog">
      <header><strong id="command-palette-title">Commands</strong><button aria-label="Close command palette" onClick={closePalette} type="button">×</button></header>
      <p className="visually-hidden" id="command-palette-help">Type to filter commands. Press Escape to close this dialog.</p>
      <input aria-controls="command-palette-results" aria-label="Search commands" onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search workspace modes, tools, projects, or help…" ref={inputRef} value={query}/>
      <nav aria-label="Command results" className="command-palette__results" id="command-palette-results">{results.length ? results.map((item) => <a href={routeHref(item.route)} key={`${item.label}-${routeHref(item.route)}`} onClick={closePalette}><strong>{item.label}</strong><span>{item.description}</span></a>) : <p aria-live="polite">No matching command.</p>}</nav>
    </section>
  </div>;
}
