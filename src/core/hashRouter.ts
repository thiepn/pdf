export type LabRoute = "overview" | "deployment" | "viewer" | "engine" | "coordinates" | "storage";

const knownRoutes = new Set<LabRoute>([
  "overview",
  "deployment",
  "viewer",
  "engine",
  "coordinates",
  "storage"
]);

export function readRoute(hash = window.location.hash): LabRoute {
  const value = hash.replace(/^#\/?/, "").split(/[/?]/)[0] || "overview";
  return knownRoutes.has(value as LabRoute) ? (value as LabRoute) : "overview";
}

export function navigate(route: LabRoute): void {
  window.location.hash = `/${route}`;
}
