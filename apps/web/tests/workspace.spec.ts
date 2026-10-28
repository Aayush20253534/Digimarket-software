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
  // Dashboard cards load asynchronously: Playwright's computed-style
  // assertion waits for the actual component before measuring its corners.
  await expect(page.getByRole("navigation",{name:"Workspace navigation"})
    .locator(".aw-nav-item").first()).toHaveCSS("border-radius","4px");
  await expect(page.locator(".aw-stat").first()).toHaveCSS("border-radius","4px");
  await expect(page.locator(".aw-panel").first()).toHaveCSS("border-radius","4px");
  await expect(page.locator(".aw-work-profile .aw-work-avatar").first()).toHaveCSS("border-radius","50%");
  for(const label of ["Global search","Content calendar","Files & assets"])
    await expect(page.getByRole("navigation",{name:"Workspace navigation"}).getByRole("link",{name:label})).toHaveCount(0);
  await expect(page.getByRole("navigation",{name:"Workspace navigation"}).getByRole("link",{name:"Leads CRM"})).toBeVisible();
  await expect(page.getByRole("navigation",{name:"Workspace navigation"}).getByRole("link",{name:"Follow Ups"})).toBeVisible();
  await expect(page.getByRole("navigation",{name:"Workspace navigation"}).getByRole("link",{name:"Clients",exact:true})).toBeVisible();
  await page.goto("/app/leads");
  await expect(page.getByRole("heading",{name:"Leads CRM"})).toBeVisible();
  await expect(page.locator(".aw-module-pill").first()).toHaveCSS("border-radius","3px");
  await expect(page.locator('[class*="rounded-2xl"]').first()).toHaveCSS("border-radius","4px");
  await expect(page.getByRole("button",{name:"Add lead"})).toHaveCount(0);
  const statusMetrics=page.getByRole("region",{name:"CRM pipeline summary"});
  await expect(statusMetrics).toBeVisible();
  await expect(statusMetrics.getByText("YET TO CALL",{exact:true})).toBeVisible();
  await expect(statusMetrics.getByText("MEETING PROCESS",{exact:true})).toBeVisible();
  await expect(statusMetrics.getByText("FOLLOW UP",{exact:true})).toBeVisible();
  await expect(statusMetrics.getByText("Conversion rate",{exact:true})).toHaveCount(0);
  await expect(statusMetrics.getByText("REJECTED",{exact:true})).toBeVisible();
  await expect(statusMetrics.getByText("Pending",{exact:true})).toHaveCount(0);
  const leadsRegister=page.getByRole("table",{name:"Leads directory"});
  await expect(leadsRegister).toBeVisible();
  await expect(leadsRegister).toHaveAttribute("aria-busy","false");
  await expect(leadsRegister.getByRole("columnheader",{name:"Date added"})).toBeVisible();
  await expect(leadsRegister.getByRole("columnheader",{name:"Call"})).toBeVisible();
  await expect(leadsRegister.getByRole("columnheader",{name:"Location"})).toBeVisible();
  await expect(leadsRegister.getByRole("columnheader",{name:"Details"})).toHaveCount(0);
  await expect(page.getByText("Potential duplicates",{exact:true})).toHaveCount(0);
  await expect(page.getByText("CSV import",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Load suspected duplicates"})).toHaveCount(0);
  await expect(page.locator("#lead-import-file")).toHaveCount(0);
  const leadTableViewport=page.locator('[data-aw-module="leads"] .aw-register-scroll');
  await expect(leadTableViewport).toHaveCSS("max-height","none");
  expect(await leadTableViewport.evaluate(el=>el.scrollHeight<=el.clientHeight+1),
    "All ten rows should fit without an internal vertical scrollbar").toBe(true);
  expect(await leadsRegister.locator("tbody tr").count()).toBeLessThanOrEqual(10);
  await expect(page.locator(".aw-register-page")).toHaveText(/^Page 1 of \d+ · Leads (?:0 of 0|1–\d+ of \d+)$/);
  await expect(page.getByRole("heading",{name:"Pending tasks"})).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Past deadline"})).toHaveCount(0);
  await page.goto("/app/notes");
  await expect(page.getByRole("heading",{name:"Start a new note"})).toBeVisible();
  await page.goto("/app/tasks");
  await expect(page.getByRole("heading",{name:"Tasks & recurring work"})).toBeVisible();
  await page.goto("/app/approvals");
  await expect(page.getByRole("heading",{name:"Approval workflows"})).toBeVisible();
  // Reporting must fit the document viewport. Overflow belongs to inner tables only.
  for(const width of [1440,1024,768,390]){
    await page.setViewportSize({width,height:800});
    await page.goto("/app/reports");
    await expect(page.getByRole("heading",{name:"Performance reports"})).toBeVisible();
    await expect(page.getByRole("article",{name:"Lead conversion rate"})).toBeVisible();
    const bounds=await page.evaluate(()=>({
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:document.documentElement.clientWidth,
    }));
    expect(bounds.documentWidth,"Reports should not overflow at "+width+"px")
      .toBeLessThanOrEqual(bounds.viewportWidth+1);
  }
  await page.setViewportSize({width:1366,height:768});
  await page.goto("/app/reports");
  // Both cash ledger totals open their own full breakdown, preserving the
  // selected report period in the URL and the drill-down date controls.
  const incomeLink=page.getByRole("link",{name:"View Income breakdown"});
  const expenseLink=page.getByRole("link",{name:"View Expenses breakdown"});
  await expect(incomeLink).toBeVisible();
  await expect(expenseLink).toBeVisible();
  const reportFrom=await page.getByRole("region",{name:"Reporting period"}).getByLabel("From").inputValue();
  const reportTo=await page.getByRole("region",{name:"Reporting period"}).getByLabel("Through").inputValue();
  // Guard the Leads breakdown gateway route and its parameter forwarding.
  const leadsBreakdownLink=page.getByRole("link",{name:"Open complete Leads analytics breakdown"});
  await expect(leadsBreakdownLink).toBeVisible();
  const leadsBreakdownResponse=page.waitForResponse(response=>
    response.url().includes("/api/v1/reports/leads?")&&response.request().method()==="GET");
  await leadsBreakdownLink.click();
  const leadResult=await leadsBreakdownResponse;
  expect(leadResult.status(),"Leads analytics gateway must forward authorized GET").toBe(200);
  const leadUrl=new URL(leadResult.url());
  expect(leadUrl.searchParams.get("from")).toBe(reportFrom);
  expect(leadUrl.searchParams.get("to")).toBe(reportTo);
  await expect(page).toHaveURL(new RegExp("/app/reports/leads[?]"));
  await expect(page.getByRole("heading",{name:"Leads Breakdown"})).toBeVisible();
  await expect(page.getByText("Client converted",{exact:true}).first()).toBeVisible();
  await expect(page.getByText("Approved",{exact:true}).first()).toBeVisible();
  await expect(page.getByTestId("lead-analytics-breakdown")).toBeVisible();
  const csvResponse=page.waitForResponse(response=>
    response.url().includes("/api/v1/reports/leads/export?")&&response.request().method()==="GET");
  await page.getByRole("button",{name:"Export filtered CSV"}).click();
  expect((await csvResponse).status(),"Lead CSV gateway must forward authorized GET").toBe(200);
  await page.getByRole("link",{name:"Back to Reports"}).click();
  await expect(page.getByRole("heading",{name:"Performance reports"})).toBeVisible();
  const incomeResponse=page.waitForResponse(response=>
    response.url().includes("/api/v1/finance/report-breakdown?")&&
    response.request().method()==="GET");
  await incomeLink.click();
  const resolvedIncome=await incomeResponse;
  expect(resolvedIncome.status(),"Income breakdown API must accept inherited dates").toBe(200);
  await expect(page).toHaveURL(/\/app\/reports\/income\?/);
  await expect(page.getByRole("heading",{name:"Income Breakdown"})).toBeVisible();
  await expect(page.getByLabel("Breakdown from date")).toHaveValue(reportFrom);
  await expect(page.getByLabel("Breakdown to date")).toHaveValue(reportTo);
  await expect(page.getByRole("region",{name:"Finance summary"})).toBeVisible();
  await expect(page.getByRole("region",{name:"Monthly financial trend"})).toBeVisible();
  await expect(page.getByRole("region",{name:"Category financial breakdown"})).toBeVisible();
  await expect(page.getByRole("region",{name:"Person-wise financial breakdown"})).toBeVisible();
  await page.getByRole("button",{name:/Open day-wise breakdown for/}).first().click();
  await expect(page.getByRole("region",{name:"Day-wise financial breakdown"})).toBeVisible();
  const dailyResponse=page.waitForResponse(res=>res.url().includes("/api/v1/finance/report-breakdown?")&&
    res.url().includes("day=")&&res.status()===200);
  await page.getByRole("button",{name:/Filter ledger to/}).first().click();
  await dailyResponse;
  await expect(page.getByRole("button",{name:"Clear ledger filters"})).toBeVisible();
  await page.getByRole("button",{name:"Clear ledger filters"}).click();
  await expect(page.getByRole("table",{name:"Financial breakdown transactions"})).toBeVisible();
  const financeGateway=page.waitForResponse(response=>
    response.url().includes("/api/v1/finance/report-breakdown/export")&&response.status()===200);
  await page.getByRole("button",{name:"Export filtered CSV"}).click();
  await financeGateway;
  await page.getByRole("link",{name:"Back to Reports"}).click();
  await expect(page.getByRole("heading",{name:"Performance reports"})).toBeVisible();
  await expect(page.getByRole("link",{name:"View Expenses breakdown"})).toBeVisible();
  const expenseResponse=page.waitForResponse(response=>
    response.url().includes("/api/v1/finance/report-breakdown?")&&
    response.request().method()==="GET");
  await page.getByRole("link",{name:"View Expenses breakdown"}).click();
  const resolvedExpense=await expenseResponse;
  expect(resolvedExpense.status(),"Expense breakdown API must accept inherited dates").toBe(200);
  await expect(page).toHaveURL(/\/app\/reports\/expenses\?/);
  await expect(page.getByRole("heading",{name:"Expense Breakdown"})).toBeVisible();
  await expect(page.getByLabel("Breakdown from date")).toHaveValue(reportFrom);
  await expect(page.getByLabel("Breakdown to date")).toHaveValue(reportTo);
  await expect(page.getByRole("region",{name:"Person-wise financial breakdown"})).toBeVisible();
  await page.getByRole("button",{name:/Open day-wise breakdown for/}).first().click();
  await expect(page.getByRole("region",{name:"Day-wise financial breakdown"})).toBeVisible();
  await page.getByLabel("Search financial transactions").fill("nonexistent CI phrase");
  await expect(page.getByText("0 matching")).toBeVisible();
  await page.getByRole("link",{name:"Back to Reports"}).click();
  await expect(page.getByRole("heading",{name:"Performance reports"})).toBeVisible();
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
  await page.getByLabel("Type",{exact:true}).selectOption("INCOME");
  await page.getByLabel("Category name",{exact:true}).fill("CI Revenue Category");
  await page.getByRole("button",{name:"Add category"}).click();
  await expect(page.getByText("CI Revenue Category",{exact:true}).last()).toBeVisible();
  await expect(page.getByRole("link",{name:"Invoices & payments"})).toHaveCount(0);
  await page.goto("/app/approvals");
  await expect(page.getByRole("heading",{name:"Approval policy configuration"})).toBeVisible();
  await page.getByRole("button",{name:"Save policy"}).click();
  await expect(page.getByText("Routing policy saved.")).toBeVisible();
  const founderInitial=await createUser(page,"ci-founder","CI Founder","FOUNDER");
  const employeeInitial=await createUser(page,"ci-employee","CI Employee","EMPLOYEE");

  // An administrator can revise task fields and assignments in one save.
  await page.goto("/app/tasks");
  await expect(page.getByRole("heading",{name:"Tasks & recurring work"})).toBeVisible();
  const teamTasksRequest=page.waitForRequest(req=>{
    const url=new URL(req.url());
    return url.pathname==="/api/v1/tasks"&&url.searchParams.get("view")==="team";
  });
  await page.getByLabel("Task view").selectOption("team");
  expect(new URL((await teamTasksRequest).url()).searchParams.get("limit")).toBe("5");
  await expect.poll(async()=>page.getByTestId("task-register-list").locator(":scope > button").count()).toBeLessThanOrEqual(5);
  await page.getByLabel("Task title",{exact:true}).fill("CI Original Task");
  await page.getByLabel("Task expiry date and time").fill(
    await page.evaluate(()=>{const d=new Date(Date.now()+72*60*60*1000);
      return new Date(d.getTime()-d.getTimezoneOffset()*60*1000).toISOString().slice(0,16);}));
  await page.getByRole("button",{name:"Assign employees"}).click();
  const activeTaskAssignee=page.locator(".aw-team-options-list input[type=checkbox]").first();
  await expect(activeTaskAssignee).toBeVisible();
  await activeTaskAssignee.check();
  await page.getByRole("button",{name:/Done · 1 selected/}).click();
  await page.getByRole("button",{name:"Create task"}).click();
  await expect(page.getByRole("button",{name:"Edit task"})).toBeVisible();
  await page.getByRole("button",{name:"Edit task"}).click();
  const taskEdit=page.getByRole("form",{name:"Edit task details"});
  await expect(taskEdit).toBeVisible();
  await taskEdit.getByLabel("Edit task title").fill("CI Updated Task");
  await taskEdit.getByLabel("Edit task description").fill("Revised scope and deadline");
  await taskEdit.getByLabel("Edit task priority").selectOption("URGENT");
  await taskEdit.getByLabel("Edit task expiry date and time").fill(
    await page.evaluate(()=>{const d=new Date(Date.now()+96*60*60*1000);
      return new Date(d.getTime()-d.getTimezoneOffset()*60*1000).toISOString().slice(0,16);}));
  await taskEdit.getByRole("button",{name:"Edit task assignees"}).click();
  await expect(taskEdit.locator(".aw-team-options-list input[type=checkbox]:checked")).toHaveCount(1);
  await taskEdit.getByRole("button",{name:/Done · 1 selected/}).click();
  await taskEdit.getByRole("button",{name:"Save task changes"}).click();
  await expect(page.getByText("Task edited successfully. Assigned team members have been updated.")).toBeVisible();
  await expect(page.getByText(/^Assigned: /)).toBeVisible();
  await expect(page.getByRole("button",{name:"CI Updated Task"})).toBeVisible();
  // Reopening must retrieve the persisted task fields, not unsaved form state.
  await page.getByRole("button",{name:"CI Updated Task"}).click();
  await page.getByRole("button",{name:"Edit task"}).click();
  await expect(taskEdit.getByLabel("Edit task title")).toHaveValue("CI Updated Task");
  await expect(taskEdit.getByLabel("Edit task description")).toHaveValue("Revised scope and deadline");
  await expect(taskEdit.getByLabel("Edit task priority")).toHaveValue("URGENT");
  await taskEdit.getByRole("button",{name:"Cancel editing"}).click();
  // Completed items are preserved in the dedicated history and disappear if
  // an admin reopens them, rather than being permanently archived.
  await page.getByLabel("Admin task status").selectOption("DONE");
  await expect(page.getByText("Task status updated.")).toBeVisible();
  await page.goto("/app/task-history");
  await expect(page.getByTestId("task-history-page")).toBeVisible();
  await expect(page.getByRole("navigation",{name:"Workspace navigation"})
    .getByRole("link",{name:"Task history"})).toBeVisible();
  await page.getByLabel("Task history scope").selectOption("team");
  await expect(page.getByRole("list",{name:"Completed task records"}).getByText("CI Updated Task")).toBeVisible();
  await expect(page.getByText(/Completed:/)).toBeVisible();
  await page.getByRole("link",{name:"Open completed task CI Updated Task"}).click();
  await expect(page.getByLabel("Admin task status")).toHaveValue("DONE");
  await page.getByLabel("Admin task status").selectOption("IN_PROGRESS");
  await expect(page.getByText("Task reopened in In Process.")).toBeVisible();
  await page.goto("/app/task-history");
  await page.getByLabel("Task history scope").selectOption("team");
  await expect(page.getByRole("list",{name:"Completed task records"}).getByText("CI Updated Task")).toHaveCount(0);
  await page.getByRole("button",{name:"Sign out"}).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page,"ci-founder",founderInitial);
  const founderPassword="CI-Founder-"+Date.now().toString(36)+"#2026";
  await finishPasswordRotation(page,founderPassword);
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByRole("heading",{name:"Enable two-factor security"})).toHaveCount(0);
  await expect(page.getByTestId("personal-task-dashboard")).toBeVisible();
  // Finance is a top-level sidebar section immediately below Workspace.
  const founderNav=page.getByRole("navigation",{name:"Workspace navigation"});
  await expect(founderNav.getByRole("link",{name:"Income & expenses"})).toBeVisible();
  const founderSections=await founderNav.locator(".aw-nav-group").allTextContents();
  expect(founderSections.indexOf("Finance"),"Finance should follow Workspace in the sidebar")
    .toBe(founderSections.indexOf("Workspace")+1);
  await expect(page.getByTestId("personal-pending")).toHaveCSS("background-color","rgb(32, 22, 47)");
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
  await expect(page.getByRole("complementary",{name:"Tool inspector"})).toBeVisible();
  await expect(page.getByRole("region",{name:"Note pages"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Open note page 1"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Open note page 2"})).toBeVisible();
  await page.getByRole("button",{name:"Open note page 1"}).click();
  await expect(page.getByLabel("Page number")).toHaveText("1 / 2");
  await page.getByRole("button",{name:"Open note page 2"}).click();
  await expect(page.getByLabel("Page number")).toHaveText("2 / 2");
  await page.getByRole("button",{name:"Previous page"}).click();
  await expect(page.getByRole("button",{name:"Typed Note",exact:true})).toHaveCount(0);
  await expect(page.getByText("Handwritten Note",{exact:true})).toBeVisible();
  await expect(page.getByText("Saved",{exact:true})).toBeVisible({timeout:30000});
  await page.reload();
  await expect(page.getByRole("button",{name:/Drawn note/})).toBeVisible();
  await page.locator(".aw-studio-note-open").filter({hasText:"CI Notes Studio"}).click();
  await expect(page.getByRole("textbox",{name:"Note title"})).toHaveValue("CI Notes Studio");
  await expect(page.getByLabel("Page number")).toHaveText("1 / 2");
  await expect(page.getByRole("button",{name:"Typed Note",exact:true})).toHaveCount(0);
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
  // Wait for the DELETE and All Notes refresh before requesting the Trash collection.
  await expect(page.getByRole("button",{name:"Move CI Notes Studio to Trash"})).toHaveCount(0,{timeout:30000});
  await page.getByRole("button",{name:"Trash",exact:true}).click();
  await expect(page.getByRole("button",{name:"Permanently delete CI Notes Studio"})).toBeVisible();
  page.once("dialog",dialog=>void dialog.accept());
  await page.getByRole("button",{name:"Permanently delete CI Notes Studio"}).click();
  await expect(page.getByRole("button",{name:"Permanently delete CI Notes Studio"})).toHaveCount(0);

  await page.goto("/app/assets");
  await expect(page.getByRole("heading",{name:"My Drive"})).toBeVisible();
  // Regression: long filenames and upload progress must not stretch the modal.
  await page.getByRole("button",{name:"New",exact:true}).click();
  await page.getByRole("menuitem",{name:"Upload files"}).click();
  const uploadDialog=page.getByRole("dialog",{name:"Upload files"});
  await uploadDialog.locator('input[type="file"]').setInputFiles({
    name:"AmplifyWorld_Tothepoint_Astrology_One_Month_Agreement_".repeat(3)+"Draft.pdf",
    mimeType:"application/pdf",
    buffer:Buffer.from("%PDF-1.4\\n")
  });
  await expect(uploadDialog.getByText("1 file(s) queued.",{exact:false})).toBeVisible();
  await uploadDialog.locator(".aw-drive-modal-form").evaluate(form=>{
    const progress=document.createElement("p");
    progress.setAttribute("role","status");
    progress.textContent="Verifying 1 of 1: "+"AmplifyWorld_Long_Contract_".repeat(20)+"Draft.pdf";
    form.insertBefore(progress,form.lastElementChild);
  });
  for(const width of [1366,375]){
    await page.setViewportSize({width,height:768});
    const bounds=await uploadDialog.evaluate(dialog=>{
      const modal=dialog.querySelector(".aw-drive-modal")!;
      const picker=dialog.querySelector('input[type="file"]')!;
      const progress=dialog.querySelector('[role="status"]')!;
      const m=modal.getBoundingClientRect(), f=picker.getBoundingClientRect();
      return {
        modalInsideViewport:m.left>=-1&&m.right<=window.innerWidth+1,
        pickerInsideModal:f.left>=m.left&&f.right<=m.right+1,
        progressContained:progress.scrollWidth<=progress.clientWidth+1,
        formContained:modal.scrollWidth<=modal.clientWidth+1
      };
    });
    expect(bounds,"Upload dialog layout at "+width+"px").toEqual({
      modalInsideViewport:true,pickerInsideModal:true,
      progressContained:true,formContained:true
    });
    await expect(uploadDialog.getByRole("button",{name:"Upload and verify"})).toBeVisible();
  }
  await uploadDialog.getByRole("button",{name:"Cancel"}).click();
  await page.setViewportSize({width:1366,height:768});
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
  await expect(page.locator(".aw-drive-crumb")).toHaveCount(1);
  await expect(page.getByRole("button",{name:"Open folder CI Campaign Artwork",exact:true})).toHaveCount(0);
  // Direct links and refresh retain a single valid breadcrumb.
  await page.reload();
  await expect(page.locator(".aw-drive-crumb")).toHaveCount(1);
  const savedTrail=await page.evaluate(()=>JSON.parse(new URLSearchParams(window.location.search).get("folders")??"[]"));
  expect(savedTrail).toHaveLength(1);
  // Old builds could save repeated IDs into the URL; repair them on load.
  await page.goto("/app/assets?folders="+encodeURIComponent(JSON.stringify([...savedTrail,...savedTrail])));
  await expect(page.locator(".aw-drive-crumb")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Open folder CI Campaign Artwork",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Open folder CI Campaign Artwork",exact:true}).click();
  await expect(page.locator(".aw-drive-crumb")).toHaveCount(1);
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
  await expect(page.getByRole("table",{name:"Leads directory"})).toHaveAttribute("aria-busy","false");
  // Saved CRM view choices survive both a browser reload and a manual Refresh.
  await page.getByLabel("Filter by stage").selectOption("FOLLOW_UP");
  await page.getByLabel("Filter by lead source").selectOption("META_LEADS");
  await page.getByLabel("Search leads").fill("Persist this CRM search");
  await page.getByLabel("Sort leads on this page").selectOption("businessName");
  await page.getByRole("button",{name:"Reverse lead sort"}).click();
  await expect.poll(()=>page.evaluate(()=>{
    const keys=Object.keys(localStorage).filter(value=>value.startsWith("amplifyworld:leads:preferences:"));
    return keys.some(key=>{
      const value=JSON.parse(localStorage.getItem(key)??"{}");
      return value.stage==="FOLLOW_UP"&&value.sourceFilter==="META_LEADS"&&
        value.search==="Persist this CRM search"&&value.sortBy==="businessName"&&value.descending===true;
    });
  })).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Filter by stage")).toHaveValue("FOLLOW_UP");
  await expect(page.getByLabel("Filter by lead source")).toHaveValue("META_LEADS");
  await expect(page.getByLabel("Search leads")).toHaveValue("Persist this CRM search");
  await expect(page.getByLabel("Sort leads on this page")).toHaveValue("businessName");
  await expect(page.getByRole("button",{name:"Reverse lead sort"})).toContainText("Descending");
  await page.getByRole("button",{name:"Refresh",exact:true}).click();
  await expect(page.getByLabel("Filter by stage")).toHaveValue("FOLLOW_UP");
  await expect(page.getByRole("button",{name:"Reverse lead sort"})).toContainText("Descending");
  // Only manual edits change these preferences.
  await page.getByLabel("Filter by stage").selectOption("");
  await page.getByLabel("Filter by lead source").selectOption("");
  await page.getByLabel("Search leads").fill("");
  await page.getByLabel("Sort leads on this page").selectOption("createdAt");
  await page.getByRole("button",{name:"Reverse lead sort"}).click();
  await expect(page.getByRole("table",{name:"Leads directory"})).toHaveAttribute("aria-busy","false");
  await expect(page.getByText("Potential duplicates",{exact:true})).toHaveCount(0);
  await expect(page.getByText("CSV import",{exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Add lead"}).click();
  const leadDialog=page.getByRole("dialog",{name:"Add lead"});
  await expect(leadDialog).toBeVisible();
  await expect(leadDialog.getByLabel("Phone number")).toBeVisible();
  await expect(leadDialog.getByLabel("Lead source")).toHaveValue("COLD_CALL");
  await expect(leadDialog.getByRole("option",{name:"Referral"})).toHaveCount(1);
  await expect(leadDialog.getByLabel("Business name")).toHaveCount(0);
  const leadPosition=await leadDialog.boundingBox();
  expect(leadPosition).not.toBeNull();
  expect(leadPosition!.x).toBeGreaterThanOrEqual(0);
  expect(leadPosition!.x+leadPosition!.width).toBeLessThanOrEqual(1366);
  await page.keyboard.press("Escape");
  await expect(leadDialog).toHaveCount(0);
  await page.getByRole("button",{name:"Add lead"}).click();
  await leadDialog.getByLabel("Phone number").fill("9876543210");
  await leadDialog.getByLabel("Lead source").selectOption("META_LEADS");
  await leadDialog.getByRole("button",{name:"Add to PENDING"}).click();
  await expect(page.getByRole("dialog",{name:"Add lead"})).toHaveCount(0);
  await expect(page.getByRole("heading",{name:/Lead: Lead/})).toBeVisible();
  await expect(page.getByText(/Source: Meta Leads/)).toBeVisible();
  const freshLeadRow=page.getByRole("table",{name:"Leads directory"}).locator("tbody tr")
    .filter({has:page.locator(".aw-lead-action")});
  await expect(freshLeadRow).toHaveCount(1);
  await expect(page.getByRole("table",{name:"Leads directory"}).getByRole("link",{name:"Call 9876543210"})).toHaveAttribute("href","tel:9876543210");
  await expect(freshLeadRow.getByRole("button",{name:"Open"})).toHaveCount(0);
  const dateAdded=freshLeadRow.locator("time");
  await expect(dateAdded).toHaveAttribute("dateTime",/^20\d{2}-/);
  expect(Number.isNaN(Date.parse(await dateAdded.getAttribute("dateTime")??""))).toBe(false);
  expect(await page.getByRole("table",{name:"Leads directory"}).locator("tbody tr").count()).toBeLessThanOrEqual(10);
  const visibleLeadTable=page.locator('[data-aw-module="leads"] .aw-register-scroll');
  expect(await visibleLeadTable.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
  // Mobile row selection should reveal the contact name in the lower detail editor.
  await page.setViewportSize({width:390,height:800});
  await freshLeadRow.click();
  await expect.poll(()=>page.locator("#edit-contactName").evaluate(input=>{
    const rect=input.getBoundingClientRect();
    return rect.top>=0&&rect.top<window.innerHeight-20;
  })).toBe(true);
  // Do not automatically focus the input: the on-screen keyboard must remain closed.
  await expect(page.locator("#edit-contactName")).not.toBeFocused();
  await page.setViewportSize({width:1366,height:768});
  await page.getByLabel("Lead status").selectOption("YET_TO_CALL");
  await page.getByRole("button",{name:"Save details and stage"}).click();
  const yetToCallBadge=page.getByRole("table",{name:"Leads directory"})
    .locator("tbody tr").filter({has:page.locator(".aw-lead-action")}).locator(".aw-status-yet-to-call");
  await expect(yetToCallBadge).toHaveText("YET TO CALL");
  await expect(yetToCallBadge).toHaveCSS("background-color","rgb(0, 0, 0)");
  await expect(yetToCallBadge).toHaveCSS("color","rgb(255, 255, 255)");
  await page.getByLabel("Lead status").selectOption("FOLLOW_UP");
  await expect(page.getByLabel("Follow-up date")).toBeVisible();
  const agencyDay=(offset:number)=>new Intl.DateTimeFormat("en-CA",{
    timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit",
  }).format(new Date(Date.now()+offset*86400000));
  const dueToday=agencyDay(0),dueTomorrow=agencyDay(1);
  // A follow-up cannot be saved without a date.
  await page.getByRole("button",{name:"Save details and stage"}).click();
  await expect(page.getByLabel("Follow-up date")).toBeVisible();
  await page.getByLabel("Follow-up date").fill(dueTomorrow);
  await page.getByRole("button",{name:"Save details and stage"}).click();
  const followUpBadge=page.getByRole("table",{name:"Leads directory"})
    .locator("tbody tr").filter({has:page.locator(".aw-lead-action")}).locator(".aw-status-badge");
  await expect(followUpBadge).toHaveText("FOLLOW UP");
  await expect(followUpBadge).toHaveCSS("background-color","rgb(91, 245, 39)");
  await expect(followUpBadge).toHaveCSS("color","rgb(0, 0, 0)");
  // The dedicated sidebar register always lists scheduled leads by follow-up date.
  const scheduledResponse=page.waitForResponse(res=>res.url().includes("/api/v1/leads/follow-ups?"));
  await page.getByRole("navigation",{name:"Workspace navigation"}).getByRole("link",{name:"Follow Ups"}).click();
  expect((await scheduledResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/app\/follow-ups$/);
  await expect(page.getByRole("heading",{name:"Follow Ups"})).toBeVisible();
  const scheduledTable=page.getByRole("table",{name:"Follow-up register"});
  await expect(scheduledTable.getByRole("columnheader")).toHaveText([
    "Follow-up date","Phone number","Business name","Contact name",
  ]);
  await expect(scheduledTable.locator("tbody tr")).toHaveCount(1);
  await expect(scheduledTable.locator("tbody tr time")).toHaveAttribute("dateTime",dueTomorrow);
  await expect(scheduledTable.getByRole("link",{name:"9876543210",exact:true})).toHaveAttribute("href","tel:9876543210");
  await expect(scheduledTable.getByRole("link",{name:"Lead 9876543210"})).toBeVisible();
  await expect(scheduledTable.locator("tbody tr").getByText("Not recorded")).toBeVisible();
  await page.goto("/app/leads");
  await expect(page.getByRole("table",{name:"Leads directory"})).toHaveAttribute("aria-busy","false");
  await page.getByRole("table",{name:"Leads directory"}).locator("tbody tr").first().click();
  // Tomorrow's reminder is invisible today, irrespective of lead creation date.
  const futureResponse=page.waitForResponse(res=>res.url().includes("/api/v1/leads/follow-ups/today?date="));
  await page.goto("/app/dashboard");
  expect((await futureResponse).status()).toBe(200);
  await expect(page.getByTestId("today-lead-followups")).toHaveCount(0);
  await page.goto("/app/leads");
  await expect(page.getByRole("table",{name:"Leads directory"})).toHaveAttribute("aria-busy","false");
  await page.getByRole("table",{name:"Leads directory"}).locator("tbody tr").first().click();
  await expect(page.getByLabel("Follow-up date")).toHaveValue(dueTomorrow);
  await page.getByLabel("Follow-up date").fill(dueToday);
  await page.getByRole("button",{name:"Save details and stage"}).click();
  const todayResponse=page.waitForResponse(res=>res.url().includes("/api/v1/leads/follow-ups/today?date="));
  await page.goto("/app/dashboard");
  expect((await todayResponse).status()).toBe(200);
  const dueCard=page.getByTestId("today-lead-followups");
  await expect(dueCard).toBeVisible();
  await expect(dueCard.getByText("Lead 9876543210")).toBeVisible();
  await expect(dueCard.locator(".aw-today-followup-card")).toHaveCSS("color","rgb(255, 255, 255)");
  await page.goto("/app/leads");
  await expect(page.getByRole("table",{name:"Leads directory"})).toHaveAttribute("aria-busy","false");
  await page.getByRole("table",{name:"Leads directory"}).locator("tbody tr").first().click();
  await page.getByLabel("Lead status").selectOption("CALL_NOT_PICKING");
  await page.getByRole("button",{name:"Save details and stage"}).click();
  const notPickingBadge=page.getByRole("table",{name:"Leads directory"})
    .locator("tbody tr").filter({has:page.locator(".aw-lead-action")}).locator(".aw-status-not-picking");
  await expect(notPickingBadge).toHaveText("CALL NOT PICKING");
  await expect(notPickingBadge).toHaveCSS("background-color","rgb(255, 0, 255)");
  await page.getByLabel("Lead status").selectOption("REJECTED");
  await page.getByRole("button",{name:"Save details and stage"}).click();
  const rejectedBadge=page.getByRole("table",{name:"Leads directory"})
    .locator("tbody tr").filter({has:page.locator(".aw-lead-action")}).locator(".aw-status-rejected");
  await expect(rejectedBadge).toHaveText("REJECTED");
  await expect(rejectedBadge).toHaveCSS("background-color","rgb(255, 0, 0)");
  await page.getByLabel("Contact name",{exact:true}).fill("CI Contact");
  await page.getByLabel("Business name",{exact:true}).fill("Founder CI Lead");
  await page.getByLabel("Business type",{exact:true}).fill("Retail");
  await page.getByLabel("Address").fill("17 Civil Lines, Prayagraj");
  await page.getByLabel("Google Maps link").fill("https://maps.app.goo.gl/abcdEFG123");
  await page.getByLabel("Lead status").selectOption("MEETING_PROCESS");
  await expect(page.getByLabel("Meeting date")).toBeVisible();
  await expect(page.getByLabel("Meeting time")).toBeVisible();
  await page.getByLabel("Note for MEETING PROCESS").fill("Initial meeting scheduled");
  await page.getByRole("button",{name:"Save details and stage"}).click();
  await expect(page.getByLabel("Meeting date")).toBeVisible();
  await page.getByLabel("Meeting date").fill(dueTomorrow);
  await page.getByLabel("Meeting time").fill("14:30");
  await page.getByRole("button",{name:"Save details and stage"}).click();
  await expect(page.getByRole("heading",{name:"Lead: Founder CI Lead"})).toBeVisible();
  await expect(page.getByLabel("Meeting date")).toHaveValue(dueTomorrow);
  await expect(page.getByLabel("Meeting time")).toHaveValue("14:30");
  await expect(page.getByLabel("Address")).toHaveValue("17 Civil Lines, Prayagraj");
  // Every scheduled meeting is visible in the dedicated register, even when future-dated.
  const scheduledMeetingsResponse=page.waitForResponse(res=>
    res.url().includes("/api/v1/leads/meetings?"));
  await page.getByRole("navigation",{name:"Workspace navigation"})
    .getByRole("link",{name:"Meetings",exact:true}).click();
  expect((await scheduledMeetingsResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/app\/meetings$/);
  const meetingRegister=page.getByRole("table",{name:"Meetings register"});
  await expect(meetingRegister.getByRole("columnheader")).toHaveText([
    "Meeting date","Meeting time","Business name","Contact name","Phone number","Address",
  ]);
  await expect(meetingRegister.locator("tbody tr")).toHaveCount(1);
  await expect(meetingRegister.locator("tbody tr time").first()).toHaveAttribute("dateTime",/20\d{2}-/);
  await expect(meetingRegister.locator("tbody tr time").nth(1)).toContainText(/2:30/i);
  await expect(meetingRegister.getByRole("link",{name:"Founder CI Lead",exact:true})).toBeVisible();
  await expect(meetingRegister.getByText("CI Contact")).toBeVisible();
  await expect(meetingRegister.getByRole("link",{name:"9876543210",exact:true})).toHaveAttribute("href","tel:9876543210");
  await expect(meetingRegister.getByText("17 Civil Lines, Prayagraj")).toBeVisible();
  await expect(meetingRegister.getByRole("link",{name:"Open Google Maps for Founder CI Lead"}))
    .toHaveAttribute("href","https://maps.app.goo.gl/abcdEFG123");
  await page.goto("/app/leads");
  await expect(page.getByRole("table",{name:"Leads directory"})).toHaveAttribute("aria-busy","false");
  await page.getByRole("table",{name:"Leads directory"}).locator("tbody tr").first().click();
  const futureMeeting=page.waitForResponse(res=>res.url().includes("/api/v1/leads/meetings/today?date="));
  await page.goto("/app/dashboard");
  expect((await futureMeeting).status()).toBe(200);
  await expect(page.getByTestId("today-lead-meetings")).toHaveCount(0);
  await page.goto("/app/leads");
  await expect(page.getByRole("table",{name:"Leads directory"})).toHaveAttribute("aria-busy","false");
  await page.getByRole("table",{name:"Leads directory"}).locator("tbody tr").first().click();
  await page.getByLabel("Meeting date").fill(dueToday);
  await page.getByRole("button",{name:"Save details and stage"}).click();
  const todayMeeting=page.waitForResponse(res=>res.url().includes("/api/v1/leads/meetings/today?date="));
  await page.goto("/app/dashboard");
  expect((await todayMeeting).status()).toBe(200);
  const meetingCard=page.getByTestId("today-lead-meetings");
  await expect(meetingCard).toBeVisible();
  await expect(meetingCard.getByText("Founder CI Lead")).toBeVisible();
  await expect(meetingCard.locator("time")).toContainText("2:30");
  await page.goto("/app/leads");
  await expect(page.getByRole("table",{name:"Leads directory"})).toHaveAttribute("aria-busy","false");
  await page.getByRole("table",{name:"Leads directory"}).locator("tbody tr").first().click();
  const savedMap=page.getByRole("link",{name:"Open Google Maps for CI Contact"});
  await expect(savedMap).toHaveAttribute("href","https://maps.app.goo.gl/abcdEFG123");
  await expect(savedMap).toHaveAttribute("target","_blank");
  await page.getByLabel("Lead status").selectOption("DECISION_PENDING");
  await page.getByLabel("Note for DECISION PENDING").fill("Awaiting customer confirmation");
  await page.getByRole("button",{name:"Save details and stage"}).click();
  const clearedMeeting=page.waitForResponse(res=>res.url().includes("/api/v1/leads/meetings/today?date="));
  await page.goto("/app/dashboard");
  expect((await clearedMeeting).status()).toBe(200);
  await expect(page.getByTestId("today-lead-meetings")).toHaveCount(0);
  await page.goto("/app/meetings");
  await expect(page.getByRole("table",{name:"Meetings register"}).locator("tbody tr")).toHaveCount(0);
  await page.goto("/app/leads");
  // The app can still be hydrating after navigation on a loaded CI runner.
  // Wait for the real CRM register, not merely the navigation response.
  await expect(page.getByRole("table",{name:"Leads directory"})).toHaveAttribute("aria-busy","false",{timeout:20000});
  await page.getByRole("table",{name:"Leads directory"}).locator("tbody tr").first().click();
  const decisionBadge=page.getByRole("table",{name:"Leads directory"})
    .locator("tbody tr").filter({has:page.locator(".aw-lead-action")}).locator(".aw-status-decision-pending");
  await expect(decisionBadge).toHaveText("DECISION PENDING");
  await expect(decisionBadge).toHaveCSS("background-color","rgb(164, 130, 242)");
  await expect(decisionBadge).toHaveCSS("color","rgb(255, 255, 255)");
  await page.getByLabel("Filter by stage").selectOption("DECISION_PENDING");
  await expect(page.getByRole("table",{name:"Leads directory"}).getByText("DECISION PENDING")).toBeVisible();
  await page.getByLabel("Filter by stage").selectOption("");
  await page.getByLabel("Lead status").selectOption("AGREEMENT_PENDING");
  await page.getByLabel("Note for AGREEMENT PENDING").fill("Agreement awaiting signature");
  await page.getByRole("button",{name:"Save details and stage"}).click();
  const agreementBadge=page.getByRole("table",{name:"Leads directory"}).locator("tbody tr").filter({has:page.locator(".aw-lead-action")}).locator(".aw-status-agreement-pending");
  await expect(agreementBadge).toHaveText("AGREEMENT PENDING");
  await expect(agreementBadge).toHaveCSS("background-color","rgb(14, 246, 188)");
  await expect(agreementBadge).toHaveCSS("color","rgb(255, 255, 255)");
  await page.getByLabel("Filter by stage").selectOption("AGREEMENT_PENDING");
  await expect(page.getByRole("table",{name:"Leads directory"}).getByText("AGREEMENT PENDING")).toBeVisible();
  await page.getByLabel("Filter by stage").selectOption("");
  await page.getByLabel("Lead status").selectOption("APPROVED");
  await page.getByLabel("Note for APPROVED").fill("Agreed to onboard");
  await page.getByRole("button",{name:"Save details and stage"}).click();
  await expect(page.getByText("Lead approved and automatically added to Clients.")).toBeVisible();
  await page.goto("/app/clients");
  await expect(page.getByRole("table",{name:"Clients directory"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Add client"})).toHaveCount(0);
  await expect(page.getByRole("table",{name:"Clients directory"}).getByText("Founder CI Lead")).toBeVisible();
  // Confirm the frontend gateway supports metrics and hard-deletion, and that
  // deleting an approved lead never removes its linked client.
  await page.goto("/app/leads");
  await expect(page.getByRole("region",{name:"CRM pipeline summary"})).toBeVisible();
  await expect(page.getByRole("region",{name:"CRM pipeline summary"}).getByText("FOLLOW UP",{exact:true})).toBeVisible();
  await expect(page.getByText("Conversion rate",{exact:true})).toHaveCount(0);
  const reopenLeadRow=page.getByRole("table",{name:"Leads directory"}).getByRole("row").filter({hasText:"Founder CI Lead"});
  await reopenLeadRow.click();
  await expect(page.getByRole("heading",{name:"Lead: Founder CI Lead"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Delete lead"})).toBeVisible();
  page.once("dialog",dialog=>{void dialog.accept();});
  await page.getByRole("button",{name:"Delete lead"}).click();
  await expect(page.getByText("Lead permanently deleted from the database. Linked clients are preserved.")).toBeVisible();
  await page.goto("/app/clients");
  await expect(page.getByRole("table",{name:"Clients directory"}).getByText("Founder CI Lead")).toBeVisible();
  await page.getByRole("button",{name:"Sign out"}).click();

  await login(page,"ci-employee",employeeInitial);
  const employeePassword="CI-Employee-"+Date.now().toString(36)+"#2026";
  await finishPasswordRotation(page,employeePassword);
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByTestId("personal-task-dashboard")).toBeVisible();
  await expect(page.getByTestId("personal-completed").getByText("Completed within the last 24 hours.")).toBeVisible();
  await expect(page.getByRole("link",{name:"Task history",exact:true}).first()).toBeVisible();
  await page.goto("/app/task-history");
  await expect(page.getByTestId("task-history-page")).toBeVisible();
  await expect(page.getByLabel("Task history scope")).toHaveCount(0);
  await expect(page.getByRole("link",{name:"Tasks",exact:true}).last()).toBeVisible();
  await page.goto("/app/dashboard");
  // Paired grid rows keep Pending/In Process and Overdue/Completed equal-height,
  // while preserving two desktop columns and compact mobile stacking.
  await page.setViewportSize({width:1366,height:812});
  const columns=page.locator(".aw-personal-task-column");
  await expect(columns).toHaveCount(2);
  await expect(columns.nth(0).locator('[data-testid="personal-pending"]')).toBeVisible();
  await expect(columns.nth(0).locator('[data-testid="personal-overdue"]')).toBeVisible();
  await expect(columns.nth(1).locator('[data-testid="personal-in-process"]')).toBeVisible();
  await expect(columns.nth(1).locator('[data-testid="personal-completed"]')).toBeVisible();
  // Every overview card keeps the identical purple body; only borders and glows differ.
  const sharedCardBackground=await page.getByTestId("personal-pending").evaluate(el=>getComputedStyle(el).backgroundImage);
  expect(sharedCardBackground).toContain("linear-gradient");
  for(const [section,outline,halo] of [
    ["personal-pending","rgb(255, 54, 94)","255, 54, 94"],
    ["personal-in-process","rgb(255, 140, 36)","255, 140, 36"],
    ["personal-completed","rgb(43, 255, 118)","43, 255, 118"],
    ["personal-overdue","rgb(5, 3, 8)","224, 217, 235"],
  ] as const){
    const card=page.getByTestId(section);
    await expect(card).toHaveCSS("background-color","rgb(32, 22, 47)");
    await expect(card).toHaveCSS("border-top-color",outline);
    // Desktop workspace uses CSS zoom, so computed pixel widths differ from stylesheet values.
    const borderWidth=await card.evaluate(el=>Number.parseFloat(getComputedStyle(el).borderTopWidth));
    expect(borderWidth,"Each task card needs a visible colored outline").toBeGreaterThan(0);
    const effect=await card.evaluate(el=>{
      const style=getComputedStyle(el);
      return {background:style.backgroundImage,shadow:style.boxShadow};
    });
    expect(effect.background,"All four cards should use the same brand-purple gradient").toBe(sharedCardBackground);
    // Glow lengths are scaled by the browser's workspace zoom as well.
    expect(effect.shadow,"Every status border needs a visible outer glow").not.toBe("none");
    expect(effect.shadow.split("rgba(").length-1,"The shadow should include three outer glow layers").toBeGreaterThanOrEqual(3);
    expect(effect.shadow,"The outer halo should correspond to the status").toContain(halo);
    await expect(card.locator("h2")).toHaveCSS("color","rgb(255, 255, 255)");
  }
  const taskRowGeometry=await page.evaluate(()=>{
    const bounds=(id:string)=>document.querySelector<HTMLElement>('[data-testid="'+id+'"]')!.getBoundingClientRect();
    const pending=bounds("personal-pending"),inProcess=bounds("personal-in-process");
    const overdue=bounds("personal-overdue"),completed=bounds("personal-completed");
    return {firstRowHeight:Math.abs(pending.height-inProcess.height),
      secondRowHeight:Math.abs(overdue.height-completed.height),
      secondRowTop:Math.abs(overdue.top-completed.top)};
  });
  expect(taskRowGeometry.firstRowHeight,"Pending and In Process should share a row height").toBeLessThanOrEqual(2);
  expect(taskRowGeometry.secondRowHeight,"Overdue and Completed should have equal heights").toBeLessThanOrEqual(2);
  expect(taskRowGeometry.secondRowTop,"Overdue and Completed should start at the same height").toBeLessThanOrEqual(2);
  // Non-admin Task Register rows use the same four-color palette.
  await page.goto("/app/tasks");
  const taskCardStyles=await page.locator('[data-aw-module="tasks"]').evaluate(container=>{
    return ["pending","in-process","completed","expired"].map(tone=>{
      const row=document.createElement("button");
      row.className="aw-assignee-task-card aw-assignee-task-"+tone;
      const name=document.createElement("p");name.textContent="Sample task";row.appendChild(name);
      const state=document.createElement("span");state.className="aw-task-state";row.appendChild(state);
      container.appendChild(row);
      const colors={background:getComputedStyle(row).backgroundColor,
        text:getComputedStyle(name).color,status:getComputedStyle(state).color};
      row.remove();return colors;
    });
  });
  expect(taskCardStyles).toEqual([
    {background:"rgb(195, 73, 73)",text:"rgb(255, 255, 255)",status:"rgb(255, 255, 255)"},
    {background:"rgb(185, 86, 43)",text:"rgb(255, 255, 255)",status:"rgb(255, 255, 255)"},
    {background:"rgb(50, 130, 80)",text:"rgb(255, 255, 255)",status:"rgb(255, 255, 255)"},
    {background:"rgb(56, 50, 61)",text:"rgb(255, 255, 255)",status:"rgb(255, 255, 255)"},
  ]);
  await page.goto("/app/dashboard");
  // Use a temporary index when this test account has no active task yet.
  // This verifies the actual applied CSS, not just the stylesheet text.
  for(const [section,background] of [
    ["personal-pending","rgb(255, 255, 0)"],
    ["personal-in-process","rgb(255, 0, 0)"],
    ["personal-completed","rgb(0, 255, 0)"],
    ["personal-overdue","rgb(0, 0, 0)"],
  ] as const){
    const numberStyles=await page.getByTestId(section).evaluate(element=>{
      const index=document.createElement("span");
      index.className="aw-personal-task-index";
      index.textContent="1";
      element.appendChild(index);
      const style=getComputedStyle(index);
      const colors={color:style.color,background:style.backgroundColor,border:style.borderTopColor};
      index.remove();
      return colors;
    });
    expect(numberStyles).toEqual({
      color:"rgb(255, 255, 255)",background,border:background,
    });
  }
  const cardGeometry=await page.evaluate(()=>{
    const box=(testid:string)=>document.querySelector<HTMLElement>('[data-testid="'+testid+'"]')!.getBoundingClientRect();
    const pending=box("personal-pending"),inProcess=box("personal-in-process"),completed=box("personal-completed");
    return {rightAligned:Math.abs(completed.left-inProcess.left),
      completedGap:completed.top-inProcess.bottom,
      pendingLeft:pending.left,progressLeft:inProcess.left};
  });
  expect(cardGeometry.rightAligned,"Completed must share the right column with In Process").toBeLessThanOrEqual(2);
  expect(cardGeometry.completedGap,"Completed should sit directly under In Process").toBeGreaterThanOrEqual(0);
  expect(cardGeometry.completedGap,"No empty grid-row gap before Completed").toBeLessThanOrEqual(25);
  expect(cardGeometry.progressLeft).toBeGreaterThan(cardGeometry.pendingLeft);
  await expect(page.getByRole("link",{name:"Team & accounts"})).toHaveCount(0);
  await expect(page.getByRole("link",{name:"Files & assets"})).toHaveCount(0);
  await page.goto("/app/finance");
  await expect(page.getByRole("heading",{name:"Income & expenses"})).toBeVisible();
  const financeCategory=page.getByLabel("Category",{exact:true});
  // No Person field on new transactions; the server records the submitting user.
  await expect(financeCategory).toHaveValue("");
  await expect(page.locator("#finance-person")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Submit for approval"})).toBeDisabled();
  await financeCategory.selectOption({label:"CI Admin Category Updated"});
  await page.getByLabel("Amount (INR)").fill("19.50");
  await page.getByRole("button",{name:"Submit for approval"}).click();
  await expect(page.getByText("Entry submitted for finance approval. Pending amounts are not included in posted totals.")).toBeVisible();
  await expect(financeCategory).toHaveValue("");
  await page.getByLabel("Entry type").selectOption("INCOME");
  await financeCategory.selectOption({label:"CI Revenue Category"});
  await page.getByLabel("Amount (INR)").fill("55.50");
  await page.getByRole("button",{name:"Submit for approval"}).click();
  await expect(page.getByText("Entry submitted for finance approval. Pending amounts are not included in posted totals.")).toBeVisible();
  await expect(page.getByRole("button",{name:"Agency totals"})).toHaveCount(0);
  for(const width of [320,360,375,390,430,768,1024,1366,1440]){
    await page.setViewportSize({width,height:812});
    await page.goto("/app/dashboard");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2)).toBe(false);
    if(width<=430){
      const cards=page.locator(".aw-personal-shortcut");
      if(await cards.count()){
        const first=await cards.first().evaluate(el=>({height:el.getBoundingClientRect().height,padding:parseFloat(getComputedStyle(el).paddingTop)}));
        expect(first.height,"Quick access must remain compact on phones").toBeLessThanOrEqual(95);
        expect(first.padding,"Quick access padding should be reduced for phones").toBeLessThanOrEqual(11);
        const columns=await page.locator(".aw-personal-quick-grid").evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length);
        expect(columns,"Personal quick access should use two columns on phones").toBe(2);
      }
      const headingSize=await page.locator(".aw-dashboard-title").evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
      expect(headingSize,"Mobile Overview heading must not dominate the screen").toBeLessThanOrEqual(30);
    }
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
          compact:cards.slice(0,4).every(x=>x.height<=112),heights:cards.slice(0,5).map(x=>Math.round(x.height))};
      });
      expect(grid.columns,"Finance summary should use two columns on phones").toBe(2);
      expect(grid.compact,"Finance cards should stay compact on phones: "+JSON.stringify(grid.heights)).toBe(true);
      await page.goto("/app/notes");
      const studio=await page.locator(".aw-studio").evaluate(el=>el.getBoundingClientRect());
      expect(studio.right,"Mobile notes must stay inside viewport")
        .toBeLessThanOrEqual(width+1);
    }
  }
  // Admin controls are visible at the start of the register and can edit both entry types.
  await page.setViewportSize({width:1366,height:768});
  await page.getByRole("button",{name:"Sign out"}).click();
  await login(page,"admin-e2e",UPDATED);
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await page.goto("/app/finance");
  const incomeRow=page.locator(".aw-finance-register tbody tr").filter({hasText:"CI Revenue Category"});
  const expenseRow=page.locator(".aw-finance-register tbody tr").filter({hasText:"CI Admin Category Updated"});
  await expect(incomeRow.getByRole("button",{name:/Edit income/})).toBeVisible();
  await expect(expenseRow.getByRole("button",{name:/Edit expense/})).toBeVisible();
  await incomeRow.getByRole("button",{name:/Edit income/}).click();
  const incomeEdit=page.getByRole("dialog",{name:"Edit income"});
  await expect(incomeEdit).toBeVisible();
  await incomeEdit.getByLabel("Amount (INR)").fill("56.00");
  await incomeEdit.getByRole("button",{name:"Save income"}).click();
  await expect(page.getByText("Finance entry updated and assigned user saved with an audit record.")).toBeVisible();
  await expenseRow.getByRole("button",{name:/Edit expense/}).click();
  const expenseEdit=page.getByRole("dialog",{name:"Edit expense"});
  await expect(expenseEdit).toBeVisible();
  await expenseEdit.getByLabel("Amount (INR)").fill("20.00");
  await expenseEdit.getByRole("button",{name:"Save expense"}).click();
  await expect(page.getByText("Finance entry updated and assigned user saved with an audit record.")).toBeVisible();
});
test("unauthenticated dashboard access is denied",async({page})=>{
  await page.goto("/app/dashboard");await expect(page).toHaveURL(/\/login/);
});
