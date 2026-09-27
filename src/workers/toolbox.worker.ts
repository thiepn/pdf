import * as mupdf from "mupdf";
import type { ToolboxTransformOptions, ToolboxTransformReport } from "../types/toolbox";
import { addPageText } from "../toolbox/pageText";

type TransformRequest = { type: "TRANSFORM"; requestId: string; bytes: ArrayBuffer; password?: string; options: ToolboxTransformOptions };
type CancelRequest = { type: "CANCEL"; requestId: string };
type Request = TransformRequest | CancelRequest;

const cancelled = new Set<string>();
const metadataKeys = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate"] as const;

function active(id: string): void { if (cancelled.has(id)) throw new DOMException("Operation cancelled.", "AbortError"); }
function authenticate(document: any, password?: string): void { if (document.needsPassword() && (!password || document.authenticatePassword(password) === 0)) throw new Error("The PDF password is required or incorrect."); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)); }
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
  const selected = options.pageNumbers ? new Set(options.pageNumbers) : null;
  for(let index=0;index<pdf.countPages();index+=1){ if(selected && !selected.has(index+1)) continue; active(requestId); const page=pdf.loadPage(index); try{
    const bounds=page.getBounds() as [number,number,number,number]; const width=bounds[2]-bounds[0],height=bounds[3]-bounds[1];
    const left=options.leftPt,right=options.rightPt,top=options.topPt,bottom=options.bottomPt;
    if([left,right,top,bottom].some((margin)=>!Number.isFinite(margin)||margin<0)) throw new Error("Crop margins must be finite and non-negative.");
    const pageRect:[number,number,number,number]=[bounds[0]+left,bounds[1]+top,bounds[2]-right,bounds[3]-bottom]; if(pageRect[2]-pageRect[0]<12||pageRect[3]-pageRect[1]<12) throw new Error(`Crop margins leave page ${index+1} too small.`);
    // setPageBox accepts displayed page coordinates and converts to PDF space internally.
    page.setPageBox("CropBox",pageRect); changed.push(index+1);
  } finally{page.destroy();} }
  warnings.push("Cropping changes the visible CropBox only; hidden content outside the crop remains in the PDF."); return changed;
}
function decorate(pdf:mupdf.PDFDocument,options:NonNullable<ToolboxTransformOptions["decoration"]>,requestId:string):number[] {
  if(!options.enabled) return []; const changed:number[]=[];
  const selected = options.pageNumbersToChange ? new Set(options.pageNumbersToChange) : null;
  for(let index=0;index<pdf.countPages();index+=1){
    if(selected && !selected.has(index+1)) continue;
    active(requestId); const page=pdf.loadPage(index);
    try {
      const bounds=page.getBounds(),width=bounds[2]-bounds[0],height=bounds[3]-bounds[1];
      const margin=Math.min(clamp(options.marginPt,4,144),width*.2,height*.2),size=clamp(options.fontSize,6,48);
      const top: mupdf.Rect = [bounds[0]+margin,bounds[1]+margin,bounds[2]-margin,bounds[1]+margin+size*1.8];
      const bottom: mupdf.Rect = [bounds[0]+margin,bounds[3]-margin-size*1.8,bounds[2]-margin,bounds[3]-margin];
      const language=options.fontLanguage ?? "auto";
      if(options.watermarkText) addPageText(pdf,page,[bounds[0]+width*.1,bounds[1]+height*.36,bounds[2]-width*.1,bounds[1]+height*.64],options.watermarkText,options.watermarkSize ?? Math.max(size*2.6,24),options.watermarkGray ?? .72,"center",language);
      if(options.headerText) addPageText(pdf,page,top,options.headerText,size,.22,"center",language);
      if(options.footerText) addPageText(pdf,page,bottom,options.footerText,size,.22,options.pageNumbers?"left":"center",language);
      if(options.pageNumbers) {
        const position=options.numberPosition ?? (options.footerText ? "bottom-right" : "bottom-center");
        const alignment=position.endsWith("left")?"left":position.endsWith("right")?"right":"center";
        addPageText(pdf,page,position.startsWith("top")?top:bottom,String(Math.round(options.startNumber)+changed.length),size,.22,alignment,language);
      }
      changed.push(index+1);
    } finally { page.destroy(); }
  }
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
