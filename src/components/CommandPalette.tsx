import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { readAppRoute, routeHref, type AppRoute } from "../core/appRouter";
import { pdfTasks, taskCategories, taskRoute } from "../ia/taskCatalog";
import { searchMatchScore, taskMatchScore, taskQuerySearchText } from "../ia/taskSearch";
import { getDocumentTaskLauncher } from "../product/documentTaskLauncher";
import { useModalFocus } from "../accessibility/modalFocus";

interface CommandItem {
  id: string;
  label: string;
  description: string;
  route: AppRoute;
  searchText: string;
  defaultVisible: boolean;
  taskId?: string;
}

interface CommandPaletteProps {
  showTrigger?: boolean;
}

const globalCommands: CommandItem[] = [
  { id: "home", label: "Home", description: "Open or continue a local document", route: { name: "home" }, searchText: "home start open continue recent", defaultVisible: true },
  { id: "documents", label: "Documents", description: "Manage local PDF projects and backups", route: { name: "projects" }, searchText: "documents projects backup restore local files", defaultVisible: true },
  { id: "tools", label: "All PDF tools", description: "Browse PDF tasks by what you want to accomplish", route: { name: "tools" }, searchText: "tools tasks actions pdf", defaultVisible: true },
  { id: "help", label: "Help", description: "Search workflows, limitations, and shortcuts", route: { name: "help" }, searchText: "guide documentation shortcuts help how", defaultVisible: true },
  { id: "settings", label: "Settings", description: "Appearance, recovery, viewer, and privacy controls", route: { name: "settings" }, searchText: "settings theme privacy updates performance accessibility", defaultVisible: false },
  { id: "maintenance", label: "Troubleshooting & recovery", description: "Recover projects or repair the application when something goes wrong", route: { name: "maintenance" }, searchText: "safe mode recovery cache support troubleshoot broken app", defaultVisible: false }
];

export function CommandPalette({ showTrigger = true }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
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

  useEffect(() => { if (!open) { setQuery(""); setError(""); } }, [open]);

  const commands = useMemo(() => {
    const route = readAppRoute();
    const projectId = "projectId" in route ? route.projectId : undefined;
    const taskCommands: CommandItem[] = pdfTasks.map((task) => {
      const target = taskRoute(task, projectId);
      const category = taskCategories.find((item) => item.id === task.category)?.label ?? "PDF task";
      return {
        id: `task:${task.id}`,
        taskId: task.id,
        label: task.label,
        description: projectId || task.target.kind === "route" ? task.description : `${task.description} Choose a PDF to continue.`,
        route: target ?? { name: "tools", taskId: task.id },
        searchText: `${taskQuerySearchText(task)} ${category.toLowerCase()}`,
        defaultVisible: task.audience === "everyday"
      };
    });
    return [...taskCommands, ...globalCommands];
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim();
    if (!needle) return commands.filter((item) => item.defaultVisible).slice(0, 14);
    return commands
      .map((item, index) => {
        const task = item.taskId ? pdfTasks.find((candidate) => candidate.id === item.taskId) : undefined;
        const score = task
          ? taskMatchScore(task, needle)
          : searchMatchScore(`${item.label} ${item.description} ${item.searchText}`, needle);
        return { item, index, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, 24)
      .map((entry) => entry.item);
  }, [commands, query]);

  function navigateResults(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.nativeEvent.isComposing) return;
    const links = Array.from(dialogRef.current?.querySelectorAll<HTMLAnchorElement>(".command-palette__results a") ?? []);
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.target === inputRef.current && event.key === "Enter") {
      event.preventDefault();
      links[0]?.click();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && !(current >= 0 && (event.key === "Home" || event.key === "End"))) return;
    event.preventDefault();
    if (!links.length) return;
    if (current === 0 && event.key === "ArrowUp") { inputRef.current?.focus(); return; }
    const index = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1
      : current < 0 ? (event.key === "ArrowUp" ? links.length - 1 : 0)
      : Math.max(0, Math.min(links.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
    links[index].focus();
    links[index].scrollIntoView({ block: "nearest" });
  }

  function chooseCommand(event: MouseEvent<HTMLAnchorElement>, item: CommandItem): void {
    const route = readAppRoute();
    const task = item.taskId ? pdfTasks.find((candidate) => candidate.id === item.taskId) : undefined;
    if (route.name === "workspace" && task) {
      event.preventDefault();
      const launch = getDocumentTaskLauncher(route.projectId);
      if (!launch) { setError("The document is still opening. Try again when it is ready."); return; }
      // Leave the document mounted until its current edits have been exported.
      closePalette();
      void launch(task);
      return;
    }
    closePalette();
  }

  if (!open) {
    if (!showTrigger) return null;
    return <button aria-haspopup="dialog" aria-label="Open command palette" className="command-palette-trigger" onClick={() => setOpen(true)} ref={triggerRef} type="button"><span>Find a tool</span><kbd>Ctrl K</kbd></button>;
  }

  return <div className="command-palette-backdrop" onMouseDown={(event: MouseEvent<HTMLDivElement>) => { if (event.currentTarget === event.target) closePalette(); }} role="presentation">
    <section aria-describedby="command-palette-help" aria-labelledby="command-palette-title" aria-modal="true" className="command-palette" ref={dialogRef} role="dialog">
      <header><div><strong id="command-palette-title">Find a PDF task</strong><span>Search by outcome, not menu name</span></div><button aria-label="Close command palette" onClick={closePalette} type="button">×</button></header>
      <p className="visually-hidden" id="command-palette-help">Type what you want to do. Use the arrow keys to browse results, Enter to open a task, or Escape to close.</p>
      <input aria-describedby="command-palette-help" onKeyDown={navigateResults} aria-controls="command-palette-results" aria-label="Search PDF tasks" onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Try “make this PDF smaller”, “remove pages 4 through 7”, “sign this”, or “make this scan searchable”…" ref={inputRef} value={query}/>
      {error ? <p role="alert">{error}</p> : null}
      <nav onKeyDown={navigateResults} aria-label="Command results" className="command-palette__results" id="command-palette-results">{results.length ? results.map((item) => <a href={routeHref(item.route)} key={item.id} onClick={(event) => chooseCommand(event, item)}><strong>{item.label}</strong><span>{item.description}</span></a>) : <p aria-live="polite">No matching task. Try a broader verb such as edit, pages, protect, convert, or compare.</p>}</nav>
    </section>
  </div>;
}
