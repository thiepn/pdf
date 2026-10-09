import { describe, expect, it } from "vitest";
import {
  applyAIWorkflowProposal, buildAIWorkflowPrompt, explainProposalChanges,
  isProposalStillCurrent, parseAIWorkflowProposal
} from "../../src/automation/aiWorkflowPlanning";
import { batchRecipeExecutionFingerprint } from "../../src/processing/batchModel";
import type { BatchRecipe } from "../../src/types/batch";

function recipe(): BatchRecipe {
  return {schemaVersion:3,id:"current",name:"Existing cleanup",steps:[{id:"old",type:"optimize"}],outputSuffix:"reviewed",updatedAt:1};
}
function make(actions: Array<{actionId:string;params:Record<string,unknown>}>, overrides:Record<string,unknown>={}) {
  return JSON.stringify({schemaVersion:1,title:"Review PDF",rationale:"Keep processing local, inspect every change.",actions,notes:[],...overrides});
}
describe("F7 AI workflow planning contract",()=>{
  it("builds a useful constrained ChatGPT prompt from public action metadata, not file bytes",()=>{
    const prompt=buildAIWorkflowPrompt("Rotate 90 degrees and split by 5 pages");
    expect(prompt).toContain("pdf.rotate");
    expect(prompt).toContain("pdf.split.fixed");
    expect(prompt).toContain("approvedRisks");
    expect(prompt).toContain("Rotate 90 degrees");
    expect(prompt).toContain("Return ONLY one JSON object");
    expect(prompt).not.toContain("Existing cleanup");
    expect(buildAIWorkflowPrompt("Rotate all pages.\nThen optimize output.")).toContain("Then optimize output.");
    expect(()=>buildAIWorkflowPrompt("")).toThrow(/Goal/);
    expect(()=>buildAIWorkflowPrompt("x".repeat(1201))).toThrow(/Goal/);
  });
  it("parses exactly one JSON object or a single JSON code fence",()=>{
    const payload=make([{actionId:"pdf.rotate",params:{degrees:90}}]);
    expect(parseAIWorkflowProposal(payload,recipe()).steps[0]).toMatchObject({type:"rotate",degrees:90});
    expect(parseAIWorkflowProposal(`\`\`\`json\n${payload}\n\`\`\``,recipe()).steps[0]).toMatchObject({type:"rotate"});
    expect(()=>parseAIWorkflowProposal("This is the answer: "+payload,recipe())).toThrow(/valid JSON/);
    expect(()=>parseAIWorkflowProposal(" ",recipe())).toThrow(/Paste/);
  });
  it("does not trust arbitrary action IDs, code execution, option injection or model permissions",()=>{
    const malicious=[
      make([{actionId:"pdf.delete.all",params:{}}]),
      make([{actionId:"pdf.optimize",params:{command:"remove",shell:"rm -rf"}}]),
      make([{actionId:"pdf.metadata.remove",params:{}}],{executeImmediately:true}),
      JSON.stringify({schemaVersion:1,title:"Unsafe",rationale:"No",actions:[{actionId:"pdf.metadata.remove",params:{},approvedRisks:["metadata-removal"]}]}),
      make([{actionId:"pdf.optimize",params:{__proto__:{unsafe:true}}}],{unexpected:"tool call"})
    ];
    for(const raw of malicious) expect(()=>parseAIWorkflowProposal(raw,recipe())).toThrow();
  });
  it("enforces terminal operations last, numeric ranges, length and action limits",()=>{
    expect(()=>parseAIWorkflowProposal(make([
      {actionId:"pdf.split.fixed",params:{pagesPerFile:2}},{actionId:"pdf.optimize",params:{}}
    ]),recipe())).toThrow(/last action/);
    expect(()=>parseAIWorkflowProposal(make([{actionId:"pdf.rotate",params:{degrees:35}}]),recipe())).toThrow(/degrees/);
    expect(()=>parseAIWorkflowProposal(make([{actionId:"pdf.pages.blank",params:{position:"end",count:999,widthMm:210,heightMm:297}}]),recipe())).toThrow(/count/);
    expect(()=>parseAIWorkflowProposal(make(Array.from({length:33},()=>({actionId:"pdf.optimize",params:{}}))),recipe())).toThrow(/32/);
    expect(()=>parseAIWorkflowProposal("x".repeat(24001),recipe())).toThrow(/24,000/);
  });
  it("parses a valid terminal workflow and produces meaningful preflight evidence",()=>{
    const parsed=parseAIWorkflowProposal(make([
      {actionId:"pdf.rotate",params:{degrees:180}},
      {actionId:"pdf.split.fixed",params:{pagesPerFile:5}}
    ]),recipe());
    expect(parsed.plan.actions.map(x=>x.id)).toEqual(["pdf.rotate","pdf.split.fixed"]);
    expect(parsed.preflight.valid).toBe(true);
    expect(parsed.preflight.terminal).toBe(true);
    expect(parsed.plan.approved).toBe(true);
    expect(explainProposalChanges(recipe(),parsed)).toMatchObject({replaces:1,introduces:2,changed:true,outputKind:"split-zip"});
  });
  it("flags metadata removal and rasterization without accepting AI approval",()=>{
    const parsed=parseAIWorkflowProposal(make([
      {actionId:"pdf.metadata.remove",params:{}},
      {actionId:"pdf.raster.compress",params:{profile:"balanced"}}
    ]),recipe());
    expect(parsed.plan.requiredRisks).toEqual(["metadata-removal","rasterization"]);
    expect(parsed.plan.approved).toBe(false);
    expect(parsed.preflight.risks).toEqual(["metadata-removal","rasterization"]);
  });
  it("applies reviewed steps with fresh IDs without mutating the source workflow or output naming",()=>{
    const source=recipe();
    const proposal=parseAIWorkflowProposal(make([
      {actionId:"pdf.rotate",params:{degrees:270}},{actionId:"pdf.optimize",params:{}}
    ]),source);
    const before=batchRecipeExecutionFingerprint(source);
    let counter=0;
    const applied=applyAIWorkflowProposal(source,proposal,()=>`fresh-${++counter}`);
    expect(applied.steps.map(x=>x.id)).toEqual(["fresh-1","fresh-2"]);
    expect(applied.name).toBe(source.name);
    expect(applied.id).toBe(source.id);
    expect(applied.outputSuffix).toBe("reviewed");
    expect(source.steps).toHaveLength(1);
    expect(isProposalStillCurrent(before,source)).toBe(true);
    expect(isProposalStillCurrent(before,applied)).toBe(false);
  });
  it("rejects oversized notes, invented output formats and false schemas",()=>{
    expect(()=>parseAIWorkflowProposal(make([{actionId:"pdf.optimize",params:{}}],{notes:["x".repeat(241)]}),recipe())).toThrow(/Note 1/);
    expect(()=>parseAIWorkflowProposal(make([{actionId:"pdf.optimize",params:{}}],{schemaVersion:2}),recipe())).toThrow(/schemaVersion/);
    expect(()=>parseAIWorkflowProposal(make([{actionId:"pdf.optimize",params:{}}],{output:{format:"exe"}}),recipe())).toThrow(/Unsupported proposal/);
  });
});
