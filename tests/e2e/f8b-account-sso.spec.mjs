import {test,expect} from "@playwright/test";

test.skip(!process.env.VITE_PDF_CORE_URL || !process.env.VITE_PDF_ACCOUNT_CLIENT_ID, "Native Account tests require explicit nonsecret test origins and registered client ID; tested in dedicated F8 qualification.");

const clientId="33333333-3333-4333-8333-333333333333";
const state="a".repeat(43),verifier="b".repeat(43);
const accountOrigin="https://account.example";
function interceptUser(page){
  return page.route(accountOrigin+"/auth/v1/user",async route=>{
    if(route.request().method()==="OPTIONS"){
      await route.fulfill({status:204,headers:{
        "Access-Control-Allow-Origin":"http://127.0.0.1:4173",
        "Access-Control-Allow-Methods":"GET, OPTIONS",
        "Access-Control-Allow-Headers":"Authorization, apikey"
      }});return;
    }
    await route.fulfill({headers:{"Access-Control-Allow-Origin":"http://127.0.0.1:4173"},
      json:{id:"11111111-1111-4111-8111-111111111111"}});
  });
}
test("F8B Account callback exchanges only state-bound PKCE for the registered PDF client",async({page})=>{
  let exchanges=0;
  await page.addInitScript(({state,verifier,clientId})=>{
    sessionStorage.setItem("pdf-studio:f8b:pkce",JSON.stringify({state,verifier,clientId,startedAt:Date.now()}));
  },{state,verifier,clientId});
  await interceptUser(page);
  await page.route(accountOrigin+"/auth/v1/oauth/token",async route=>{
    exchanges++;
    const body=new URLSearchParams(route.request().postData()??"");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe(clientId);
    expect(body.get("state")).toBeNull();
    expect(body.get("code_verifier")).toBe(verifier);
    expect(body.get("redirect_uri")).toBe("http://127.0.0.1:4173/pdf/");
    expect(body.get("code")).toBe("test-code-one-time");
    await route.fulfill({headers:{"Access-Control-Allow-Origin":"http://127.0.0.1:4173"},json:{
      token_type:"bearer",
      access_token:"test-account-access-token-long-enough",
      refresh_token:"test-account-refresh-token-long-enough",
      expires_in:3600
    }});
  });
  await page.goto("./?code=test-code-one-time&state="+state);
  const native=page.getByLabel("Native GPT-6 Luna planner");
  await expect(native.getByText("THIEPN Account connected",{exact:true})).toBeVisible({timeout:20000});
  expect(exchanges).toBe(1);
  expect(page.url()).not.toContain("test-code-one-time");
  expect(page.url()).not.toContain("state=");
  await expect(page.getByRole("heading",{name:"Plan with GPT-6 Luna or ChatGPT"})).toBeVisible();
  expect(await page.evaluate(()=>sessionStorage.getItem("pdf-studio:f8b:pkce"))).toBeNull();
});
test("F8B rejects a forged OAuth callback without exchanging tokens",async({page})=>{
  let exchanges=0;
  await page.addInitScript(({state,verifier,clientId})=>{
    sessionStorage.setItem("pdf-studio:f8b:pkce",JSON.stringify({state,verifier,clientId,startedAt:Date.now()}));
  },{state,verifier,clientId});
  await page.route(accountOrigin+"/auth/v1/oauth/token",async route=>{exchanges++;await route.abort();});
  await page.goto("./?code=invalid-code&state="+("z".repeat(43)));
  await expect(page.getByRole("heading",{name:"Plan with GPT-6 Luna or ChatGPT"})).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("state and PKCE validation");
  expect(exchanges).toBe(0);
  expect(page.url()).not.toContain("invalid-code");
  expect(await page.evaluate(()=>sessionStorage.getItem("pdf-studio:f8b:pkce"))).toBeNull();
});
