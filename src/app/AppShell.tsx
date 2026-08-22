import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { routeHref, type AppRoute } from "../core/appRouter";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { UpdateBanner } from "../components/UpdateBanner";
import { APP_VERSION } from "../core/release";
import { CommandPalette } from "../components/CommandPalette";
import { isSafeMode } from "../maintenance/safeMode";
import { Icon, type IconName } from "../components/Icon";

interface AppShellProps { route: AppRoute; children: ReactNode; title: string; subtitle?: string; fullBleed?: boolean; hideTopbar?: boolean }

const navigation: Array<{ route: AppRoute; label: string; icon: IconName }> = [
  { route: { name: "home" }, label: "Home", icon: "home" },
  { route: { name: "projects" }, label: "Documents", icon: "documents" },
  { route: { name: "tools" }, label: "Tools", icon: "tools" },
  { route: { name: "settings" }, label: "Settings", icon: "settings" },
  { route: { name: "help" }, label: "Help", icon: "help" }
];

// Keep normal support navigation focused on things a user may actually need.
// Engineering laboratories, release self-checks, and raw storage diagnostics remain
// reachable from Help/About for troubleshooting but do not compete with PDF work.
const utilityNavigation: Array<{ route: AppRoute; label: string; description: string }> = [
  { route: { name: "activity" }, label: "Download history", description: "Local output records" },
  { route: { name: "maintenance" }, label: "Troubleshooting & recovery", description: "Safe mode, project health, and app recovery" },
  { route: { name: "release" }, label: "About this app", description: "Capabilities, limitations, and technical support" }
];

const mobileNavigation = navigation.filter((item) => ["home", "projects", "tools", "settings", "help"].includes(item.route.name));

function isActive(route: AppRoute, item: AppRoute): boolean {
  const quickToolRoutes: AppRoute["name"][] = ["tools", "merge", "scan", "batch", "compare", "create"];
  const documentRoutes: AppRoute["name"][] = ["projects", "workspace", "viewer", "organizer", "editor", "secure", "ocr", "compress", "inspector", "repair", "professional", "preservation", "native", "compliance", "toolbox"];
  return item.name === route.name
    || (item.name === "tools" && quickToolRoutes.includes(route.name))
    || (item.name === "projects" && documentRoutes.includes(route.name));
}

function routeKey(route: AppRoute): string {
  if ("projectId" in route) return `${route.name}:${route.projectId}:${"mode" in route ? route.mode : ""}`;
  return `${route.name}:${"lab" in route ? route.lab ?? "" : ""}`;
}

export function AppShell({ route, children, title, subtitle, fullBleed = false, hideTopbar = false }: AppShellProps) {
  const viewer = ["workspace", "viewer", "organizer", "editor", "secure", "ocr", "compress", "inspector", "repair", "professional", "preservation", "native", "compliance", "toolbox"].includes(route.name);
  const mainRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mountedRef = useRef(false);
  const currentRouteKey = useMemo(() => routeKey(route), [route]);

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    const frame = window.requestAnimationFrame(() => {
      const target = hideTopbar ? mainRef.current : headingRef.current;
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentRouteKey, hideTopbar]);

  return <div className={viewer ? "app-shell app-shell--viewer" : "app-shell"}>
    <a className="skip-link" href="#main-workspace">Skip to workspace</a>
    <aside className="sidebar app-sidebar" aria-label="Application sidebar">
      <a aria-label="PDF Studio home" className="brand" href={routeHref({ name: "home" })}><img alt="" aria-hidden="true" className="brand__mark" src={`${import.meta.env.BASE_URL}icons/icon.svg`} /><div><strong>PDF Studio</strong><span>Private browser workspace</span></div></a>
      <nav className="nav-list" aria-label="Application navigation">{navigation.map((item) => <a aria-current={isActive(route, item.route) ? "page" : undefined} className={isActive(route, item.route) ? "nav-item nav-item--active" : "nav-item"} href={routeHref(item.route)} key={item.route.name}><Icon className="nav-item__icon" name={item.icon} /><span>{item.label}</span></a>)}</nav>
      <CommandPalette />
      <details className="sidebar-advanced">
        <summary>Support</summary>
        <nav aria-label="Support navigation" className="sidebar-utility-links">{utilityNavigation.map((item) => <a href={routeHref(item.route)} key={item.route.name}><strong>{item.label}</strong><small>{item.description}</small></a>)}</nav>
      </details>
      <div className="sidebar__footer sidebar__footer--stacked"><div><span className="privacy-dot" /> Files stay on this device</div><div><ConnectionStatus compact /> · v{APP_VERSION}</div></div>
    </aside>

    <main aria-label={hideTopbar ? title : undefined} className="main-content" id="main-workspace" ref={mainRef} tabIndex={-1}>
      <div aria-atomic="true" aria-live="polite" className="visually-hidden" role="status">{title}</div>
      <UpdateBanner />
      {!hideTopbar ? <header className="topbar app-topbar"><div><p className="eyebrow">Local-first PDF workspace</p><h1 data-route-heading="true" ref={headingRef} tabIndex={-1}>{title}</h1>{subtitle ? <p className="topbar__subtitle">{subtitle}</p> : null}</div><div className="topbar__state"><span className="local-badge"><span className="privacy-dot" /> {isSafeMode() ? "Safe mode" : "Local"}</span><span className="separator" /><ConnectionStatus /></div></header> : null}
      <div className={fullBleed ? "workspace workspace--full" : "workspace"}>{children}</div>
    </main>

    {!viewer ? <nav className="mobile-nav" aria-label="Mobile navigation">{mobileNavigation.map((item) => <a aria-current={isActive(route, item.route) ? "page" : undefined} className={isActive(route, item.route) ? "active" : ""} href={routeHref(item.route)} key={item.route.name}><Icon name={item.icon} /><small>{item.label}</small></a>)}</nav> : null}
  </div>;
}
