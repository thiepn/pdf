import type { CreatorBuildReport, CreatorBuildRequest } from "../types/creator";

interface Success { type:"CREATOR_RESULT";requestId:string;output:ArrayBuffer;report:CreatorBuildReport }
interface Failure { type:"CREATOR_ERROR";requestId:string;error:{name:string;message:string} }
interface Ready { type:"READY" }
type Response=Ready|Success|Failure;

export function buildSearchablePdf(request:CreatorBuildRequest,signal?:AbortSignal):Promise<{bytes:Uint8Array;report:CreatorBuildReport}>{
  if(signal?.aborted)return Promise.reject(new DOMException("Operation cancelled.","AbortError"));
  const worker=new Worker(new URL("../workers/creator.worker.ts",import.meta.url),{type:"module"});const requestId=crypto.randomUUID();
  return new Promise((resolve,reject)=>{const cleanup=()=>{signal?.removeEventListener("abort",cancel);worker.onmessage=null;worker.onmessageerror=null;worker.onerror=null;worker.terminate();};const fail=(reason:unknown)=>{cleanup();reject(reason instanceof Error?reason:new Error(String(reason)));};const cancel=()=>{try{worker.postMessage({type:"CANCEL",requestId});}catch{/* termination below is authoritative */}cleanup();reject(new DOMException("Operation cancelled.","AbortError"));};signal?.addEventListener("abort",cancel,{once:true});
    worker.onmessage=(event:MessageEvent<Response>)=>{if(event.data.type==="READY"){try{worker.postMessage({type:"CREATE",requestId,request});}catch(reason){fail(reason);}return;}if(event.data.requestId!==requestId)return;cleanup();if(event.data.type==="CREATOR_ERROR")reject(new Error(event.data.error.message));else resolve({bytes:new Uint8Array(event.data.output),report:event.data.report});};
    worker.onmessageerror=()=>fail(new Error("PDF creator worker returned an unreadable response."));
    worker.onerror=(event)=>fail(new Error(event.message||"PDF creator worker failed."));
  });
}
