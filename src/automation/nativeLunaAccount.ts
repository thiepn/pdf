/**
 * F8B: PDF Studio public OAuth 2.1 client of THIEPN Account.
 * Identical first-party trust boundaries to @thiepn/account-session:
 * Account-owned consent, PKCE S256 + state, exact redirect, opt-out-aware probe.
 * There are no browser HMAC secrets and no direct Google OAuth calls here.
 */
const PENDING_KEY="pdf-studio:f8b:pkce";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATE=/^[A-Za-z0-9_-]{43,128}$/;
const PENDING_TTL_MS=10*60*1000;
const PROBE_TIMEOUT_MS=2500;
const THIEPN_ACCOUNT_ORIGIN="https://account.thiepn.dev";

export interface AccountSession {
  access_token:string;
  refresh_token:string;
  expires_at:number;
}
export interface NativeLunaConfig {
  accountUrl:URL;
  publicKey:string;
  coreUrl:URL;
  clientId:string;
  accountOrigin:URL;
  redirectUri:URL;
}
export type PdfSsoProbe="signed-in"|"signed-out"|"disconnected"|"unavailable";
interface PendingAuthorization {state:string;verifier:string;startedAt:number;clientId:string;}

let callbackFlight:Promise<boolean>|null=null;
let refreshFlight:Promise<AccountSession|null>|null=null;
let lastProbe=0;
let probeFlight:Promise<PdfSsoProbe>|null=null;
let signOutGeneration=0;

function exactOrigin(raw:string):URL {
  const url=new URL(raw);
  const local=url.hostname==="localhost"||url.hostname==="127.0.0.1";
  if((url.protocol!=="https:"&&!(local&&url.protocol==="http:"))||
    url.username||url.password||url.search||url.hash||url.pathname!=="/")
    throw new Error("Invalid configured Account or Core origin.");
  return url;
}
function validRedirect(raw:string):URL {
  const url=new URL(raw);
  const local=url.hostname==="localhost"||url.hostname==="127.0.0.1";
  if((url.protocol!=="https:"&&!(local&&url.protocol==="http:"))||
    url.username||url.password||url.search||url.hash)
    throw new Error("PDF Account callback must be an exact HTTP(S) URL with no query or fragment.");
  return url;
}
export function nativeLunaConfig():NativeLunaConfig|null {
  const env=import.meta.env as unknown as Record<string,string|undefined>;
  const core=env["VITE_PDF_CORE_URL"];
  const account=env["VITE_PDF_ACCOUNT_SUPABASE_URL"];
  const key=env["VITE_PDF_ACCOUNT_PUBLIC_KEY"];
  const clientId=env["VITE_PDF_ACCOUNT_CLIENT_ID"];
  const redirect=env["VITE_PDF_ACCOUNT_REDIRECT_URI"];
  if(!core||!account||!key||!clientId||!redirect)return null;
  if(!UUID.test(clientId))throw new Error("Configured PDF OAuth client ID is invalid.");
  const redirectUri=validRedirect(redirect);
  if(typeof window!=="undefined"&&redirectUri.origin!==window.location.origin)
    throw new Error("The registered PDF OAuth callback must match this deployment's origin.");
  return {
    coreUrl:exactOrigin(core),
    accountUrl:exactOrigin(account),
    publicKey:key,
    clientId:clientId.toLowerCase(),
    redirectUri,
    accountOrigin:exactOrigin(THIEPN_ACCOUNT_ORIGIN)
  };
}
function tokenKey(config:NativeLunaConfig):string{return "pdf-studio:f8b:tokens:"+config.clientId;}
function optOutKey(config:NativeLunaConfig):string{return "pdf-studio:f8b:optout:"+config.clientId;}
function parseSession(raw:unknown):AccountSession|null {
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
  const value=raw as Partial<AccountSession>;
  if(typeof value.access_token!=="string"||value.access_token.length<20||
    typeof value.refresh_token!=="string"||value.refresh_token.length<20||
    typeof value.expires_at!=="number"||!Number.isFinite(value.expires_at)||value.expires_at<=0)return null;
  return {access_token:value.access_token,refresh_token:value.refresh_token,expires_at:value.expires_at};
}
export function currentAccountSession(config:NativeLunaConfig):AccountSession|null {
  try{return parseSession(JSON.parse(localStorage.getItem(tokenKey(config))||"null"));}
  catch{return null;}
}
function saveSession(config:NativeLunaConfig,raw:unknown):AccountSession {
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Account returned an invalid token response.");
  const value=raw as Record<string,unknown>;
  if(value.token_type!=="bearer"&&value.token_type!=="Bearer")throw new Error("Account returned an invalid bearer type.");
  const expires=typeof value.expires_in==="number"?Math.floor(Date.now()/1000)+value.expires_in:null;
  const session=parseSession({...value,expires_at:expires});
  if(!session)throw new Error("Account did not issue a valid session.");
  localStorage.setItem(tokenKey(config),JSON.stringify(session));
  return session;
}
function b64(bytes:Uint8Array):string {
  let source="";for(const byte of bytes)source+=String.fromCharCode(byte);
  return btoa(source).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function randomToken():string{return b64(crypto.getRandomValues(new Uint8Array(32)));}
function safeState():PendingAuthorization|null {
  try{
    const raw=JSON.parse(sessionStorage.getItem(PENDING_KEY)||"null") as Partial<PendingAuthorization>|null;
    if(!raw||typeof raw.state!=="string"||!STATE.test(raw.state)||
      typeof raw.verifier!=="string"||!STATE.test(raw.verifier)||
      typeof raw.startedAt!=="number"||typeof raw.clientId!=="string")return null;
    return raw as PendingAuthorization;
  }catch{return null;}
}
export function pdfAccountLocallyDisconnected(config:NativeLunaConfig):boolean {
  try{return localStorage.getItem(optOutKey(config))==="1";}catch{return true;}
}
function clearOptOut(config:NativeLunaConfig):void{try{localStorage.removeItem(optOutKey(config));}catch{/* blocked storage */}}
async function postToken(config:NativeLunaConfig,body:URLSearchParams,signal?:AbortSignal):Promise<AccountSession>{
  const response=await fetch(new URL("/auth/v1/oauth/token",config.accountUrl),{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body,credentials:"omit",redirect:"error",signal:signal??AbortSignal.timeout(12000)
  });
  if(!response.ok)throw new Error(response.status===400||response.status===401||response.status===403?
    "ACCOUNT_GRANT_REVOKED":"ACCOUNT_AUTH_TEMPORARILY_UNAVAILABLE");
  return saveSession(config,await response.json());
}
export async function startPdfAccountSignIn(config:NativeLunaConfig):Promise<void>{
  const state=randomToken(),verifier=randomToken();
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)));
  sessionStorage.setItem(PENDING_KEY,JSON.stringify({state,verifier,startedAt:Date.now(),clientId:config.clientId} satisfies PendingAuthorization));
  clearOptOut(config);
  window.location.assign(buildPdfAccountAuthorizationUrl(config,state,b64(digest)));
}
export function buildPdfAccountAuthorizationUrl(config:NativeLunaConfig,state:string,challenge:string):string{
  if(!STATE.test(state)||!STATE.test(challenge))throw new Error("Invalid OAuth state or PKCE challenge.");
  const url=new URL("/auth/v1/oauth/authorize",config.accountUrl);
  url.searchParams.set("response_type","code");
  url.searchParams.set("client_id",config.clientId);
  url.searchParams.set("redirect_uri",config.redirectUri.href);
  url.searchParams.set("scope","openid email profile offline_access");
  url.searchParams.set("state",state);
  url.searchParams.set("code_challenge",challenge);
  url.searchParams.set("code_challenge_method","S256");
  return url.href;
}
export function isPdfOAuthCallback(config:NativeLunaConfig,location:Pick<Location,"href"|"hash">):boolean{
  const url=new URL(location.href);
  return url.origin===config.redirectUri.origin&&url.pathname===config.redirectUri.pathname&&
    !url.hash&&(!location.hash)&&url.searchParams.has("state")&&
    (url.searchParams.has("code")||url.searchParams.has("error"));
}
export async function finishPdfAccountSignIn(config:NativeLunaConfig):Promise<boolean>{
  if(callbackFlight)return callbackFlight;
  const perform=async()=>{
    const url=new URL(window.location.href);
    if(!isPdfOAuthCallback(config,window.location))return false;
    const keys=[...url.searchParams.keys()];
    const state=url.searchParams.get("state")??"";
    const code=url.searchParams.get("code");
    const valid=STATE.test(state)&&url.searchParams.getAll("state").length===1&&
      (code!==null?
        keys.every(x=>x==="code"||x==="state")&&url.searchParams.getAll("code").length===1&&
        code.length>0&&code.length<=4096&&!/[\u0000-\u001f\s]/.test(code):
        keys.every(x=>["error","error_description","state"].includes(x))&&
        url.searchParams.getAll("error").length===1);
    const pending=safeState();
    // One-shot callback, including every invalid/denied response. Erase secrets from URL.
    sessionStorage.removeItem(PENDING_KEY);
    history.replaceState(null,"",url.pathname+"#/batch");
    if(!valid||!pending||pending.state!==state||pending.clientId!==config.clientId||
      Date.now()<pending.startedAt||Date.now()-pending.startedAt>PENDING_TTL_MS)
      throw new Error("Account authorization callback failed state and PKCE validation.");
    if(code===null)throw new Error("THIEPN Account authorization was cancelled.");
    const atStart=signOutGeneration;
    const response=await postToken(config,new URLSearchParams({
      grant_type:"authorization_code",code,client_id:config.clientId,
      redirect_uri:config.redirectUri.href,code_verifier:pending.verifier
    }));
    if(signOutGeneration!==atStart){localStorage.removeItem(tokenKey(config));return false;}
    if(!response.access_token)return false;
    clearOptOut(config);
    return true;
  };
  callbackFlight=perform().finally(()=>{callbackFlight=null;});
  return callbackFlight;
}
export async function accountAccessToken(config:NativeLunaConfig,signal?:AbortSignal):Promise<string|null>{
  const session=currentAccountSession(config);
  if(!session)return null;
  if(session.expires_at-Math.floor(Date.now()/1000)>30)return session.access_token;
  if(refreshFlight)return (await refreshFlight)?.access_token??null;
  const old=session.refresh_token,epoch=signOutGeneration;
  const perform=async():Promise<AccountSession|null>=>{
    try{
      const newest=currentAccountSession(config);
      if(!newest||newest.refresh_token!==old)return newest;
      const next=await postToken(config,new URLSearchParams({
        grant_type:"refresh_token",refresh_token:old,client_id:config.clientId
      }),signal);
      if(signOutGeneration!==epoch){localStorage.removeItem(tokenKey(config));return null;}
      return next;
    }catch(error){
      if(error instanceof Error&&error.message==="ACCOUNT_GRANT_REVOKED"&&
        currentAccountSession(config)?.refresh_token===old)localStorage.removeItem(tokenKey(config));
      // Transient outages must not silently revoke an Account session.
      return null;
    }
  };
  refreshFlight=perform().finally(()=>{refreshFlight=null;});
  return (await refreshFlight)?.access_token??null;
}
export async function verifyPdfAccount(config:NativeLunaConfig):Promise<boolean>{
  const token=await accountAccessToken(config);
  if(!token)return false;
  try{
    const response=await fetch(new URL("/auth/v1/user",config.accountUrl),{
      headers:{Accept:"application/json",apikey:config.publicKey,Authorization:"Bearer "+token},
      credentials:"omit",redirect:"error",signal:AbortSignal.timeout(8000)
    });
    if(response.status===401||response.status===403){
      if(currentAccountSession(config)?.access_token===token)localStorage.removeItem(tokenKey(config));
      return false;
    }
    if(!response.ok)return false;
    const user:unknown=await response.json();
    return !!user&&typeof user==="object"&&
      typeof (user as Record<string,unknown>).id==="string"&&
      UUID.test((user as Record<string,string>).id);
  }catch{return false;}
}
export function signOutPdfAccount(config:NativeLunaConfig):void {
  signOutGeneration++;
  localStorage.removeItem(tokenKey(config));
  sessionStorage.removeItem(PENDING_KEY);
  try{localStorage.setItem(optOutKey(config),"1");}catch{/* blocked storage */}
}
export function parsePdfSsoProbeMessage(raw:unknown,clientId:string):PdfSsoProbe|null{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
  const row=raw as Record<string,unknown>;
  if(row.type!=="thiepn:sso-probe:v1"||row.clientId!==clientId||
    typeof row.signedIn!=="boolean"||typeof row.eligible!=="boolean")return null;
  if(!row.signedIn)return "signed-out";
  return row.eligible?"signed-in":"disconnected";
}
export async function probePdfAccountSso(config:NativeLunaConfig):Promise<PdfSsoProbe>{
  if(probeFlight)return probeFlight;
  if(pdfAccountLocallyDisconnected(config)||typeof document==="undefined"||!document.body||
    !navigator.onLine||Date.now()-lastProbe<30_000)return "unavailable";
  lastProbe=Date.now();
  const pending=new Promise<PdfSsoProbe>(resolve=>{
    const iframe=document.createElement("iframe");
    iframe.hidden=true;iframe.tabIndex=-1;iframe.setAttribute("aria-hidden","true");
    iframe.setAttribute("sandbox","allow-scripts allow-same-origin");
    iframe.referrerPolicy="origin";
    iframe.src=config.accountOrigin.origin+"/sso/probe?client_id="+encodeURIComponent(config.clientId);
    let done=false;let timeout:ReturnType<typeof setTimeout>;
    const finish=(status:PdfSsoProbe)=>{
      if(done)return;done=true;clearTimeout(timeout);
      window.removeEventListener("message",onMessage);iframe.remove();resolve(status);
    };
    const onMessage=(event:MessageEvent)=>{
      if(event.origin!==config.accountOrigin.origin||event.source!==iframe.contentWindow)return;
      const result=parsePdfSsoProbeMessage(event.data,config.clientId);
      if(result)finish(result);
    };
    window.addEventListener("message",onMessage);
    timeout=setTimeout(()=>finish("unavailable"),PROBE_TIMEOUT_MS);
    try{document.body.appendChild(iframe);}catch{finish("unavailable");}
  });
  probeFlight=pending.finally(()=>{probeFlight=null;});
  return probeFlight;
}
