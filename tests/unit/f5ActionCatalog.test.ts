import { describe, expect, it } from "vitest";
import {
  HEADLESS_ACTION_SCHEMA, HEADLESS_ACTIONS, actionFromBatchStep,
  getHeadlessAction, listHeadlessActions, planHeadlessActions, validateActionRequest
} from "../../src/actions/actionCatalog";
import type { BatchStep } from "../../src/types/batch";

const action = (id: string, params: Record<string,unknown> = {}, approvedRisks: string[] = []) =>
  ({schemaVersion:HEADLESS_ACTION_SCHEMA,actionId:id,params,approvedRisks});

describe("F5 headless PDF action registry", () => {
  it("publishes ten uniquely identified immutable operations with no UI dependencies", () => {
    const entries=listHeadlessActions();
    expect(entries).toHaveLength(10);
    expect(new Set(entries.map(x=>x.id)).size).toBe(entries.length);
    expect(entries.every(x=>x.inputMime==="application/pdf" && x.outputMime.startsWith("application/"))).toBe(true);
    const item=entries[0];
    item.options.push("fake");
    expect(getHeadlessAction(item.id).options).not.toContain("fake");
    expect(() => getHeadlessAction("pdf.hack")).toThrow(/Unknown PDF action/);
  });
  it("rejects schema drift, extra command keys, hidden options and invalid payloads", () => {
    expect(() => validateActionRequest({...action("pdf.optimize"),schemaVersion:2})).toThrow(/schemaVersion/);
    expect(() => validateActionRequest({...action("pdf.optimize"),shell:"rm -rf"})).toThrow(/Unknown action property/);
    expect(() => validateActionRequest(action("pdf.optimize",{command:"delete"}))).toThrow(/Unknown option/);
    expect(() => validateActionRequest(action("pdf.rotate",{degrees:13}))).toThrow(/degrees/);
    expect(() => validateActionRequest(action("pdf.rotate",{degrees:"90"}))).toThrow(/degrees/);
    expect(() => validateActionRequest(action("pdf.pages.blank",{position:"end",count:Infinity,widthMm:210,heightMm:297}))).toThrow(/count/);
    expect(() => validateActionRequest(action("pdf.pages.blank",{position:"middle",count:1,widthMm:210,heightMm:297}))).toThrow(/position/);
    expect(() => validateActionRequest(action("pdf.crop",{topMm:0,rightMm:0,bottomMm:-1,leftMm:0}))).toThrow(/bottomMm/);
    expect(() => validateActionRequest(action("pdf.decorate",{watermarkText:"\u0001",headerText:"",footerText:"",pageNumbers:false,startNumber:1}))).toThrow(/watermarkText/);
  });
  it("requires all fields and bounds their values", () => {
    expect(() => validateActionRequest(action("pdf.crop",{topMm:12,rightMm:0,bottomMm:0}))).toThrow(/Missing/);
    expect(() => validateActionRequest(action("pdf.split.fixed",{pagesPerFile:501}))).toThrow(/pagesPerFile/);
    expect(() => validateActionRequest(action("pdf.pages.images",{quality:"300dpi"}))).toThrow(/quality/);
    expect(validateActionRequest(action("pdf.rotate",{degrees:180})).actionId).toBe("pdf.rotate");
  });
  it("enforces terminal output ordering before side effects", () => {
    expect(() => planHeadlessActions([
      action("pdf.split.fixed",{pagesPerFile:4}),action("pdf.optimize")
    ])).toThrow(/last action/);
    expect(() => planHeadlessActions([])).toThrow(/between 1 and 32/);
    expect(() => planHeadlessActions(Array.from({length:33},()=>action("pdf.optimize")))).toThrow(/32/);
    expect(planHeadlessActions([action("pdf.optimize"),action("pdf.split.fixed",{pagesPerFile:4})]).actions.at(-1)?.outputKind).toBe("split-zip");
  });
  it("reports risk and refuses unacknowledged destructive processing", () => {
    const requests = [action("pdf.metadata.remove"),action("pdf.raster.compress",{profile:"small"})];
    const plan=planHeadlessActions(requests);
    expect(plan.requiredRisks).toEqual(["metadata-removal","rasterization"]);
    expect(plan.approved).toBe(false);
    expect(planHeadlessActions([action("pdf.metadata.remove",{},["metadata-removal"])]).approved).toBe(true);
    expect(() => validateActionRequest(action("pdf.optimize",{},["network-access"]))).toThrow(/risk/);
  });
  it("maps every existing batch step to a published action without preserving implementation ids", () => {
    const steps:BatchStep[]=[
      {id:"a",type:"rotate",degrees:90},{id:"b",type:"optimize"},{id:"c",type:"remove-metadata"},
      {id:"d",type:"crop",topMm:1,rightMm:0,bottomMm:0,leftMm:0},
      {id:"e",type:"decorate",watermarkText:"DRAFT",headerText:"",footerText:"",pageNumbers:true,startNumber:1},
      {id:"f",type:"blank-pages",position:"end",count:1,widthMm:210,heightMm:297},
      {id:"g",type:"raster-compress",profile:"balanced"},{id:"h",type:"grayscale",profile:"screen"},
      {id:"i",type:"split-fixed",pagesPerFile:3},{id:"j",type:"page-images",quality:"high"}
    ];
    const requests=steps.map(actionFromBatchStep);
    expect(requests.map(x=>x.actionId).sort()).toEqual(HEADLESS_ACTIONS.map(x=>x.id).sort());
    expect(requests.every(x=>!("id" in x.params) && !("type" in x.params))).toBe(true);
    expect(requests.find(x=>x.actionId==="pdf.raster.compress")?.approvedRisks).toEqual(["rasterization"]);
    expect(planHeadlessActions(requests.slice(0,-2)).approved).toBe(true);
    expect(() => actionFromBatchStep({...steps[4],startNumber:0} as BatchStep)).toThrow(/startNumber/);
  });
});
