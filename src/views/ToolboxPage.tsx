import { useEffect, useMemo, useRef, useState } from "react";
import { openPdfWithPdfJs } from "../engines/pdfjs";
import { navigateTo } from "../core/appRouter";
import { downloadBlob } from "../projects/download";
import { createDerivedProjectFromBytes, getProject, loadProjectBytes } from "../projects/projectRepository";
import { runProjectOperation } from "../operations/projectOperationCoordinator";
import { exportPdfHtml, exportPdfImagesZip, exportPdfMarkdown, exportPdfSplitZip, exportPdfText } from "../toolbox/exporters";
import { rasterTransformPdf, RASTER_PROFILES } from "../processing/rasterCompression";
import { transformPdf } from "../toolbox/toolboxClient";
import { mmToPt } from "../toolbox/toolboxModel";
import type { ToolboxMetadata, ToolboxTransformOptions } from "../types/toolbox";

const fileBase = (name: string) => name.replace(/\.pdf$/i, "") || "document";
const EMPTY_METADATA: ToolboxMetadata = { title: "", author: "", subject: "", keywords: "" };

type Tab = "decorate" | "pages" | "metadata" | "convert";

export function ToolboxPage({ projectId, onTitleChange }: { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }) {
  const [tab, setTab] = useState<Tab>("decorate");
  const [name, setName] = useState("document");
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [password, setPassword] = useState("");
  const [metadata, setMetadata] = useState<ToolboxMetadata>(EMPTY_METADATA);
  const [removeMetadata, setRemoveMetadata] = useState(false);
  const [crop, setCrop] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [blank, setBlank] = useState({ enabled: false, position: "end" as "start" | "end", count: 1, width: 210, height: 297 });
  const [decoration, setDecoration] = useState({ watermarkText: "", headerText: "", footerText: "", pageNumbers: false, startNumber: 1, fontSize: 10, margin: 10, fontLanguage: "auto" as "auto" | "ko" | "ja" | "zh-Hans" | "zh-Hant" });
  const [splitPages, setSplitPages] = useState(10);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const project = await getProject(projectId); if (!project) throw new Error("Project not found.");
        const source = await loadProjectBytes(project); if (cancelled) return;
        setName(project.name); setBytes(source); onTitleChange?.(project.name, "Toolbox · decorate, crop, metadata, and local conversions");
        try {
          const pdf = await openPdfWithPdfJs(source);
          try {
            const result = await pdf.getMetadata(); const info = result.info as Record<string, unknown>;
            if (!cancelled) setMetadata({ title: String(info.Title ?? ""), author: String(info.Author ?? ""), subject: String(info.Subject ?? ""), keywords: String(info.Keywords ?? "") });
          } finally { await pdf.loadingTask.destroy(); }
        } catch { /* encrypted files can be opened after password is supplied */ }
      } catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); }
    })();
    return () => { cancelled = true; abortRef.current?.abort(); };
  }, [onTitleChange, projectId]);

  const cropEnabled = useMemo(() => Object.values(crop).some((value) => value > 0), [crop]);
  const decorationEnabled = useMemo(() => Boolean(decoration.watermarkText || decoration.headerText || decoration.footerText || decoration.pageNumbers), [decoration]);

  async function createOutput(options: ToolboxTransformOptions, suffix: string): Promise<void> {
    if (!bytes) return; setBusy(true); setError(null); setWarnings([]); setProgress("Transforming PDF…"); const controller = new AbortController(); abortRef.current = controller;
    try {
      await runProjectOperation(projectId, { label: `Creating ${suffix.replaceAll("-", " ")} revision`, signal: controller.signal, reserveBytes: bytes.byteLength }, async ({ signal, update }) => {
      update({ detail: "Transforming PDF…", progress: 0.08 });
      const result = await transformPdf(bytes, options, password || undefined, signal);
      setWarnings(result.report.warnings); setProgress("Validating and creating revision…");
      update({ stage: "committing", detail: "Validating storage and saving a new revision…", progress: 0.88 });
      const project = await createDerivedProjectFromBytes(projectId, result.bytes, `${fileBase(name)}-${suffix}.pdf`, `toolbox-${suffix}`, "application/pdf", password || undefined);
      update({ progress: 1 });
      navigateTo({ name: "workspace", projectId: project.id, mode: "toolbox" });
      });
    } catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); setProgress(""); abortRef.current = null; }
  }

  async function exportFile(kind: "text" | "markdown" | "html" | "images" | "split"): Promise<void> {
    if (!bytes) return; setBusy(true); setError(null); const controller = new AbortController(); abortRef.current = controller;
    try {
      await runProjectOperation(projectId, { label: `Exporting ${kind === "images" ? "page images" : kind === "split" ? "split PDFs" : kind.toUpperCase()}`, signal: controller.signal }, async ({ signal, update }) => {
      update({ detail: "Preparing local export…", progress: 0.05 });
      if (kind === "text") { setProgress("Extracting text…"); downloadBlob(new Blob([await exportPdfText(bytes, password || undefined)], { type: "text/plain;charset=utf-8" }), `${fileBase(name)}.txt`); }
      if (kind === "markdown") { setProgress("Building Markdown…"); downloadBlob(new Blob([await exportPdfMarkdown(bytes, name, password || undefined)], { type: "text/markdown;charset=utf-8" }), `${fileBase(name)}.md`); }
      if (kind === "html") { setProgress("Building HTML…"); downloadBlob(new Blob([await exportPdfHtml(bytes, name, password || undefined)], { type: "text/html;charset=utf-8" }), `${fileBase(name)}.html`); }
      if (kind === "images") { setProgress("Rendering pages…"); const zip = await exportPdfImagesZip(bytes, 2, signal, (done,total)=>{ const value=done/total; setProgress(`Rendering page ${done}/${total}…`); update({ detail:`Rendering page ${done}/${total}…`, progress:value }); }, password || undefined); downloadBlob(new Blob([Uint8Array.from(zip).buffer], { type: "application/zip" }), `${fileBase(name)}-pages.zip`); }
      if (kind === "split") { setProgress("Splitting PDF…"); const zip = await exportPdfSplitZip(bytes, splitPages, password || undefined, signal, (done,total)=>{ const value=done/total; setProgress(`Building part ${done}/${total}…`); update({ detail:`Building part ${done}/${total}…`, progress:value }); }); downloadBlob(new Blob([Uint8Array.from(zip).buffer], { type: "application/zip" }), `${fileBase(name)}-split.zip`); }
      update({ progress: 1 });
      });
    } catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); setProgress(""); abortRef.current = null; }
  }

  async function createGrayscaleRevision(): Promise<void> {
    if (!bytes) return; setBusy(true); setError(null); setWarnings(["Grayscale output is rasterized and intentionally loses searchable text, forms, links, annotations, layers, signatures, and vector editability."]); const controller = new AbortController(); abortRef.current = controller;
    try {
      await runProjectOperation(projectId, { label: "Creating grayscale PDF", signal: controller.signal, reserveBytes: bytes.byteLength }, async ({ signal, update }) => {
      setProgress("Rendering grayscale pages…"); update({ detail: "Rendering grayscale pages…", progress: 0.02 });
      const pdf = await openPdfWithPdfJs(bytes, password || undefined);
      let output: Uint8Array;
      try {
        const profile = RASTER_PROFILES.find((item) => item.id === "balanced"); if (!profile) throw new Error("Balanced raster profile is unavailable.");
        output = await rasterTransformPdf(pdf, profile, { grayscale: true }, signal, (done,total)=>{ const value=done/total; setProgress(`Rendering grayscale page ${done}/${total}…`); update({ detail:`Rendering grayscale page ${done}/${total}…`, progress:Math.min(.82,value*.82) }); });
      } finally { await pdf.loadingTask.destroy(); }
      setProgress("Validating and creating revision…"); update({ stage: "committing", detail: "Validating storage and saving grayscale revision…", progress: 0.9 });
      const project = await createDerivedProjectFromBytes(projectId, output, `${fileBase(name)}-grayscale.pdf`, "toolbox-grayscale");
      update({ progress: 1 }); navigateTo({ name: "workspace", projectId: project.id, mode: "toolbox" });
      });
    } catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); setProgress(""); abortRef.current = null; }
  }

  const numberInput = (label: string, value: number, onChange: (value:number)=>void, min=0, step=1) => <label className="toolbox-field"><span>{label}</span><input min={min} step={step} type="number" value={value} onChange={(event)=>onChange(Number(event.target.value))}/></label>;

  return <div className="toolbox-page">
    <header className="toolbox-header"><div><p className="eyebrow">PDF tools</p><h2>Everyday document utilities</h2><p>Crop, add page content, edit metadata, insert blank pages, split, grayscale, or export text and page images—all locally.</p></div>{busy ? <button className="button button--secondary" onClick={()=>abortRef.current?.abort()} type="button">Cancel</button> : null}</header>
    {error ? <div className="error-banner"><strong>Toolbox operation failed</strong><span>{error}</span></div> : null}
    {progress ? <div className="toolbox-progress"><span className="spinner"/><strong>{progress}</strong></div> : null}
    {warnings.length ? <div className="warning-list">{warnings.map((warning)=><p key={warning}>{warning}</p>)}</div> : null}
    <nav className="toolbox-tabs" aria-label="Toolbox sections">{(["decorate","pages","metadata","convert"] as Tab[]).map((item)=><button className={tab===item?"active":""} key={item} onClick={()=>setTab(item)} type="button">{item === "decorate" ? "Watermark & numbering" : item === "pages" ? "Crop & blank pages" : item === "metadata" ? "Metadata" : "Convert"}</button>)}</nav>
    {tab === "decorate" ? <section className="toolbox-card"><div className="toolbox-card__heading"><div><h3>Watermark, header, footer, and page numbers</h3><p>Writes static text into page content streams. The source project remains unchanged.</p></div></div><div className="toolbox-form-grid">
      <label className="toolbox-field toolbox-field--wide"><span>Watermark</span><input placeholder="CONFIDENTIAL" value={decoration.watermarkText} onChange={(event)=>setDecoration({...decoration,watermarkText:event.target.value})}/></label>
      <label className="toolbox-field"><span>Header</span><input value={decoration.headerText} onChange={(event)=>setDecoration({...decoration,headerText:event.target.value})}/></label>
      <label className="toolbox-field"><span>Footer</span><input value={decoration.footerText} onChange={(event)=>setDecoration({...decoration,footerText:event.target.value})}/></label>
      <label className="check-row"><input checked={decoration.pageNumbers} type="checkbox" onChange={(event)=>setDecoration({...decoration,pageNumbers:event.target.checked})}/> Add page numbers</label>
      {numberInput("Start number",decoration.startNumber,(value)=>setDecoration({...decoration,startNumber:value}),-9999)}
      {numberInput("Font size (pt)",decoration.fontSize,(value)=>setDecoration({...decoration,fontSize:value}),6,1)}
      {numberInput("Margin (mm)",decoration.margin,(value)=>setDecoration({...decoration,margin:value}),1,1)}<label className="toolbox-field"><span>Decoration script</span><select value={decoration.fontLanguage} onChange={(event)=>setDecoration({...decoration,fontLanguage:event.target.value as typeof decoration.fontLanguage})}><option value="auto">Auto detect</option><option value="ko">Korean</option><option value="ja">Japanese</option><option value="zh-Hans">Chinese · Simplified</option><option value="zh-Hant">Chinese · Traditional</option></select></label>
    </div><div className="toolbox-actions"><button className="button" disabled={busy || !decorationEnabled} onClick={()=>void createOutput({decoration:{enabled:true,...decoration,marginPt:mmToPt(decoration.margin)}},"decorated")} type="button">Create decorated revision</button></div></section> : null}
    {tab === "pages" ? <section className="toolbox-card"><h3>Crop visible page area</h3><p className="muted">Margins use millimetres. Cropping changes the CropBox; it does not securely erase content outside the visible area.</p><div className="toolbox-form-grid">
      {numberInput("Top (mm)",crop.top,(value)=>setCrop({...crop,top:value}),0,1)}{numberInput("Right (mm)",crop.right,(value)=>setCrop({...crop,right:value}),0,1)}{numberInput("Bottom (mm)",crop.bottom,(value)=>setCrop({...crop,bottom:value}),0,1)}{numberInput("Left (mm)",crop.left,(value)=>setCrop({...crop,left:value}),0,1)}
    </div><hr/><label className="check-row"><input checked={blank.enabled} type="checkbox" onChange={(event)=>setBlank({...blank,enabled:event.target.checked})}/> Insert blank pages</label>{blank.enabled ? <div className="toolbox-form-grid"><label className="toolbox-field"><span>Position</span><select value={blank.position} onChange={(event)=>setBlank({...blank,position:event.target.value as "start"|"end"})}><option value="start">Start</option><option value="end">End</option></select></label>{numberInput("Count",blank.count,(value)=>setBlank({...blank,count:value}),1,1)}{numberInput("Width (mm)",blank.width,(value)=>setBlank({...blank,width:value}),25,1)}{numberInput("Height (mm)",blank.height,(value)=>setBlank({...blank,height:value}),25,1)}</div> : null}<div className="toolbox-actions"><button className="button" disabled={busy || (!cropEnabled && !blank.enabled)} onClick={()=>void createOutput({crop:{enabled:cropEnabled,topPt:mmToPt(crop.top),rightPt:mmToPt(crop.right),bottomPt:mmToPt(crop.bottom),leftPt:mmToPt(crop.left)},blankPages:{enabled:blank.enabled,position:blank.position,count:blank.count,widthPt:mmToPt(blank.width),heightPt:mmToPt(blank.height)}},"pages")} type="button">Create page-tools revision</button></div></section> : null}
    {tab === "metadata" ? <section className="toolbox-card"><h3>Document metadata</h3><div className="toolbox-form-grid"><label className="toolbox-field"><span>Title</span><input disabled={removeMetadata} value={metadata.title} onChange={(event)=>setMetadata({...metadata,title:event.target.value})}/></label><label className="toolbox-field"><span>Author</span><input disabled={removeMetadata} value={metadata.author} onChange={(event)=>setMetadata({...metadata,author:event.target.value})}/></label><label className="toolbox-field"><span>Subject</span><input disabled={removeMetadata} value={metadata.subject} onChange={(event)=>setMetadata({...metadata,subject:event.target.value})}/></label><label className="toolbox-field"><span>Keywords</span><input disabled={removeMetadata} value={metadata.keywords} onChange={(event)=>setMetadata({...metadata,keywords:event.target.value})}/></label></div><label className="check-row"><input checked={removeMetadata} type="checkbox" onChange={(event)=>setRemoveMetadata(event.target.checked)}/> Remove Info metadata and catalog XMP metadata instead</label><div className="toolbox-actions"><button className="button" disabled={busy} onClick={()=>void createOutput(removeMetadata?{removeMetadata:true}:{metadata},removeMetadata?"metadata-removed":"metadata-updated")} type="button">Create metadata revision</button></div></section> : null}
    {tab === "convert" ? <section className="toolbox-card"><h3>Export and derive</h3><p className="muted">Content exports run locally without modifying the project. PDF transformations create normal derived revisions.</p><div className="toolbox-export-grid"><button disabled={busy} onClick={()=>void exportFile("text")} type="button"><strong>Plain text</strong><span>Extract searchable text to .txt</span></button><button disabled={busy} onClick={()=>void exportFile("markdown")} type="button"><strong>Markdown</strong><span>Page-separated .md document</span></button><button disabled={busy} onClick={()=>void exportFile("html")} type="button"><strong>HTML</strong><span>Readable standalone .html</span></button><button disabled={busy} onClick={()=>void exportFile("images")} type="button"><strong>Page images</strong><span>2× PNG pages in one ZIP</span></button><button disabled={busy} onClick={()=>void createGrayscaleRevision()} type="button"><strong>Grayscale PDF</strong><span>Balanced rasterized grayscale revision</span></button></div><div className="toolbox-split"><div><strong>Split into PDF parts</strong><span>Preserve PDF pages and package the parts in one ZIP.</span></div>{numberInput("Pages per PDF",splitPages,setSplitPages,1,1)}<button className="button button--secondary" disabled={busy || splitPages < 1} onClick={()=>void exportFile("split")} type="button">Split and download ZIP</button></div><div className="warning-banner"><strong>Raster boundary</strong><span>Grayscale intentionally rasterizes each page. Use it only when losing interactive PDF structure is acceptable.</span></div></section> : null}
    <details className="toolbox-password"><summary>Password-protected PDF?</summary><label className="toolbox-field"><span>Local session password</span><input autoComplete="off" type="password" value={password} onChange={(event)=>setPassword(event.target.value)}/></label><p>This value is held only in this component state and is not stored in the project.</p></details>
  </div>;
}
