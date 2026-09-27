import { useEffect, useRef, useState, type FormEvent } from "react";
import { navigateTo, routeHref } from "../core/appRouter";
import { getTask } from "../ia/taskCatalog";
import { openPdfWithPdfJs } from "../engines/pdfjsBase";
import { downloadBlob } from "../projects/download";
import { createProjectFromBytes, getProject, loadProjectBytes } from "../projects/projectRepository";
import { readProjectSessionPassword, rememberProjectSessionPassword } from "../security/sessionPasswords";
import { defaultQuickOptions, formatBytes, handOffQuickResult, isQuickTask, MAX_INPUT_BYTES, planSplit, safeOutputName, takeQuickResult, type QuickOptions, type QuickTaskId } from "../quick/quickModel";
import { runQuickOperation, validateQuickOptions, zipQuickResults, type QuickInput, type QuickOutput, type QuickResult } from "../quick/quickOperations";
import { QuickPagePicker } from "../quick/QuickPagePicker";
import { Icon } from "../components/Icon";
import { FilePreview } from "../product/FilePreview";
import { TaskGlyph } from "../product/TaskGlyph";
import { taskCopy } from "../product/TaskDirectory";
import { takeTaskFiles } from "../product/fileHandoff";

const actionLabels: Record<QuickTaskId, string> = {
  "merge-pdfs": "Merge PDFs", "split-pdf": "Split PDF", "extract-pages": "Extract selected pages", "remove-pages": "Remove selected pages", "rotate-pdf": "Rotate selected pages", "pdf-to-jpg": "Convert to JPG", "pdf-to-png": "Convert to PNG", "pdf-to-text": "Extract text", "images-to-pdf": "Create PDF", "compress-pdf": "Compress PDF", "unlock-pdf": "Remove password", "password-protect": "Protect PDF", "add-page-numbers": "Add page numbers", "add-watermark": "Add watermark", "crop-pages": "Crop PDF"
};
interface PendingPassword { file: File; rest: File[]; accepted: QuickInput[] }
const message = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);
const fileBlob = (file: QuickOutput) => new Blob([Uint8Array.from(file.bytes).buffer], { type: file.mime });

export function QuickToolPage({ taskId, projectId }: { taskId: string; projectId?: string }) {
  if (!isQuickTask(taskId)) return <section className="empty-state"><h2>Tool not found</h2><a href={routeHref({ name: "tools" })}>Browse all PDF tools</a></section>;
  return <QuickWorkflow key={`${taskId}:${projectId ?? ""}`} projectId={projectId} taskId={taskId} />;
}

function QuickWorkflow({ taskId, projectId }: { taskId: QuickTaskId; projectId?: string }) {
  const task = getTask(taskId)!;
  const images = taskId === "images-to-pdf";
  const multiple = images || taskId === "merge-pdfs";
  const [inputs, setInputs] = useState<QuickInput[]>([]);
  const inputsRef = useRef<QuickInput[]>([]);
  const [options, setOptions] = useState<QuickOptions>(defaultQuickOptions);
  const [outputName, setOutputName] = useState("document");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<QuickResult | null>(null);
  const [pending, setPending] = useState<PendingPassword | null>(null);
  const [password, setPassword] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const reading = useRef(false);
  const heldFile = useRef<File | null>(null);
  const draggedFile = useRef<number | null>(null);
  const locked = busy || loading || Boolean(pending);
  const updateInputs = (next: QuickInput[]) => { inputsRef.current = next; setInputs(next); setResult(null); };
  const change = (patch: Partial<QuickOptions>) => { setOptions((current) => ({ ...current, ...patch })); setResult(null); setError(""); };

  async function readFiles(files: File[], accepted = multiple ? inputsRef.current : [], suppliedPassword?: string): Promise<void> {
    if (reading.current || !alive.current) return;
    reading.current = true; setLoading(true); setError(""); setResult(null);
    const next = [...accepted];
    try {
      if (!multiple && files.length > 1) throw new Error("Choose one PDF for this task. Use Merge PDFs to combine several files.");
      if (next.reduce((sum, file) => sum + file.bytes.byteLength, 0) + files.reduce((sum, file) => sum + file.size, 0) > MAX_INPUT_BYTES) throw new Error("Choose files totaling less than 200 MB for this browser workflow.");
      for (const [index, file] of files.entries()) {
        if (!alive.current) return;
        if (images ? !/\.(jpe?g|png|webp)$/i.test(file.name) : !/\.pdf$/i.test(file.name)) throw new Error(images ? "Choose JPG, PNG, or WebP images. Other formats are not converted by this tool." : "Choose PDF files. Word, Excel, and PowerPoint conversion is not available here.");
        if (!file.size) throw new Error(`${file.name} is empty.`);
        setProgress(`Opening ${file.name}…`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        let pageCount = 1;
        const filePassword = index === 0 ? suppliedPassword : undefined;
        if (!images) {
          try {
            const pdf = await openPdfWithPdfJs(bytes, filePassword);
            try { pageCount = pdf.numPages; } finally { await pdf.loadingTask.destroy(); }
          } catch (reason) {
            if (/password|encrypted/i.test(message(reason))) {
              if (alive.current) { updateInputs(next); setPending({ file, rest: files.slice(index + 1), accepted: next }); setPassword(""); setError(filePassword ? "That password did not open the PDF. Try again." : ""); }
              return;
            }
            throw reason;
          }
        }
        if (!alive.current) return;
        next.push({ id: crypto.randomUUID(), name: file.name, bytes, pageCount, password: filePassword, image: images ? file : undefined });
      }
      if (alive.current) {
        updateInputs(next); setPending(null); setPassword("");
        if (next.length) setOutputName(`${next[0].name.replace(/\.[^.]+$/, "")}-${taskId === "merge-pdfs" ? "merged" : taskId === "images-to-pdf" ? "images" : taskId.replace(/-pdfs?$/, "")}`);
      }
    } catch (reason) { if (alive.current) { updateInputs(next); setError(message(reason)); } }
    finally { reading.current = false; if (alive.current) { setLoading(false); setProgress(""); } }
  }

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    // Defer initialization so StrictMode's rehearsal effect cannot consume the hand-off twice.
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      const staged = takeTaskFiles(taskId);
      if (staged?.length) { await readFiles(staged); return; }
      heldFile.current ??= takeQuickResult(taskId);
      if (heldFile.current) { await readFiles([heldFile.current]); heldFile.current = null; return; }
      if (projectId && !images) {
        try {
          setLoading(true);
          const project = await getProject(projectId); if (!project) throw new Error("The source document is no longer available. Choose a file instead.");
          const bytes = await loadProjectBytes(project);
          if (!cancelled) { setLoading(false); await readFiles([new File([Uint8Array.from(bytes).buffer], project.name, { type: "application/pdf" })], [], readProjectSessionPassword(projectId)); }
        } catch (reason) { if (!cancelled) { setLoading(false); setError(message(reason)); } }
      }
    });
    return () => { cancelled = true; alive.current = false; controller.current?.abort(); };
  }, []);

  let validation = "";
  try { if (inputs.length) validateQuickOptions(taskId, inputs, options); } catch (reason) { validation = message(reason); }
  const selectionTool = ["extract-pages", "remove-pages", "rotate-pdf", "pdf-to-jpg", "pdf-to-png", "pdf-to-text"].includes(taskId);
  const pageRebuild = ["merge-pdfs", "split-pdf", "extract-pages", "remove-pages", "rotate-pdf"].includes(taskId);
  const inputSize = inputs.reduce((sum, file) => sum + file.bytes.byteLength, 0);
  const outputSize = result?.files.reduce((sum, file) => sum + file.bytes.byteLength, 0) ?? 0;
  let splitSummary = "";
  if (taskId === "split-pdf" && inputs.length && !validation) splitSummary = `${planSplit(inputs[0].pageCount, options.splitMode, options.every, options.ranges).length} PDF files will be created.`;

  async function execute(event: FormEvent): Promise<void> {
    event.preventDefault(); if (locked || validation || !inputs.length) return;
    setBusy(true); setError(""); setResult(null);
    const abort = new AbortController(); controller.current = abort;
    try {
      const output = await runQuickOperation(taskId, inputs, options, outputName, abort.signal, (value) => { if (alive.current) setProgress(value); });
      if (alive.current && !abort.signal.aborted) { setResult(output); window.requestAnimationFrame(() => { resultRef.current?.focus(); resultRef.current?.scrollIntoView({ block: "nearest" }); }); }
    } catch (reason) { if (alive.current) setError(abort.signal.aborted ? "Cancelled. Your original files are unchanged." : message(reason)); }
    finally { if (alive.current) { setBusy(false); setProgress(""); } controller.current = null; }
  }
  function download(file: QuickOutput): void { downloadBlob(fileBlob(file), file.name, { track: false }); }
  function downloadAll(): void {
    if (!result) return;
    try { downloadBlob(new Blob([Uint8Array.from(zipQuickResults(result.files)).buffer], { type: "application/zip" }), safeOutputName(outputName, "zip"), { track: false }); }
    catch (reason) { setError(message(reason)); }
  }
  async function openInEditor(file: QuickOutput): Promise<void> {
    setBusy(true); setError("");
    try {
      const outputPassword = taskId === "password-protect" ? options.outputPassword : inputs[0]?.password;
      const project = await createProjectFromBytes(file.bytes, file.name, file.mime, outputPassword);
      if (outputPassword) rememberProjectSessionPassword(project.id, outputPassword);
      navigateTo({ name: "workspace", projectId: project.id, mode: "editor" });
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  const select = (label: string, value: string | number, onChange: (value: string) => void, entries: Array<[string | number, string]>) => <label className="quick-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{entries.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
  function move(index: number, direction: number): void { const next = [...inputs]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; updateInputs(next); }

  const filePicker = <input ref={inputRef} aria-label={images ? "Image files" : "PDF files"} hidden accept={images ? "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" : "application/pdf,.pdf"} multiple={multiple} onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) void readFiles(files); }} type="file" />;
  const pickLabel = inputs.length ? multiple ? "Add more files" : "Change PDF" : images ? "Choose images" : multiple ? "Choose PDFs" : "Choose PDF";
  return <div className={`quick-workflow task-page${inputs.length && !result ? " task-page--working" : ""}`}>
    <a className="product-back" href={routeHref({ name: "tools" })}><Icon name="arrow-left" size={17} /> All PDF tools</a>
    <header className="task-heading"><TaskGlyph task={task} large /><div><h1>{task.label}</h1><p>{taskCopy(task)}</p></div><span className="task-step">{result ? "3 / 3 · Download" : inputs.length ? "2 / 3 · Make it yours" : "1 / 3 · Choose your files"}</span></header>
    {filePicker}
    {projectId && !result ? <p className="quick-warning">This tool uses the saved source PDF. Editor-only text, drawings, signatures, and unsaved changes are not included; export your edited PDF first to include them.</p> : null}
    {!inputs.length && !result && !pending ? <section className={`product-dropzone task-dropzone${dragging ? " is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (!locked) void readFiles([...event.dataTransfer.files]); }} aria-label="Choose input files">
      <span className="product-dropzone__icon"><Icon name={images ? "image" : "documents"} size={32} /></span><h2>{images ? "Drop your images here" : multiple ? "Drop your PDFs here" : "Drop your PDF here"}</h2><p>{multiple ? "Choose several files. Arrange them in the next step." : "Your original file stays unchanged."}</p><button className="button" disabled={locked} onClick={() => inputRef.current?.click()} type="button">{pickLabel}<Icon name="plus" size={18}/></button><small>Up to 200 MB total · {images ? "JPG, PNG or WebP" : "PDF files"}</small>
    </section> : null}
    {pending ? <form className="quick-panel task-password" onSubmit={(event) => { event.preventDefault(); void readFiles([pending.file, ...pending.rest], pending.accepted, password); }}><Icon name="secure" size={32}/><h2>This PDF needs its password</h2><p>{pending.file.name}</p><label className="quick-field"><span>Existing PDF password</span><input autoFocus autoComplete="off" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><p className="quick-hint">Used only on this device. This tool does not guess or crack passwords.</p><div className="quick-inline"><button className="button" disabled={loading || !password} type="submit">Unlock for this task</button><button className="button button--secondary" disabled={loading} onClick={() => { const rest = pending.rest; const accepted = pending.accepted; setPending(null); void readFiles(rest, accepted); }} type="button">Skip this file</button></div></form> : null}
    {error ? <div className="error-banner" role="alert"><strong>Could not finish</strong><span>{error}</span></div> : null}
    {progress ? <div className="quick-progress" role="status" aria-live="polite"><span className="spinner" /><span>{progress}</span>{busy ? <button className="button button--secondary" onClick={() => controller.current?.abort()} type="button">Cancel</button> : null}</div> : null}
    {inputs.length && !pending && !result ? <div className="task-workbench">
      <section className={`task-canvas${dragging ? " is-dragging" : ""}`} aria-label="Document preview and selection" onDragOver={(event) => { event.preventDefault(); if (!locked && event.dataTransfer.types.includes("Files")) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); setDragging(false); if (!locked) void readFiles([...event.dataTransfer.files]); }}>
        <div className="task-canvas__bar"><div><strong>{selectionTool ? "Select your pages" : multiple ? "Arrange your files" : "Your document"}</strong><span>{inputs.length === 1 ? `${inputs[0].pageCount} ${images ? "image" : "pages"}` : `${inputs.length} files`} · {formatBytes(inputSize)}</span></div><button className="button button--secondary" disabled={locked} onClick={() => inputRef.current?.click()} type="button"><Icon name="plus" size={17}/>{pickLabel}</button></div>
        {taskId === "remove-pages" ? <p className="task-selection-instruction"><strong>Select the pages to remove.</strong> All other pages will stay.</p> : null}
        {selectionTool ? <QuickPagePicker disabled={locked} input={inputs[0]} selection={options.selection} onChange={(selection) => change({ selection })} /> : <ol className={`task-file-grid${multiple ? "" : " task-file-grid--single"}`} aria-label="Files in output order">{inputs.map((file, index) => <li className="task-file-card" key={file.id} draggable={multiple && !locked} onDragStart={(event) => { draggedFile.current = index; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", file.id); }} onDragEnd={() => { draggedFile.current = null; }} onDragOver={(event) => { if (multiple && draggedFile.current !== null) event.preventDefault(); }} onDrop={(event) => { const from = draggedFile.current; if (from === null || locked) return; event.preventDefault(); event.stopPropagation(); const next = [...inputs]; const [item] = next.splice(from, 1); next.splice(index, 0, item); draggedFile.current = null; updateInputs(next); }}>
          <span className="task-file-index">{index + 1}</span>{index < 6 ? <FilePreview input={file} /> : <div className="file-preview file-preview--placeholder"><Icon name="documents" size={42}/></div>}<div className="task-file-caption"><strong title={file.name}>{file.name}</strong><small>{images ? "Image" : `${file.pageCount} pages`} · {formatBytes(file.bytes.byteLength)}</small></div><div className="quick-file-actions">{multiple ? <><button aria-label={`Move ${file.name} up`} disabled={locked || index === 0} onClick={() => move(index, -1)} type="button"><Icon name="arrow-left" size={16}/></button><button aria-label={`Move ${file.name} down`} disabled={locked || index === inputs.length - 1} onClick={() => move(index, 1)} type="button"><Icon name="chevron-right" size={16}/></button></> : null}<button aria-label={`Remove ${file.name}`} disabled={locked} onClick={() => updateInputs(inputs.filter((entry) => entry.id !== file.id))} type="button"><Icon name="close" size={16}/><span>Remove</span></button></div>
        </li>)}</ol>}
        {multiple ? <p className="task-canvas__foot">Drag to reorder. Move buttons work with keyboard and touch.</p> : null}
      </section>
      <form className="quick-panel task-options" onSubmit={(event) => void execute(event)}><fieldset disabled={locked}><legend>Make it yours</legend>
      {taskId === "split-pdf" ? <><div className="quick-fields">{select("Split mode", options.splitMode, (splitMode) => change({ splitMode: splitMode as QuickOptions["splitMode"] }), [["each", "One PDF for every page"], ["every", "Split every N pages"], ["ranges", "Custom page groups"]])}{options.splitMode === "every" ? <label className="quick-field"><span>Pages per file</span><input min="1" step="1" type="number" value={options.every} onChange={(event) => change({ every: Number(event.target.value) })} /></label> : null}</div>{options.splitMode === "ranges" ? <label className="quick-field"><span>Page groups</span><input aria-label="Page groups" aria-describedby="page-groups-hint" placeholder="1-3; 4-6; 7-end" value={options.ranges} onChange={(event) => change({ ranges: event.target.value })} /><small id="page-groups-hint">Semicolons separate output files. Example: 1,3; 2,4; 5-end.</small></label> : null}<p role="status">{splitSummary}</p></> : null}
      {taskId === "rotate-pdf" ? select("Rotation", options.rotation, (rotation) => change({ rotation: Number(rotation) as QuickOptions["rotation"] }), [[90, "90° clockwise"], [180, "180° upside down"], [270, "90° counterclockwise"]]) : null}
      {["pdf-to-jpg", "pdf-to-png"].includes(taskId) ? select("Image resolution", options.dpi, (dpi) => change({ dpi: Number(dpi) }), [[72, "72 DPI · smaller files"], [150, "150 DPI · balanced"], [300, "300 DPI · high resolution"]]) : null}
      {images ? <><p>Images become pages in the order shown. Drag a file or use its move buttons.</p><div className="quick-fields">{select("Page size", options.paper, (paper) => change({ paper: paper as QuickOptions["paper"] }), [["a4", "A4"], ["letter", "US Letter"], ["original", "Match image size"]])}{options.paper !== "original" ? select("Orientation", options.orientation, (orientation) => change({ orientation: orientation as QuickOptions["orientation"] }), [["auto", "Match each image"], ["portrait", "Portrait"], ["landscape", "Landscape"]]) : null}{select("Margins", options.margin, (margin) => change({ margin: Number(margin) }), [[0, "None"], [10, "10 mm"], [20, "20 mm"]])}</div><p className="quick-hint">Images are fitted without stretching, with white backgrounds and high-quality JPEG encoding.</p></> : null}
      {taskId === "compress-pdf" ? <>{select("Compression", options.compression, (compression) => change({ compression: compression as QuickOptions["compression"], acceptRaster: false }), [["lossless", "Lossless cleanup · keep text and interactive content"], ["balanced", "Image-based · balanced quality"], ["small", "Image-based · smaller file"]])}{options.compression !== "lossless" ? <label className="quick-warning quick-check"><input type="checkbox" checked={options.acceptRaster} onChange={(event) => change({ acceptRaster: event.target.checked })} /><span>I understand that image-based compression removes selectable text, forms, links, layers, password protection, and digital signatures.</span></label> : <p className="quick-hint">Already optimized PDFs may not get smaller. The original is offered unchanged when compression would increase its size.</p>}</> : null}
      {taskId === "password-protect" ? <div className="quick-fields"><label className="quick-field"><span>New PDF password</span><input autoComplete="new-password" type="password" value={options.outputPassword} onChange={(event) => change({ outputPassword: event.target.value })} /></label><label className="quick-field"><span>Confirm new password</span><input autoComplete="new-password" type="password" value={options.confirmPassword} onChange={(event) => change({ confirmPassword: event.target.value })} /></label></div> : null}
      {taskId === "unlock-pdf" ? <p>Save an unencrypted copy of the PDF you have opened. Only use this for documents you are authorized to change. The source stays protected.</p> : null}
      {taskId === "add-watermark" ? <label className="quick-field"><span>Watermark text</span><input maxLength={200} value={options.watermark} placeholder="CONFIDENTIAL" onChange={(event) => change({ watermark: event.target.value })} /></label> : null}
      {taskId === "add-page-numbers" ? <label className="quick-field"><span>Start number</span><input aria-label="Start number" aria-describedby="start-number-hint" min="1" step="1" type="number" value={options.startNumber} onChange={(event) => change({ startNumber: Number(event.target.value) })} /><small id="start-number-hint">Numbers are added at the bottom of every page.</small></label> : null}
      {taskId === "crop-pages" ? <><p className="quick-warning">Cropping hides page edges; it does not securely erase their content. Use permanent redaction for sensitive information.</p><div className="quick-fields">{(["top", "right", "bottom", "left"] as const).map((side) => <label className="quick-field" key={side}><span>{side[0].toUpperCase() + side.slice(1)} margin (mm)</span><input min="0" step="1" type="number" value={options.crop[side]} onChange={(event) => change({ crop: { ...options.crop, [side]: Number(event.target.value) } })} /></label>)}</div><p className="quick-hint">Margins are applied to every page. A visual drag-to-crop editor is not included in this tool.</p></> : null}
      <label className="quick-field"><span>Output filename</span><input aria-label="Output filename" aria-describedby="output-filename-hint" maxLength={140} value={outputName} onChange={(event) => { setOutputName(event.target.value); setResult(null); }} /><small id="output-filename-hint">The correct file extension is added automatically.</small></label>
      {validation ? <p className="quick-validation" role="status">{validation}</p> : null}
      {pageRebuild ? <details className="task-preservation"><summary>What changes in this PDF?</summary><p>Pages retain their appearance and selectable text. Rebuilding pages may not retain document-level bookmarks, attachments, complex forms, or password protection. Existing digital signatures cannot remain valid after changes.</p></details> : null}
      <div className="task-action-dock"><button className="button quick-run" disabled={locked || Boolean(validation)} type="submit">{actionLabels[taskId]}<Icon name="chevron-right" size={19}/></button><small>Your original stays unchanged.</small></div>
    </fieldset></form></div> : null}
    {result ? <section className="quick-result" aria-label="Your files are ready" ref={resultRef} tabIndex={-1}><span className="task-success-mark" aria-hidden="true">✓</span><p className="eyebrow">COMPLETE</p><h2>Your {result.files.length === 1 ? "file is" : "files are"} ready</h2><p>{result.files.length} {result.files.length === 1 ? "file" : "files"} · {formatBytes(outputSize)}{taskId === "compress-pdf" ? ` · ${outputSize < inputSize ? `${Math.round((1 - outputSize / inputSize) * 100)}% smaller` : "Original size unchanged"} (was ${formatBytes(inputSize)})` : ""}</p>
      {result.files.length > 1 ? <button className="button" onClick={downloadAll} type="button">Download all as ZIP</button> : <button className="button" onClick={() => download(result.files[0])} type="button">Download {result.files[0].mime === "application/pdf" ? "PDF" : taskId === "pdf-to-text" ? "text" : taskId === "pdf-to-jpg" ? "JPG" : "PNG"}</button>}
      {result.files.length > 1 ? <details className="quick-individual"><summary>Download individual files ({result.files.length})</summary>{result.files.map((file) => <button key={file.name} onClick={() => download(file)} type="button">{file.name} · {formatBytes(file.bytes.byteLength)}</button>)}</details> : <p className="quick-hint">{result.files[0].name}</p>}
      {result.warnings.length ? <details className="quick-output-notes" open><summary>Output notes</summary>{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</details> : null}
      {result.files.length === 1 && result.files[0].mime === "application/pdf" ? <div className="quick-next"><h3>Continue with this PDF</h3><p>No need to choose the file again.</p><div className="quick-inline">{(["compress-pdf", "extract-pages", "rotate-pdf", "password-protect"] as QuickTaskId[]).filter((id) => id !== taskId).map((id) => <button className="button button--secondary" disabled={busy} key={id} onClick={() => { const file = result.files[0]; handOffQuickResult(id, new File([fileBlob(file)], file.name, { type: file.mime })); navigateTo({ name: "quick", taskId: id }); }} type="button">{getTask(id)?.label}</button>)}<button className="button button--secondary" disabled={busy} onClick={() => void openInEditor(result.files[0])} type="button">Open in editor</button></div><small>Opening the editor saves a local project. The quick tools do not.</small></div> : null}
      <div className="task-result-actions"><button className="button button--secondary" disabled={busy} onClick={() => { setResult(null); setError(""); }} type="button">Edit options</button><a href={routeHref({ name: "home" })}>Start a new task</a></div>
    </section> : null}
    {!result ? <div className="task-privacy"><Icon name="shield" size={16}/><span>Files stay on your device. No account. No saved project needed.</span></div> : null}
  </div>;
}
