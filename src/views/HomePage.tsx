import { TaskDirectory } from "../product/TaskDirectory";
import { handOffTaskFiles, inspectIncomingFiles, type InputKind } from "../product/fileHandoff";
import type { PdfTask } from "../ia/taskCatalog";
import { formatBytes } from "../quick/quickModel";
import { useEffect, useRef, useState } from "react";
import { navigateTo, routeHref } from "../core/appRouter";
import { createShowcasePdf } from "../fixtures/showcasePdf";
import { taskRoute } from "../ia/taskCatalog";
import { createProjectFromBytes, importPdfProject, importProjectPackage, listProjects } from "../projects/projectRepository";
import { acknowledgeSharedInboxFiles, listSharedInboxFiles, removeSharedInboxFiles } from "../pwa/shareInbox";
import { acknowledgePendingPwaLaunchFiles, peekPendingPwaLaunchFiles, PWA_LAUNCH_FILES_EVENT } from "../pwa/launchFiles";
import { classifyIncomingFile } from "../pwa/fileIngress";
import type { ProjectManifest } from "../types/project";
import { rememberProjectSessionPassword } from "../security/sessionPasswords";
import { Icon } from "../components/Icon";
interface PendingPassword { file: File; kind: "pdf" | "package"; inboxId?: string; launchId?: string }
export function HomePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [inputKind, setInputKind] = useState<InputKind>();
  const [dragging, setDragging] = useState(false);
  function stageFiles(files: File[]): void {
    if (busy || !files.length) return;
    try { const kind = inspectIncomingFiles(files); setInputKind(kind); setStagedFiles(files); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  function chooseStagedTask(task: PdfTask): void {
    const route = taskRoute(task); if (!route) return;
    try { handOffTaskFiles(task.id, stagedFiles); navigateTo(route); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  const [projects, setProjects] = useState<ProjectManifest[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingPassword, setPendingPassword] = useState<PendingPassword | null>(null);
  const [password, setPassword] = useState("");
  const deferredInboxIds = useRef(new Set<string>());
  const deferredLaunchIds = useRef(new Set<string>());
  useEffect(() => { void refresh(); }, []);
  async function refresh(): Promise<void> {
    try { setProjects((await listProjects()).slice(0, 6)); } catch { /* Quick tools remain usable without project storage. */ }
  }
  async function processFile(file: File, kind: "pdf" | "package", suppliedPassword?: string, inboxId?: string, launchId?: string): Promise<boolean> {
    setBusy(true); setError(null); setStatus(`Opening ${file.name}…`);
    try {
      const project = kind === "package" ? await importProjectPackage(file, suppliedPassword) : await importPdfProject(file, suppliedPassword);
      if (kind === "pdf" && suppliedPassword) rememberProjectSessionPassword(project.id, suppliedPassword);
      if (launchId) { acknowledgePendingPwaLaunchFiles([launchId]); deferredLaunchIds.current.delete(launchId); }
      if (inboxId) {
        // Persist logical acknowledgement before best-effort Cache Storage deletion.
        // If physical cleanup fails, Home will not import this committed file again.
        await acknowledgeSharedInboxFiles([inboxId]); deferredInboxIds.current.delete(inboxId);
      }
      setStatus("Opening document…"); navigateTo({ name: "workspace", projectId: project.id, mode: "editor" }); return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message)) { setPendingPassword({ file, kind, inboxId, launchId }); setError("This PDF requires a password. The password is used only to open this file and is not stored."); }
      else {
        if (inboxId) deferredInboxIds.current.add(inboxId);
        if (launchId) deferredLaunchIds.current.add(launchId);
        setError(inboxId ? `${message} The shared file remains in the local inbox and can be retried after reloading Home.` : message);
      }
      return false;
    } finally { setBusy(false); setStatus(null); }
  }
  async function createFixture(): Promise<void> {
    setBusy(true); setError(null);
    try { const project = await createProjectFromBytes(createShowcasePdf(), "northstar-launch-review.pdf"); navigateTo({ name: "workspace", projectId: project.id, mode: "editor" }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  async function retryPassword(): Promise<void> {
    if (!pendingPassword || !password) return;
    const pending = pendingPassword; setPendingPassword(null);
    await processFile(pending.file, pending.kind, password, pending.inboxId, pending.launchId); setPassword("");
  }
  useEffect(() => {
    let cancelled = false; let consuming = false;
    const consumeIncoming = async () => {
      if (cancelled || consuming || busy || pendingPassword) return;
      consuming = true;
      try {
        const launch = peekPendingPwaLaunchFiles().find((entry) => !deferredLaunchIds.current.has(entry.id));
        if (launch) { const kind = classifyIncomingFile(launch.file.name, launch.file.type); if (kind) await processFile(launch.file, kind, undefined, undefined, launch.id); else acknowledgePendingPwaLaunchFiles([launch.id]); return; }
        const shared = (await listSharedInboxFiles()).find((entry) => !deferredInboxIds.current.has(entry.id));
        if (!shared) return;
        const kind = classifyIncomingFile(shared.file.name, shared.file.type);
        if (kind) await processFile(shared.file, kind, undefined, shared.id);
        else await removeSharedInboxFiles([shared.id]);
      } finally { consuming = false; }
    };
    const listener = () => { void consumeIncoming(); };
    window.addEventListener(PWA_LAUNCH_FILES_EVENT, listener); void consumeIncoming();
    return () => { cancelled = true; window.removeEventListener(PWA_LAUNCH_FILES_EVENT, listener); };
  }, [busy, pendingPassword]);
  return <div className="product-home">
    <section className="product-home-hero">
      <span className="product-eyebrow">YOUR EVERYDAY PDF TOOLS</span>
      <h1>Less work.<br className="product-mobile-break" /> <span>More done.</span></h1>
      <p>Merge, edit, compress and convert. Choose a tool below, or start with your files.</p>
      <div className={`product-home-drop${dragging ? " is-dragging" : ""}`} aria-label="Start with your files" onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); stageFiles([...event.dataTransfer.files]); }}>
        <span className="product-upload-mark" aria-hidden="true"><Icon name="documents" size={30} /><span>+</span></span>
        <div><strong>{stagedFiles.length ? `${stagedFiles.length} ${stagedFiles.length === 1 ? "file" : "files"} ready` : "Drop your files here"}</strong><span>{stagedFiles.length ? "Choose what to do with them below." : "PDF, JPG, PNG or WebP · Up to 200 MB"}</span></div>
        <button className="button" disabled={busy} onClick={() => fileInputRef.current?.click()} type="button">{stagedFiles.length ? "Change files" : "Choose files"}<Icon name="plus" size={18} /></button>
      </div>
      <div className="product-trust-line"><span><Icon name="shield" size={15} /> No file uploads</span><span>No account needed</span><span>Originals stay unchanged</span></div>
    </section>
    <input ref={fileInputRef} hidden aria-label="Choose files to get started" accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple type="file" onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; stageFiles(files); }} />
    <input ref={projectInputRef} hidden accept=".lpsproject,application/x-local-pdf-studio-project" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void processFile(file, "package"); event.target.value = ""; }} />
    {status ? <div className="product-message" role="status">{status}</div> : null}
    {error ? <div className="error-banner" role="alert"><strong>Could not open these files</strong><span>{error}</span><button type="button" onClick={() => setError(null)}>Dismiss</button></div> : null}
    {pendingPassword ? <form className="product-password" onSubmit={(event) => { event.preventDefault(); void retryPassword(); }}><h2>Enter the PDF password</h2><p>{pendingPassword.file.name}</p><label>PDF password<input autoFocus autoComplete="off" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><div><button className="button" disabled={!password || busy} type="submit">Open locally</button><button className="button button--secondary" onClick={() => { if (pendingPassword.inboxId) deferredInboxIds.current.add(pendingPassword.inboxId); if (pendingPassword.launchId) deferredLaunchIds.current.add(pendingPassword.launchId); setPendingPassword(null); setPassword(""); setError(null); }} type="button">Cancel</button></div></form> : null}
    {stagedFiles.length ? <section className="product-staged" aria-label="Selected files"><div className="product-staged__files">{stagedFiles.map((file, index) => <span key={`${file.name}:${index}`}><Icon name={inputKind === "images" ? "image" : "documents"} size={18} /><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span>)}</div><button className="button button--ghost" onClick={() => { setStagedFiles([]); setInputKind(undefined); }} type="button">Clear files</button></section> : null}
    <TaskDirectory home kind={inputKind} onChoose={stagedFiles.length ? chooseStagedTask : undefined} />
    {stagedFiles.length && inputKind === "pdf" ? <p className="product-fine-print">Quick tools use temporary files. Editing, form filling and other document work saves a local project on this device.</p> : null}
    {!stagedFiles.length ? <section className="product-home-bottom"><div><h2>Just need to look around?</h2><p>Try the editor with a sample document. No file of your own needed.</p></div><button className="button button--secondary" disabled={busy} onClick={() => void createFixture()} type="button">Try an example <span aria-hidden="true">→</span></button></section> : null}
    {projects.length ? <details className="product-recents"><summary>Continue a saved document <span>{projects.length}</span></summary><div>{projects.map((project) => <a key={project.id} href={routeHref({ name: "workspace", projectId: project.id, mode: "editor" })}><Icon name="documents" /><strong>{project.name}</strong><span>{project.summary.pageCount} pages</span><Icon name="chevron-right" /></a>)}</div><a href={routeHref({ name: "projects" })}>All saved documents</a></details> : null}
    <div className="product-home-links"><a href={routeHref({ name: "projects" })}>Saved documents</a><button disabled={busy} onClick={() => projectInputRef.current?.click()} type="button">Restore a project backup</button></div>
  </div>;
}
