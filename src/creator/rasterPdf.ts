import { buildJpegPdf, type JpegPdfPage } from "../pdf/jpegPdf";
import type { CreatorBuildRequest, CreatorFontRole, CreatorPageCommand } from "../types/creator";

function fontCss(size:number,role:CreatorFontRole,family:"sans"|"serif"):string{
  const weight=role==="bold"||role==="bold-italic"?"700":"400",style=role==="italic"||role==="bold-italic"?"italic":"normal",stack=role==="mono"?'ui-monospace, "SFMono-Regular", Consolas, monospace':family==="serif"?'Georgia, "Times New Roman", serif':'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
  return `${style} ${weight} ${size}px ${stack}`;
}
function gray(value:number):string{const channel=Math.round(Math.max(0,Math.min(1,value))*255);return`rgb(${channel},${channel},${channel})`;}
async function canvasJpeg(canvas:HTMLCanvasElement):Promise<Uint8Array>{const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("Could not encode creator page.")),"image/jpeg",.9));return new Uint8Array(await blob.arrayBuffer());}
function drawCommand(context:CanvasRenderingContext2D,command:CreatorPageCommand,scale:number):void{
  if(command.type==="rule"){context.strokeStyle=gray(command.gray);context.lineWidth=Math.max(1,scale*.5);context.beginPath();context.moveTo(command.xPt*scale,command.yTopPt*scale);context.lineTo((command.xPt+command.widthPt)*scale,command.yTopPt*scale);context.stroke();return;}
  context.fillStyle=gray(command.gray);context.font=fontCss(command.fontSizePt*scale,command.fontRole,command.fontFamily);context.textBaseline="alphabetic";context.fillText(command.text,command.xPt*scale,command.yTopPt*scale);if(command.underline&&command.widthPt){context.strokeStyle=gray(command.gray);context.lineWidth=Math.max(1,scale*.45);context.beginPath();context.moveTo(command.xPt*scale,(command.yTopPt+1.4)*scale);context.lineTo((command.xPt+command.widthPt)*scale,(command.yTopPt+1.4)*scale);context.stroke();}
}
export async function buildVisualCreatorPdf(request:CreatorBuildRequest,signal?:AbortSignal,onProgress?:(done:number,total:number)=>void):Promise<{bytes:Uint8Array;warnings:string[]}>{
  const scale=2;const pages:JpegPdfPage[]=[];for(let index=0;index<request.layout.pages.length;index+=1){if(signal?.aborted)throw new DOMException("Operation cancelled.","AbortError");const canvas=document.createElement("canvas");canvas.width=Math.ceil(request.layout.pageWidthPt*scale);canvas.height=Math.ceil(request.layout.pageHeightPt*scale);const context=canvas.getContext("2d",{alpha:false});if(!context)throw new Error("Canvas rendering is unavailable.");context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);for(const command of request.layout.pages[index].commands)drawCommand(context,command,scale);pages.push({jpeg:await canvasJpeg(canvas),pixelWidth:canvas.width,pixelHeight:canvas.height,pageWidth:request.layout.pageWidthPt,pageHeight:request.layout.pageHeightPt});canvas.width=1;canvas.height=1;onProgress?.(index+1,request.layout.pages.length);}
  return{bytes:buildJpegPdf(pages,{title:request.metadata.title||"Created document",author:request.metadata.author||"PDF Studio"}),warnings:["Visual compatibility output rasterizes each page. Text remains visually shaped by the browser but is not searchable/selectable as PDF text. Hyperlinks are rendered visually but are not interactive in raster output."]};
}
