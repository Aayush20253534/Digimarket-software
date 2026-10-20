import { expect, test, type Page } from "@playwright/test";

const INITIAL = process.env.E2E_ADMIN_INITIAL_PASSWORD ?? "";
const UPDATED = process.env.E2E_ADMIN_UPDATED_PASSWORD ?? "";
if (!INITIAL || !UPDATED) throw Error("Missing isolated browser CI credentials");

async function login(page:Page,id:string,password:string){
  await page.goto("/login");
  await page.getByLabel("Login ID").fill(id);
  await page.getByLabel("Password",{exact:true}).fill(password);
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
}
async function finishPasswordRotation(page:Page,next:string){
  await expect(page.getByRole("heading",{name:"Set your new password"})).toBeVisible();
  await page.getByLabel("New password").fill(next);
  await page.getByRole("button",{name:"Change password"}).click();
  await expect(page.getByText("Password changed. Sign in using your new password.")).toBeVisible();
  await page.getByLabel("Password",{exact:true}).fill(next);
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
}
async function createUser(page:Page,id:string,name:string,role:"FOUNDER"|"EMPLOYEE"){
  await page.goto("/app/team/users");
  await page.getByRole("button",{name:"New account"}).click();
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Login ID",{exact:true}).fill(id);
  await page.getByLabel("Role",{exact:true}).selectOption(role);
  const initial=await page.getByLabel("Temporary password").inputValue();
  expect(initial.length).toBeGreaterThanOrEqual(12);
  await page.getByRole("button",{name:"Create account"}).click();
  await expect(page.getByText(name)).toBeVisible();
  return initial;
}

test("admin policy, founder operations, note persistence, Drive, and employee permissions",async({page})=>{
  test.setTimeout(420000);
  page.setDefaultTimeout(15000);
  await page.setViewportSize({width:1366,height:768});
  await login(page,"admin-e2e",INITIAL);
  await finishPasswordRotation(page,UPDATED);
  // Admin now signs in with credentials alone; no authenticator challenge remains.
  await expect(page.getByRole("heading",{name:"Enable two-factor security"})).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByTestId("amplifyworld-dashboard")).toBeVisible();
  for(const label of ["My notes","Global search","Leads CRM","Content calendar","Files & assets","Income, expenses & billing"])
    await expect(page.getByRole("navigation",{name:"Workspace navigation"}).getByRole("link",{name:label})).toHaveCount(0);
  await expect(page.getByRole("navigation",{name:"Workspace navigation"}).getByRole("link",{name:"Clients",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Pending tasks"})).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Past deadline"})).toHaveCount(0);
  await page.goto("/app/notes");
  await expect(page.getByText("This operational module is not available to administrator accounts.")).toBeVisible();
  await page.goto("/app/tasks");
  await expect(page.getByRole("heading",{name:"Tasks & recurring work"})).toBeVisible();
  await page.goto("/app/approvals");
  await expect(page.getByRole("heading",{name:"Approval workflows"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Approval policy configuration"})).toBeVisible();
  await page.getByRole("button",{name:"Save policy"}).click();
  await expect(page.getByText("Routing policy saved.")).toBeVisible();
  const founderInitial=await createUser(page,"ci-founder","CI Founder","FOUNDER");
  const employeeInitial=await createUser(page,"ci-employee","CI Employee","EMPLOYEE");
  await page.getByRole("button",{name:"Sign out"}).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page,"ci-founder",founderInitial);
  const founderPassword="CI-Founder-"+Date.now().toString(36)+"#2026";
  await finishPasswordRotation(page,founderPassword);
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByRole("heading",{name:"Enable two-factor security"})).toHaveCount(0);
  await expect(page.getByTestId("personal-task-dashboard")).toBeVisible();
  await page.goto("/app/notes");
  await page.getByRole("button",{name:"New note",exact:true}).click();
  await page.getByRole("textbox",{name:"Note title"}).fill("CI Notes Studio");
  const canvas=page.locator("canvas.aw-notes-canvas");
  await expect(canvas).toBeVisible();
  const box=await canvas.boundingBox();if(!box)throw Error("Canvas missing");
  await page.mouse.move(box.x+box.width*.2,box.y+box.height*.2);
  await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.35,{steps:7});await page.mouse.up();
  await expect(page.getByText("Saved",{exact:true})).toBeVisible({timeout:30000});
  await page.getByRole("button",{name:"Undo"}).click();
  await page.getByRole("button",{name:"Redo"}).click();
  await page.getByRole("button",{name:"Eraser",exact:true}).click();
  await page.getByRole("button",{name:"Pen",exact:true}).click();
  await page.getByRole("button",{name:"Zoom in"}).click();
  await expect(page.getByLabel("Zoom percentage")).toHaveText("125%");
  await page.getByRole("button",{name:"Add page"}).click();
  await expect(page.getByLabel("Page number")).toHaveText("2 / 2");
  await page.getByRole("button",{name:"Previous page"}).click();
  await page.getByRole("button",{name:"Typed Note",exact:true}).click();
  await page.getByRole("textbox",{name:"Typed notes"}).fill("## Design\nApproved typography and layout.");
  await page.getByRole("button",{name:"Handwritten Note"}).click();
  await expect(page.getByText("Saved",{exact:true})).toBeVisible({timeout:30000});
  await page.reload();
  await expect(page.getByRole("textbox",{name:"Note title"})).toHaveValue("CI Notes Studio");
  await expect(page.getByLabel("Page number")).toHaveText("1 / 2");
  await page.getByRole("button",{name:"Typed Note",exact:true}).click();
  await expect(page.getByRole("textbox",{name:"Typed notes"})).toHaveValue(/Approved typography/);
  await page.getByRole("button",{name:"Handwritten Note"}).click();
  await page.getByRole("button",{name:"Expand canvas"}).click();
  await expect(page.locator(".aw-studio-fullscreen")).toBeVisible();
  await page.getByRole("button",{name:"Exit full screen"}).click();
  page.once("dialog",dialog=>void dialog.accept("CI Notebook"));
  await page.getByRole("button",{name:"Create notebook"}).click();
  await expect(page.getByRole("button",{name:"CI Notebook",exact:true})).toBeVisible();
  await page.getByRole("combobox",{name:"Choose notebook"}).selectOption({label:"CI Notebook"});
  await page.getByRole("button",{name:"Star CI Notes Studio"}).click();
  await page.getByRole("button",{name:"Starred"}).click();
  await expect(page.getByRole("button",{name:"Unstar CI Notes Studio"})).toBeVisible();

  await page.goto("/app/assets");
  await expect(page.getByRole("heading",{name:"My Drive"})).toBeVisible();
  await page.getByRole("button",{name:"New",exact:true}).click();
  await page.getByRole("menuitem",{name:"New folder"}).click();
  await page.getByRole("textbox",{name:"New folder name"}).fill("CI Campaign Artwork");
  await page.getByRole("button",{name:"Create folder"}).click();
  await expect(page.getByRole("button",{name:"Open folder CI Campaign Artwork",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Open folder CI Campaign Artwork",exact:true}).click();
  await page.getByRole("button",{name:"Go back"}).click();
  await expect(page.getByRole("button",{name:"Open folder CI Campaign Artwork",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"More actions for folder CI Campaign Artwork"}).click();
  await page.getByRole("button",{name:"Rename CI Campaign Artwork"}).click();
  await page.getByRole("textbox",{name:"Rename folder"}).fill("CI Brand Designs");
  await page.getByRole("button",{name:"Save folder",exact:true}).click();
  await expect(page.getByRole("button",{name:"Open folder CI Brand Designs",exact:true})).toBeVisible();
  const zipped=page.waitForResponse(response=>response.url().endsWith("/download")&&response.status()===200);
  await page.getByRole("button",{name:"More actions for folder CI Brand Designs"}).click();
  await page.getByRole("button",{name:"Download CI Brand Designs as ZIP"}).click();
  expect((await zipped).headers()["content-type"]).toContain("application/zip");
  await page.getByRole("button",{name:"More actions for folder CI Brand Designs"}).click();
  await expect(page.getByRole("button",{name:"Delete empty folder CI Brand Designs"})).toHaveCount(0); // Founder cannot bypass assets.delete permissions.
  await page.goto("/app/leads");
  await expect(page.getByRole("table",{name:"Leads directory"})).toBeVisible();
  await page.getByRole("button",{name:"Add lead"}).click();
  const leadDialog=page.getByRole("dialog",{name:"Create a lead"});
  await expect(leadDialog).toBeVisible();
  await expect(leadDialog.getByLabel("Business name",{exact:true})).toBeVisible();
  const leadPosition=await leadDialog.boundingBox();
  expect(leadPosition).not.toBeNull();
  expect(leadPosition!.x).toBeGreaterThanOrEqual(0);
  expect(leadPosition!.x+leadPosition!.width).toBeLessThanOrEqual(1366);
  await page.keyboard.press("Escape");
  await expect(leadDialog).toHaveCount(0);
  await page.getByRole("button",{name:"Add lead"}).click();
  await expect(leadDialog).toBeVisible();
  await leadDialog.getByLabel("Business name",{exact:true}).fill("Founder CI Lead");
  await page.getByLabel("Phone",{exact:true}).fill("9876543210");
  await page.getByRole("button",{name:"Create lead"}).click();
  await expect(page.getByRole("heading",{name:"Lead: Founder CI Lead"})).toBeVisible();
  await expect(page.getByRole("dialog",{name:"Create a lead"})).toHaveCount(0);
  await page.goto("/app/clients");
  await expect(page.getByRole("table",{name:"Clients directory"})).toBeVisible();
  await page.getByRole("button",{name:"Add client"}).click();
  const clientDialog=page.getByRole("dialog",{name:"Add client"});
  await expect(clientDialog).toBeVisible();
  await expect(clientDialog.getByLabel("Business name",{exact:true})).toBeVisible();
  await clientDialog.getByLabel("Business name",{exact:true}).fill("CI Client Popup");
  await clientDialog.getByLabel("Business phone",{exact:true}).fill("9999991234");
  await clientDialog.getByRole("button",{name:"Create client"}).click();
  await expect(clientDialog).toHaveCount(0);
  await expect(page.getByText("CI Client Popup",{exact:true})).toBeVisible();
  // Client creation opens its detail drawer. Close that modal before using the page toolbar.
  await page.getByRole("dialog",{name:"Client details"}).getByRole("button",{name:"Close",exact:true}).click();
  await page.getByRole("button",{name:"Add client"}).click();
  await expect(page.getByRole("dialog",{name:"Add client"})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog",{name:"Add client"})).toHaveCount(0);
  await page.getByRole("button",{name:"Sign out"}).click();

  await login(page,"ci-employee",employeeInitial);
  const employeePassword="CI-Employee-"+Date.now().toString(36)+"#2026";
  await finishPasswordRotation(page,employeePassword);
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByTestId("personal-task-dashboard")).toBeVisible();
  await expect(page.getByRole("link",{name:"Team & accounts"})).toHaveCount(0);
  await expect(page.getByRole("link",{name:"Files & assets"})).toHaveCount(0);
  await page.goto("/app/finance");
  await expect(page.getByRole("heading",{name:"Income, expenses & billing"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Agency totals"})).toHaveCount(0);
  for(const width of [320,375,768,1024,1366]){
    await page.setViewportSize({width,height:812});await page.goto("/app/dashboard");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2)).toBe(false);
  }
});
test("unauthenticated dashboard access is denied",async({page})=>{
  await page.goto("/app/dashboard");await expect(page).toHaveURL(/\/login/);
});
