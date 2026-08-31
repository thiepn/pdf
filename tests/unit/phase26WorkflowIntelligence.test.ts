import { describe, expect, it } from "vitest";
import { alignPageFingerprints, hybridPageSimilarity } from "../../src/comparison/alignment";
import { visualFingerprintSimilarity, type VisualPageFingerprint } from "../../src/comparison/visualFingerprint";
import { layoutCreatorDocument } from "../../src/creator/layout";
import { parseMarkdownBlocks, parseMarkdownInline } from "../../src/creator/markdown";
import { DEFAULT_CREATOR_STYLE } from "../../src/creator/presets";
import { parseBatchRecipeJson, serializeBatchRecipe } from "../../src/processing/batchModel";

const visual=(bits:string,inkRatio=.2,aspectRatio=1):VisualPageFingerprint=>({bits,inkRatio,aspectRatio});
describe("Phase 26 workflow intelligence",()=>{
  it("uses visual fingerprints for image-only page alignment",()=>{const a=visual("0".repeat(64),.1),b=visual("01".repeat(32),.35),c=visual("1".repeat(64),.6);const rows=alignPageFingerprints([{text:"",visual:a},{text:"",visual:c}],[{text:"",visual:a},{text:"",visual:b},{text:"",visual:c}]);expect(rows.map(row=>row.status)).toEqual(["same","inserted","same"]);expect(rows[0].basis).toBe("visual");});
  it("keeps text dominant when reliable text exists",()=>{const result=hybridPageSimilarity({text:"A sufficiently long stable paragraph about local document processing.",visual:visual("0".repeat(64))},{text:"A sufficiently long stable paragraph about local document processing.",visual:visual("1".repeat(64))});expect(result.basis).toBe("hybrid");expect(result.similarity).toBeGreaterThan(.7);});
  it("scores identical visual fingerprints as identical",()=>expect(visualFingerprintSimilarity(visual("01".repeat(32)),visual("01".repeat(32)))).toBe(1));
  it("parses rich Markdown inline runs",()=>{const runs=parseMarkdownInline("**Bold** *italic* `code` [site](https://example.com)");expect(runs.map(run=>run.style)).toEqual(expect.arrayContaining(["bold","italic","code","link"]));expect(runs.find(run=>run.style==="link")?.href).toBe("https://example.com");});
  it("paginates inline styles into distinct text commands",()=>{const layout=layoutCreatorDocument(parseMarkdownBlocks("Text **bold** `code` [link](https://example.com)"),DEFAULT_CREATOR_STYLE);const commands=layout.pages[0].commands.filter(command=>command.type==="text");expect(commands.some(command=>command.fontRole==="bold")).toBe(true);expect(commands.some(command=>command.fontRole==="mono")).toBe(true);expect(commands.some(command=>command.linkUrl==="https://example.com")).toBe(true);});
  it("migrates Batch 2 recipes to schema 3",()=>{const imported=parseBatchRecipeJson(JSON.stringify({schemaVersion:2,name:"Old",steps:[{id:"a",type:"optimize"}],outputSuffix:"done"}));expect(imported.schemaVersion).toBe(3);expect(imported.steps[0].type).toBe("optimize");});
  it("round-trips terminal multi-output Batch steps",()=>{const imported=parseBatchRecipeJson(serializeBatchRecipe({schemaVersion:3,id:"x",name:"Images",steps:[{id:"a",type:"page-images",quality:"high"}],outputSuffix:"pages",updatedAt:1}));expect(imported.steps[0]).toMatchObject({type:"page-images",quality:"high"});});
  it("rejects non-terminal multi-output steps",()=>expect(()=>parseBatchRecipeJson(JSON.stringify({schemaVersion:3,name:"Bad",steps:[{id:"a",type:"split-fixed",pagesPerFile:2},{id:"b",type:"optimize"}],outputSuffix:"x"}))).toThrow(/final workflow step/));
});
