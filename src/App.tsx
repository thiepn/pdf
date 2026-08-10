import { useCallback, useEffect, useState } from "react";
import { AppShell } from "./app/AppShell";
import { navigateTo, readAppRoute, type AppRoute } from "./core/appRouter";
import { HomePage } from "./views/HomePage";
import { ProjectsPage } from "./views/ProjectsPage";
import { ViewerPage } from "./views/ViewerPage";
import { SettingsPage } from "./views/SettingsPage";
import { StoragePage } from "./views/StoragePage";
import { DiagnosticsPage } from "./views/DiagnosticsPage";
import { ToolsPage } from "./views/ToolsPage";
import { MergeToolPage } from "./views/MergeToolPage";
import { OrganizerPage } from "./views/OrganizerPage";
import { EditorPage } from "./views/EditorPage";
import { SecurePage } from "./views/SecurePage";
import { OcrPage } from "./views/OcrPage";
import { ScanPage } from "./views/ScanPage";
import { CompressionPage } from "./views/CompressionPage";
import { BatchPage } from "./views/BatchPage";
import { ComparePage } from "./views/ComparePage";
import { CreatePdfPage } from "./views/CreatePdfPage";
import { InspectorPage } from "./views/InspectorPage";
import { RepairPage } from "./views/RepairPage";
import { ProfessionalPage } from "./views/ProfessionalPage";
import { applySettings, readSettings } from "./settings/settingsStore";
import { getLastOpenedProjectId, getProject } from "./projects/projectRepository";
import { ReleasePage } from "./views/ReleasePage";
import { ValidationPage } from "./views/ValidationPage";
import { ActivityPage } from "./views/ActivityPage";
import { MaintenancePage } from "./views/MaintenancePage";
import { HelpPage } from "./views/HelpPage";
import { isSafeMode } from "./maintenance/safeMode";
import { UnifiedWorkspace } from "./workspace/UnifiedWorkspace";
import type { WorkspaceMode } from "./types/workspace";

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
    case "release": return { title: "About this release", subtitle: "Stable capabilities, preservation boundaries, privacy, and recovery contract." };
    case "activity": return { title: "Download history", subtitle: "Review local output records. Technical checksums are available in details." };
    case "maintenance": return { title: "Troubleshooting & recovery", subtitle: "Safe mode, project checks, offline-cache repair, and privacy-safe support information." };
    case "help": return { title: "Help", subtitle: "Offline workflow guidance, preservation boundaries, recovery instructions, and shortcuts." };
    case "workspace": return { title: "PDF workspace", subtitle: "Read, edit, organize, protect, OCR, and optimize without reopening the document." };
    case "viewer": return { title: "PDF viewer" };
    case "editor": return { title: "PDF editor", subtitle: "Add text, images, shapes, ink, links, comments, highlights, signatures, and redaction marks without uploading the document." };
    case "secure": return { title: "Forms & Protect", subtitle: "Fill forms, permanently apply redactions, remove risky active content, inspect signatures, and protect the PDF locally." };
    case "ocr": return { title: "OCR PDF", subtitle: "Recognize scanned pages locally and create searchable output." };
    case "compress": return { title: "Optimize PDF", subtitle: "Reduce file size locally with lossless cleanup or stronger image-based compression." };
    case "inspector": return { title: "Inspect PDF", subtitle: "Analyze pages, resources, forms, actions, revisions, and security." };
    case "repair": return { title: "Repair PDF", subtitle: "Create a clean rewritten copy without overwriting the source." };
    case "professional": return { title: "Print & Advanced", subtitle: "Advanced existing-content editing, document numbering, print layout, layers, and archive checks." };
    case "preservation": return { title: "PDF structure details", subtitle: "Advanced technical view of what document structures are preserved or rebuilt." };
    case "native": return { title: "Unified editor", subtitle: "Legacy native-edit link; redirects to Edit." };
    case "compliance": return { title: "Accessibility & Standards", subtitle: "Check document accessibility, signatures, archive readiness, and print/security standards." };
    case "organizer": return { title: "Page organizer", subtitle: "Reorder, rotate, duplicate, delete, reverse, and extract pages locally." };
    case "toolbox": return { title: "PDF Tools", subtitle: "Crop, add page content, edit metadata, insert blank pages, and export local conversions." };
    case "tools": return { title: "Quick Tools", subtitle: "Focused local PDF operations with validated outputs." };
    case "merge": return { title: "Merge PDFs", subtitle: "Combine local PDF files without uploading them." };
    case "scan": return { title: "Scan to PDF", subtitle: "Turn images or camera captures into local PDFs." };
    case "batch": return { title: "Batch automation", subtitle: "Apply the same saved sequence of PDF actions to multiple files." };
    case "compare": return { title: "Compare PDFs", subtitle: "Align and compare local documents visually or by extracted text." };
    case "create": return { title: "Create PDF", subtitle: "Write Markdown, plain text, or simple HTML and export a local PDF." };
    default: return { title: "PDF Studio", subtitle: "A private, installable PDF workspace running entirely in your browser." };
  }
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => readAppRoute());
  const [header, setHeader] = useState<HeaderState>(() => headerForRoute(readAppRoute()));

  useEffect(() => {
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
      setRoute(next);
      setHeader(headerForRoute(next));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

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
                      : isDocumentRoute(route) ? <UnifiedWorkspace mode={documentRouteMode(route)} onTitleChange={handleViewerTitle} projectId={route.projectId} />
                        : <HomePage />;

  const unified = isDocumentRoute(route);
  return <AppShell fullBleed={unified} hideTopbar={unified} route={route} subtitle={header.subtitle} title={header.title}>{content}</AppShell>;
}

function isDocumentRoute(route: AppRoute): route is Extract<AppRoute, { projectId: string }> {
  return ["workspace", "viewer", "editor", "organizer", "secure", "ocr", "compress", "inspector", "repair", "professional", "preservation", "native", "compliance", "toolbox"].includes(route.name);
}

function documentRouteMode(route: Extract<AppRoute, { projectId: string }>): WorkspaceMode {
  return route.name === "workspace" ? route.mode : route.name;
}
