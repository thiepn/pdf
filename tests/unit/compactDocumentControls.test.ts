import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReaderToolbar } from "../../src/viewer/ReaderToolbar";
import { CompactDocumentHome, DocumentControlsContext, COMPACT_DOCUMENT_QUERY } from "../../src/product/CompactDocumentControls";
import type { ViewerPreferences } from "../../src/types/project";

let root: Root | undefined;
afterEach(() => { if (root) act(() => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount(compact: boolean) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const listeners = new Set<() => void>();
  let matches = compact;
  vi.stubGlobal("matchMedia", (query: string) => ({ media:query, get matches() { return query === COMPACT_DOCUMENT_QUERY && matches; }, addEventListener: (_:string, cb:()=>void) => listeners.add(cb), removeEventListener:(_:string, cb:()=>void) => listeners.delete(cb) }));
  const host = document.createElement("div"); document.body.append(host); root=createRoot(host);
  const preferences: ViewerPreferences = {projectId:"phone", pageNumber:2, zoom:1, viewMode:"single", sidebarTab:"pages", sidebarOpen:false, updatedAt:0};
  const download = vi.fn(), fit=vi.fn(), find=vi.fn();
  function Reader() { const [p,setP]=useState(preferences); return createElement(ReaderToolbar,{preferences:p,pageCount:1000,ready:true,onPreferences:patch=>setP({...p,...patch}),onPage:pageNumber=>setP({...p,pageNumber}),onFit:fit,onFind:find,onDownload:download,onBackup:vi.fn()}); }
  act(()=>root!.render(createElement(Reader)));
  return {host,download,fit,find,resize(value:boolean){act(()=>{matches=value;listeners.forEach(cb=>cb());});}};
}
function button(host: HTMLElement, label: string): HTMLButtonElement {
  const element = Array.from(host.querySelectorAll("button")).find(node=>node.getAttribute("aria-label")===label || node.textContent===label);
  if (!element) throw new Error(`Missing button: ${label}`); return element;
}
function click(node: HTMLElement) {act(()=>node.click());}
describe("compact document controls",()=>{
  it("renders only five icon buttons and a page field in the default reader row",()=>{
    const {host,download}=mount(true);
    expect(host.querySelector(".compact-document-bar")).not.toBeNull();
    expect(host.querySelectorAll(".compact-document-bar > button")).toHaveLength(4);
    expect(host.querySelectorAll(".compact-document-bar > a")).toHaveLength(1);
    expect(host.querySelectorAll(".compact-document-bar .page-input")).toHaveLength(1);
    expect(host.querySelectorAll("[role=dialog], select")).toHaveLength(0);
    click(button(host,"Next page")); expect((host.querySelector("input") as HTMLInputElement).value).toBe("3");
    click(button(host,"Download original PDF")); expect(download).toHaveBeenCalledOnce();
  });
  it("opens all secondary reader controls on demand and closes after fit",()=>{
    const {host,fit}=mount(true);
    click(button(host,"More reader actions")); expect(host.querySelector('[role=dialog]')).not.toBeNull();
    for (const name of ["Pages / search","Find text","Zoom out","Zoom in","Fit width","Fit page","Single","Continuous","Back up project"]) expect(button(host,name)).toBeDefined();
    click(button(host,"Fit width")); expect(fit).toHaveBeenCalledWith("width"); expect(host.querySelector('[role=dialog]')).toBeNull();
  });
  it("closes an obsolete compact menu on resize without resetting page or zoom",()=>{
    const {host,resize}=mount(true);
    click(button(host,"Next page")); click(button(host,"More reader actions")); click(button(host,"Zoom in"));
    resize(false); expect(host.querySelector('[role=dialog]')).toBeNull(); expect(host.querySelector('.compact-document-bar')).toBeNull();
    expect((host.querySelector('select[aria-label="Zoom"]') as HTMLSelectElement).value).toBe("1.25");
    expect((host.querySelector('input[aria-label="Current page"]') as HTMLInputElement).value).toBe("3");
    resize(true); expect(host.querySelector('[role=dialog]')).toBeNull(); expect((host.querySelector('input') as HTMLInputElement).value).toBe("3");
  });
  it("preserves the workspace's leave guard in the compact back control",()=>{
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
    const host=document.createElement("div");document.body.append(host);root=createRoot(host);
    const guard=vi.fn(event=>event.preventDefault());
    act(()=>root!.render(createElement(DocumentControlsContext.Provider,{value:{title:"protected",summary:"3 pages",busy:true,onHomeClick:guard,openActions:vi.fn(),openHistory:vi.fn()}},createElement(CompactDocumentHome))));
    const back=host.querySelector('a')!;expect(back.getAttribute('aria-disabled')).toBe("true");click(back);expect(guard).toHaveBeenCalledOnce();
  });
});
