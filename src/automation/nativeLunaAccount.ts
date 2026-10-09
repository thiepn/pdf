/**
 * THIEPN Account native, first-party PKCE browser session used only for F8.
 * No service-role keys, HMAC secrets or model keys enter the browser.
 */
const SESSION_KEY="pdf-studio:f8:account-session";
const VERIFIER_KEY="pdf-studio:f8:oauth-verifier";

export interface AccountSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
export interface NativeLunaConfig {
  accountUrl: URL;
  publicKey: string;
  coreUrl: URL;
}
function exactOrigin(raw:string):URL {
  const url=new URL(raw);
  const local=url.hostname==="localhost"||url.hostname==="127.0.0.1";
  if((url.protocol!=="https:" && !(local&&url.protocol==="http:"))||
    url.username||url.password||url.search||url.hash||url.pathname!=="/")throw new Error("Invalid configured Account or Core origin.");
  return url;
}
export function nativeLunaConfig():NativeLunaConfig|null {
  const core=import.meta.env.VITE_PDF_CORE_URL;
  const account=import.meta.env.VITE_PDF_ACCOUNT_SUPABASE_URL;
  const key=import.meta.env.VITE_PDF_ACCOUNT_PUBLIC_KEY;
  if(!core||!account||!key)return null;
  return {coreUrl:exactOrigin(core),accountUrl:exactOrigin(account),publicKey:key};
}
function usableSession(raw:unknown):AccountSession|null {
  if(!raw||typeof raw!=="object")return null;
  const row=raw as Partial<AccountSession>;
  return typeof row.access_token==="string"&&row.access_token.length>20&&
    typeof row.refresh_token==="string"&&row.refresh_token.length>20&&
    typeof row.expires_at==="number"&&Number.isFinite(row.expires_at) ?
    {access_token:row.access_token,refresh_token:row.refresh_token,expires_at:row.expires_at}:null;
}
export function currentAccountSession():AccountSession|null {
  try{return usableSession(JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null"));}
  catch{return null;}
}
function saveSession(payload:unknown):AccountSession {
  const raw=payload as Record<string,unknown>;
  const expires=typeof raw.expires_at==="number"?raw.expires_at:
    typeof raw.expires_in==="number"?Math.floor(Date.now()/1000)+raw.expires_in:null;
  const session=usableSession({...raw,expires_at:expires});
  if(!session)throw new Error("Account did not issue a valid session.");
  sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));
  return session;
}
function base64url(input:Uint8Array):string {
  let raw="";
  for(const x of input)raw+=String.fromCharCode(x);
  return btoa(raw).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function callbackUrl():string{return window.location.origin+window.location.pathname;}
export async function startPdfAccountSignIn(config:NativeLunaConfig):Promise<void>{
  const bytes=crypto.getRandomValues(new Uint8Array(48));
  const verifier=base64url(bytes);
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)));
  sessionStorage.setItem(VERIFIER_KEY,verifier);
  const url=new URL("/auth/v1/authorize",config.accountUrl);
  url.searchParams.set("provider","google");
  url.searchParams.set("redirect_to",callbackUrl());
  url.searchParams.set("code_challenge",base64url(digest));
  url.searchParams.set("code_challenge_method","s256");
  window.location.assign(url.href);
}
async function accountTokenRequest(config:NativeLunaConfig,grant:string,body:Record<string,unknown>,signal?:AbortSignal):Promise<AccountSession>{
  const url=new URL("/auth/v1/token",config.accountUrl);
  url.searchParams.set("grant_type",grant);
  const response=await fetch(url.href,{
    method:"POST",headers:{"Content-Type":"application/json",apikey:config.publicKey},
    body:JSON.stringify(body),signal,credentials:"omit",redirect:"error"
  });
  if(!response.ok)throw new Error(response.status===400||response.status===401?
    "Account authorization expired or was rejected. Sign in again.":"Account service is unavailable.");
  return saveSession(await response.json());
}
export async function finishPdfAccountSignIn(config:NativeLunaConfig):Promise<boolean>{
  const url=new URL(window.location.href);
  const code=url.searchParams.get("code");
  if(!code)return false;
  // Immediately clear the one-use authorization code from history.
  url.searchParams.delete("code");url.searchParams.delete("error");url.searchParams.delete("error_description");
  history.replaceState(null,"",url.pathname+url.search+(url.hash||"#/batch"));
  const verifier=sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  if(!verifier||!/^[-_A-Za-z0-9]{43,128}$/.test(verifier))throw new Error("Account login verifier expired. Sign in again.");
  if(!/^[A-Za-z0-9_-]{12,512}$/.test(code))throw new Error("Account login callback is invalid.");
  await accountTokenRequest(config,"pkce",{auth_code:code,code_verifier:verifier});
  return true;
}
export async function accountAccessToken(config:NativeLunaConfig,signal?:AbortSignal):Promise<string|null>{
  const session=currentAccountSession();
  if(!session)return null;
  if(session.expires_at-Math.floor(Date.now()/1000)>60)return session.access_token;
  try{return (await accountTokenRequest(config,"refresh_token",{refresh_token:session.refresh_token},signal)).access_token;}
  catch{sessionStorage.removeItem(SESSION_KEY);return null;}
}
export function signOutPdfAccount():void {
  // Local-only logout; do not revoke sessions in other first-party apps.
  sessionStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(VERIFIER_KEY);
}
