import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { readAppRoute, routeHref, type AppRoute } from "../core/appRouter";
import { pdfTasks, taskCategories, taskRoute, taskSearchText } from "../ia/taskCatalog";
import { useModalFocus } from "../accessibility/modalFocus";

interface CommandItem {
  id: string;
  label: string;
  description: string;
  route: AppRoute;
  searchText: string;
  defaultVisible: boolean;
}

const globalCommands: CommandItem[] = [
  { id: "home", label: "Home", description: "Open or continue a local document", route: { name: "home" }, searchText: "home start open continue recent", defaultVisible: true },
  { id: "documents", label: "Documents", description: "Manage local PDF projects and backups", route: { name: "projects" }, searchText: "documents projects backup restore local files", defaultVisible: true },
  { id: "tools", label: "All PDF tools", description: "Browse PDF tasks by what you want to accomplish", route: { name: "tools" }, searchText: "tools tasks actions pdf", defaultVisible: true },
  { id: "help", label: "Help", description: "Search workflows, limitations, and shortcuts", route: { name: "help" }, searchText: "guide documentation shortcuts help how", defaultVisible: true },
  { id: "settings", label: "Settings", description: "Appearance, recovery, viewer, and privacy controls", route: { name: "settings" }, searchText: "settings theme privacy updates performance accessibility", defaultVisible: false },
  { id: "maintenance", label: "Troubleshooting & recovery", description: "Recover projects or repair the application when something goes wrong", route: { name: "maintenance" }, searchText: "safe mode recovery cache support troubleshoot broken app", defaultVisible: false }
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closePalette = useCallback(() => setOpen(false), []);
  useModalFocus(open, dialogRef, closePalette, inputRef, triggerRef);

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
    const projectId = "projectId" in route ? route.projectId : undefined;
    const taskCommands: CommandItem[] = pdfTasks.map((task) => {
      const target = taskRoute(task, projectId);
      const category = taskCategories.find((item) => item.id === task.category)?.label ?? "PDF task";
      return {
        id: `task:${task.id}`,
        label: task.label,
        description: projectId || task.target.kind === "route" ? task.description : `${task.description} Choose a PDF to continue.`,
        route: target ?? { name: "tools", taskId: task.id },
        searchText: `${taskSearchText(task)} ${category.toLowerCase()}`,
        defaultVisible: task.audience === "everyday"
      };
    });
    return [...taskCommands, ...globalCommands];
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands.filter((item) => item.defaultVisible).slice(0, 14);
    return commands.filter((item) => `${item.label} ${item.description} ${item.searchText}`.toLowerCase().includes(needle)).slice(0, 24);
  }, [commands, query]);

  if (!open) return <button aria-haspopup="dialog" aria-label="Open command palette" className="command-palette-trigger" onClick={() => setOpen(true)} ref={triggerRef} type="button"><span>Find a PDF task</span><kbd>Ctrl K</kbd></button>;

  const palette = <div className="command-palette-backdrop" onMouseDown={(event: MouseEvent<HTMLDivElement>) => { if (event.currentTarget === event.target) closePalette(); }} role="presentation">
    <section aria-describedby="command-palette-help" aria-labelledby="command-palette-title" aria-modal="true" className="command-palette" ref={dialogRef} role="dialog">
      <header><div><strong id="command-palette-title">Find a PDF task</strong><span>Search by outcome, not menu name</span></div><button aria-label="Close command palette" onClick={closePalette} type="button">×</button></header>
      <p className="visually-hidden" id="command-palette-help">Type what you want to do. Press Escape to close this dialog.</p>
      <input aria-controls="command-palette-results" aria-label="Search PDF tasks" onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Try “crop”, “remove metadata”, “sign”, “OCR”, or “split”…" ref={inputRef} value={query}/>
      <nav aria-label="Command results" className="command-palette__results" id="command-palette-results">{results.length ? results.map((item) => <a href={routeHref(item.route)} key={item.id} onClick={closePalette}><strong>{item.label}</strong><span>{item.description}</span></a>) : <p aria-live="polite">No matching task. Try a broader verb such as edit, pages, protect, convert, or compare.</p>}</nav>
    </section>
  </div>;

  return createPortal(palette, document.body);
}
