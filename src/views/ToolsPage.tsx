import { useRef, useState } from "react";
import { navigateTo, routeHref } from "../core/appRouter";
import { importPdfProject } from "../projects/projectRepository";
import { rememberProjectSessionPassword } from "../security/sessionPasswords";
import { Icon, type IconName } from "../components/Icon";

type LocalTarget = "organizer" | "secure" | "ocr" | "compress" | "inspector" | "repair" | "professional" | "toolbox";

const targetLabels: Record<LocalTarget, string> = { organizer: "organizer", secure: "Forms & Protect", ocr: "OCR", compress: "Optimize", inspector: "Document details", repair: "Repair", professional: "print & advanced tools", toolbox: "PDF tools" };

export function ToolsPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const targetRef = useRef<LocalTarget>("organizer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingTarget, setPendingTarget] = useState<LocalTarget>("organizer");
  const [password, setPassword] = useState("");

  function chooseFile(target: LocalTarget): void { targetRef.current = target; inputRef.current?.click(); }
  async function openWorkspace(file: File, target: LocalTarget, suppliedPassword?: string): Promise<void> {
    setBusy(true); setError(null);
    try { const project = await importPdfProject(file, suppliedPassword); if (suppliedPassword) rememberProjectSessionPassword(project.id, suppliedPassword); navigateTo({ name: target, projectId: project.id } as any); }
    catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message) && !suppliedPassword) { setPendingFile(file); setPendingTarget(target); setError("This PDF requires a password. It is used only for this local session and is not stored."); }
      else setError(message);
    } finally { setBusy(false); }
  }
  const ToolButton = ({ target, icon, title, description, primary = false }: { target: LocalTarget; icon: IconName; title: string; description: string; primary?: boolean }) => <button className={primary ? "tool-tile tool-tile--primary" : "tool-tile"} disabled={busy} onClick={() => chooseFile(target)} type="button"><span><Icon name={icon} size={24}/></span><div><strong>{title}</strong><p>{description}</p></div><small>{busy ? "Opening…" : "Available"}</small></button>;

  return <div className="tools-page">
    <section className="tools-hero"><p className="eyebrow">PDF tools</p><h2>Choose what you want to do.</h2><p>Everything runs locally in this browser. Everyday tools are shown first; specialist diagnostics are kept under Advanced tools.</p></section>
    {error ? <div className="error-banner"><strong>Could not open the tool</strong><span>{error}</span></div> : null}
    {pendingFile ? <section className="password-panel"><div><strong>Password required</strong><span>{pendingFile.name}</span></div><input autoFocus autoComplete="off" onChange={(event) => setPassword(event.target.value)} placeholder="PDF password" type="password" value={password}/><button className="button" disabled={!password || busy} onClick={() => void openWorkspace(pendingFile, pendingTarget, password)} type="button">Open {targetLabels[pendingTarget]}</button><button className="button button--ghost" onClick={() => { setPendingFile(null); setPassword(""); setError(null); }} type="button">Cancel</button></section> : null}
    <section className="tool-category"><div className="section-heading"><div><p className="eyebrow">Organize and create</p><h2>Create, page, and scan tools</h2></div></div><div className="tool-grid">
      <a className="tool-tile tool-tile--primary" href={routeHref({ name: "create" })}><span><Icon name="create" size={24}/></span><div><strong>Create PDF</strong><p>Write Markdown, text, or semantic HTML with metric page controls and export a searchable or visual PDF.</p></div><small>Write or paste content</small></a>
      <a className="tool-tile" href={routeHref({ name: "merge" })}><span><Icon name="merge" size={24}/></span><div><strong>Merge PDFs</strong><p>Combine complete PDFs in a chosen order.</p></div><small>Available</small></a>
      <ToolButton description="Reorder, rotate, duplicate, delete, reverse, or extract pages." icon="pages" target="organizer" title="Organize, split, and extract"/>
      <a className="tool-tile" href={routeHref({ name: "scan" })}><span><Icon name="scan" size={24}/></span><div><strong>Scan to PDF</strong><p>Create a PDF from images or camera captures, with optional OCR.</p></div><small>Available</small></a>
    </div></section>
    <section className="tool-category"><div className="section-heading"><div><p className="eyebrow">OCR and optimize</p><h2>Searchability and file size</h2></div></div><div className="tool-grid">
      <ToolButton description="Recognize scanned pages and generate searchable PDF output." icon="ocr" primary target="ocr" title="OCR PDF"/>
      <ToolButton description="Use lossless cleanup or stronger raster compression profiles." icon="compress" target="compress" title="Optimize PDF"/>
      <a className="tool-tile" href={routeHref({ name: "batch" })}><span><Icon name="batch" size={24}/></span><div><strong>Batch automation</strong><p>Apply the same saved sequence of actions to several PDFs.</p></div><small>Available</small></a>
    </div></section>
    <section className="tool-category"><div className="section-heading"><div><p className="eyebrow">Everyday toolbox</p><h2>Decorate, crop, metadata, and convert</h2></div></div><div className="tool-grid">
      <ToolButton description="Add watermarks, headers, footers, and page numbers; crop pages; insert blank pages; edit metadata; export text, Markdown, HTML, or page images." icon="toolbox" primary target="toolbox" title="PDF utilities"/>
      <ToolButton description="Advanced content replacement, document numbering, print layout/booklets, layers, and archive checks." icon="professional" target="professional" title="Print & Advanced"/>
    </div></section>
    <section className="tool-category"><div className="section-heading"><div><p className="eyebrow">Forms, protection, and comparison</p><h2>Protect or compare documents</h2></div></div><div className="tool-grid">
      <ToolButton description="Fill forms, permanently apply redactions, remove risky active content, flatten, or add password protection." icon="secure" primary target="secure" title="Forms & Protect"/>
      <details className="tool-advanced-disclosure"><summary>Advanced tools</summary><div className="tool-grid tool-grid--nested">
        <ToolButton description="Inspect fonts, images, forms, actions, signatures, revisions, and other technical PDF structure." icon="inspect" target="inspector" title="Inspect PDF structure"/>
        <ToolButton description="Rewrite a separate clean copy when a PDF is damaged or behaves unexpectedly." icon="repair" target="repair" title="Repair PDF"/>
      </div></details>
      <a className="tool-tile" href={routeHref({ name: "compare" })}><span><Icon name="compare" size={24}/></span><div><strong>Compare PDFs</strong><p>Hybrid-align text or scanned pages, then compare matched pages visually or by text.</p></div><small>Text and scanned PDFs</small></a>
    </div></section>
    <input ref={inputRef} hidden accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openWorkspace(file, targetRef.current); event.target.value = ""; }} type="file"/>
    <section className="phase2-scope"><strong>Before using image-based tools</strong><p>Raster OCR and raster compression intentionally rebuild pages as images. They do not preserve interactive forms, links, annotations, cryptographic signatures, or vector editability. Lossless optimization, inspection, repair, and Forms & Protect keep working from the original PDF structure.</p></section>
  </div>;
}
