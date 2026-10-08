import { useMemo, useState } from "react";
import { routeHref } from "../core/appRouter";
import { Icon } from "../components/Icon";
import { pdfTasks, taskRoute, type PdfTask } from "../ia/taskCatalog";
import { rankTasksByQuery } from "../ia/taskSearch";
import { createGenericTaskCapabilityContext, evaluateTaskCapability, isCapabilityBlocked } from "../capabilities/taskCapability";
import { TaskGlyph } from "./TaskGlyph";
import { acceptsTaskInput, type InputKind } from "./fileHandoff";

const popular = ["merge-pdfs", "split-pdf", "compress-pdf", "edit-pdf", "images-to-pdf", "pdf-to-jpg", "organize-pages", "visual-signature", "extract-pages", "remove-pages", "ocr-pdf", "fill-forms"];
const groups = [
  { id: "pages", filter: "Pages", title: "Organize your pages", ids: ["merge-pdfs", "split-pdf", "organize-pages", "extract-pages", "remove-pages", "rotate-pdf", "crop-pages"] },
  { id: "edit", filter: "Edit & sign", title: "Edit, fill & sign", ids: ["edit-pdf", "annotate-pdf", "fill-forms", "visual-signature", "add-page-numbers", "add-watermark"] },
  { id: "convert", filter: "Convert", title: "Convert & make smaller", ids: ["compress-pdf", "images-to-pdf", "pdf-to-jpg", "pdf-to-png", "pdf-to-text", "pdf-to-docx", "ocr-pdf", "scan-to-pdf", "create-pdf"] },
  { id: "protect", filter: "Protect & review", title: "Read, protect & review", ids: ["read-pdf", "password-protect", "unlock-pdf", "flatten-pdf", "remove-metadata", "sanitize-pdf", "apply-redactions", "compare-pdfs", "repair-pdf"] }
];
const shortCopy: Record<string, string> = {
  "merge-pdfs": "Combine PDFs and images, in your order.", "split-pdf": "Break one PDF into separate files.",
  "compress-pdf": "Make your file smaller, with clear quality choices.", "edit-pdf": "Add content or change supported PDF text and images.",
  "images-to-pdf": "Turn your photos and images into PDF pages.", "pdf-to-jpg": "Save PDF pages as JPG images.",
  "organize-pages": "Insert, replace, reorder, rotate or remove pages.", "visual-signature": "Place a signature on your document.",
  "extract-pages": "Keep just the pages you need.", "remove-pages": "Remove unwanted pages. Keep the rest.",
  "ocr-pdf": "Make scanned text searchable and selectable.", "fill-forms": "Fill in existing interactive form fields.",
  "rotate-pdf": "Turn sideways pages the right way up.", "pdf-to-png": "Save PDF pages as PNG images.",
  "password-protect": "Add a password to protect your PDF.", "unlock-pdf": "Remove a password you already know."
};
export function taskCopy(task: PdfTask): string { return shortCopy[task.id] ?? task.description; }
interface Props { home?: boolean; compact?: boolean; projectId?: string; kind?: InputKind; fileCount?: number; onChoose?: (task: PdfTask) => void; }
export function TaskDirectory({ home = false, compact = false, projectId, kind, fileCount, onChoose }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const context = useMemo(() => createGenericTaskCapabilityContext(), []);
  const tasks = useMemo(() => pdfTasks.filter((task) => (!kind || acceptsTaskInput(task, kind, fileCount)) && evaluateTaskCapability(task, context).state !== "hidden"), [kind, fileCount, context]);
  const needle = query.trim();
  // Search always checks the full compatible catalog. A previous category choice
  // must never silently conceal a high-confidence natural-language result.
  const matching = needle ? rankTasksByQuery(tasks, needle) : tasks;
  const officeQuery = /\b(word|docx?|excel|xlsx?|powerpoint|pptx?)\b/i.test(needle);
  const fullCatalog = !home && !compact && !kind;
  const categoryGroups = category === "all" ? groups : groups.filter((group) => group.id === category);
  function cards(items: PdfTask[]) {
    return <div className="product-tool-grid">{items.map((task) => {
      const route = taskRoute(task, projectId); if (!route) return null;
      const capability = evaluateTaskCapability(task, context);
      const blocked = isCapabilityBlocked(capability);
      const content = <><TaskGlyph task={task} /><span className="product-tool-card__body">
        <strong>{task.label}</strong><span>{taskCopy(task)}</span>
        {capability.state !== "available" ? <small className="product-tool-card__caution">{capability.label}{capability.reason ? ` · ${capability.reason}` : ""}</small> : null}
        {blocked && capability.recovery ? <small className="product-tool-card__recovery">{capability.recovery}</small> : null}
      </span>
      {blocked ? <span className="product-tool-card__blocked-label">Unavailable</span> : <span className="product-tool-card__arrow" aria-hidden="true">↗</span>}</>;
      // Disabled buttons cannot receive keyboard focus or explain why a task is
      // unavailable. Expose unavailable tools as named, non-actionable content.
      if (blocked) return <div className="product-tool-card home-task-card product-tool-card--blocked" key={task.id} role="group" aria-label={`${task.label} unavailable`}>{content}</div>;
      return onChoose ? <button className="product-tool-card home-task-card" key={task.id} onClick={() => onChoose(task)} type="button">{content}</button>
        : <a className="product-tool-card home-task-card" href={routeHref(route)} key={task.id}>{content}</a>;
    })}</div>;
  }
  const byIds = (ids: string[]) => ids.flatMap((id) => { const task = tasks.find((item) => item.id === id); return task ? [task] : []; });
  const groupedIds = new Set(groups.flatMap((group) => group.ids));
  const advanced = tasks.filter((task) => !groupedIds.has(task.id));
  const shownGroups = categoryGroups.map((group) => ({ ...group, items: byIds(group.ids) })).filter((group) => group.items.length);
  const categoryCount = shownGroups.reduce((total, group) => total + group.items.length, 0);
  return <div className={`product-directory product-directory--d2${home ? " product-directory--home" : ""}${fullCatalog ? " product-directory--library" : ""}${compact ? " product-directory--compact" : ""}`}>
    <div className="product-discovery-toolbar">
      <div className="product-search" role="search">
        <Icon name="inspect" size={20} />
        <label className="visually-hidden" htmlFor={compact ? "document-tool-search" : "pdf-tool-search"}>Find a PDF tool</label>
        <input id={compact ? "document-tool-search" : "pdf-tool-search"} autoComplete="off" type="search" placeholder="What do you need to do? Try “remove pages”" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); setQuery(""); } }} />
        {needle ? <button aria-label="Clear tool search" onClick={() => setQuery("")} type="button"><Icon name="close" /></button> : <span className="product-search__hint">Search actions</span>}
      </div>
      {fullCatalog && !needle ? <div className="product-discovery-scope" aria-label="Filter PDF tools">
        <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>All tools</button>
        {groups.map((group) => <button type="button" key={group.id} aria-pressed={category === group.id} onClick={() => setCategory(group.id)}>{group.filter}</button>)}
      </div> : null}
    </div>
    {officeQuery ? <p className="product-message" role="status">PDF to Word reconstructs editable paragraphs, common tables, images, page geometry and supported styling locally. Exact PDF line wrapping, complex drawings, Excel/PowerPoint conversion and Office-file import remain outside this tool.</p> : null}
    {needle ? <section aria-label="Tool search results">
      <div className="product-section-heading"><h2>Search results</h2><span role="status" aria-live="polite">{matching.length} {matching.length === 1 ? "tool" : "tools"}</span></div>
      {matching.length ? cards(matching) : <div className="product-empty"><Icon name="inspect" size={26} /><h3>No matching tool</h3><p>Try a different action, such as merging files or recognizing scanned text.</p>
        <div className="product-discovery-suggestions" aria-label="Suggested searches">{["merge", "edit", "compress", "ocr"].map((word) => <button onClick={() => setQuery(word)} type="button" key={word}>{word}</button>)}</div>
        <button className="button button--secondary" onClick={() => setQuery("")} type="button">Show all tools</button>
      </div>}
    </section> : home || kind ? <section aria-label={kind ? "Tools for your files" : "Popular PDF tasks"}>
      <div className="product-section-heading"><h2>{kind ? "What would you like to do with these files?" : "Everyday PDF tools"}</h2>{!kind ? <a href={routeHref({ name: "tools" })}>See all tools <span aria-hidden="true">→</span></a> : null}</div>
      {cards(kind ? tasks.filter((task) => task.audience === "everyday") : byIds(popular))}
      {kind && tasks.some((task) => task.audience !== "everyday") ? <details className="product-advanced"><summary>More tools for these files</summary>{cards(tasks.filter((task) => task.audience !== "everyday"))}</details> : null}
    </section> : <>
      <p className="product-discovery-count" role="status" aria-live="polite">{category === "all" ? `${tasks.length} available or inspectable tools, organized by task` : `${categoryCount} ${categoryCount === 1 ? "tool" : "tools"} in ${groups.find((group) => group.id === category)?.filter ?? "this category"}`}</p>
      {shownGroups.map((group) => <section className="product-tool-section" aria-label={group.title} key={group.id}><div className="product-section-heading"><h2>{group.title}</h2><span>{group.items.length} tools</span></div>{cards(group.items)}</section>)}
      {category === "all" && advanced.length ? <details className="product-advanced"><summary>More tools & troubleshooting <span>{advanced.length} tools</span></summary><p>Advanced inspection, recovery and specialized workflows. These are not needed for routine PDF work.</p>{cards(advanced)}</details> : null}
    </>}
  </div>;
}
