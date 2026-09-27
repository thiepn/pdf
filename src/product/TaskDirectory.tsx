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
  { title: "Organize your pages", ids: ["merge-pdfs", "split-pdf", "organize-pages", "extract-pages", "remove-pages", "rotate-pdf", "crop-pages"] },
  { title: "Edit, fill & sign", ids: ["edit-pdf", "annotate-pdf", "fill-forms", "visual-signature", "add-page-numbers", "add-watermark"] },
  { title: "Convert & make smaller", ids: ["compress-pdf", "images-to-pdf", "pdf-to-jpg", "pdf-to-png", "pdf-to-text", "ocr-pdf", "scan-to-pdf", "create-pdf"] },
  { title: "Protect & review", ids: ["password-protect", "unlock-pdf", "apply-redactions", "compare-pdfs"] }
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
  const context = useMemo(() => createGenericTaskCapabilityContext(), []);
  const tasks = useMemo(() => pdfTasks.filter((task) => (!kind || acceptsTaskInput(task, kind, fileCount)) && evaluateTaskCapability(task, context).state !== "hidden"), [kind, fileCount, context]);
  const needle = query.trim();
  const matching = needle ? rankTasksByQuery(tasks, needle) : tasks;
  const officeQuery = /\b(word|docx?|excel|xlsx?|powerpoint|pptx?)\b/i.test(needle);
  function cards(items: PdfTask[]) {
    return <div className="product-tool-grid">{items.map((task) => {
      const route = taskRoute(task, projectId); if (!route) return null;
      const capability = evaluateTaskCapability(task, context);
      const blocked = isCapabilityBlocked(capability);
      const content = <><TaskGlyph task={task} /><span className="product-tool-card__body"><strong>{task.label}</strong><span>{taskCopy(task)}</span>{blocked ? <small>{capability.reason ?? capability.label}</small> : null}</span><span className="product-tool-card__arrow" aria-hidden="true">↗</span></>;
      return onChoose || blocked ? <button className="product-tool-card home-task-card" disabled={blocked} key={task.id} onClick={() => onChoose?.(task)} type="button">{content}</button> : <a className="product-tool-card home-task-card" href={routeHref(route)} key={task.id}>{content}</a>;
    })}</div>;
  }
  const byIds = (ids: string[]) => ids.flatMap((id) => { const task = tasks.find((item) => item.id === id); return task ? [task] : []; });
  const advanced = tasks.filter((task) => task.audience !== "everyday");
  return <div className={`product-directory${compact ? " product-directory--compact" : ""}`}>
    <div className="product-search" role="search"><Icon name="inspect" size={22} /><label className="visually-hidden" htmlFor={compact ? "document-tool-search" : "pdf-tool-search"}>Find a PDF tool</label><input id={compact ? "document-tool-search" : "pdf-tool-search"} autoComplete="off" type="search" placeholder="Search tools: merge, compress, remove pages…" value={query} onChange={(event) => setQuery(event.target.value)} />{needle ? <button aria-label="Clear tool search" onClick={() => setQuery("")} type="button"><Icon name="close" /></button> : <span className="product-search__hint">Search by what you need</span>}</div>
    {officeQuery ? <p className="product-message" role="status">Editable Word, Excel, and PowerPoint conversion is not implemented yet. Text and image export are different tools, not editable Office conversion.</p> : null}
    {needle ? <section aria-label="Tool search results"><div className="product-section-heading"><h2>Search results</h2><span role="status">{matching.length} {matching.length === 1 ? "tool" : "tools"}</span></div>{matching.length ? cards(matching) : <div className="product-empty"><Icon name="inspect" size={30} /><h3>No matching tool</h3><p>Try a task such as merge, sign, crop or rotate.</p><button className="button button--secondary" onClick={() => setQuery("")} type="button">Show tools</button></div>}</section> : home || kind ? <section aria-label={kind ? "Tools for your files" : "Popular PDF tasks"}><div className="product-section-heading"><h2>{kind ? "What would you like to do with these files?" : "Everyday PDF tools"}</h2>{!kind ? <a href={routeHref({ name: "tools" })}>See all tools <span aria-hidden="true">→</span></a> : null}</div>{cards(kind ? tasks.filter((task) => task.audience === "everyday") : byIds(popular))}</section> : <>{groups.map((group) => { const items = byIds(group.ids); return items.length ? <section className="product-tool-section" key={group.title}><div className="product-section-heading"><h2>{group.title}</h2></div>{cards(items)}</section> : null; })}
      {advanced.length ? <details className="product-advanced"><summary>More tools & troubleshooting <span>{advanced.length} tools</span></summary><p>Specialist tasks, document checks and recovery. Nothing here is needed for a simple PDF job.</p>{cards(advanced)}</details> : null}
    </>}
  </div>;
}
