import * as mupdf from "mupdf";
import type { AffineMatrix } from "../core/coordinates";
import type { ToolboxTransformOptions, ToolboxTransformReport } from "../types/toolbox";
import { resolveDecorationLanguage, type DecorationLanguage } from "../toolbox/toolboxModel";

type TransformRequest = { type: "TRANSFORM"; requestId: string; bytes: ArrayBuffer; password?: string; options: ToolboxTransformOptions };
type CancelRequest = { type: "CANCEL"; requestId: string };
type Request = TransformRequest | CancelRequest;

const cancelled = new Set<string>();
let resourceSequence = 0;
const metadataKeys = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate"] as const;

function active(id: string): void { if (cancelled.has(id)) throw new DOMException("Operation cancelled.", "AbortError"); }
function authenticate(document: any, password?: string): void { if (document.needsPassword() && (!password || document.authenticatePassword(password) === 0)) throw new Error("The PDF password is required or incorrect."); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)); }
function point(matrix: AffineMatrix, x: number, y: number): [number, number] { return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]]; }
function transformRect(matrix: AffineMatrix, rect: [number, number, number, number]): [number, number, number, number] {
  const [x0,y0,x1,y1]=rect; const points=[point(matrix,x0,y0),point(matrix,x1,y0),point(matrix,x1,y1),point(matrix,x0,y1)];
  return [Math.min(...points.map(v=>v[0])),Math.min(...points.map(v=>v[1])),Math.max(...points.map(v=>v[0])),Math.max(...points.map(v=>v[1]))];
}
function escapePdfText(text: string): string {
  if ([...text].some(character => character.charCodeAt(0) > 255)) throw new Error("This decoration contains characters that require a CJK font or complex-script shaping.");
  return text.replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)").replace(/\r?\n/g," ");
}
function utf16Hex(text:string):string { let hex="feff"; for(let index=0;index<text.length;index+=1) hex+=text.charCodeAt(index).toString(16).padStart(4,"0"); return `<${hex}>`; }
function appendPageStream(pdf: any, page: any, content: string): void {
  const pageObject=page.getObject(); const stream=pdf.addStream(content); const existing=pageObject.get("Contents");
  if(!existing) pageObject.put("Contents",stream); else if(existing.isArray?.()) existing.push(stream); else { const array=pdf.newArray(); array.push(existing); array.push(stream); pageObject.put("Contents",array); }
}
function resourceDictionary(pdf:any,page:any,category:"Font"):any {
  const pageObject=page.getObject(); let resources=pageObject.get("Resources");
  if(!resources){ const inherited=pageObject.getInheritable?.("Resources"); resources=inherited?pdf.graftObject(inherited):pdf.newDictionary(); pageObject.put("Resources",resources); }
  let dictionary=resources.get(category); if(!dictionary){ dictionary=pdf.newDictionary(); resources.put(category,dictionary); } return dictionary;
}
function addText(pdf:any,page:any,rect:[number,number,number,number],text:string,fontSize:number,gray=0.22,align:"left"|"center"|"right"="center",preferredLanguage:DecorationLanguage="auto"):void {
  if(!text) return; const fonts=resourceDictionary(pdf,page,"Font"); const resourceName=`LPST${++resourceSequence}`; const language=resolveDecorationLanguage(text,preferredLanguage);
  if(language){ const font=new (mupdf as any).Font(language); fonts.put(resourceName,pdf.addCJKFont(font,language,0,"sans-serif")); }
  else fonts.put(resourceName,pdf.addSimpleFont(new (mupdf as any).Font("Helvetica"),"Latin"));
  const [x0,y0,x1,y1]=rect,width=Math.max(1,x1-x0),height=Math.max(1,y1-y0),size=clamp(fontSize,6,96),estimated=[...text].length*size*(language?1:0.49);
  const x=align==="left"?x0:align==="right"?Math.max(x0,x1-estimated):x0+Math.max(0,(width-estimated)/2); const y=y0+Math.max(size,(height+size*0.72)/2); const encoded=language?utf16Hex(text):`(${escapePdfText(text)})`;
  appendPageStream(pdf,page,`q ${gray.toFixed(3)} g BT /${resourceName} ${size.toFixed(2)} Tf 1 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} Tm ${encoded} Tj ET Q\n`);
}
function clearMetadata(pdf:any):void {
  for(const key of metadataKeys){ try{pdf.setMetaData(`info:${key}`,"");}catch{} }
  try{ const trailer=pdf.getTrailer?.(); trailer?.delete?.("Info"); const root=trailer?.get?.("Root"); root?.delete?.("Metadata"); }catch{}
}
function pdfDate(date=new Date()):string { const pad=(value:number)=>String(value).padStart(2,"0"); return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth()+1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`; }
function setMetadata(pdf:any,metadata:NonNullable<ToolboxTransformOptions["metadata"]>):void {
  const values:{[key:string]:string}={Title:metadata.title,Author:metadata.author,Subject:metadata.subject,Keywords:metadata.keywords};
  for(const [key,value] of Object.entries(values)) pdf.setMetaData(`info:${key}`,value.trim());
  pdf.setMetaData("info:ModDate",pdfDate());
}
function addBlankPages(pdf:any,options:NonNullable<ToolboxTransformOptions["blankPages"]>):void {
  if(!options.enabled) return; const count=Math.round(clamp(options.count,1,20)); const width=clamp(options.widthPt,72,2880),height=clamp(options.heightPt,72,2880);
  for(let i=0;i<count;i+=1){ const resources=pdf.addObject(pdf.newDictionary()); const page=pdf.addPage([0,0,width,height],0,resources,""); pdf.insertPage(options.position==="start"?i:-1,page); }
}
function applyCrop(pdf:any,options:NonNullable<ToolboxTransformOptions["crop"]>,requestId:string,warnings:string[]):number[] {
  if(!options.enabled) return []; const changed:number[]=[];
  for(let index=0;index<pdf.countPages();index+=1){ active(requestId); const page=pdf.loadPage(index); try{
    const bounds=page.getBounds() as [number,number,number,number]; const width=bounds[2]-bounds[0],height=bounds[3]-bounds[1];
    const left=clamp(options.leftPt,0,Math.max(0,width-1)),right=clamp(options.rightPt,0,Math.max(0,width-left-1)),top=clamp(options.topPt,0,Math.max(0,height-1)),bottom=clamp(options.bottomPt,0,Math.max(0,height-top-1));
    const pageRect:[number,number,number,number]=[bounds[0]+left,bounds[1]+top,bounds[2]-right,bounds[3]-bottom]; if(pageRect[2]-pageRect[0]<12||pageRect[3]-pageRect[1]<12) throw new Error(`Crop margins leave page ${index+1} too small.`);
    const pdfRect=transformRect(page.getTransform() as AffineMatrix,pageRect); page.setPageBox("CropBox",pdfRect); changed.push(index+1);
  } finally{page.destroy();} }
  warnings.push("Cropping changes the visible CropBox only; hidden content outside the crop remains in the PDF."); return changed;
}
function decorate(pdf:any,options:NonNullable<ToolboxTransformOptions["decoration"]>,requestId:string):number[] {
  if(!options.enabled) return []; const changed:number[]=[];
  for(let index=0;index<pdf.countPages();index+=1){ active(requestId); const page=pdf.loadPage(index); try{
    const bounds=page.getBounds() as [number,number,number,number],width=bounds[2]-bounds[0],height=bounds[3]-bounds[1],margin=clamp(options.marginPt,4,144),size=clamp(options.fontSize,6,48),transform=page.getTransform() as AffineMatrix;
    const toPdf=(rect:[number,number,number,number])=>transformRect(transform,rect);
    if(options.watermarkText){ const box:[number,number,number,number]=[bounds[0]+width*0.1,bounds[1]+height*0.44,bounds[2]-width*0.1,bounds[1]+height*0.56]; addText(pdf,page,toPdf(box),options.watermarkText,Math.min(64,Math.max(size*2.6,24)),0.72,"center",options.fontLanguage ?? "auto"); }
    if(options.headerText){ addText(pdf,page,toPdf([bounds[0]+margin,bounds[1]+margin,bounds[2]-margin,bounds[1]+margin+size*1.6]),options.headerText,size,0.22,"center",options.fontLanguage ?? "auto"); }
    if(options.footerText){ addText(pdf,page,toPdf([bounds[0]+margin,bounds[3]-margin-size*1.8,bounds[2]-margin,bounds[3]-margin]),options.footerText,size,0.22,options.pageNumbers?"left":"center",options.fontLanguage ?? "auto"); }
    if(options.pageNumbers){ const label=String(Math.round(options.startNumber)+index); addText(pdf,page,toPdf([bounds[0]+margin,bounds[3]-margin-size*1.8,bounds[2]-margin,bounds[3]-margin]),label,size,0.22,options.footerText?"right":"center",options.fontLanguage ?? "auto"); }
    changed.push(index+1);
  } finally{page.destroy();} }
  return changed;
}
function save(pdf:any):Uint8Array { pdf.check?.(); const buffer=pdf.saveToBuffer("garbage=4,clean=yes,compress=yes,compress-images=yes,compress-fonts=yes,appearance=all,encrypt=keep"); try{return Uint8Array.from(buffer.asUint8Array());}finally{buffer.destroy();} }

self.onmessage=(event:MessageEvent<Request>)=>{
  const request=event.data; if(request.type==="CANCEL"){cancelled.add(request.requestId);return;} const startedAt=performance.now();
  try{ active(request.requestId); const document=(mupdf as any).Document.openDocument(request.bytes,"application/pdf"); try{ authenticate(document,request.password); const pdf=document.asPDF(); if(!pdf) throw new Error("The input is not a mutable PDF."); pdf.disableJS?.(); const warnings:string[]=[]; const changed=new Set<number>();
    if(request.options.removeMetadata) clearMetadata(pdf); else if(request.options.metadata) setMetadata(pdf,request.options.metadata);
    addBlankPages(pdf,request.options.blankPages ?? {enabled:false,position:"end",count:0,widthPt:595,heightPt:842});
    for(const page of applyCrop(pdf,request.options.crop ?? {enabled:false,topPt:0,rightPt:0,bottomPt:0,leftPt:0},request.requestId,warnings)) changed.add(page);
    for(const page of decorate(pdf,request.options.decoration ?? {enabled:false,watermarkText:"",headerText:"",footerText:"",pageNumbers:false,startNumber:1,fontSize:10,marginPt:24,fontLanguage:"auto"},request.requestId)) changed.add(page);
    active(request.requestId); const outputBytes=save(pdf),output=outputBytes.buffer.slice(outputBytes.byteOffset,outputBytes.byteOffset+outputBytes.byteLength); const report:ToolboxTransformReport={operation:"toolbox-transform",pageCount:pdf.countPages(),outputBytes:outputBytes.byteLength,changedPages:[...changed].sort((a,b)=>a-b),warnings,durationMs:performance.now()-startedAt}; self.postMessage({type:"TOOLBOX_RESULT",requestId:request.requestId,output,report},[output]);
  }finally{document.destroy();} }
  catch(error){ self.postMessage({type:"TOOLBOX_ERROR",requestId:request.requestId,error:{name:error instanceof Error?error.name:"Error",message:error instanceof Error?error.message:String(error)}}); }
  finally{cancelled.delete(request.requestId);}
};

export {};
