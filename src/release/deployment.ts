export function normalizeBasePath(value: string): string {
  let path = value.trim() || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (!path.endsWith("/")) path += "/";
  return path;
}

export function cacheNamespaceForBase(value: string): string {
  const normalized = normalizeBasePath(value);
  const token = normalized.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return token || "root";
}

export function githubPagesProjectBase(repository: string): string {
  const name = repository.trim().split("/").filter(Boolean).at(-1) ?? "";
  return name ? `/${name}/` : "/";
}

export function pathIsWithinBase(pathname: string, basePath: string): boolean {
  const base = normalizeBasePath(basePath);
  if (base === "/") return pathname.startsWith("/");
  return pathname === base.slice(0, -1) || pathname.startsWith(base);
}

export function deploymentAssetUrl(relative: string, basePath = import.meta.env.BASE_URL): string {
  const clean = relative.replace(/^\/+/, "");
  return new URL(`${normalizeBasePath(basePath)}${clean}`, window.location.origin).toString();
}

export interface DeploymentAssessment {
  basePath: string;
  currentPath: string;
  withinBase: boolean;
  githubPagesProjectSite: boolean;
  sharedGithubIoOrigin: boolean;
}

export function assessDeployment(locationLike: Pick<Location, "hostname" | "pathname">, basePath = import.meta.env.BASE_URL): DeploymentAssessment {
  const normalized = normalizeBasePath(basePath);
  const githubPagesProjectSite = locationLike.hostname.endsWith(".github.io") && normalized !== "/";
  return {
    basePath: normalized,
    currentPath: locationLike.pathname,
    withinBase: pathIsWithinBase(locationLike.pathname, normalized),
    githubPagesProjectSite,
    sharedGithubIoOrigin: githubPagesProjectSite
  };
}
