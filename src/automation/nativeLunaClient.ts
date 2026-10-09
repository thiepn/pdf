import { accountAccessToken, type NativeLunaConfig } from "./nativeLunaAccount";

export class PdfLunaError extends Error {
  constructor(public readonly code:"AUTH_REQUIRED"|"LIMITED"|"UNAVAILABLE"|"INVALID_RESPONSE"|"INVALID_REQUEST"|"TIMEOUT",message:string){
    super(message);this.name="PdfLunaError";
  }
}
export interface NativePlanResult {
  json:string;
  model:"gpt-6-luna";
  requestId:string;
}
function object(raw:unknown): raw is Record<string,unknown> {
  return !!raw&&typeof raw==="object"&&!Array.isArray(raw);
}
/**
 * Browser calls only the private THIEPN Core gateway with its Account bearer.
 * The gateway verifies the identity and privately signs the AI-service request.
 */
export async function planPdfWithLuna(
  goal:string,
  config:NativeLunaConfig,
  signal?:AbortSignal
):Promise<NativePlanResult>{
  if(typeof goal!=="string"||goal.trim().length<3||goal.length>1200)
    throw new PdfLunaError("INVALID_REQUEST","Describe a PDF workflow in 3–1,200 characters.");
  const token=await accountAccessToken(config,signal);
  if(!token)throw new PdfLunaError("AUTH_REQUIRED","Sign in with THIEPN Account to use Luna.");
  let response:Response;
  try{
    response=await fetch(new URL("/v1/pdf/ai/plan",config.coreUrl),{
      method:"POST",
      headers:{Accept:"application/json","Content-Type":"application/json",Authorization:`Bearer ${token}`},
      body:JSON.stringify({input:{goal:goal.trim()}}),
      credentials:"omit",redirect:"error",
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20_000)]):AbortSignal.timeout(20_000)
    });
  }catch(error){
    if(error instanceof DOMException&&["TimeoutError","AbortError"].includes(error.name))
      throw new PdfLunaError("TIMEOUT","The AI planning request timed out or was cancelled.");
    throw new PdfLunaError("UNAVAILABLE","Could not reach THIEPN Core. Manual ChatGPT planning remains available.");
  }
  if(response.status===401||response.status===403)throw new PdfLunaError("AUTH_REQUIRED","Account authorization expired. Sign in again.");
  if(response.status===429)throw new PdfLunaError("LIMITED","Luna usage limit reached. Use manual planning or try later.");
  if(response.status===400||response.status===413)throw new PdfLunaError("INVALID_REQUEST","The planning request was rejected.");
  if(!response.ok)throw new PdfLunaError("UNAVAILABLE","Native Luna is temporarily unavailable. Use manual planning.");
  let root:unknown;
  try{root=await response.json();}catch{throw new PdfLunaError("INVALID_RESPONSE","Native Luna returned invalid JSON.");}
  if(!object(root)||root.ok!==true||!object(root.data)||!object(root.meta)||
    root.data.capability!=="pdf.planWorkflow"||root.data.model!=="gpt-6-luna"||
    root.data.version!==1||typeof root.meta.requestId!=="string"||!object(root.data.data))
    throw new PdfLunaError("INVALID_RESPONSE","Native Luna response did not match the expected capability contract.");
  const data=root.data.data;
  if(data.schemaVersion!==1||typeof data.title!=="string"||typeof data.rationale!=="string"||
    !Array.isArray(data.actions)||!Array.isArray(data.notes)||data.actions.length<1||data.actions.length>32)
    throw new PdfLunaError("INVALID_RESPONSE","Luna proposed an invalid workflow.");
  const actions=data.actions.map((item:unknown)=>{
    if(!object(item)||Object.keys(item).some(k=>!["actionId","paramsJson"].includes(k))||
      typeof item.actionId!=="string"||typeof item.paramsJson!=="string")
      throw new PdfLunaError("INVALID_RESPONSE","Luna returned an unsupported action format.");
    let params:unknown;
    try{params=JSON.parse(item.paramsJson);}catch{throw new PdfLunaError("INVALID_RESPONSE","Luna returned malformed action parameters.");}
    if(!object(params))throw new PdfLunaError("INVALID_RESPONSE","Luna action parameters must be a JSON object.");
    return {actionId:item.actionId,params};
  });
  // Full action allowlisting, output limits and safety review occur in F7 parser.
  return {
    json:JSON.stringify({schemaVersion:1,title:data.title,rationale:data.rationale,actions,notes:data.notes}),
    model:"gpt-6-luna",requestId:root.meta.requestId
  };
}
