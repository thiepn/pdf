import { describe, expect, it } from "vitest";
import { addWorkflowStep, createWorkflowRunEvidence, duplicateWorkflowStep, reorderWorkflowSteps, validateWorkflowDraft } from "../../src/automation/workflowComposerModel";
import type { BatchRecipe, BatchStep } from "../../src/types/batch";

function recipe(steps: BatchStep[]): BatchRecipe {
  return {schemaVersion:3,id:"r",name:"Demo",steps,outputSuffix:"processed",updatedAt:0};
}
const rotate: BatchStep={type:"rotate",degrees:90,id:"rotate"};
const optimize: BatchStep={type:"optimize",id:"optimize"};
const split: BatchStep={type:"split-fixed",pagesPerFile:4,id:"split"};
describe("F6 visual composition",()=>{
  it("inserts ordinary steps ahead of terminal output and replaces terminal output",()=>{
    const first=addWorkflowStep([rotate,split],"optimize","copy");
    expect(first.map(step=>step.type)).toEqual(["rotate","optimize","split-fixed"]);
    const next=addWorkflowStep(first,"page-images","export");
    expect(next.map(step=>step.type)).toEqual(["rotate","optimize","page-images"]);
    expect(next.at(-1)?.id).toBe("export");
  });
  it("reorders by stable IDs and prevents moving a terminal output upstream",()=>{
    const source=[rotate,optimize,split];
    const reordered=reorderWorkflowSteps(source,"optimize","rotate");
    expect(reordered.map(step=>step.id)).toEqual(["optimize","rotate","split"]);
    expect(reorderWorkflowSteps(source,"split","rotate")).toEqual(source);
    expect(reorderWorkflowSteps(source,"rotate","missing")).toEqual(source);
    expect(reorderWorkflowSteps(source,"missing","rotate")).toEqual(source);
    expect(reorderWorkflowSteps(source,"rotate",null)).toEqual(source);
  });
  it("duplicates safe steps with independent IDs and refuses duplicate exports",()=>{
    expect(duplicateWorkflowStep([rotate,optimize],"rotate","copy").map(step=>step.id)).toEqual(["rotate","copy","optimize"]);
    expect(()=>duplicateWorkflowStep([rotate,split],"split","copy")).toThrow(/Terminal/);
    expect(()=>addWorkflowStep(Array.from({length:32},(_,i)=>({...optimize,id:String(i)})),"rotate")).toThrow(/32/);
  });
  it("preflight detects missing steps, duplicate IDs and malformed settings",()=>{
    expect(validateWorkflowDraft(recipe([])).valid).toBe(false);
    expect(validateWorkflowDraft(recipe([rotate,{...optimize,id:"rotate"}])).errors).toContain("Step IDs must be unique.");
    const invalid=validateWorkflowDraft(recipe([{...rotate,degrees:42 as 90}]));
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join(" ")).toMatch(/degrees/);
    expect(validateWorkflowDraft(recipe([rotate,split,optimize])).errors.join(" ")).toMatch(/last action/);
  });
  it("surfaces destructive operations and marks final ZIP output",()=>{
    const review=validateWorkflowDraft(recipe([{id:"metadata",type:"remove-metadata"},{id:"raster",type:"raster-compress",profile:"small"},split]));
    expect(review.valid).toBe(true);
    expect(review.risks).toEqual(["metadata-removal","rasterization"]);
    expect(review.terminal).toBe(true);
    expect(review.warnings.some(text=>/searchable text/.test(text))).toBe(true);
    expect(review.plan?.actions).toHaveLength(3);
  });
  it("run evidence tracks per-file status without embedding document bytes",()=>{
    const report=createWorkflowRunEvidence({recipeName:"Demo",fingerprint:"abc",failurePolicy:"stop",
      startedAt:"2026-10-09T00:00:00Z",completedAt:"2026-10-09T00:00:01Z",
      entries:[{name:"a.pdf",status:"complete",bytesIn:22,bytesOut:18},{name:"b.pdf",status:"failed",bytesIn:23,bytesOut:null,error:"Oops"}]});
    expect(report.total).toBe(2);
    expect(report.succeeded).toBe(1);
    expect(report.failed).toBe(1);
    expect(JSON.stringify(report)).not.toMatch(/Uint8Array|base64/);
  });
});
