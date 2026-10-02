import type { CreatorBuildReport, CreatorBuildRequest } from "../types/creator";
import { WORKER_STARTUP_TIMEOUT_MS } from "../workers/workerReliability";

interface Success { type:"CREATOR_RESULT";requestId:string;output:ArrayBuffer;report:CreatorBuildReport }
interface Failure { type:"CREATOR_ERROR";requestId:string;error:{name:string;message:string} }
interface Ready { type:"READY" }
type Response=Ready|Success|Failure;

export function buildSearchablePdf(request:CreatorBuildRequest,signal?:AbortSignal):Promise<{bytes:Uint8Array;report:CreatorBuildReport}>{
  if(signal?.aborted)return Promise.reject(new DOMException("Operation cancelled.","AbortError"));
  const worker=new Worker(new URL("../workers/creator.worker.ts",import.meta.url),{type:"module"});const requestId=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    let started=false;
    const cleanup=()=>{clearTimeout(startupTimeout);signal?.removeEventListener("abort",cancel);worker.terminate();};
    const cancel=()=>{if(started){try{worker.postMessage({type:"CANCEL",requestId});}catch{/* Worker may already be gone. */}}cleanup();reject(new DOMException("Operation cancelled.","AbortError"));};
    const startupTimeout=setTimeout(()=>{cleanup();reject(new Error("The PDF creator engine could not start. Reload the app and try again."));},WORKER_STARTUP_TIMEOUT_MS);
    signal?.addEventListener("abort",cancel,{once:true});
    worker.onmessage=(event:MessageEvent<Response>)=>{if(event.data.type==="READY"){if(started||signal?.aborted)return;started=true;clearTimeout(startupTimeout);worker.postMessage({type:"CREATE",requestId,request});return;}if(event.data.requestId!==requestId)return;cleanup();if(event.data.type==="CREATOR_ERROR")reject(new Error(event.data.error.message));else resolve({bytes:new Uint8Array(event.data.output),report:event.data.report});};
    worker.onmessageerror=()=>{cleanup();reject(new Error("The PDF creator engine returned an unreadable response."));};
    worker.onerror=(event)=>{cleanup();reject(new Error(event.message||"PDF creator worker failed."));};
  });
}
