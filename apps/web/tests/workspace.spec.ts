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
  for(const label of ["My notes","Global search","Leads CRM","Content calendar","Files & assets"])
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
  // Reporting must fit the document viewport. Overflow belongs to inner tables only.
  for(const width of [1440,1024,768,390]){
    await page.setViewportSize({width,height:800});
    await page.goto("/app/reports");
    await expect(page.getByRole("heading",{name:"Performance reports"})).toBeVisible();
    const bounds=await page.evaluate(()=>({
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:document.documentElement.clientWidth,
    }));
    expect(bounds.documentWidth,"Reports should not overflow at "+width+"px")
      .toBeLessThanOrEqual(bounds.viewportWidth+1);
  }
  await page.setViewportSize({width:1366,height:768});
  await page.goto("/app/reports");
  const desktopZoom=await page.locator(".aw-workspace").evaluate(
    element=>Number.parseFloat(getComputedStyle(element).zoom)
  );
  expect(desktopZoom,"Desktop workspace must use 75% visual scaling").toBe(0.75);
  const pageBackground=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  expect(pageBackground,"Reports must never expose a white body beneath the scaled layout")
    .toBe("rgb(9, 7, 14)");
  const desktopBounds=await page.evaluate(()=>({
    doc:document.documentElement.scrollWidth,
    client:document.documentElement.clientWidth,
  }));
  expect(desktopBounds.doc,"Scaled workspace must not create document overflow")
    .toBeLessThanOrEqual(desktopBounds.client+1);
  await page.setViewportSize({width:768,height:800});
  await page.reload();
  const mobileZoom=await page.locator(".aw-workspace").evaluate(
    element=>Number.parseFloat(getComputedStyle(element).zoom)
  );
  expect(mobileZoom,"Mobile/tablet touch scaling remains unmodified").toBe(1);
  await page.setViewportSize({width:1366,height:768});
  const assigneeResponse=page.waitForResponse(response=>
    response.url().includes("/api/v1/finance/assignees") && response.request().method()==="GET");
  await page.goto("/app/finance");
  expect((await assigneeResponse).status(),"Finance gateway must forward assignee lookups").toBe(200);
  await expect(page.getByRole("heading",{name:"Income & expenses"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Add category"})).toBeVisible();
  await page.getByLabel("Category name",{exact:true}).fill("CI Admin Category");
  await page.getByRole("button",{name:"Add category"}).click();
  await expect(page.getByText("CI Admin Category",{exact:true}).last()).toBeVisible();
  await page.getByRole("button",{name:"Edit"}).last().click();
  await expect(page.getByRole("dialog",{name:"Edit finance category"})).toBeVisible();
  await page.getByLabel("Category name",{exact:true}).last().fill("CI Admin Category Updated");
  await page.getByRole("button",{name:"Save changes"}).click();
  await expect(page.getByText("CI Admin Category Updated",{exact:true}).last()).toBeVisible();
  await expect(page.getByRole("link",{name:"Invoices & payments"})).toHaveCount(0);
  await page.goto("/app/approvals");
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
  // The studio must reach the bottom of the visible desktop viewport at 75% zoom.
  const notesBottom=await page.locator(".aw-studio").evaluate(el=>el.getBoundingClientRect().bottom);
  const viewportHeight=await page.evaluate(()=>window.innerHeight);
  expect(Math.abs(notesBottom-viewportHeight),"Notes Studio must fill the desktop viewport")
    .toBeLessThanOrEqual(3);
  await expect(page.getByRole("button",{name:"Drawn note"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Typed note"})).toBeVisible();
  await page.getByRole("button",{name:/Drawn note/}).click();
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
  await page.getByRole("button",{name:"Toggle tool settings"}).click();
  await expect(page.getByRole("region",{name:"Note pages"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Open note page 1"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Open note page 2"})).toBeVisible();
  await page.getByRole("button",{name:"Open note page 1"}).click();
  await expect(page.getByLabel("Page number")).toHaveText("1 / 2");
  await page.getByRole("button",{name:"Open note page 2"}).click();
  await expect(page.getByLabel("Page number")).toHaveText("2 / 2");
  await page.getByRole("button",{name:"Previous page"}).click();
  await page.getByRole("button",{name:"Typed Note",exact:true}).click();
  await page.getByRole("textbox",{name:"Typed notes"}).fill("## Design\nApproved typography and layout.");
  await page.getByRole("button",{name:"Handwritten Note"}).click();
  await expect(page.getByText("Saved",{exact:true})).toBeVisible({timeout:30000});
  await page.reload();
  await expect(page.getByRole("button",{name:/Drawn note/})).toBeVisible();
  await page.locator(".aw-studio-note-open").filter({hasText:"CI Notes Studio"}).click();
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

  // Trash is recoverable; permanent deletion is routed through the authenticated web gateway.
  page.once("dialog",dialog=>void dialog.accept());
  await page.getByRole("button",{name:"Move CI Notes Studio to Trash"}).click();
  await page.getByRole("button",{name:"Trash",exact:true}).click();
  await expect(page.getByRole("button",{name:"Permanently delete CI Notes Studio"})).toBeVisible();
  page.once("dialog",dialog=>void dialog.accept());
  await page.getByRole("button",{name:"Permanently delete CI Notes Studio"}).click();
  await expect(page.getByRole("button",{name:"Permanently delete CI Notes Studio"})).toHaveCount(0);

  await page.goto("/app/assets");
  await expect(page.getByRole("heading",{name:"My Drive"})).toBeVisible();
  await page.getByRole("button",{name:"New",exact:true}).click();
  await page.getByRole("menuitem",{name:"New folder"}).click();
  await page.getByRole("textbox",{name:"New folder name"}).fill("CI Campaign Artwork");
  await page.getByRole("button",{name:"Create folder"}).click();
  await expect(page.getByRole("button",{name:"Open folder CI Campaign Artwork",exact:true})).toBeVisible();

  await page.getByRole("button",{name:"List view"}).click();
  await expect(page.locator(".aw-drive-folders-list")).toBeVisible();
  await page.getByRole("button",{name:"Grid view"}).click();
  await expect(page.locator(".aw-drive-folders-grid")).toBeVisible();
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
  await expect(leadDialog.getByLabel("Website URL",{exact:true})).not.toHaveAttribute("required","");
  await expect(leadDialog.getByLabel("Instagram URL",{exact:true})).not.toHaveAttribute("required","");
  await leadDialog.getByLabel("Business name",{exact:true}).fill("Founder CI Lead");
  await leadDialog.getByLabel("Contact name",{exact:true}).fill("CI Contact");
  await leadDialog.getByLabel("Phone",{exact:true}).fill("9876543210");
  await leadDialog.getByLabel("Business type",{exact:true}).fill("Retail");
  await leadDialog.getByLabel("City / location",{exact:true}).fill("Prayagraj");
  await leadDialog.getByLabel("Source",{exact:true}).fill("Website");
  await leadDialog.getByLabel("First note",{exact:true}).fill("CI initial enquiry");
  await page.getByRole("button",{name:"Create lead"}).click();
  await expect(page.getByRole("heading",{name:"Lead: Founder CI Lead"})).toBeVisible();
  await expect(page.getByRole("dialog",{name:"Create a lead"})).toHaveCount(0);
  await page.goto("/app/clients");
  await expect(page.getByRole("table",{name:"Clients directory"})).toBeVisible();
  await page.getByRole("button",{name:"Add client"}).click();
  const clientDialog=page.getByRole("dialog",{name:"Add client"});
  await expect(clientDialog).toBeVisible();
  await expect(clientDialog.getByLabel("Business name",{exact:true})).toBeVisible();
  await expect(clientDialog.getByLabel("Website URL",{exact:true})).not.toHaveAttribute("required","");
  await expect(clientDialog.getByLabel("Instagram URL",{exact:true})).not.toHaveAttribute("required","");
  await clientDialog.getByLabel("Business name",{exact:true}).fill("CI Client Popup");
  await clientDialog.getByLabel("Business phone",{exact:true}).fill("9999991234");
  await clientDialog.getByLabel("Business type",{exact:true}).fill("Advertising");
  await clientDialog.getByLabel("Business email",{exact:true}).fill("ci-contact@example.com");
  await clientDialog.getByLabel("Address / location",{exact:true}).fill("Prayagraj");
  await clientDialog.getByLabel("Facebook URL",{exact:true}).fill("https://facebook.com/ciclient");
  await clientDialog.getByLabel("Internal notes",{exact:true}).fill("Test client details");
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
  await expect(page.getByRole("heading",{name:"Income & expenses"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Agency totals"})).toHaveCount(0);
  for(const width of [320,375,390,768,1024,1366]){
    await page.setViewportSize({width,height:812});
    await page.goto("/app/dashboard");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2)).toBe(false);
    if(width<=390){
      const nav=await page.locator(".aw-work-topbar").evaluate(el=>{
        const box=el.getBoundingClientRect();
        const first=el.firstElementChild!.getBoundingClientRect();
        const actions=el.querySelector(".aw-work-topactions")!.getBoundingClientRect();
        return {contained:first.right<=actions.left+1,right:actions.right<=box.right+1};
      });
      expect(nav.contained,"Mobile navigation title must not collide with icons").toBe(true);
      expect(nav.right,"Mobile navigation actions must stay on-screen").toBe(true);
      await page.goto("/app/finance");
      const grid=await page.locator(".aw-finance-summary-grid").evaluate(el=>{
        const cards=[...el.children].map(x=>x.getBoundingClientRect());
        return {columns:getComputedStyle(el).gridTemplateColumns.split(" ").length,
          compact:cards.slice(0,4).every(x=>x.height<=125)};
      });
      expect(grid.columns,"Finance summary should use two columns on phones").toBe(2);
      expect(grid.compact,"Finance cards should stay compact on phones").toBe(true);
      await page.goto("/app/notes");
      const studio=await page.locator(".aw-studio").evaluate(el=>el.getBoundingClientRect());
      expect(studio.right,"Mobile notes must stay inside viewport")
        .toBeLessThanOrEqual(width+1);
    }
  }
});
test("unauthenticated dashboard access is denied",async({page})=>{
  await page.goto("/app/dashboard");await expect(page).toHaveURL(/\/login/);
});
