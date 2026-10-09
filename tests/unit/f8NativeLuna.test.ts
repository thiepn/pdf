import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
import { accountAccessToken,currentAccountSession,signOutPdfAccount,type NativeLunaConfig } from "../../src/automation/nativeLunaAccount";
import { planPdfWithLuna,PdfLunaError } from "../../src/automation/nativeLunaClient";
import { parseAIWorkflowProposal } from "../../src/automation/aiWorkflowPlanning";
import type {BatchRecipe} from "../../src/types/batch";

const config:NativeLunaConfig={
  accountUrl:new URL("https://account.example/"),publicKey:"public-anon-key",
  coreUrl:new URL("https://core.example/")
};
const token="example-test-jwt-access-token-valid-length";
const refresh="example-test-refresh-token-valid-length";
const sessionKey="pdf-studio:f8:account-session";
const recipe:BatchRecipe={schemaVersion:3,id:"x",name:"Test",steps:[{type:"optimize",id:"original"}],outputSuffix:"processed",updatedAt:0};
const result=(paramsJson:string)=>({
  ok:true,meta:{requestId:"server-req-1"},data:{
    capability:"pdf.planWorkflow",version:1,model:"gpt-6-luna",data:{
      schemaVersion:1,title:"Prepare PDF",rationale:"Rotate pages",notes:[],
      actions:[{actionId:"pdf.rotate",paramsJson}]
    }
  }
});
const authorize=()=>sessionStorage.setItem(sessionKey,JSON.stringify({
  access_token:token,refresh_token:refresh,expires_at:Math.floor(Date.now()/1000)+300
}));
beforeEach(()=>{sessionStorage.clear();vi.restoreAllMocks()});
afterEach(()=>vi.unstubAllGlobals());
describe("F8 native Luna browser security",()=>{
  it("refuses to send requests for an unauthenticated browser",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    await expect(planPdfWithLuna("Rotate my pages",config)).rejects.toMatchObject({code:"AUTH_REQUIRED"});
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends only the goal to Core under the verified Account bearer",async()=>{
    authorize();
    const fetch=vi.fn(async(url:unknown,init?:RequestInit)=>{
      expect(String(url)).toContain("/v1/pdf/ai/plan");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer "+token);
      expect(init?.credentials).toBe("omit");
      expect(JSON.parse(String(init?.body))).toEqual({input:{goal:"Rotate my pages"}});
      expect(String(init?.body)).not.toContain("sourcePdf");
      return Response.json(result('{"degrees":90}'));
    });
    vi.stubGlobal("fetch",fetch);
    const draft=await planPdfWithLuna(" Rotate my pages ",config);
    expect(draft.model).toBe("gpt-6-luna");
    expect(draft.requestId).toBe("server-req-1");
    const review=parseAIWorkflowProposal(draft.json,recipe);
    expect(review.plan.actions[0].id).toBe("pdf.rotate");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("requires user consent even after native model proposes metadata removal",async()=>{
    authorize();
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json({
      ...result("{}"),
      data:{...result("{}").data,data:{
        ...result("{}").data.data,
        actions:[{actionId:"pdf.metadata.remove",paramsJson:"{}"}]
      }}
    })));
    const plan=await planPdfWithLuna("remove metadata",config);
    const parsed=parseAIWorkflowProposal(plan.json,recipe);
    expect(parsed.plan.approved).toBe(false);
    expect(parsed.preflight.risks).toEqual(["metadata-removal"]);
  });
  it("rejects invalid model JSON, forged permissions and malformed output",async()=>{
    authorize();
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json(result('{"degrees":90,"approvedRisks":["metadata-removal"]}'))));
    const draft=await planPdfWithLuna("rotate pages",config);
    expect(()=>parseAIWorkflowProposal(draft.json,recipe)).toThrow(/Unknown option/);
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json(result("{invalid json"))));
    await expect(planPdfWithLuna("rotate pages",config)).rejects.toMatchObject({code:"INVALID_RESPONSE"});
  });
  it("handles rate limits and unauthorized responses without forwarding to any AI endpoint",async()=>{
    authorize();
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:429})));
    await expect(planPdfWithLuna("rotate pages",config)).rejects.toMatchObject({code:"LIMITED"});
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:401})));
    await expect(planPdfWithLuna("rotate pages",config)).rejects.toMatchObject({code:"AUTH_REQUIRED"});
  });
  it("refreshes a session using the public Account endpoint and clears local tokens on logout",async()=>{
    authorize();
    sessionStorage.setItem(sessionKey,JSON.stringify({access_token:token,refresh_token:refresh,expires_at:1}));
    const fetch=vi.fn(async(url:unknown,init?:RequestInit)=>{
      expect(String(url)).toBe("https://account.example/auth/v1/token?grant_type=refresh_token");
      expect(new Headers(init?.headers).get("apikey")).toBe(config.publicKey);
      expect(new Headers(init?.headers).get("Authorization")).toBeNull();
      expect(JSON.parse(String(init?.body))).toEqual({refresh_token:refresh});
      return Response.json({access_token:token+"-new",refresh_token:refresh+"-new",expires_in:3600});
    });
    vi.stubGlobal("fetch",fetch);
    expect(await accountAccessToken(config)).toBe(token+"-new");
    expect(currentAccountSession()?.refresh_token).toBe(refresh+"-new");
    signOutPdfAccount();
    expect(currentAccountSession()).toBeNull();
  });
});
