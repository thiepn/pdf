import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { alignPageTexts, pageTextSimilarity } from "../../src/comparison/alignment.ts";
import { layoutCreatorDocument, wrapCreatorText } from "../../src/creator/layout.ts";
import { parseMarkdownBlocks, parsePlainTextBlocks } from "../../src/creator/markdown.ts";
import { parseBatchRecipeJson, serializeBatchRecipe } from "../../src/processing/batchModel.ts";

const DEFAULT_CREATOR_STYLE={pagePreset:"a4",customWidthMm:210,customHeightMm:297,marginTopMm:20,marginRightMm:20,marginBottomMm:20,marginLeftMm:20,fontFamily:"sans",bodySizePt:11,lineHeight:1.48,paragraphGapPt:8,headingScale:1,headerText:"",footerText:"",pageNumbers:true,firstPageNumber:1};
let passed=0;function check(name,task){task();passed+=1;console.log(`PASS ${name}`);}
const creatorPage=await readFile(new URL("../../src/views/CreatePdfPage.tsx",import.meta.url),"utf8");
const creatorWorker=await readFile(new URL("../../src/workers/creator.worker.ts",import.meta.url),"utf8");
const raster=await readFile(new URL("../../src/creator/rasterPdf.ts",import.meta.url),"utf8");
const comparePage=await readFile(new URL("../../src/views/ComparePage.tsx",import.meta.url),"utf8");
const toolsPage=await readFile(new URL("../../src/views/ToolsPage.tsx",import.meta.url),"utf8");

check("Markdown structure",()=>assert.deepEqual(parseMarkdownBlocks("# T\n\nHello **world**\n\n- A").map(item=>item.type),["heading","paragraph","bullet"]));
check("Plain text paragraphs",()=>assert.equal(parsePlainTextBlocks("One\n\nTwo").length,2));
check("Metric A4 creator layout",()=>{const layout=layoutCreatorDocument(parsePlainTextBlocks("Text"),DEFAULT_CREATOR_STYLE);assert.ok(Math.abs(layout.pageWidthPt-595.276)<1);assert.ok(Math.abs(layout.pageHeightPt-841.89)<1);});
check("CJK wrapping",()=>assert.ok(wrapCreatorText("한국어문장을길게작성합니다한국어문장을길게작성합니다",60,11).length>1));
check("Inserted-page alignment",()=>{const rows=alignPageTexts(["alpha","beta","gamma"],["alpha","new insertion","beta","gamma"]);assert.deepEqual(rows.map(row=>row.status),["same","inserted","same","same"]);assert.deepEqual([rows[2].leftPage,rows[2].rightPage],[2,3]);});
check("Similarity identity",()=>assert.equal(pageTextSimilarity("same page","same page"),1));
check("Portable batch recipe",()=>{const json=serializeBatchRecipe({schemaVersion:2,id:"x",name:"Portable",steps:[{id:"s",type:"optimize"}],outputSuffix:"done",updatedAt:1});const parsed=parseBatchRecipeJson(json);assert.equal(parsed.steps[0].type,"optimize");assert.notEqual(parsed.id,"x");});
check("Searchable creator worker",()=>{assert.match(creatorWorker,/new \(mupdf as any\)\.PDFDocument/);assert.match(creatorWorker,/addCJKFont/);assert.match(creatorWorker,/Use Visual compatibility PDF/);});
check("Visual shaping fallback",()=>{assert.match(raster,/buildJpegPdf/);assert.match(raster,/not searchable\/selectable/);});
check("Create PDF Studio UI",()=>{assert.match(creatorPage,/Searchable text PDF/);assert.match(creatorPage,/Visual compatibility PDF/);assert.match(creatorPage,/Save as project/);});
check("Compare 2.0 UI",()=>{assert.match(comparePage,/Analyze document/);assert.match(comparePage,/Page map/);assert.match(comparePage,/inserted/);});
check("Tools entry point",()=>assert.match(toolsPage,/Create PDF/));
console.log(`Phase 25 runtime regression: ${passed}/12 passed.`);
