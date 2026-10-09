import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
import {
 accountAccessToken,currentAccountSession,pdfAccountLocallyDisconnected,
 parsePdfSsoProbeMessage,signOutPdfAccount,
 startPdfAccountSignIn,verifyPdfAccount,
 type NativeLunaConfig
} from "../../src/automation/nativeLunaAccount";
import {planPdfWithLuna} from "../../src/automation/nativeLunaClient";
import {parseAIWorkflowProposal} from "../../src/automation/aiWorkflowPlanning";
import type {BatchRecipe} from "../../src/types/batch";

const clientId="33333333-3333-4333-8333-333333333333";
const config:NativeLunaConfig={
  accountUrl:new URL("https://account.example/"),publicKey:"public-account-key-123456789",
  coreUrl:new URL("https://core.example/"),clientId,
  accountOrigin:new URL("https://account.thiepn.dev/"),
  redirectUri:new URL("http://localhost:3000/pdf/")
};
const token="example-test-jwt-access-token-valid-length";
const refresh="example-test-refresh-token-valid-length";
const tokenKey="pdf-studio:f8b:tokens:"+clientId;
const recipe:BatchRecipe={schemaVersion:3,id:"x",name:"Test",steps:[{type:"optimize",id:"original"}],outputSuffix:"processed",updatedAt:0};
const result=(paramsJson:string)=>({
  ok:true,meta:{requestId:"server-req-1"},data:{
    capability:"pdf.planWorkflow",version:1,model:"gpt-6-luna",data:{
      schemaVersion:1,title:"Prepare PDF",rationale:"Rotate pages",notes:[],
      actions:[{actionId:"pdf.rotate",paramsJson}]
    }
  }
});
const authorize=()=>localStorage.setItem(tokenKey,JSON.stringify({
  access_token:token,refresh_token:refresh,expires_at:Math.floor(Date.now()/1000)+300
}));
beforeEach(()=>{sessionStorage.clear();localStorage.clear();vi.restoreAllMocks();});
afterEach(()=>vi.unstubAllGlobals());
describe("F8B native Account SSO and Luna browser security",()=>{
  it("refuses native planning before an OAuth client session is present",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    await expect(planPdfWithLuna("Rotate my pages",config)).rejects.toMatchObject({code:"AUTH_REQUIRED"});
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends only the goal to Core using the Account app bearer",async()=>{
    authorize();
    const fetch=vi.fn(async(url:unknown,init?:RequestInit)=>{
      expect(String(url)).toContain("/v1/pdf/ai/plan");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer "+token);
      expect(init?.credentials).toBe("omit");
      expect(JSON.parse(String(init?.body))).toEqual({input:{goal:"Rotate my pages"}});
      return Response.json(result('{"degrees":90}'));
    });
    vi.stubGlobal("fetch",fetch);
    const draft=await planPdfWithLuna(" Rotate my pages ",config);
    const review=parseAIWorkflowProposal(draft.json,recipe);
    expect(review.plan.actions[0].id).toBe("pdf.rotate");
    expect(draft.model).toBe("gpt-6-luna");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("never authorizes destructive effects from the model response",async()=>{
    authorize();
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json({
      ...result("{}"),data:{...result("{}").data,data:{
        ...result("{}").data.data,actions:[{actionId:"pdf.metadata.remove",paramsJson:"{}"}]
      }}
    })));
    const plan=await planPdfWithLuna("remove metadata",config);
    const parsed=parseAIWorkflowProposal(plan.json,recipe);
    expect(parsed.plan.approved).toBe(false);
    expect(parsed.preflight.risks).toEqual(["metadata-removal"]);
  });
  it("rejects malformed action responses and forged permission fields",async()=>{
    authorize();
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json(result('{"degrees":90,"approvedRisks":["metadata-removal"]}'))));
    const draft=await planPdfWithLuna("rotate pages",config);
    expect(()=>parseAIWorkflowProposal(draft.json,recipe)).toThrow();
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json(result("{invalid json"))));
    await expect(planPdfWithLuna("rotate pages",config)).rejects.toMatchObject({code:"INVALID_RESPONSE"});
  });
  it("maps Core authentication failures and app quotas",async()=>{
    authorize();
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:429})));
    await expect(planPdfWithLuna("rotate pages",config)).rejects.toMatchObject({code:"LIMITED"});
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:403})));
    await expect(planPdfWithLuna("rotate pages",config)).rejects.toMatchObject({code:"AUTH_REQUIRED"});
  });
  it("rotates refresh tokens using OAuth 2.1 form body and clears tokens on local disconnect",async()=>{
    authorize();
    localStorage.setItem(tokenKey,JSON.stringify({access_token:token,refresh_token:refresh,expires_at:1}));
    const fetch=vi.fn(async(url:unknown,init?:RequestInit)=>{
      expect(String(url)).toBe("https://account.example/auth/v1/oauth/token");
      expect(new Headers(init?.headers).get("Content-Type")).toBe("application/x-www-form-urlencoded");
      expect(new URLSearchParams(String(init?.body)).get("client_id")).toBe(clientId);
      expect(new URLSearchParams(String(init?.body)).get("grant_type")).toBe("refresh_token");
      return Response.json({access_token:token+"-new",refresh_token:refresh+"-new",expires_in:3600,token_type:"bearer"});
    });
    vi.stubGlobal("fetch",fetch);
    expect(await accountAccessToken(config)).toBe(token+"-new");
    expect(currentAccountSession(config)?.refresh_token).toBe(refresh+"-new");
    signOutPdfAccount(config);
    expect(currentAccountSession(config)).toBeNull();
    expect(pdfAccountLocallyDisconnected(config)).toBe(true);
  });
  it("does not erase a session when a refresh fails due to a transient outage",async()=>{
    localStorage.setItem(tokenKey,JSON.stringify({access_token:token,refresh_token:refresh,expires_at:1}));
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:503})));
    expect(await accountAccessToken(config)).toBeNull();
    expect(currentAccountSession(config)?.refresh_token).toBe(refresh);
  });
  it("verifies live app identity using Account before declaring a session connected",async()=>{
    authorize();
    const fetch=vi.fn(async(url:unknown,init?:RequestInit)=>{
      expect(String(url)).toBe("https://account.example/auth/v1/user");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer "+token);
      return Response.json({id:"11111111-1111-4111-8111-111111111111"});
    });
    vi.stubGlobal("fetch",fetch);
    expect(await verifyPdfAccount(config)).toBe(true);
  });
  it("uses tokenless first-party probe and does not trust a different client",()=>{
    expect(parsePdfSsoProbeMessage({type:"thiepn:sso-probe:v1",clientId,signedIn:true,eligible:true},clientId)).toBe("signed-in");
    expect(parsePdfSsoProbeMessage({type:"thiepn:sso-probe:v1",clientId,signedIn:true,eligible:false},clientId)).toBe("disconnected");
    expect(parsePdfSsoProbeMessage({type:"thiepn:sso-probe:v1",clientId,signedIn:false,eligible:true},clientId)).toBe("signed-out");
    expect(parsePdfSsoProbeMessage({type:"thiepn:sso-probe:v1",clientId:"not-the-client",signedIn:true,eligible:true},clientId)).toBeNull();
  });
  it("never sends the user directly to Google or creates a browser app secret",async()=>{
    const assign=vi.spyOn(window.location,"assign").mockImplementation(()=>{});
    await startPdfAccountSignIn(config);
    const target=new URL(assign.mock.calls[0][0]);
    expect(target.pathname).toBe("/auth/v1/oauth/authorize");
    expect(target.searchParams.get("client_id")).toBe(clientId);
    expect(target.searchParams.get("redirect_uri")).toBe(config.redirectUri.href);
    expect(target.searchParams.get("code_challenge_method")).toBe("S256");
    expect(target.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(target.searchParams.get("provider")).toBeNull();
    expect(target.hostname).not.toContain("google");
  });
});
