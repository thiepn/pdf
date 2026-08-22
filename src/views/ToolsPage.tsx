import { useRef, useState } from "react";
import { navigateTo, routeHref } from "../core/appRouter";
import { importPdfProject } from "../projects/projectRepository";
import { rememberProjectSessionPassword } from "../security/sessionPasswords";
import { Icon, type IconName } from "../components/Icon";

type LocalTarget = "organizer" | "secure" | "ocr" | "compress" | "professional" | "toolbox";

const targetLabels: Record<LocalTarget, string> = { organizer: "organizer", secure: "Forms & Protect", ocr: "OCR", compress: "Optimize", professional: "print & advanced tools", toolbox: "PDF tools" };

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
  const ToolButton = ({ target, icon, title, description, primary = false }: { target: LocalTarget; icon: IconName; title: string; description: string; primary?: boolean }) => <button className={primary ? "tool-tile tool-tile--primary" : "tool-tile"} disabled={busy} onClick={() => chooseFile(target)} type="button"><span><Icon name={icon} size={24}/></span><div><strong>{title}</strong><p>{description}</p></div></button>;

  return <div className="tools-page">
    <section className="tools-hero"><p className="eyebrow">PDF tools</p><h2>Choose what you want to do.</h2><p>Everything runs locally in this browser. This page is for document tasks; diagnostics and recovery live in Help.</p></section>
    {error ? <div className="error-banner"><strong>Could not open the tool</strong><span>{error}</span></div> : null}
    {pendingFile ? <section className="password-panel"><div><strong>Password required</strong><span>{pendingFile.name}</span></div><input autoFocus autoComplete="off" onChange={(event) => setPassword(event.target.value)} placeholder="PDF password" type="password" value={password}/><button className="button" disabled={!password || busy} onClick={() => void openWorkspace(pendingFile, pendingTarget, password)} type="button">Open {targetLabels[pendingTarget]}</button><button className="button button--ghost" onClick={() => { setPendingFile(null); setPassword(""); setError(null); }} type="button">Cancel</button></section> : null}
    <section className="tool-category"><div className="section-heading"><div><p className="eyebrow">Organize and create</p><h2>Create, page, and scan tools</h2></div></div><div className="tool-grid">
      <a className="tool-tile tool-tile--primary" href={routeHref({ name: "create" })}><span><Icon name="create" size={24}/></span><div><strong>Create PDF</strong><p>Write Markdown, text, or semantic HTML and export a searchable or visual PDF.</p></div></a>
      <a className="tool-tile" href={routeHref({ name: "merge" })}><span><Icon name="merge" size={24}/></span><div><strong>Merge PDFs</strong><p>Combine complete PDFs in a chosen order.</p></div></a>
      <ToolButton description="Reorder, rotate, duplicate, delete, reverse, or extract pages." icon="pages" target="organizer" title="Organize pages"/>
      <a className="tool-tile" href={routeHref({ name: "scan" })}><span><Icon name="scan" size={24}/></span><div><strong>Scan to PDF</strong><p>Create a PDF from images or camera captures, with optional OCR.</p></div></a>
    </div></section>
    <section className="tool-category"><div className="section-heading"><div><p className="eyebrow">OCR and optimize</p><h2>Searchability and file size</h2></div></div><div className="tool-grid">
      <ToolButton description="Recognize scanned pages and generate searchable PDF output." icon="ocr" primary target="ocr" title="OCR PDF"/>
      <ToolButton description="Use lossless cleanup or stronger image-based compression." icon="compress" target="compress" title="Compress PDF"/>
      <a className="tool-tile" href={routeHref({ name: "batch" })}><span><Icon name="batch" size={24}/></span><div><strong>Batch automation</strong><p>Apply the same saved sequence of actions to several PDFs.</p></div></a>
    </div></section>
    <section className="tool-category"><div className="section-heading"><div><p className="eyebrow">Document utilities</p><h2>Decorate, crop, metadata, and convert</h2></div></div><div className="tool-grid">
      <ToolButton description="Add watermarks or page numbers, crop, insert blank pages, edit metadata, or export document content." icon="toolbox" primary target="toolbox" title="Document utilities"/>
      <ToolButton description="Document numbering, print layout and booklets, PDF layers, archive checks, and limited DOCX export." icon="professional" target="professional" title="Specialist document tools"/>
    </div></section>
    <section className="tool-category"><div className="section-heading"><div><p className="eyebrow">Forms, protection, and comparison</p><h2>Protect or compare documents</h2></div></div><div className="tool-grid">
      <ToolButton description="Fill forms, permanently apply redactions, remove risky active content, flatten, or add password protection." icon="secure" primary target="secure" title="Forms & Protect"/>
      <a className="tool-tile" href={routeHref({ name: "compare" })}><span><Icon name="compare" size={24}/></span><div><strong>Compare PDFs</strong><p>Match text or scanned pages, then compare them visually or by text.</p></div></a>
    </div></section>
    <input ref={inputRef} hidden accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openWorkspace(file, targetRef.current); event.target.value = ""; }} type="file"/>
    <section className="phase2-scope"><strong>Before using image-based tools</strong><p>OCR and image-based compression rebuild pages as images and may remove forms, links, annotations, digital signatures, or vector editability. Lossless operations preserve more of the original PDF structure.</p><a href={routeHref({ name: "maintenance" })}>Troubleshooting & recovery</a></section>
  </div>;
}
