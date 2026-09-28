import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppRoute } from "../../src/core/useAppRoute";
import { scrollPageWithinStage } from "../../src/viewer/scrollPageWithinStage";

let root: Root | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("route continuity", () => {
  it("catches a URL change between render and the subscription effect", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState(null, "", "#/home");
    const host = document.createElement("div"); document.body.append(host);
    function Reader() {
      const route = useAppRoute();
      // Layout effects run before the external-store subscription effect.
      useLayoutEffect(() => { window.history.replaceState(null, "", "#/tools/read-pdf"); }, []);
      return createElement("output", null, JSON.stringify(route));
    }
    root = createRoot(host);
    await act(async () => root!.render(createElement(Reader)));
    expect(host.textContent).toBe(JSON.stringify({ name: "tools", taskId: "read-pdf" }));
  });
  it("tracks history traversal without remounting the consumer", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState(null, "", "#/home");
    const host = document.createElement("div"); document.body.append(host);
    const mounted = vi.fn();
    function Reader() { const route = useAppRoute(); useLayoutEffect(mounted, []); return createElement("output", null, route.name); }
    root = createRoot(host);
    await act(async () => root!.render(createElement(Reader)));
    await act(async () => { window.history.replaceState(null, "", "#/help"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(host.textContent).toBe("help"); expect(mounted).toHaveBeenCalledTimes(1);
  });
});

describe("contained reader scrolling", () => {
  function fixture() {
    const stage = document.createElement("main"), page = document.createElement("section");
    stage.append(page); document.body.append(stage);
    Object.defineProperties(stage, { scrollHeight: { value: 2000 }, clientHeight: { value: 400 }, clientTop: { value: 2 } });
    stage.scrollTop = 200; stage.scrollLeft = 75;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({ top: 100 } as DOMRect);
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue({ top: 450 } as DOMRect);
    const scrollTo = vi.fn(); stage.scrollTo = scrollTo;
    return { stage, page, scrollTo };
  }
  it("uses stage-relative coordinates without scrolling the shell or resetting horizontal pan", () => {
    const { stage, page, scrollTo } = fixture();
    scrollPageWithinStage(stage, page, "smooth");
    expect(scrollTo).toHaveBeenCalledWith({ top: 548, behavior: "smooth" });
    expect(stage.scrollLeft).toBe(75); expect(document.documentElement.scrollTop).toBe(0);
  });
  it("clamps to the viewport scroll range and ignores other documents", () => {
    const { stage, page, scrollTo } = fixture();
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue({ top: 9000 } as DOMRect);
    scrollPageWithinStage(stage, page); expect(scrollTo).toHaveBeenLastCalledWith({ top: 1600, behavior: "auto" });
    scrollPageWithinStage(stage, document.createElement("section"));
    scrollPageWithinStage(stage, undefined); expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});
