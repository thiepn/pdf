import { useEffect } from "react";
import { classifyResponsiveWidth, deriveViewportMetrics } from "./layoutPolicy";

export function MobileViewportManager() {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const viewport = window.visualViewport;
      const metrics = deriveViewportMetrics(window.innerHeight, viewport?.height ?? window.innerHeight, viewport?.offsetTop ?? 0);
      root.style.setProperty("--app-viewport-height", `${Math.round(metrics.visualHeight)}px`);
      root.style.setProperty("--keyboard-inset", `${metrics.keyboardInset}px`);
      root.dataset.viewportClass = classifyResponsiveWidth(window.innerWidth);
      if (metrics.keyboardOpen) root.dataset.keyboardOpen = "true";
      else delete root.dataset.keyboardOpen;
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("orientationchange", update, { passive: true });
    window.visualViewport?.addEventListener("resize", update, { passive: true });
    window.visualViewport?.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);
  return null;
}
