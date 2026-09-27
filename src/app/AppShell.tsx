import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { routeHref, type AppRoute } from "../core/appRouter";
import { CommandPalette } from "../components/CommandPalette";
import { UpdateBanner } from "../components/UpdateBanner";
import { Icon } from "../components/Icon";
import { useModalFocus } from "../accessibility/modalFocus";
import { isSafeMode } from "../maintenance/safeMode";
import { ProductMark } from "../product/TaskGlyph";
import { APP_VERSION } from "../core/release";

interface AppShellProps { route: AppRoute; children: ReactNode; title: string; subtitle?: string; fullBleed?: boolean; hideTopbar?: boolean }
export function AppShell({ route, children, title, subtitle, fullBleed = false, hideTopbar = false }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const mounted = useRef(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useModalFocus(menuOpen, menuRef, closeMenu);
  const routeKey = `${route.name}:${"projectId" in route ? route.projectId : ""}:${"taskId" in route ? route.taskId ?? "" : ""}:${"mode" in route ? route.mode : ""}`;
  const ownsHeading = ["home", "tools", "quick"].includes(route.name) || hideTopbar;
  useEffect(() => {
    setMenuOpen(false);
    document.title = title === "PDF Studio" ? "PDF Studio — Your everyday PDF tools" : `${title} · PDF Studio`;
    if (!mounted.current) { mounted.current = true; return; }
    const frame = requestAnimationFrame(() => { mainRef.current?.focus({ preventScroll: true }); if (!hideTopbar) window.scrollTo({ top: 0 }); });
    return () => cancelAnimationFrame(frame);
  }, [routeKey]);
  return <div className={`product-app${hideTopbar ? " product-app--document" : ""}`}>
    <a className="skip-link" href="#main-workspace" onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}>Skip to content</a>
    {!hideTopbar ? <header className="product-header">
      <a className="product-brand" aria-label="PDF Studio home" href={routeHref({ name: "home" })}><ProductMark /><span>PDF<span className="product-brand__light">Studio</span></span></a>
      <nav className="product-header__links" aria-label="Main navigation"><a href={routeHref({ name: "tools" })}>All PDF tools</a><a href={routeHref({ name: "tools", taskId: "edit-pdf" })}>Edit a PDF</a></nav>
      <div className="product-header__end"><span className="product-private"><Icon name="shield" size={16} />On your device</span><button className="product-menu-button" aria-label="Open app menu" aria-expanded={menuOpen} aria-haspopup="dialog" onClick={() => setMenuOpen(true)} type="button"><Icon name="more" size={22} /></button></div>
    </header> : null}
    <CommandPalette showTrigger={false} />
    <main className={`product-main${fullBleed ? " product-main--full" : ""}`} aria-label={title} id="main-workspace" ref={mainRef} tabIndex={-1}>
      <span className="visually-hidden" aria-live="polite" aria-atomic="true">{title}</span>
      <UpdateBanner />
      {isSafeMode() ? <div className="product-message" role="status">Safe mode is on. <a href={routeHref({ name: "maintenance" })}>Review recovery settings</a></div> : null}
      <div className={ownsHeading ? "product-content" : "product-content product-utility"}>
        {!ownsHeading ? <header className="product-page-heading"><a href={routeHref({ name: "home" })}><Icon name="arrow-left" size={16} /> Home</a><h1 data-route-heading="true">{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</header> : null}
        {children}
      </div>
    </main>
    {!hideTopbar ? <footer className="product-footer"><span>PDF Studio <span aria-hidden="true">·</span> Local PDF tools</span><nav aria-label="Footer navigation"><a href={routeHref({ name: "help" })}>Help</a><a href={routeHref({ name: "settings" })}>Settings</a><a href={routeHref({ name: "release" })}>Privacy & limitations</a></nav></footer> : null}
    {menuOpen ? <div className="product-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeMenu(); }}><section className="product-app-menu" role="dialog" aria-modal="true" aria-labelledby="app-menu-title" ref={menuRef}><header><h2 id="app-menu-title">PDF Studio</h2><button className="icon-button" aria-label="Close app menu" onClick={closeMenu} type="button"><Icon name="close" /></button></header><nav aria-label="App menu"><a href={routeHref({ name: "tools" })}><Icon name="tools" />All PDF tools</a><a href={routeHref({ name: "projects" })}><Icon name="documents" />Saved documents</a><a href={routeHref({ name: "activity" })}><Icon name="download" />Download history</a><a href={routeHref({ name: "settings" })}><Icon name="settings" />Settings & appearance</a><a href={routeHref({ name: "help" })}><Icon name="help" />Help</a><a href={routeHref({ name: "maintenance" })}><Icon name="repair" />Troubleshooting</a></nav><p>v{APP_VERSION} · Files are processed on this device.</p></section></div> : null}
  </div>;
}
