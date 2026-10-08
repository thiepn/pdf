import type { BatchStep } from "../types/batch";

/** Public, versioned, data-only contract. This file never imports engines or UI. */
export const HEADLESS_ACTION_SCHEMA = 1 as const;
export type HeadlessActionId =
  | "pdf.rotate" | "pdf.optimize" | "pdf.metadata.remove" | "pdf.crop"
  | "pdf.decorate" | "pdf.pages.blank" | "pdf.raster.compress"
  | "pdf.raster.grayscale" | "pdf.split.fixed" | "pdf.pages.images";

export type ActionRisk = "metadata-removal" | "rasterization";
export type ActionOutputKind = "pdf" | "split-zip" | "images-zip";
export interface ActionDescriptor {
  id: HeadlessActionId;
  label: string;
  description: string;
  inputMime: "application/pdf";
  outputMime: "application/pdf" | "application/zip";
  outputKind: ActionOutputKind;
  terminal: boolean;
  risks: readonly ActionRisk[];
  options: readonly string[];
}
export interface ActionRequest {
  schemaVersion: typeof HEADLESS_ACTION_SCHEMA;
  actionId: HeadlessActionId;
  params: Record<string, unknown>;
  /** Risk acknowledgements must be provided by the initiating workflow, never inferred from params. */
  approvedRisks?: ActionRisk[];
}
export interface ActionPlan {
  schemaVersion: typeof HEADLESS_ACTION_SCHEMA;
  actions: Array<{ id: HeadlessActionId; label: string; risks: ActionRisk[]; outputKind: ActionOutputKind; terminal: boolean }>;
  approved: boolean;
  requiredRisks: ActionRisk[];
}
const d = (id: HeadlessActionId, label: string, description: string, options: string[], risks: ActionRisk[] = [], outputKind: ActionOutputKind = "pdf"): ActionDescriptor => ({
  id,label,description,inputMime:"application/pdf",outputMime:outputKind === "pdf" ? "application/pdf" : "application/zip",
  outputKind,terminal:outputKind!=="pdf",risks,options
});
export const HEADLESS_ACTIONS: readonly ActionDescriptor[] = [
  d("pdf.rotate","Rotate pages","Rotate the PDF page assembly.",["degrees"]),
  d("pdf.optimize","Lossless cleanup","Recompress PDF internals using the existing MuPDF engine.",[]),
  d("pdf.metadata.remove","Remove metadata","Remove document metadata deliberately.",[],["metadata-removal"]),
  d("pdf.crop","Crop page margins","Apply non-destructive crop box changes.",["topMm","rightMm","bottomMm","leftMm"]),
  d("pdf.decorate","Decorate pages","Add a watermark, header/footer, or numbering.",["watermarkText","headerText","footerText","pageNumbers","startNumber","fontLanguage"]),
  d("pdf.pages.blank","Insert blank pages","Insert bounded blank pages at the start or end.",["position","count","widthMm","heightMm"]),
  d("pdf.raster.compress","Raster compression","Flatten page content to compressed page images.",["profile"],["rasterization"]),
  d("pdf.raster.grayscale","Grayscale raster output","Flatten the PDF and convert rendered pages to grayscale.",["profile"],["rasterization"]),
  d("pdf.split.fixed","Split to ZIP","Produce PDFs with a fixed maximum page count.",["pagesPerFile"],[],"split-zip"),
  d("pdf.pages.images","Export page images","Produce PNG page images in a ZIP.",["quality"],[],"images-zip")
] as const;
const byId = new Map(HEADLESS_ACTIONS.map(item => [item.id, item]));
export function listHeadlessActions(): ActionDescriptor[] { return HEADLESS_ACTIONS.map(x=>({...x,options:[...x.options],risks:[...x.risks]})); }
export function getHeadlessAction(id: string): ActionDescriptor {
  const descriptor = byId.get(id as HeadlessActionId);
  if (!descriptor) throw new Error(`Unknown PDF action: ${id.slice(0,80)}`);
  return descriptor;
}
const plain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function number(value: unknown, key: string, low: number, high: number, integer = false): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high || (integer && !Number.isSafeInteger(value)))
    throw new Error(`${key} must be ${integer?"a whole number":"a finite number"} between ${low} and ${high}.`);
}
function oneOf(value: unknown, key: string, items: readonly (string | number)[]): void {
  if (!items.includes(value as string | number)) throw new Error(`${key} must be one of: ${items.join(", ")}.`);
}
function shortString(value: unknown, key: string, max = 500): void {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`${key} must be text of at most ${max} characters.`);
}
/** Strict parsing boundary for programmatically generated commands and imported recipes. */
export function validateActionRequest(input: unknown): ActionRequest {
  if (!plain(input) || input.schemaVersion !== HEADLESS_ACTION_SCHEMA || typeof input.actionId !== "string" || !plain(input.params))
    throw new Error("PDF action requires schemaVersion 1, a known actionId and an options object.");
  for (const key of Object.keys(input)) if (!["schemaVersion","actionId","params","approvedRisks"].includes(key)) throw new Error(`Unknown action property: ${key}`);
  const item = getHeadlessAction(input.actionId);
  const params = input.params;
  for (const key of Object.keys(params)) if (!item.options.includes(key)) throw new Error(`Unknown option for ${item.id}: ${key}`);
  for (const key of item.options) {
    if (!(key in params) && !(item.id === "pdf.decorate" && key === "fontLanguage")) throw new Error(`Missing ${item.id} option: ${key}`);
  }
  switch (item.id) {
    case "pdf.rotate": oneOf(params.degrees,"degrees",[90,180,270]); break;
    case "pdf.crop":
      for (const key of item.options) number(params[key],key,0,5000);
      break;
    case "pdf.decorate":
      for (const key of ["watermarkText","headerText","footerText"]) shortString(params[key],key,400);
      if (typeof params.pageNumbers !== "boolean") throw new Error("pageNumbers must be a boolean.");
      number(params.startNumber,"startNumber",1,1000000,true);
      if (params.fontLanguage !== undefined) oneOf(params.fontLanguage,"fontLanguage",["auto","ko","ja","zh-Hans","zh-Hant"]);
      break;
    case "pdf.pages.blank":
      oneOf(params.position,"position",["start","end"]);
      number(params.count,"count",1,20,true);
      number(params.widthMm,"widthMm",25,2000);
      number(params.heightMm,"heightMm",25,2000);
      break;
    case "pdf.raster.compress": oneOf(params.profile,"profile",["screen","balanced","small","print"]); break;
    case "pdf.raster.grayscale": oneOf(params.profile,"profile",["screen","balanced","print"]); break;
    case "pdf.split.fixed": number(params.pagesPerFile,"pagesPerFile",1,500,true); break;
    case "pdf.pages.images": oneOf(params.quality,"quality",["compact","balanced","high"]); break;
  }
  const approved = input.approvedRisks ?? [];
  if (!Array.isArray(approved) || approved.some(r => !["metadata-removal","rasterization"].includes(r)))
    throw new Error("Invalid risk acknowledgement list.");
  return {schemaVersion:1,actionId:item.id,params:{...params},approvedRisks:[...new Set(approved)] as ActionRisk[]};
}
export function planHeadlessActions(requests: readonly unknown[]): ActionPlan {
  if (!Array.isArray(requests) || !requests.length || requests.length>32) throw new Error("Supply between 1 and 32 PDF actions.");
  const validated = requests.map(validateActionRequest);
  const required = new Set<ActionRisk>();
  for (const [index,request] of validated.entries()) {
    const descriptor = getHeadlessAction(request.actionId);
    if (descriptor.terminal && index !== validated.length-1) throw new Error(`${descriptor.label} must be the last action.`);
    descriptor.risks.forEach(r=>required.add(r));
  }
  return {
    schemaVersion:HEADLESS_ACTION_SCHEMA,
    actions:validated.map(request=>{const d=getHeadlessAction(request.actionId);return{id:d.id,label:d.label,risks:[...d.risks],outputKind:d.outputKind,terminal:d.terminal};}),
    requiredRisks:[...required],
    approved:validated.every(request=>getHeadlessAction(request.actionId).risks.every(risk=>request.approvedRisks?.includes(risk)))
  };
}
/** Adapter from persisted batch recipe, whose explicit selected steps represent UI intent. */
export function actionFromBatchStep(step: BatchStep): ActionRequest {
  const {id: _id,type,...params}=step;
  const ids:Record<BatchStep["type"],HeadlessActionId>={
    "rotate":"pdf.rotate","optimize":"pdf.optimize","remove-metadata":"pdf.metadata.remove","crop":"pdf.crop",
    "decorate":"pdf.decorate","blank-pages":"pdf.pages.blank","raster-compress":"pdf.raster.compress",
    "grayscale":"pdf.raster.grayscale","split-fixed":"pdf.split.fixed","page-images":"pdf.pages.images"
  };
  const descriptor = getHeadlessAction(ids[type]);
  return validateActionRequest({schemaVersion:1,actionId:descriptor.id,params,approvedRisks:[...descriptor.risks]});
}
