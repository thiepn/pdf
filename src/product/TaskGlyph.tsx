import { Icon } from "../components/Icon";
import type { PdfTask } from "../ia/taskCatalog";

/** Every everyday operation has its own visual cue, not another generic page icon. */
export function TaskGlyph({ task, large = false }: { task: PdfTask; large?: boolean }) {
  const tone = task.id.includes("compress") ? "green" : task.category === "protect" ? "rose" : task.category === "pages" ? "amber" : task.category === "convert" ? "blue" : task.category === "edit" ? "violet" : "indigo";
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let shape;
  switch (task.id) {
    case "merge-pdfs": shape = <><path {...stroke} d="M3 3h6v7H3zM15 3h6v7h-6zM6 13v2h12v-2M12 15v6m-3-3 3 3 3-3" /></>; break;
    case "split-pdf": shape = <><path {...stroke} d="M8 2h8v7H8zM12 12v2M5 18v-4h14v4M2 18h6v4H2zM16 18h6v4h-6z" /></>; break;
    case "extract-pages": shape = <><path {...stroke} d="M3 3h10v15H3zM7 6h3M7 9h3M15 12h6v9h-6M10 13h7m-3-3 3 3-3 3" /></>; break;
    case "remove-pages": shape = <><path {...stroke} d="M4 2h10l4 4v5M14 2v4h4M4 2v19h7M15 15l6 6m0-6-6 6" /></>; break;
    case "rotate-pdf": shape = <><path {...stroke} d="M6 10H3V7a8 8 0 0 1 15-2M3 10l4-3M8 9h10v13H8zM11 13h4m-4 4h4" /></>; break;
    case "crop-pages": shape = <><path {...stroke} d="M7 2v15h15M2 7h15v15M10 3h11v11M3 10v11h11" /></>; break;
    case "add-page-numbers": shape = <><path {...stroke} d="M4 2h11l4 4v16H4zM14 2v5h5M9 12l3-2v8m-3 0h6" /></>; break;
    case "add-watermark": shape = <><path {...stroke} d="M4 2h11l4 4v16H4zM14 2v5h5M7 14l3 4 2-5 3 3 2-5" /></>; break;
    case "password-protect": case "unlock-pdf": shape = <><rect {...stroke} x="4" y="10" width="16" height="12" rx="3" /><path {...stroke} d={task.id === "unlock-pdf" ? "M8 10V6a4 4 0 0 1 7-3" : "M8 10V6a4 4 0 0 1 8 0v4"} /><path {...stroke} d="M12 15v3" /></>; break;
    case "images-to-pdf": case "pdf-to-jpg": case "pdf-to-png": shape = <><rect {...stroke} x="2" y="3" width="15" height="16" rx="2" /><path {...stroke} d="m4 15 4-4 3 3 2-2 2 3M20 7v14H7" /><circle {...stroke} cx="12" cy="8" r="1.5" /></>; break;
    default: shape = null;
  }
  return <span className={`task-glyph${large ? " task-glyph--large" : ""}`} data-tone={tone}>{shape ? <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">{shape}</svg> : <Icon name={task.id === "visual-signature" ? "signature" : task.icon} size={large ? 32 : 25} />}</span>;
}

export function ProductMark() {
  return <svg className="product-mark" aria-hidden="true" focusable="false" viewBox="0 0 36 36"><rect width="36" height="36" rx="11" fill="currentColor" /><path d="M11 8h9l6 6v14H11z" fill="white" /><path d="M20 8v7h6M15 20h7M15 24h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}
