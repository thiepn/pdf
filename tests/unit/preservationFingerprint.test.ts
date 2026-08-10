import { describe, expect, it } from "vitest";
import { addFingerprint, aggregateCategoryFingerprints, comparePreservationGraphs, createObjectMap } from "../../src/preservation/fingerprint";
import type { GraphCounts, PreservationCategory, PreservationGraph } from "../../src/types/preservation";

const zeroCounts = (): GraphCounts => ({ pages:0,text:0,images:0,vectors:0,fonts:0,annotations:0,forms:0,links:0,bookmarks:0,attachments:0,layers:0,metadata:0,signatures:0,tags:0,encryption:0 });
const policy = (value: "preserve"|"modify") => Object.fromEntries(["pages","text","images","vectors","fonts","annotations","forms","links","bookmarks","attachments","layers","metadata","signatures","tags","encryption"].map((key)=>[key,value])) as Record<PreservationCategory,"preserve"|"modify">;

function graph(texts: Array<[string,string]>): PreservationGraph {
  const objects=createObjectMap();
  for(const [id,text] of texts) addFingerprint(objects,"text",id,text,1,text);
  const counts=zeroCounts(); counts.text=texts.length;
  return { graphVersion:2,pageCount:0,counts,encrypted:false,tagged:false,metadata:{},objects,fingerprints:aggregateCategoryFingerprints(objects),warnings:[] };
}

describe("preservation object fingerprints",()=>{
  it("detects replacement even when category counts stay equal",()=>{
    const report=comparePreservationGraphs("image-optimize",policy("preserve"),graph([["p1:l1","alpha"],["p1:l2","beta"]]),graph([["p1:l1","alpha"],["p1:l2","gamma"]]),1);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/objects changed/i);
  });

  it("allows a category explicitly declared as modified",()=>{
    const contract=policy("preserve"); contract.text="modify";
    const report=comparePreservationGraphs("ocr-overlay",contract,graph([["p1:l1","alpha"]]),graph([["p1:l1","beta"]]),1);
    expect(report.passed).toBe(true);
  });
});
