import { useEffect, useRef, useState } from "react";
import { ProjectCard } from "../components/ProjectCard";
import { navigateTo, routeHref } from "../core/appRouter";
import { createShowcasePdf } from "../fixtures/showcasePdf";
import { rankTasksByQuery } from "../ia/taskSearch";
import "../quick/quickTools.css";
import { getTask, taskRoute, pdfTasks } from "../ia/taskCatalog";
import { createProjectFromBytes, importPdfProject, importProjectPackage, listProjects } from "../projects/projectRepository";
import { acknowledgeSharedInboxFiles, listSharedInboxFiles, removeSharedInboxFiles } from "../pwa/shareInbox";
import { acknowledgePendingPwaLaunchFiles, peekPendingPwaLaunchFiles, PWA_LAUNCH_FILES_EVENT } from "../pwa/launchFiles";
import { classifyIncomingFile } from "../pwa/fileIngress";
import type { ProjectManifest } from "../types/project";
import { rememberProjectSessionPassword } from "../security/sessionPasswords";
import { Icon } from "../components/Icon";
import "./homeConsumer.css";
interface PendingPassword { file: File; kind: "pdf" | "package"; inboxId?: string; launchId?: string }
const homeTasks = [
  { id: "images-to-pdf", copy: "Combine images with page-size and margin choices." },
  { id: "pdf-to-jpg", copy: "Save pages as images, individually or together." },
  { id: "extract-pages", copy: "Keep only the pages you need." },
  { id: "rotate-pdf", copy: "Fix sideways and upside-down pages." },
  { id: "edit-pdf", copy: "Change supported text, images, and added content." },
  { id: "merge-pdfs", copy: "Combine multiple PDFs into one document." },
  { id: "organize-pages", copy: "Reorder, rotate, duplicate, or remove pages." },
  { id: "split-pdf", copy: "Separate a PDF into smaller documents." },
  { id: "compress-pdf", copy: "Reduce PDF file size with clear quality choices." },
  { id: "ocr-pdf", copy: "Make scanned pages searchable with OCR." },
  { id: "fill-forms", copy: "Open a form and fill supported fields." },
  { id: "visual-signature", copy: "Place a visual signature on a PDF." }
] as const;
export function HomePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const displayedTasks = query.trim() ? rankTasksByQuery(pdfTasks, query).map((task) => ({ id: task.id, copy: task.description })) : homeTasks;
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
      setStatus("Opening document…"); navigateTo({ name: "workspace", projectId: project.id, mode: "viewer" }); return true;
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
    try { const project = await createProjectFromBytes(createShowcasePdf(), "northstar-launch-review.pdf"); navigateTo({ name: "workspace", projectId: project.id, mode: "viewer" }); }
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
  return <div className="home-stack">
    <section className="consumer-home-hero">
      <div className="consumer-home-hero__intro"><p className="eyebrow">PDF Studio</p><h2>What do you want to do with your PDF?</h2><p>Choose the task first. PDF Studio asks for a file only when the task needs one, and supported processing stays on this device.</p></div>
      <label className="home-quick-search"><span>Find a PDF tool</span><input type="search" placeholder="Merge, remove pages, JPG to PDF, unlock…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {query.trim() && /\b(word|docx?|excel|xlsx?|powerpoint|pptx?)\b/i.test(query) ? <p role="status">Editable Word, Excel, and PowerPoint conversion is not implemented yet. Text and image exports are separate tools, not equivalent conversions.</p> : null}
      {!displayedTasks.length ? <p role="status">No matching tool. Try merge, split, images, rotate, compress, or unlock.</p> : null}
      <div aria-label="Popular PDF tasks" className="home-task-grid">{displayedTasks.map((item) => {
        const task = getTask(item.id); if (!task) return null; const route = taskRoute(task); if (!route) return null;
        return <a className="home-task-card" href={routeHref(route)} key={task.id}><span className="home-task-card__icon"><Icon name={task.icon} size={19} /></span><strong>{task.label}</strong><span>{item.copy}</span></a>;
      })}</div>
      <div className="consumer-home-actions"><a className="button" href={routeHref({ name: "tools" })}>All PDF tools</a><button className="button button--secondary" disabled={busy} onClick={() => fileInputRef.current?.click()} type="button"><Icon name="documents" size={17} />Open PDF</button><span className="button button--ghost" aria-hidden="true">No upload required</span></div>
      <input ref={fileInputRef} hidden accept="application/pdf,.pdf" type="file" onChange={(event: { target: HTMLInputElement }) => { const file = event.target.files?.[0]; if (file) void processFile(file, "pdf"); event.target.value = ""; }} />
      <input ref={projectInputRef} hidden accept=".lpsproject,application/x-local-pdf-studio-project" type="file" onChange={(event: { target: HTMLInputElement }) => { const file = event.target.files?.[0]; if (file) void processFile(file, "package"); event.target.value = ""; }} />
    </section>
    {status ? <div aria-live="polite" className="notice-banner" role="status">{status}</div> : null}
    {error ? <div aria-live="assertive" className="error-banner" role="alert"><strong>Could not open the file</strong><span>{error}</span></div> : null}
    {pendingPassword ? <section aria-labelledby="home-password-title" className="password-panel"><div><strong id="home-password-title">Password required</strong><span>{pendingPassword.file.name}</span></div><label className="visually-hidden" htmlFor="home-password-input">PDF password</label><input autoFocus autoComplete="off" id="home-password-input" onChange={(event: { target: HTMLInputElement }) => setPassword(event.target.value)} placeholder="PDF password" type="password" value={password} /><button className="button" disabled={!password || busy} onClick={() => void retryPassword()} type="button">Open locally</button><button className="button button--ghost" onClick={() => { const inboxId = pendingPassword.inboxId; const launchId = pendingPassword.launchId; setPendingPassword(null); setPassword(""); if (inboxId) void removeSharedInboxFiles([inboxId]); if (launchId) acknowledgePendingPwaLaunchFiles([launchId]); }} type="button">Cancel</button></section> : null}
    <section className="home-continuation-strip"><div><strong>Open or continue a workspace</strong><p>Restore an exported project backup, open a sample, or return to a recent local document below.</p></div><div className="home-continuation-strip__actions"><button className="button button--secondary" disabled={busy} onClick={() => projectInputRef.current?.click()} type="button">Restore project</button><button className="button button--ghost" disabled={busy} onClick={() => void createFixture()} type="button">Open sample</button></div></section>
    <section aria-label="Privacy and recovery" className="home-trust-note"><div><strong>Processing</strong><span>Supported PDF work runs locally in your browser.</span></div><div><strong>Upload</strong><span>None unless you explicitly export or share something yourself.</span></div><div><strong>Recovery</strong><span>Local autosave. Browser storage can still be cleared, so project backups remain useful.</span></div></section>
    <section className="section-block"><div className="section-heading"><div><p className="eyebrow">Your documents</p><h2>Recent projects</h2></div><a href={routeHref({ name: "projects" })}>View all</a></div>{projects.length ? <div className="project-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} />)}</div> : <div className="empty-state"><strong>No local projects yet</strong><p>Choose a PDF task above or open a PDF to create your first local project.</p></div>}</section>
  </div>;
}
