import { describe, expect, it } from "vitest";
import { SMART_MODES, SMART_PRESERVED_CATEGORIES, assertSmartOptimizationSafe, selectSmartCandidate } from "../../src/optimization/smartOptimizer";
import { comparePreservationGraphs, createObjectMap, aggregateCategoryFingerprints, addFingerprint } from "../../src/preservation/fingerprint";
import { preservationPolicy } from "../../src/preservation/policies";
import type { PreservationGraph } from "../../src/types/preservation";

function testGraph(): PreservationGraph {
  const objects = createObjectMap();
  addFingerprint(objects, "pages", "page:1", "1,2,3,4");
  addFingerprint(objects, "text", "page:1:line:1", "example");
  const counts = {
    pages:1,text:1,images:0,vectors:0,fonts:0,annotations:0,
    forms:0,links:0,bookmarks:0,attachments:0,layers:0,metadata:0,
    signatures:0,tags:0,encryption:0
  };
  return {
    graphVersion:2,pageCount:1,counts,encrypted:false,tagged:false,
    metadata:{},objects,fingerprints:aggregateCategoryFingerprints(objects),warnings:[]
  };
}
describe("F4 fail-closed structure preservation", () => {
  it("preserves all 15 categories by policy", () => {
    expect(SMART_PRESERVED_CATEGORIES).toHaveLength(15);
    expect(new Set(SMART_PRESERVED_CATEGORIES).size).toBe(15);
    const policy=preservationPolicy("smart-optimize");
    for (const category of SMART_PRESERVED_CATEGORIES) expect(policy[category]).toBe("preserve");
    expect(SMART_MODES.careful.saveOptions).toHaveLength(1);
    expect(SMART_MODES.compact.saveOptions).toHaveLength(2);
    expect(SMART_MODES.compact.saveOptions.every(option => !/incremental|encrypt=no|subset/.test(option))).toBe(true);
  });
  it("rejects signed, certified, repaired, encrypted and revision-chained sources", () => {
    const source=testGraph();
    const flags={ signed:false,certified:false,repaired:false,incrementalRevisions:false };
    expect(() => assertSmartOptimizationSafe(source,flags)).not.toThrow();
    for (const reason of Object.keys(flags) as Array<keyof typeof flags>)
      expect(() => assertSmartOptimizationSafe(source,{...flags,[reason]:true})).toThrow();
    expect(() => assertSmartOptimizationSafe({...source,encrypted:true},flags)).toThrow(/encrypted/);
    expect(() => assertSmartOptimizationSafe({...source,counts:{...source.counts,signatures:1}},flags)).toThrow(/signed/);
  });
  it("selects smallest strictly verified candidate, or retains original bytes", () => {
    const samples=[
      {variant:"larger",bytes:1100,passed:true,failures:[]},
      {variant:"unsafe",bytes:400,passed:false,failures:["form changed"]},
      {variant:"safe",bytes:800,passed:true,failures:[]},
      {variant:"best",bytes:600,passed:true,failures:[]}
    ];
    expect(selectSmartCandidate(1000,samples).candidate?.variant).toBe("best");
    expect(selectSmartCandidate(1000,samples).savedBytes).toBe(400);
    expect(selectSmartCandidate(1000,samples.slice(0,2)).candidate).toBeNull();
    expect(selectSmartCandidate(1000,samples.slice(0,2)).savedBytes).toBe(0);
    expect(() => selectSmartCandidate(0,samples)).toThrow();
  });
  it("rejects unchanged-count structural corruption using real preservation hashes", () => {
    const source=testGraph();
    const output=testGraph();
    addFingerprint(output.objects,"text","page:1:line:2","injected");
    output.fingerprints=aggregateCategoryFingerprints(output.objects);
    const report=comparePreservationGraphs("smart-optimize",preservationPolicy("smart-optimize"),source,output,5);
    expect(report.passed).toBe(false);
    expect(report.failures.some(f=>f.includes("text"))).toBe(true);
    const pristine=comparePreservationGraphs("smart-optimize",preservationPolicy("smart-optimize"),source,testGraph(),5);
    expect(pristine.passed).toBe(true);
  });
});
