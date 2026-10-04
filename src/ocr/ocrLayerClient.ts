import type { OcrLayerPage } from "./ocrLayer";
import { WORKER_STARTUP_TIMEOUT_MS } from "../workers/workerReliability";

interface Ready { type:"READY" }
interface Success { type:"OCR_LAYER_RESULT"; requestId:string; output:ArrayBuffer; result:{pageCount:number;outputBytes:number;changedPages:number[];appliedWords:number;skippedWords:number;warnings:string[];durationMs:number} }
interface Failure { type:"OCR_LAYER_ERROR"; requestId:string; error:{name:string;message:string} }

export async function applyOcrTextLayer(bytes:Uint8Array,pages:OcrLayerPage[],password?:string,signal?:AbortSignal){
  if(signal?.aborted) throw new DOMException("OCR layer export cancelled.","AbortError");
  const input=Uint8Array.from(bytes).buffer;
  const response=await new Promise<Success>((resolve,reject)=>{
    const worker=new Worker(new URL("../workers/ocr-layer-entry.worker.ts",import.meta.url),{type:"module"});
    const requestId=crypto.randomUUID?.()??`${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let started=false;
    const cleanup=()=>{clearTimeout(startup);signal?.removeEventListener("abort",cancel);worker.terminate();};
    const cancel=()=>{if(started){try{worker.postMessage({type:"CANCEL",requestId});}catch{/* worker already unavailable */}}cleanup();reject(new DOMException("OCR layer export cancelled.","AbortError"));};
    const startup=setTimeout(()=>{cleanup();reject(new Error("The OCR PDF writer could not start. Reload the app and try again."));},WORKER_STARTUP_TIMEOUT_MS);
    signal?.addEventListener("abort",cancel,{once:true});
    worker.onmessage=(event:MessageEvent<Ready|Success|Failure>)=>{
      if(event.data.type==="READY"){
        if(started||signal?.aborted)return;
        started=true;clearTimeout(startup);
        try{worker.postMessage({type:"APPLY_OCR_LAYER",requestId,bytes:input,pages,password},[input]);}
        catch(reason){cleanup();reject(reason instanceof Error?reason:new Error(String(reason)));}
        return;
      }
      if(event.data.requestId!==requestId)return;
      cleanup();
      if(event.data.type==="OCR_LAYER_ERROR")reject(new Error(event.data.error.message));else resolve(event.data);
    };
    worker.onmessageerror=()=>{cleanup();reject(new Error("The OCR PDF writer returned an unreadable response."));};
    worker.onerror=(event)=>{cleanup();reject(new Error(event.message||"OCR PDF writer failed."));};
  });
  return {bytes:new Uint8Array(response.output),...response.result};
}
