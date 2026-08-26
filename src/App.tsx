import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "./app/AppShell";
import { navigateTo, readAppRoute, type AppRoute } from "./core/appRouter";
import { HomePage } from "./views/HomePage";
import { applySettings, readSettings } from "./settings/settingsStore";
import { getLastOpenedProjectId, getProject } from "./projects/projectRepository";
import { isSafeMode } from "./maintenance/safeMode";
import { initializeRuntimePerformanceMonitoring, noteNavigationPaint, noteNavigationStart } from "./performance/runtimeMetrics";
import type { WorkspaceMode } from "./types/workspace";

const ProjectsPage = lazy(() => import("./views/ProjectsPage").then(({ ProjectsPage }) => ({ default: ProjectsPage })));
const SettingsPage = lazy(() => import("./views/SettingsPage").then(({ SettingsPage }) => ({ default: SettingsPage })));
const StoragePage = lazy(() => import("./views/StoragePage").then(({ StoragePage }) => ({ default: StoragePage })));
const DiagnosticsPage = lazy(() => import("./views/DiagnosticsPage").then(({ DiagnosticsPage }) => ({ default: DiagnosticsPage })));
const ToolsPage = lazy(() => import("./views/ToolsPage").then(({ ToolsPage }) => ({ default: ToolsPage })));
const MergeToolPage = lazy(() => import("./views/MergeToolPage").then(({ MergeToolPage }) => ({ default: MergeToolPage })));
const ScanPage = lazy(() => import("./views/ScanPage").then(({ ScanPage }) => ({ default: ScanPage })));
const BatchPage = lazy(() => import("./views/BatchPage").then(({ BatchPage }) => ({ default: BatchPage })));
const ComparePage = lazy(() => import("./views/ComparePage").then(({ ComparePage }) => ({ default: ComparePage })));
const CreatePdfPage = lazy(() => import("./views/CreatePdfPage").then(({ CreatePdfPage }) => ({ default: CreatePdfPage })));
const ReleasePage = lazy(() => import("./views/ReleasePage").then(({ ReleasePage }) => ({ default: ReleasePage })));
const ValidationPage = lazy(() => import("./views/ValidationPage").then(({ ValidationPage }) => ({ default: ValidationPage })));
const ActivityPage = lazy(() => import("./views/ActivityPage").then(({ ActivityPage }) => ({ default: ActivityPage })));
const MaintenancePage = lazy(() => import("./views/MaintenancePage").then(({ MaintenancePage }) => ({ default: MaintenancePage })));
const HelpPage = lazy(() => import("./views/HelpPage").then(({ HelpPage }) => ({ default: HelpPage })));
const UnifiedWorkspace = lazy(() => import("./workspace/UnifiedWorkspace").then(({ UnifiedWorkspace }) => ({ default: UnifiedWorkspace })));
const CapabilityGatedWorkspace = lazy(() => import("./capabilities/CapabilityGatedWorkspace").then(({ CapabilityGatedWorkspace }) => ({ default: CapabilityGatedWorkspace })));

interface HeaderState {
  title: string;
  subtitle?: string;
}

function headerForRoute(route: AppRoute): HeaderState {
  switch (route.name) {
    case "projects": return { title: "Local projects", subtitle: "Open, back up, rename, or remove browser-local workspaces." };
    case "validation": return { title: "App self-check", subtitle: "Advanced release and browser checks for troubleshooting." };
    case "settings": return { title: "Settings", subtitle: "Viewer, appearance, privacy, and performance defaults." };
    case "storage": return { title: "Local storage", subtitle: "See how much browser storage your PDF projects use and whether the browser may clean it automatically." };
    case "diagnostics": return { title: "Troubleshooting diagnostics", subtitle: "Advanced browser capability checks and local technical error records." };
    case "release": return { title: "About this release", subtitle: "Capabilities, limitations, privacy, and recovery information." };
    case "activity": return { title: "Download history", subtitle: "Review local output records. Technical checksums are available in details." };
    case "maintenance": return { title: "Troubleshooting & recovery", subtitle: "Safe mode, project checks, offline-cache repair, and privacy-safe support information." };
    case "help": return { title: "Help", subtitle: "Offline workflow guidance, document-change boundaries, recovery instructions, and shortcuts." };
    case "workspace": return { title: "PDF workspace", subtitle: "Read, edit, manage pages, or find a PDF task without reopening the document." };
    case "viewer": return { title: "Read PDF" };
    case "editor": return { title: "Edit PDF", subtitle: "Change supported content and add text, images, markup, comments, links, signatures, and redaction marks." };
    case "secure": return { title: "Protect PDF", subtitle: "Fill forms, permanently apply redactions, sanitize active content, flatten supported structures, or add password protection." };
    case "ocr": return { title: "OCR PDF", subtitle: "Recognize scanned pages locally and create searchable output." };
    case "compress": return { title: "Compress PDF", subtitle: "Reduce file size with lossless cleanup or stronger image-based compression." };
    case "inspector": return { title: "Document details", subtitle: "Technical PDF structure, resources, forms, actions, revisions, and security information." };
    case "repair": return { title: "Repair PDF", subtitle: "Create a clean rewritten copy without overwriting the source." };
    case "professional": return { title: "Specialist tools", subtitle: "Document numbering, print layout, layers, archive checks, and specialist document workflows." };
    case "preservation": return { title: "Structure check", subtitle: "Technical view of document structures preserved or rebuilt by an operation." };
    case "native": return { title: "Edit PDF", subtitle: "Legacy compatibility link; existing-content editing now lives in Edit." };
    case "compliance": return { title: "Accessibility", subtitle: "Check accessibility findings and supported standards-related document details." };
    case "organizer": return { title: "Pages", subtitle: "Reorder, rotate, duplicate, delete, reverse, and extract pages locally." };
    case "toolbox": return { title: "PDF tasks", subtitle: "Find document actions by outcome, with utilities grouped under one disclosure." };
    case "tools": return { title: "PDF tasks", subtitle: "Search by what you want to accomplish instead of by internal tool or engine name." };
    case "merge": return { title: "Merge PDFs", subtitle: "Combine local PDF files without uploading them." };
    case "scan": return { title: "Scan to PDF", subtitle: "Turn images or camera captures into local PDFs." };
    case "batch": return { title: "Batch automation", subtitle: "Apply the same saved sequence of PDF actions to multiple files." };
    case "compare": return { title: "Compare PDFs", subtitle: "Align and compare local documents visually or by extracted text." };
    case "create": return { title: "Create PDF", subtitle: "Write Markdown, plain text, or simple HTML and export a local PDF." };
    default: return { title: "PDF Studio", subtitle: "A private, installable PDF workspace running entirely in your browser." };
  }
}

function RouteLoading() {
  return <div className="viewer-loading" role="status" aria-live="polite"><span className="spinner" /><strong>Opening tool…</strong></div>;
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => readAppRoute());
  const [header, setHeader] = useState<HeaderState>(() => headerForRoute(readAppRoute()));

  useEffect(() => {
    initializeRuntimePerformanceMonitoring();
    noteNavigationStart(route.name);
    const settings = readSettings();
    applySettings(settings);
    try {
      if (!isSafeMode() && settings.reopenLastProject && route.name === "home" && !sessionStorage.getItem("local-pdf-studio-reopen-attempted")) {
        sessionStorage.setItem("local-pdf-studio-reopen-attempted", "1");
        const projectId = getLastOpenedProjectId();
        if (projectId) void getProject(projectId).then((project) => { if (project) navigateTo({ name: "viewer", projectId }); });
      }
    } catch { /* Session storage may be unavailable. */ }
    const onHashChange = () => {
      const next = readAppRoute();
      noteNavigationStart(next.name);
      setRoute(next);
      setHeader(headerForRoute(next));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => noteNavigationPaint(route.name));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [route]);

  const handleViewerTitle = useCallback((title: string, subtitle?: string) => setHeader({ title, subtitle }), []);

  const content = route.name === "home" ? <HomePage />
    : route.name === "projects" ? <ProjectsPage />
      : route.name === "settings" ? <SettingsPage />
        : route.name === "storage" ? <StoragePage />
          : route.name === "diagnostics" ? <DiagnosticsPage lab={route.lab} />
            : route.name === "release" ? <ReleasePage />
              : route.name === "validation" ? <ValidationPage />
                : route.name === "activity" ? <ActivityPage />
                  : route.name === "maintenance" ? <MaintenancePage />
                    : route.name === "help" ? <HelpPage />
                      : route.name === "tools" ? <ToolsPage />
                        : route.name === "merge" ? <MergeToolPage />
                          : route.name === "scan" ? <ScanPage />
                            : route.name === "batch" ? <BatchPage />
                              : route.name === "compare" ? <ComparePage />
                                : route.name === "create" ? <CreatePdfPage />
                                  : route.name === "workspace" ? <CapabilityGatedWorkspace mode={route.mode} onTitleChange={handleViewerTitle} projectId={route.projectId} taskId={route.taskId} />
                                    : isDocumentRoute(route) ? <UnifiedWorkspace mode={documentRouteMode(route)} onTitleChange={handleViewerTitle} projectId={route.projectId} />
                                      : <HomePage />;

  const unified = isDocumentRoute(route);
  return <AppShell fullBleed={unified} hideTopbar={unified} route={route} subtitle={header.subtitle} title={header.title}>
    <Suspense fallback={<RouteLoading />}>{content}</Suspense>
  </AppShell>;
}

function isDocumentRoute(route: AppRoute): route is Extract<AppRoute, { projectId: string }> {
  return ["workspace", "viewer", "editor", "organizer", "secure", "ocr", "compress", "inspector", "repair", "professional", "preservation", "native", "compliance", "toolbox"].includes(route.name);
}

function documentRouteMode(route: Extract<AppRoute, { projectId: string }>): WorkspaceMode {
  return route.name === "workspace" ? route.mode : route.name;
}
