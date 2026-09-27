import { useEffect, useMemo, useRef, useState } from "react";
import { navigateTo, readAppRoute, routeHref } from "../core/appRouter";
import { importPdfProject } from "../projects/projectRepository";
import { rememberProjectSessionPassword } from "../security/sessionPasswords";
import { getTask, taskRoute } from "../ia/taskCatalog";
import { createGenericTaskCapabilityContext, evaluateTaskCapability, isCapabilityBlocked } from "../capabilities/taskCapability";
import { Icon } from "../components/Icon";
import { TaskDirectory, taskCopy } from "../product/TaskDirectory";
import { TaskGlyph } from "../product/TaskGlyph";
import { handOffTaskFiles, takeTaskTransfer, isPdfFile } from "../product/fileHandoff";

export function ToolsPage() {
  const route = readAppRoute();
  const task = getTask(route.name === "tools" ? route.taskId : undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [dragging, setDragging] = useState(false);
  const alive = useRef(true);
  const opening = useRef(false);
  const context = useMemo(() => createGenericTaskCapabilityContext(), []);
  const capability = task ? evaluateTaskCapability(task, context) : null;
  const blocked = capability ? isCapabilityBlocked(capability) || capability.state === "hidden" : false;
  async function openFile(file: File, suppliedPassword?: string): Promise<void> {
    if (!task || blocked || opening.current) return;
    const destination = taskRoute(task);
    if (destination?.name === "quick") { handOffTaskFiles(task.id, [file], { passwords: [suppliedPassword] }); navigateTo(destination); return; }
    if (task.target.kind !== "workspace") { navigateTo(task.target.route); return; }
    if (!isPdfFile(file)) { setError("Choose a PDF for this tool. Images can be converted with Images to PDF."); return; }
    opening.current = true; setBusy(true); setError("");
    try {
      const project = await importPdfProject(file, suppliedPassword);
      if (!alive.current) return;
      if (suppliedPassword) rememberProjectSessionPassword(project.id, suppliedPassword);
      navigateTo({ name: "workspace", projectId: project.id, mode: task.target.mode, taskId: task.id });
    } catch (reason) {
      if (!alive.current) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message)) { setPendingFile(file); setPassword(""); setError(suppliedPassword ? "That password did not open the PDF. Try again." : ""); }
      else setError(message);
    } finally { opening.current = false; if (alive.current) setBusy(false); }
  }
  function chooseFiles(files: File[]): void {
    if (busy || !files.length) return;
    if (files.length !== 1) { setError("Choose one PDF for this task. Merge PDFs combines several files first."); return; }
    void openFile(files[0]);
  }
  useEffect(() => {
    alive.current = true; let cancelled = false;
    void Promise.resolve().then(() => { if (cancelled || !task) return; const transfer = takeTaskTransfer(task.id); if (transfer?.files.length === 1) void openFile(transfer.files[0], transfer.passwords[0]); });
    return () => { cancelled = true; alive.current = false; };
  }, [task?.id]);
  if (!task) return <div className="product-tools"><header className="product-directory-heading"><span className="product-eyebrow">ONE PLACE. EVERYDAY TASKS.</span><h1>Find your next PDF tool.</h1><p>Start with what you want to do. The right controls follow.</p></header><TaskDirectory /></div>;
  return <div className="product-tool-start">
    <a className="product-back" href={routeHref({ name: "tools" })}><Icon name="arrow-left" size={17} />All PDF tools</a>
    <header className="product-task-intro"><TaskGlyph task={task} large /><h1>{task.label}</h1><p>{taskCopy(task)}</p></header>
    {blocked ? <div className="product-message" role="alert"><strong>{capability?.label}</strong><p>{capability?.reason}</p><p>{capability?.recovery}</p></div> : <section className={`product-dropzone${dragging ? " is-dragging" : ""}`} aria-label="Choose a PDF" onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFiles([...event.dataTransfer.files]); }}>
      <Icon name="documents" size={44} /><h2>{busy ? "Opening your PDF…" : "Start with your PDF"}</h2><p>{busy ? "Preparing the document on this device." : "Drop a file here, or choose one from your device."}</p><button className="button" disabled={busy || Boolean(pendingFile)} onClick={() => inputRef.current?.click()} type="button">{busy ? "Opening…" : "Choose PDF"}<Icon name="plus" size={19} /></button><input ref={inputRef} hidden aria-label="PDF file" accept="application/pdf,.pdf" type="file" onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; chooseFiles(files); }} />
    </section>}
    {pendingFile ? <form className="product-password" onSubmit={(event) => { event.preventDefault(); void openFile(pendingFile, password); }}><h2>This PDF needs a password</h2><p>{pendingFile.name}</p><label>PDF password<input autoFocus type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} /></label><p>Used only to open this file. The password is not saved.</p><div><button className="button" disabled={!password || busy} type="submit">Open PDF</button><button className="button button--secondary" disabled={busy} onClick={() => { setPendingFile(null); setPassword(""); setError(""); }} type="button">Choose another file</button></div></form> : null}
    {error ? <div className="error-banner" role="alert"><strong>Could not open the PDF</strong><span>{error}</span></div> : null}
    <p className="product-tool-privacy"><Icon name="shield" size={17} /> Your file is not uploaded. This editor saves a local project so you can return to your work.</p>
    <div className="product-how"><div><span>1</span><strong>Choose your PDF</strong><p>Your original stays unchanged.</p></div><div><span>2</span><strong>Work on the document</strong><p>Only the relevant tools, in one place.</p></div><div><span>3</span><strong>Download your copy</strong><p>Save the finished PDF to your device.</p></div></div>
  </div>;
}
