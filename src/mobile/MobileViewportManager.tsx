import { useEffect } from "react";
import { classifyResponsiveWidth, deriveViewportMetrics } from "./layoutPolicy";

export function MobileViewportManager() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const viewport = window.visualViewport;
      const metrics = deriveViewportMetrics(
        window.innerHeight,
        viewport?.height ?? window.innerHeight,
        viewport?.offsetTop ?? 0,
        viewport?.width ?? window.innerWidth,
        viewport?.offsetLeft ?? 0
      );
      root.style.setProperty("--app-viewport-height", `${Math.round(metrics.visualHeight)}px`);
      root.style.setProperty("--app-viewport-width", `${Math.round(metrics.visualWidth || window.innerWidth)}px`);
      root.style.setProperty("--visual-viewport-offset-top", `${Math.round(metrics.offsetTop)}px`);
      root.style.setProperty("--visual-viewport-offset-left", `${Math.round(metrics.offsetLeft)}px`);
      root.style.setProperty("--keyboard-inset", `${metrics.keyboardInset}px`);
      root.dataset.viewportClass = classifyResponsiveWidth(window.innerWidth);
      root.dataset.orientation = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
      if (metrics.keyboardOpen) root.dataset.keyboardOpen = "true";
      else delete root.dataset.keyboardOpen;
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("scroll", schedule, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, []);
  return null;
}
