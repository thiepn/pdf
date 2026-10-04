import { applyOcrLayerPdf } from "../ocr/ocrLayerPdf";
import type { OcrLayerPage } from "../ocr/ocrLayer";

interface ApplyRequest { type:"APPLY_OCR_LAYER"; requestId:string; bytes:ArrayBuffer; pages:OcrLayerPage[]; password?:string }
interface CancelRequest { type:"CANCEL"; requestId:string }
type Request = ApplyRequest | CancelRequest;
const cancelled=new Set<string>();
function active(id:string){if(cancelled.has(id))throw new DOMException("OCR layer export cancelled.","AbortError");}

self.onmessage=(event:MessageEvent<Request>)=>{
  const request=event.data;
  if(request.type==="CANCEL"){cancelled.add(request.requestId);return;}
  const startedAt=performance.now();
  try{
    const result=applyOcrLayerPdf(new Uint8Array(request.bytes),request.pages,request.password,()=>active(request.requestId));
    const output=Uint8Array.from(result.output).buffer;
    const warnings=result.skippedWords?[result.skippedWords+" OCR word"+(result.skippedWords===1?" was":"s were")+" omitted because their script cannot be embedded safely by the current local PDF writer."]:[];
    self.postMessage({type:"OCR_LAYER_RESULT",requestId:request.requestId,output,result:{pageCount:result.pageCount,outputBytes:result.output.byteLength,changedPages:result.changedPages,appliedWords:result.appliedWords,skippedWords:result.skippedWords,warnings,durationMs:performance.now()-startedAt}},[output]);
  }catch(error){
    self.postMessage({type:"OCR_LAYER_ERROR",requestId:request.requestId,error:error instanceof Error?{name:error.name,message:error.message}:{name:"UnknownError",message:String(error)}});
  }finally{cancelled.delete(request.requestId);}
};
export {};
