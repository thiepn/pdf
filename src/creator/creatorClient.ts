import type { CreatorBuildReport, CreatorBuildRequest } from "../types/creator";

interface Success { type:"CREATOR_RESULT";requestId:string;output:ArrayBuffer;report:CreatorBuildReport }
interface Failure { type:"CREATOR_ERROR";requestId:string;error:{name:string;message:string} }
interface Ready { type:"READY" }
type Response=Ready|Success|Failure;

export function buildSearchablePdf(request:CreatorBuildRequest,signal?:AbortSignal):Promise<{bytes:Uint8Array;report:CreatorBuildReport}>{
  const worker=new Worker(new URL("../workers/creator.worker.ts",import.meta.url),{type:"module"});const requestId=crypto.randomUUID();
  return new Promise((resolve,reject)=>{const cleanup=()=>{signal?.removeEventListener("abort",cancel);worker.terminate();};const cancel=()=>{worker.postMessage({type:"CANCEL",requestId});cleanup();reject(new DOMException("Operation cancelled.","AbortError"));};signal?.addEventListener("abort",cancel,{once:true});
    worker.onmessage=(event:MessageEvent<Response>)=>{if(event.data.type==="READY"){worker.postMessage({type:"CREATE",requestId,request});return;}if(event.data.requestId!==requestId)return;cleanup();if(event.data.type==="CREATOR_ERROR")reject(new Error(event.data.error.message));else resolve({bytes:new Uint8Array(event.data.output),report:event.data.report});};
    worker.onerror=(event)=>{cleanup();reject(new Error(event.message||"PDF creator worker failed."));};
  });
}
