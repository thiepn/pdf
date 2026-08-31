import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { alignPageFingerprints, hybridPageSimilarity } from "../../src/comparison/alignment.ts";
import { visualFingerprintSimilarity } from "../../src/comparison/visualFingerprint.ts";
import { layoutCreatorDocument } from "../../src/creator/layout.ts";
import { parseMarkdownBlocks, parseMarkdownInline } from "../../src/creator/markdown.ts";
import { parseBatchRecipeJson, serializeBatchRecipe } from "../../src/processing/batchModel.ts";

const STYLE={pagePreset:"a4",customWidthMm:210,customHeightMm:297,marginTopMm:20,marginRightMm:20,marginBottomMm:20,marginLeftMm:20,fontFamily:"sans",bodySizePt:11,lineHeight:1.48,paragraphGapPt:8,headingScale:1,headerText:"",footerText:"",pageNumbers:true,firstPageNumber:1};
const visual=(bits,ink=.2,aspect=1)=>({bits,inkRatio:ink,aspectRatio:aspect});
let passed=0;function check(name,task){task();passed+=1;console.log(`PASS ${name}`);}
const comparePage=await readFile(new URL("../../src/views/ComparePage.tsx",import.meta.url),"utf8");
const creatorWorker=await readFile(new URL("../../src/workers/creator.worker.ts",import.meta.url),"utf8");
const batchPage=await readFile(new URL("../../src/views/BatchPage.tsx",import.meta.url),"utf8");
const batchPipeline=await readFile(new URL("../../src/processing/batchPipeline.ts",import.meta.url),"utf8");

check("visual identity",()=>assert.equal(visualFingerprintSimilarity(visual("0".repeat(64)),visual("0".repeat(64))),1));
check("visual difference",()=>assert.ok(visualFingerprintSimilarity(visual("0".repeat(64)),visual("1".repeat(64)))<.3));
check("hybrid scan fallback",()=>assert.equal(hybridPageSimilarity({text:"",visual:visual("01".repeat(32))},{text:"",visual:visual("01".repeat(32))}).basis,"visual"));
check("scan sequence alignment",()=>{const a=visual("0".repeat(64),.1),b=visual("01".repeat(32),.35),c=visual("1".repeat(64),.6);const rows=alignPageFingerprints([{text:"",visual:a},{text:"",visual:c}],[{text:"",visual:a},{text:"",visual:b},{text:"",visual:c}]);assert.deepEqual(rows.map(row=>row.status),["same","inserted","same"]);});
check("markdown inline styles",()=>{const runs=parseMarkdownInline("Normal **bold** *italic* `code` [OpenAI](https://openai.com)");assert.ok(runs.some(run=>run.style==="bold"));assert.ok(runs.some(run=>run.style==="italic"));assert.ok(runs.some(run=>run.style==="code"));assert.ok(runs.some(run=>run.style==="link"&&run.href==="https://openai.com"));});
check("creator layout preserves inline roles",()=>{const layout=layoutCreatorDocument(parseMarkdownBlocks("Paragraph with **bold** and `code`."),STYLE);const roles=layout.pages.flatMap(page=>page.commands.filter(command=>command.type==="text").map(command=>command.fontRole));assert.ok(roles.includes("bold"));assert.ok(roles.includes("mono"));});
check("creator layout emits link command",()=>{const layout=layoutCreatorDocument(parseMarkdownBlocks("[OpenAI](https://openai.com)"),STYLE);assert.ok(layout.pages[0].commands.some(command=>command.type==="text"&&command.linkUrl==="https://openai.com"&&command.underline));});
check("Batch 3 schema round trip",()=>{const parsed=parseBatchRecipeJson(serializeBatchRecipe({schemaVersion:3,id:"x",name:"Split",steps:[{id:"s",type:"split-fixed",pagesPerFile:5}],outputSuffix:"parts",updatedAt:1}));assert.equal(parsed.schemaVersion,3);assert.equal(parsed.steps[0].type,"split-fixed");});
check("Batch terminal step validation",()=>assert.throws(()=>parseBatchRecipeJson(JSON.stringify({schemaVersion:3,name:"Bad",steps:[{id:"a",type:"split-fixed",pagesPerFile:5},{id:"b",type:"optimize"}],outputSuffix:"x"})),/final workflow step/));
check("Compare hybrid UI",()=>{assert.match(comparePage,/scanned documents/);assert.match(comparePage,/matched automatically/);assert.match(comparePage,/extractAllFingerprints/);});
check("searchable link annotations",()=>assert.match(creatorWorker,/page\.createLink/));
check("Batch multi-output UI",()=>{assert.match(batchPage,/Split into PDF parts/);assert.match(batchPage,/Export page images/);assert.match(batchPipeline,/split-zip/);assert.match(batchPipeline,/images-zip/);});
console.log(`Phase 26 runtime regression: ${passed}/12 passed.`);
