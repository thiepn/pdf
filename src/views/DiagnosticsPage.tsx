import { CoordinatesLab } from "../prototypes/coordinates/CoordinatesLab";
import { DeploymentLab } from "../prototypes/deployment/DeploymentLab";
import { EngineLab } from "../prototypes/engine/EngineLab";
import { StorageLab } from "../prototypes/storage/StorageLab";
import { PdfViewerLab } from "../prototypes/viewer/PdfViewerLab";
import { Overview } from "../lab/Overview";
import { routeHref } from "../core/appRouter";
import { PerformanceDiagnostics } from "../diagnostics/PerformanceDiagnostics";
import { SystemDiagnostics } from "../diagnostics/SystemDiagnostics";

const primaryLabs = [
  { id: "system", label: "System" },
  { id: "performance", label: "Performance" }
] as const;
const technicalLabs = [
  { id: "overview", label: "Technical overview" },
  { id: "deployment", label: "Deployment" },
  { id: "viewer", label: "PDF.js" },
  { id: "engine", label: "MuPDF" },
  { id: "coordinates", label: "Coordinates" },
  { id: "storage", label: "Storage probe" }
] as const;
const labs = [...primaryLabs, ...technicalLabs];

export function DiagnosticsPage({ lab = "system" }: { lab?: string }) {
  const activeLab = labs.some((item) => item.id === lab) ? lab : "system";
  const technicalActive = technicalLabs.some((item) => item.id === activeLab);
  return <div className="stack">
    <nav className="diagnostic-tabs" aria-label="Troubleshooting diagnostics">{primaryLabs.map((item) => <a className={activeLab === item.id ? "active" : ""} href={routeHref({ name: "diagnostics", lab: item.id })} key={item.id}>{item.label}</a>)}</nav>
    <details className="card diagnostic-technical-disclosure" open={technicalActive}><summary>Technical diagnostics</summary><p>Implementation-specific checks for deeper troubleshooting. Most users do not need these.</p><nav className="diagnostic-tabs" aria-label="Technical diagnostic laboratories">{technicalLabs.map((item) => <a className={activeLab === item.id ? "active" : ""} href={routeHref({ name: "diagnostics", lab: item.id })} key={item.id}>{item.label}</a>)}</nav></details>
    {activeLab === "system" ? <SystemDiagnostics /> : null}
    {activeLab === "performance" ? <PerformanceDiagnostics /> : null}
    {activeLab === "deployment" ? <DeploymentLab /> : null}
    {activeLab === "viewer" ? <PdfViewerLab /> : null}
    {activeLab === "engine" ? <EngineLab /> : null}
    {activeLab === "coordinates" ? <CoordinatesLab /> : null}
    {activeLab === "storage" ? <StorageLab /> : null}
    {activeLab === "overview" ? <Overview /> : null}
  </div>;
}
