import { CoordinatesLab } from "../prototypes/coordinates/CoordinatesLab";
import { DeploymentLab } from "../prototypes/deployment/DeploymentLab";
import { EngineLab } from "../prototypes/engine/EngineLab";
import { StorageLab } from "../prototypes/storage/StorageLab";
import { PdfViewerLab } from "../prototypes/viewer/PdfViewerLab";
import { Overview } from "../lab/Overview";
import { routeHref } from "../core/appRouter";
import { PerformanceDiagnostics } from "../diagnostics/PerformanceDiagnostics";
import { SystemDiagnostics } from "../diagnostics/SystemDiagnostics";

const labs = [
  { id: "system", label: "System" },
  { id: "performance", label: "Performance" },
  { id: "overview", label: "Engineering overview" },
  { id: "deployment", label: "Deployment" },
  { id: "viewer", label: "PDF.js" },
  { id: "engine", label: "MuPDF" },
  { id: "coordinates", label: "Coordinates" },
  { id: "storage", label: "Storage probe" }
] as const;

export function DiagnosticsPage({ lab = "system" }: { lab?: string }) {
  return <div className="stack">
    <nav className="diagnostic-tabs" aria-label="System diagnostics and engineering laboratories">{labs.map((item) => <a className={lab === item.id ? "active" : ""} href={routeHref({ name: "diagnostics", lab: item.id })} key={item.id}>{item.label}</a>)}</nav>
    {lab === "system" ? <SystemDiagnostics /> : null}
    {lab === "performance" ? <PerformanceDiagnostics /> : null}
    {lab === "deployment" ? <DeploymentLab /> : null}
    {lab === "viewer" ? <PdfViewerLab /> : null}
    {lab === "engine" ? <EngineLab /> : null}
    {lab === "coordinates" ? <CoordinatesLab /> : null}
    {lab === "storage" ? <StorageLab /> : null}
    {!labs.some((item) => item.id === lab) || lab === "overview" ? <Overview /> : null}
  </div>;
}
