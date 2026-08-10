import { useEffect, useRef, useState } from "react";
import { ProjectCard } from "../components/ProjectCard";
import { navigateTo, routeHref } from "../core/appRouter";
import { createMinimalPdf } from "../fixtures/minimalPdf";
import { createProjectFromBytes, importPdfProject, importProjectPackage, listProjects } from "../projects/projectRepository";
import { PwaReadinessCard } from "../components/PwaReadinessCard";
import { acknowledgeSharedInboxFiles, listSharedInboxFiles, removeSharedInboxFiles } from "../pwa/shareInbox";
import { acknowledgePendingPwaLaunchFiles, peekPendingPwaLaunchFiles, PWA_LAUNCH_FILES_EVENT } from "../pwa/launchFiles";
import { classifyIncomingFile } from "../pwa/fileIngress";
import type { ProjectManifest } from "../types/project";
import { rememberProjectSessionPassword } from "../security/sessionPasswords";
import { Icon } from "../components/Icon";

interface PendingPassword {
  file: File;
  kind: "pdf" | "package";
  inboxId?: string;
  launchId?: string;
}

export function HomePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
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
    setProjects((await listProjects()).slice(0, 6));
  }

  async function processFile(file: File, kind: "pdf" | "package", suppliedPassword?: string, inboxId?: string, launchId?: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setStatus(`Inspecting ${file.name}…`);
    try {
      const project = kind === "package"
        ? await importProjectPackage(file, suppliedPassword)
        : await importPdfProject(file, suppliedPassword);
      if (kind === "pdf" && suppliedPassword) rememberProjectSessionPassword(project.id, suppliedPassword);
      if (launchId) {
        acknowledgePendingPwaLaunchFiles([launchId]);
        deferredLaunchIds.current.delete(launchId);
      }
      if (inboxId) {
        // Persist logical acknowledgement before best-effort Cache Storage deletion.
        // If physical cleanup fails, Home will not import this committed file again.
        await acknowledgeSharedInboxFiles([inboxId]);
        deferredInboxIds.current.delete(inboxId);
      }
      setStatus("Project stored locally. Opening unified workspace…");
      navigateTo({ name: "workspace", projectId: project.id, mode: "viewer" });
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message) && !suppliedPassword) {
        setPendingPassword({ file, kind, inboxId, launchId });
        setError("This PDF requires a password. The password is used only to open this file and is not stored.");
      } else {
        if (inboxId) deferredInboxIds.current.add(inboxId);
        if (launchId) deferredLaunchIds.current.add(launchId);
        setError(inboxId ? `${message} The shared file remains in the local inbox and can be retried after reloading Home.` : message);
      }
      return false;
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function createFixture(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const project = await createProjectFromBytes(createMinimalPdf(), "pdf-studio-welcome.pdf");
      navigateTo({ name: "workspace", projectId: project.id, mode: "viewer" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function retryPassword(): Promise<void> {
    if (!pendingPassword || !password) return;
    const pending = pendingPassword;
    setPendingPassword(null);
    await processFile(pending.file, pending.kind, password, pending.inboxId, pending.launchId);
    setPassword("");
  }

  useEffect(() => {
    let cancelled = false;
    let consuming = false;
    const consumeIncoming = async () => {
      if (cancelled || consuming || busy || pendingPassword) return;
      consuming = true;
      try {
        const launch = peekPendingPwaLaunchFiles().find((entry) => !deferredLaunchIds.current.has(entry.id));
        if (launch) {
          const kind = classifyIncomingFile(launch.file.name, launch.file.type);
          if (kind) await processFile(launch.file, kind, undefined, undefined, launch.id);
          else acknowledgePendingPwaLaunchFiles([launch.id]);
          return;
        }
        const shared = (await listSharedInboxFiles()).find((entry) => !deferredInboxIds.current.has(entry.id));
        if (!shared) return;
        const kind = classifyIncomingFile(shared.file.name, shared.file.type);
        if (kind) await processFile(shared.file, kind, undefined, shared.id);
        else await removeSharedInboxFiles([shared.id]);
      } finally { consuming = false; }
    };
    const listener = () => { void consumeIncoming(); };
    window.addEventListener(PWA_LAUNCH_FILES_EVENT, listener);
    void consumeIncoming();
    return () => { cancelled = true; window.removeEventListener(PWA_LAUNCH_FILES_EVENT, listener); };
  }, [busy, pendingPassword]);

  return (
    <div className="home-stack">
      <section className="product-hero">
        <div>
          <p className="eyebrow">Private by architecture</p>
          <h2>Work with PDFs without uploading them.</h2>
          <p>Open a PDF once, then move between reading, editing, page organization, forms, protection, OCR, optimization, and advanced tools inside one recoverable workspace.</p>
          <div className="hero-actions">
            <button className="button button--large" disabled={busy} onClick={() => fileInputRef.current?.click()} type="button"><Icon name="documents" size={17} />Open PDF</button>
            <button className="button button--secondary button--large" disabled={busy} onClick={() => projectInputRef.current?.click()} type="button">Restore project</button>
            <button className="button button--ghost-on-dark button--large" disabled={busy} onClick={() => void createFixture()} type="button">Open sample</button>
          </div>
          <input ref={fileInputRef} hidden accept="application/pdf,.pdf" type="file" onChange={(event: { target: HTMLInputElement }) => { const file = event.target.files?.[0]; if (file) void processFile(file, "pdf"); event.target.value = ""; }} />
          <input ref={projectInputRef} hidden accept=".lpsproject,application/x-local-pdf-studio-project" type="file" onChange={(event: { target: HTMLInputElement }) => { const file = event.target.files?.[0]; if (file) void processFile(file, "package"); event.target.value = ""; }} />
        </div>
        <div className="privacy-card">
          <span className="privacy-card__icon"><Icon name="shield" size={22} /></span>
          <strong>Local processing</strong>
          <p>The PDF bytes, extracted text, passwords, and project state remain inside this browser.</p>
          <dl>
            <div><dt>Upload</dt><dd>None</dd></div>
            <div><dt>Storage</dt><dd>Local browser storage</dd></div>
            <div><dt>Recovery</dt><dd>Automatic</dd></div>
          </dl>
        </div>
      </section>

      {status ? <div aria-live="polite" className="notice-banner" role="status">{status}</div> : null}
      {error ? <div aria-live="assertive" className="error-banner" role="alert"><strong>Could not open the file</strong><span>{error}</span></div> : null}

      {pendingPassword ? (
        <section aria-labelledby="home-password-title" className="password-panel">
          <div><strong id="home-password-title">Password required</strong><span>{pendingPassword.file.name}</span></div>
          <label className="visually-hidden" htmlFor="home-password-input">PDF password</label><input autoFocus autoComplete="off" id="home-password-input" onChange={(event: { target: HTMLInputElement }) => setPassword(event.target.value)} placeholder="PDF password" type="password" value={password} />
          <button className="button" disabled={!password || busy} onClick={() => void retryPassword()} type="button">Open locally</button>
          <button className="button button--ghost" onClick={() => { const inboxId = pendingPassword.inboxId; const launchId = pendingPassword.launchId; setPendingPassword(null); setPassword(""); if (inboxId) void removeSharedInboxFiles([inboxId]); if (launchId) acknowledgePendingPwaLaunchFiles([launchId]); }} type="button">Cancel</button>
        </section>
      ) : null}

      <PwaReadinessCard compact />

      <section className="home-tools-strip">
        <div><p className="eyebrow">Unified PDF workspace</p><strong>One document, one tab, every workflow</strong><span>Switch tools without reopening the file. Simple mode shows everyday tools. Advanced mode adds specialist inspection, repair, print, and standards controls.</span></div>
        <a className="button button--secondary" href={routeHref({ name: "tools" })}>Open Quick Tools</a>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div><p className="eyebrow">Local workspace</p><h2>Recent projects</h2></div>
          <a href={routeHref({ name: "projects" })}>View all</a>
        </div>
        {projects.length ? (
          <div className="project-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} />)}</div>
        ) : (
          <div className="empty-state"><strong>No local projects yet</strong><p>Open a PDF to create an automatically recoverable project.</p></div>
        )}
      </section>

      <section aria-label="PDF Studio foundations" className="foundation-grid foundation-grid--quiet">
        <article><span>01</span><strong>Local-first processing</strong><p>PDFs, OCR results, scan images, recipes, and generated outputs remain on the device.</p></article>
        <article><span>02</span><strong>Shared validation pipeline</strong><p>Generated PDFs reopen and verify page structure before download or project creation.</p></article>
        <article><span>03</span><strong>Explicit preservation boundaries</strong><p>Raster OCR and compression warn before replacing searchable, vector, or interactive PDF structures.</p></article>
      </section>
    </div>
  );
}
