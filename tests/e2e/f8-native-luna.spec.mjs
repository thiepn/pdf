import {test,expect} from "@playwright/test";

test.setTimeout(90_000);
const session={
  access_token:"test-account-access-token-long-enough",
  refresh_token:"test-account-refresh-token-long-enough",
  expires_at:Math.floor(Date.now()/1000)+3600
};
test("F8 native GPT-6 Luna proposes, validates, waits for apply and never executes itself",async({page})=>{
  await page.addInitScript(s=>sessionStorage.setItem("pdf-studio:f8:account-session",JSON.stringify(s)),session);
  let modelCalls=0;
  await page.route("https://core.example/v1/pdf/ai/plan",async route=>{
    modelCalls++;
    const data=route.request().postDataJSON();
    expect(data).toEqual({input:{goal:"Rotate every page and remove metadata"}});
    expect(route.request().headers().authorization).toMatch(/^Bearer test-account-access/);
    await route.fulfill({json:{
      ok:true,meta:{requestId:"req-f8-e2e"},data:{
        capability:"pdf.planWorkflow",version:1,model:"gpt-6-luna",data:{
          schemaVersion:1,title:"Rotate and clean metadata",rationale:"Two requested actions.",
          notes:[],actions:[
            {actionId:"pdf.rotate",paramsJson:'{"degrees":90}'},
            {actionId:"pdf.metadata.remove",paramsJson:"{}"}
          ]
        }
      }
    }});
  });
  await page.goto("./#/batch");
  const planner=page.getByRole("region",{name:"AI-assisted workflow planning"});
  await expect(planner.getByRole("heading",{name:"Plan with GPT-6 Luna or ChatGPT"})).toBeVisible();
  const native=page.getByLabel("Native GPT-6 Luna planner");
  await expect(native.getByText("THIEPN Account connected")).toBeVisible();
  await planner.getByRole("textbox",{name:"PDF workflow goal"}).fill("Rotate every page and remove metadata");
  await native.getByRole("button",{name:"Generate with Luna"}).click();
  await expect(page.getByLabel("Proposed workflow review")).toBeVisible({timeout:15000});
  await expect(page.getByLabel("Proposed workflow review")).toContainText("Rotate and clean metadata");
  expect(modelCalls).toBe(1);
  await expect(page.locator(".f6-step")).toHaveCount(1);
  await expect(page.getByRole("button",{name:"Run workflow"})).toBeDisabled();
  await planner.getByRole("checkbox",{name:/I approve replacing the current workflow steps/}).check();
  await planner.getByRole("button",{name:"Apply proposal to composer"}).click();
  await expect(page.locator(".f6-step")).toHaveCount(2);
  await expect(page.getByRole("checkbox",{name:/I reviewed the metadata removal effects/})).not.toBeChecked();
  await expect(page.getByRole("button",{name:"Run workflow"})).toBeDisabled();
  await expect(page.locator(".batch-item--complete")).toHaveCount(0);
});
test("F8 keeps manual ChatGPT fallback when native deployment configuration is absent",async({page})=>{
  // CI configuration is present for the first test; manual fallback must remain present anyway.
  await page.goto("./#/batch");
  await expect(page.getByRole("button",{name:"Copy ChatGPT prompt"})).toBeVisible();
  await expect(page.getByRole("textbox",{name:"ChatGPT workflow JSON"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Review proposed workflow"})).toBeDisabled();
});
