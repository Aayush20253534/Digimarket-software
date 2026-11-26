import {expect,test,type Page} from "@playwright/test";

async function mockWorkspace(page:Page,role="FOUNDER",cycleClosed=false){
 const requests:{path:string;from:string|null;to:string|null;cycle:string|null}[]=[];
 let leads=Array.from({length:20},(_,i)=>({id:"00000000-0000-4000-8000-"+String(i+1).padStart(12,"0"),
  businessName:"Business "+(i+1),contactName:"Contact "+(i+1),phone:"900000"+String(i).padStart(4,"0"),
  status:"PENDING",source:"COLD_CALL",version:1,createdAt:"2026-11-10T10:00:00Z",updatedAt:"2026-11-10T10:00:00Z",
  businessType:null,location:null,googleMapsUrl:null,stageNote:null,meetingAt:null,assignedToId:null,assignee:null}));
 const deleted:string[][]=[];
 const permissions=["leads.read","clients.read","tasks.read","finance.entry.read.own","finance.read.all","finance.entry.create","reports.business.read"];
 const totals={currency:"INR",postedIncome:"1000",postedExpense:"200",postedSalaryExpense:"50",postedExpenseIncludingSalary:"250",
  agencyOperatingNet:"750",postedNet:"650",pendingIncome:"0",pendingExpense:"0",groups:[],clientAdSpend:{posted:"100",pending:"0",count:1},recurringIncome:{monthlyCombinedTotal:"5000.0000"}};
 await page.clock.setFixedTime(new Date("2026-11-17T12:00:00Z"));
 await page.route("**/api/v1/**",async route=>{
  const url=new URL(route.request().url()),path=url.pathname.slice("/api/v1".length);
  requests.push({path,from:url.searchParams.get("from"),to:url.searchParams.get("to"),cycle:url.searchParams.get("cycle")});
  let data:unknown=[];
  if(path==="/auth/refresh")data={next:"SIGNED_IN",accessToken:"test",user:{id:"user",organizationId:"org",loginId:"test",displayName:"Test Founder",status:"ACTIVE",mustChangePassword:false}};
  else if(path==="/me")data={userId:"user",organizationId:"org",roles:[role],permissions};
  else if(path==="/notifications")data={items:[],unreadCount:0};
  else if(path==="/notifications/push-key")data={publicKey:null};
  else if(path==="/messages/users")data={items:[]};
  else if(path==="/leads"){
   const start=url.searchParams.has("cursor")?10:0;
   const scoped=url.searchParams.get("cycle")==="2026-11"?[]:leads;
   data={items:scoped.slice(start,start+10),total:scoped.length,nextCursor:start+10<scoped.length?scoped[start+9].id:null};
  }else if(path==="/leads/metrics"){const n=url.searchParams.get("cycle")==="2026-11"?0:leads.length;data={total:n,pending:n,yetToCall:0,meetingProcess:0,decisionPending:0,agreementPending:0,followUp:0,approved:0,rejected:0,converted:0,callNotPicking:0,callBusy:0,conversionRatePercent:0};}
  else if(path==="/leads/bulk-delete"){
   const rows=route.request().postDataJSON().leads as {id:string;version:number}[];
   deleted.push(rows.map(row=>row.id));leads=leads.filter(lead=>!rows.some(row=>row.id===lead.id));
   data={deletedCount:rows.length,ids:rows.map(row=>row.id)};
  }else if(path==="/finance/cycle-state")data=cycleClosed?{current:{from:"2026-11-22",to:"2026-12-21"},history:[{from:"2026-10-22",to:"2026-11-21",closedAt:"2026-11-22"}],plannedThrough:"2026-12-21",canClose:false}:{current:{from:"2026-10-22",to:"2026-11-21"},history:[],plannedThrough:"2026-11-21",canClose:false};
  else if(path==="/finance/categories")data=[{id:"cat1",kind:"EXPENSE",name:"Travel",active:true,purpose:"GENERAL"},{id:"cat2",kind:"INCOME",name:"Service fees",active:true,purpose:"GENERAL"}];
  else if(path==="/finance/expenses/mine")data={status:"POSTED"};
  else if(path==="/finance/activity"){const type=url.searchParams.get("type");const items=[{id:"a1",date:"2026-11-17",type:"SELF_ADS",category:"Meta Ads",person:"Test Founder",client:"",description:"Agency campaign",amount:"50.0000",status:"POSTED",method:"UPI",direction:"OUTGOING",reversal:false},{id:"a2",date:"2026-11-17",type:"CLIENT_ADS",category:"Meta Ads",person:"Test Founder",client:"Example Cafe",description:"Client campaign",amount:"100.0000",status:"POSTED",method:"UPI",direction:"OUTGOING",reversal:false},{id:"a3",date:"2026-11-16",type:"SETTLEMENT",category:"Internal settlement",person:"Founder A → Founder B",client:"",description:"Reimbursement",amount:"25.0000",status:"POSTED",method:"UPI",direction:"INCOMING",reversal:false}].filter(r=>!type||type==="ALL"||r.type===type);data={items,total:items.length,page:1,limit:25};}
  else if(path==="/finance/register")data={items:[],total:0,page:1,limit:25};
  else if(path==="/finance/summary")data=url.searchParams.get("from")==="2026-11-22"
    ? {...totals,postedIncome:"0",postedExpense:"0",postedNet:"0"}:totals;
  else if(path==="/finance/cycle-balance")data={opening:"650",movement:"0",remaining:"650"};
  else if(path==="/finance/client-ad-spend/mine")data={
    from:url.searchParams.get("from"),to:url.searchParams.get("to"),
    currency:"INR",posted:"8500.0000",entries:9,
    byClient:[
      {clientId:"c1",name:"Rouche Cafe",posted:"4192.0000",entries:6},
      {clientId:"c2",name:"Other clients",posted:"4308.0000",entries:3}
    ]
  };
  else if(path==="/finance/internal-settlements/all")data={
    postedTotal:"10719.0000",postedCount:2,voidedCount:0,total:2,page:1,limit:50,
    items:[
      {id:"s1",occurredOn:"2026-11-21",senderName:"Founder Jha",recipientName:"Aayush Thakur",
       amount:"2234.0000",status:"POSTED",method:"UPI",note:"Reimbursement",voidReason:null},
      {id:"s2",occurredOn:"2026-11-07",senderName:"Founder Jha",recipientName:"Dev Raj",
       amount:"8485.0000",status:"POSTED",method:"BANK_TRANSFER",note:null,voidReason:null}
    ]
  };
  else if(path==="/finance/client-funds")data=[
    {id:"first",closing:"300.5000"},{id:"second",closing:"-100.2500"}
  ];
  else if(path==="/finance/internal-settlements/mine")data=[
    {amount:"2234.0000",status:"POSTED",settlementDirection:"INCOMING"},
    {amount:"234.0000",status:"POSTED",settlementDirection:"OUTGOING"},
    {amount:"500.0000",status:"CANCELLED",settlementDirection:"INCOMING"}
  ];
  else if(path==="/finance/category-summary")data=url.searchParams.get("from")==="2026-11-22"?{ordinary:"0",total:"0",items:[]}:{ordinary:"200",total:"200",items:[{id:"cat1",name:url.searchParams.get("kind")==="INCOME"?"Service fees":"Travel",posted:"200",pending:"0",count:2,active:true}]};
  else if(path==="/finance/total-expenses")data={items:[],total:0,page:1,limit:25,summary:{postedIncome:"1000",postedTotalExpense:"350",netOperatingMoney:"650",breakdown:{OTHER:"200",SELF_ADS:"0",CLIENT_ADS:"100",SALARY:"50"}}};
  else if(path==="/finance/total-expenses/summary")data={postedIncome:"1000",postedTotalExpense:"350",netOperatingMoney:"650",breakdown:{OTHER:"200",SELF_ADS:"0",CLIENT_ADS:"100",SALARY:"50"}};
  else if(path==="/salary/summary")data={totalPaid:"50",founderFunding:[]};
  else if(path==="/finance/meta-ads-distribution")data={view:"mine",from:url.searchParams.get("from"),to:url.searchParams.get("to"),totalPosted:"100",totalPending:"0",total:"100",excludedAmount:"0",excludedCount:0,transactionCount:1,selfPosted:"0",selfPending:"0",clientPosted:"100",clientPending:"0",categories:[],individuals:[],daily:[],monthly:[]};
  await route.fulfill({json:{data}});
 });
 return {requests,deleted};
}

test("administrators can select across pages and confirm one bulk deletion",async({page})=>{
 const {deleted}=await mockWorkspace(page,"ADMIN");
 await page.goto("/app/leads");
 await page.getByRole("checkbox",{name:"Select lead Contact 1",exact:true}).check();
 await page.getByRole("button",{name:"Next leads page"}).click();
 await page.getByRole("checkbox",{name:"Select all leads on this page"}).check();
 await expect(page.getByRole("button",{name:"Delete selected (11)",exact:true})).toBeEnabled();
 page.once("dialog",dialog=>dialog.accept());
 await page.getByRole("button",{name:"Delete selected (11)",exact:true}).click();
 await expect(page.getByText("11 leads permanently deleted. Linked clients preserved.",{exact:true})).toBeVisible();
 expect(deleted).toHaveLength(1);expect(new Set(deleted[0]).size).toBe(11);
 await expect(page.getByRole("button",{name:"Delete selected (0)",exact:true})).toBeDisabled();
 await expect(page.getByRole("checkbox",{name:"Select lead Contact 2",exact:true})).toBeVisible();
});

test("changing a lead filter clears bulk selection and cancel deletes nothing",async({page})=>{
 const {deleted}=await mockWorkspace(page);
 await page.goto("/app/leads");
 await page.getByRole("checkbox",{name:"Select lead Contact 1",exact:true}).check();
 page.once("dialog",dialog=>dialog.dismiss());
 await page.getByRole("button",{name:"Delete selected (1)",exact:true}).click();
 expect(deleted).toHaveLength(0);
 await page.getByRole("combobox",{name:"Filter by stage"}).selectOption("PENDING");
 await expect(page.getByRole("button",{name:"Delete selected (0)",exact:true})).toBeDisabled();
});

test("unified Finance keeps quick entry, classification and shared work cycle",async({page})=>{
 const {requests}=await mockWorkspace(page);
 await page.goto("/app/finance");
 await expect(page.getByLabel("Work cycle from")).toHaveValue("2026-10-22");
 await expect(page.getByLabel("Work cycle through")).toHaveValue("2026-11-21");
 await expect(page.getByText("Operating net (before settlements)",{exact:true})).toBeVisible();
 await expect(page.getByRole("navigation",{name:"Finance categories"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Record expense",exact:true})).toBeVisible();
 await expect(page.getByRole("navigation",{name:"Finance workspace sections"}).getByRole("button",{name:"Salary",exact:true})).toBeVisible();
 await expect(page.getByRole("region",{name:"Expense classification"})).toBeVisible();
 await expect(page.getByRole("region",{name:"Financial register",exact:true})).toHaveCount(0);
 await expect(page.getByLabel("Amount (INR)",{exact:true})).toBeVisible();
 await page.getByLabel("Category",{exact:true}).selectOption("cat1");
 await page.getByLabel("Amount (INR)",{exact:true}).fill("25");
 await page.getByRole("button",{name:"Save expense",exact:true}).click();
 await expect(page.getByText("Entry saved and included in posted totals.")).toBeVisible();
 await expect(page.getByLabel("Amount (INR)",{exact:true})).toHaveValue("");
 await expect(page.getByRole("button",{name:"Next cycle",exact:true})).toBeDisabled();
 await page.getByRole("link",{name:/Meta Ads Self and client/}).click();
 await expect(page).toHaveURL(/finance\/ads/);
 await expect(page.getByLabel("Work cycle from")).toHaveValue("2026-10-22");
 for(const path of ["/finance/register","/finance/meta-ads-distribution"])
  await expect.poll(()=>requests.some(row=>row.path===path&&row.from==="2026-10-22"&&row.to==="2026-11-21")).toBe(true);
 await page.getByRole("link",{name:"← Finance overview"}).click();
 await page.getByRole("navigation",{name:"Finance workspace sections"}).getByRole("button",{name:"Transactions",exact:true}).click();
 await expect(page.getByLabel("Work cycle from")).toHaveValue("2026-10-22");
 const unified=page.getByRole("region",{name:"Unified transaction register"});
 await expect(unified).toBeVisible();
 await expect(unified.locator("article").filter({hasText:"Agency campaign"}).getByText("Agency Meta Ads",{exact:false})).toBeVisible();
 await expect(unified.getByText("Example Cafe",{exact:false})).toBeVisible();
 await unified.getByLabel("Transaction type").selectOption("SETTLEMENT");
 await expect(unified.getByText("Founder A → Founder B")).toBeVisible();
 await expect(unified.getByText("Example Cafe",{exact:false})).toHaveCount(0);
 await page.getByRole("group",{name:"Transaction classification"}).getByRole("button",{name:"Income & operating expenses"}).click();
 await expect.poll(()=>requests.some(row=>row.path==="/salary/summary"&&row.from==="2026-10-22")).toBe(true);
 await page.getByRole("navigation",{name:"Finance workspace sections"}).getByRole("button",{name:"Salary",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Record a salary payment"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Salary payment history"})).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
});

test("a founder's received settlement reduces personal deficit but never creates new income",async({page})=>{
 const {requests}=await mockWorkspace(page);
 await page.route("**/api/v1/finance/total-expenses/summary?*",route=>route.fulfill({json:{data:{
  postedIncome:"10000.0000",postedTotalExpense:"12234.4900",netOperatingMoney:"-2234.4900",
  breakdown:{OTHER:"4734.4900",SELF_ADS:"0",CLIENT_ADS:"7500",SALARY:"2000"}
 }}}));
 await page.route("**/api/v1/finance/internal-settlements/mine?*",route=>route.fulfill({json:{data:[
  {amount:"2234.0000",status:"POSTED",settlementDirection:"INCOMING"},
  {amount:"999.0000",status:"CANCELLED",settlementDirection:"OUTGOING"}
 ]}}));
 await page.goto("/app/finance?view=mine&from=2026-10-22&to=2026-11-21");
 const card=page.getByText("My net after internal settlements · this cycle",{exact:true}).locator("..");
 await expect(card.getByText("−₹0.49",{exact:true})).toBeVisible();
 await expect(card).toContainText("Operating net −₹2,234.49 + received ₹2,234.00 − sent ₹0.00");
 await expect(page.getByText("Operating net (before settlements)",{exact:true})).toBeVisible();
 expect(requests.some(x=>x.path==="/finance/summary")).toBe(true);
});

test("Finance category cards show accurate posted, held and transferred amounts",async({page})=>{
 const {requests}=await mockWorkspace(page);
 await page.goto("/app/finance?view=mine&from=2026-10-22&to=2026-11-21");
 const nav=page.getByRole("navigation",{name:"Finance categories"});
 await expect(nav.getByRole("link",{name:/^Meta Ads/})).toContainText("₹100.00");
 await expect(nav.getByRole("link",{name:/^Meta Ads/})).toContainText("Posted Meta Ads spend · this cycle");
 await expect(nav.getByRole("link",{name:/^Client ad funds/})).toContainText("₹8,500.00");
 await expect(nav.getByRole("link",{name:/^Client ad funds/})).toContainText("Posted client ads paid from my account · this cycle");
 await nav.getByRole("link",{name:/^Client ad funds/}).click();
 await expect(page.getByText("Client advertising outflow from my account")).toBeVisible();
 await expect(page.getByRole("region",{name:"My client ad spending by client"})).toContainText("Rouche Cafe");
 await expect(page.getByRole("region",{name:"My client ad spending by client"})).toContainText("₹4,192.00");
 await page.getByRole("link",{name:"← Finance overview"}).click();

 await expect(nav.getByRole("link",{name:/^Founder settlements/})).toContainText("₹2,000.00");
 await expect(nav.getByRole("link",{name:/^Founder settlements/})).toContainText("Received ₹2,234.00 · Sent ₹234.00");
 await expect(nav.getByRole("link",{name:/^Agreement projections/})).toContainText("₹5,000.00");
 await expect(nav.getByRole("link",{name:/^Agreement projections/})).toContainText("not posted income");
 await expect(page.getByText("Agency balance carried forward",{exact:true})).toHaveCount(0);
 expect(requests.some(x=>x.path==="/finance/cycle-balance")).toBe(false);
 await page.getByRole("button",{name:"Agency totals & register"}).click();
 await expect(page.getByText("Agency balance carried forward",{exact:true})).toBeVisible();
 await expect(nav.getByRole("link",{name:/^Client ad funds/})).toContainText("₹100.00");
 await expect(nav.getByRole("link",{name:/^Client ad funds/})).toContainText("Posted client Meta Ads · all accounts · this cycle");
 await expect(nav.getByRole("link",{name:/^Founder settlements/})).toContainText("₹10,719.00");
 await expect(nav.getByRole("link",{name:/^Founder settlements/})).toContainText("All founders' transfers · this cycle");
 await expect(nav.getByRole("link",{name:/^Founder settlements/})).toContainText("2 active settlements");
 await nav.getByRole("link",{name:/^Founder settlements/}).click();
 await expect(page.getByRole("region",{name:"Agency settlement history"})
  .getByTestId("agency-settlement-entry")).toHaveCount(2);
 await expect(page.getByText("Founder Jha → Dev Raj")).toBeVisible();
 await expect(page.getByText("Founder Jha → Aayush Thakur")).toBeVisible();
 await expect(page.getByText("Total transferred (active)")).toBeVisible();

 await expect.poll(()=>requests.some(x=>x.path==="/finance/cycle-balance")).toBe(true);
});

test("agency operating money includes opening carry exactly once and keeps cycle totals separate",async({page})=>{
 await mockWorkspace(page);
 await page.route("**/api/v1/finance/cycle-balance?*",route=>route.fulfill({json:{data:{
  opening:"19051.5100",movement:"-1142.0000",remaining:"17909.5100"
 }}}));
 await page.route("**/api/v1/finance/total-expenses/summary?*",route=>route.fulfill({json:{data:{
  postedIncome:"1000.0000",postedTotalExpense:"2142.0000",netOperatingMoney:"-1142.0000",
  breakdown:{OTHER:"1992.0000",SELF_ADS:"0",CLIENT_ADS:"100",SALARY:"50"}
 }}}));
 await page.goto("/app/finance?view=all&from=2026-10-22&to=2026-11-21");
 const net=page.getByText("Net operating money",{exact:true}).locator("..");
 const carry=page.getByText("Agency balance carried forward",{exact:true}).locator("..");
 await expect(net).toContainText("₹17,909.51");
 await expect(carry).toContainText("₹19,051.51");
 await expect(page.getByTestId("finance-category-amount-income")).toHaveText("₹1,000.00");
 await expect(page.getByTestId("finance-category-amount-total-expense")).toHaveText("₹2,142.00");
 await page.getByRole("button",{name:"My entries"}).click();
 await expect(page.getByText("Agency balance carried forward",{exact:true})).toHaveCount(0);
 await expect(page.getByText("Operating net (before settlements)",{exact:true}).locator("..")).toContainText("−₹1,142.00");
});

test("carried balances appear in agency register but not My Entries",async({page})=>{
 const {requests}=await mockWorkspace(page);
 await page.goto("/app/finance/entries?view=mine&from=2026-10-22&to=2026-11-21");
 await expect(page.getByText("Net balance remaining · My account",{exact:true})).toHaveCount(0);
 expect(requests.some(x=>x.path==="/finance/cycle-balance")).toBe(false);
 await page.getByRole("button",{name:"Agency totals & register"}).click();
 await expect(page.getByText("Agency net balance remaining",{exact:true})).toBeVisible();
 await expect.poll(()=>requests.some(x=>x.path==="/finance/cycle-balance")).toBe(true);
});

test("next-cycle Income identifies previous cycle net without double counting new income",async({page})=>{
 const {requests}=await mockWorkspace(page,"FOUNDER",true);
 await page.goto("/app/finance/income?view=mine&from=2026-11-22&to=2026-12-21");
 await expect(page.getByText("Previous cycle net posted",{exact:true})).toBeVisible();
 await expect(page.getByText("₹650.00",{exact:true})).toBeVisible();
 await expect(page.getByText("New income this cycle",{exact:true})).toBeVisible();
 await expect(page.getByText("₹0.00",{exact:true})).toBeVisible();
 await expect(page.getByRole("link",{name:"View source cycle"})).toHaveAttribute("href",/from=2026-10-22.*to=2026-11-21/);
 expect(requests.some(x=>x.path==="/finance/summary"&&x.from==="2026-10-22"&&x.to==="2026-11-21")).toBe(true);
});

test("Tasks are hidden and preserved routes display the pause notice",async({page})=>{
 const {requests}=await mockWorkspace(page);
 await page.goto("/app/tasks");
 await expect(page.getByRole("heading",{name:"Tasks are paused"})).toBeVisible();
 await expect(page.getByRole("navigation",{name:"Workspace navigation"}).getByRole("link",{name:"Tasks",exact:true})).toHaveCount(0);
 expect(requests.some(row=>row.path.startsWith("/tasks"))).toBe(false);
 await page.goto("/app/task-history");
 await expect(page.getByRole("heading",{name:"Tasks are paused"})).toBeVisible();
});

test("closed cycle dashboard exposes category drilldowns and preserves selected dates",async({page})=>{
 const {requests}=await mockWorkspace(page,"FOUNDER",true);
 await page.goto("/app/finance/cycles?from=2026-10-22&to=2026-11-21&view=all");
 const nav=page.getByRole("navigation",{name:"Cycle finance categories"});
 await expect(nav.getByRole("link",{name:/^Meta Ads/})).toContainText("₹100.00");
 await expect(nav.getByRole("link",{name:/^Salaries/})).toContainText("₹50.00");
 const categories=page.getByRole("region",{name:"Cycle category breakdown"});
 await expect(categories.getByRole("link",{name:/^Travel/})).toContainText("₹200.00");
 await expect(categories.getByRole("link",{name:/^Service fees/})).toHaveAttribute("href",/from=2026-10-22.*to=2026-11-21.*kind=INCOME/);
 await categories.getByRole("link",{name:/^Travel/}).click();
 await expect(page).toHaveURL(/finance\/entries/);
 await expect(page.getByLabel("Work cycle from")).toHaveValue("2026-10-22");
 await expect(page.getByLabel("Work cycle through")).toHaveValue("2026-11-21");
 await expect.poll(()=>requests.some(x=>x.path==="/finance/register"&&x.from==="2026-10-22"&&x.to==="2026-11-21")).toBe(true);
});

test("lead cycle scopes the register and metrics together and Total includes earlier leads",async({page})=>{
 const {requests}=await mockWorkspace(page);
 await page.clock.setFixedTime(new Date("2026-11-25T12:00:00Z"));
 await page.goto("/app/leads");
 const picker=page.getByLabel("Lead cycle");
 await expect(picker).toHaveValue("2026-11");
 await expect(picker.locator("option")).toHaveCount(3);
 await expect(page.getByText("No matching leads.",{exact:false})).toBeVisible();
 await expect.poll(()=>requests.some(r=>r.path==="/leads/metrics"&&r.cycle==="2026-11")).toBe(true);
 await picker.selectOption("2026-10");
 await expect(page.getByRole("table",{name:"Leads directory"}).getByText("Business 1",{exact:true})).toBeVisible();
 await expect.poll(()=>requests.some(r=>r.path==="/leads/metrics"&&r.cycle==="2026-10")).toBe(true);
 await page.getByRole("region",{name:"Lead business cycle"}).getByRole("button",{name:"Total",exact:true}).click();
 await expect(picker).toHaveValue("total");
 await expect.poll(()=>requests.some(r=>r.path==="/leads/metrics"&&r.cycle===null)).toBe(true);
});

test("purple and light theme choices persist through full CRM reloads",async({page})=>{
 await mockWorkspace(page);
 await page.goto("/app/leads");
 const workspace=page.locator(".aw-workspace");
 await expect(workspace).toHaveAttribute("data-theme","dark");
 await page.getByRole("button",{name:"Switch to light theme"}).click();
 await expect(workspace).toHaveAttribute("data-theme","light");
 await page.reload();
 await expect(workspace).toHaveAttribute("data-theme","light");
 await page.getByRole("button",{name:"Switch to dark theme"}).click();
 await expect(workspace).toHaveAttribute("data-theme","dark");
 await page.reload();
 await expect(workspace).toHaveAttribute("data-theme","dark");
});

test("Expired is offered only after approval and enabled only after manual agreement termination",async({page})=>{
 await mockWorkspace(page);
 const id="00000000-0000-4000-8000-000000000001";
 let status="PENDING",ended=false,saved=false;
 const detail=()=>({id,businessName:"Business 1",contactName:"Contact 1",phone:"9000000000",businessType:null,location:null,googleMapsUrl:null,websiteUrl:null,instagramUrl:null,source:"COLD_CALL",status,stageNote:"",assignedToId:null,createdById:"user",nextFollowUpAt:null,meetingAt:null,version:1,createdAt:"2026-11-10T10:00:00Z",canEdit:true,canExpire:ended,linkedClientId:"00000000-0000-4000-8000-000000000099",activities:[]});
 await page.route("**/api/v1/leads/"+id,async route=>{
  if(route.request().method()==="PUT"){const body=route.request().postDataJSON();expect(body.status).toBe("EXPIRED");status="EXPIRED";saved=true;}
  await route.fulfill({json:{data:detail()}});
 });
 await page.goto("/app/leads");
 const row=page.getByRole("table",{name:"Leads directory"}).getByText("Business 1",{exact:true});
 await row.click();
 const select=page.getByLabel("Lead status");
 await expect(select.locator("option[value=EXPIRED]")).toHaveCount(0);
 status="APPROVED";await row.click();
 await expect(select).toHaveValue("APPROVED");
 await expect(select.locator("option[value=EXPIRED]")).toBeDisabled();
 ended=true;await row.click();
 await expect(select.locator("option[value=EXPIRED]")).toBeEnabled();
 await select.selectOption("EXPIRED");
 await page.getByRole("button",{name:"Save details and stage"}).click();
 await expect(page.getByText("Lead moved to Expired. Original conversion preserved.")).toBeVisible();
 expect(saved).toBe(true);
 await expect(select).toBeDisabled();
});

test("lead cycle controls align on desktop and wrap on small screens",async({page})=>{
 await mockWorkspace(page);
 await page.setViewportSize({width:1440,height:900});
 await page.goto("/app/leads");
 const bar=page.getByRole("region",{name:"Lead business cycle"});
 const button=bar.getByRole("button",{name:"Total",exact:true});
 const picker=bar.getByLabel("Lead cycle");
 await expect(picker).toBeVisible();
 const a=await button.boundingBox(),b=await picker.boundingBox();
 expect(a).not.toBeNull();expect(b).not.toBeNull();
 expect(Math.abs((a!.y+a!.height/2)-(b!.y+b!.height/2))).toBeLessThanOrEqual(2);
 await page.setViewportSize({width:390,height:844});
 await expect(picker).toBeVisible();
 const bounds=await bar.boundingBox(),control=await picker.boundingBox();
 expect(bounds).not.toBeNull();expect(control).not.toBeNull();
 expect(control!.x+control!.width).toBeLessThanOrEqual(bounds!.x+bounds!.width+2);
});

test("lead temperature defaults to Unclassified, can be set and filtered",async({page})=>{
 await mockWorkspace(page);
 const id="00000000-0000-4000-8000-000000000001";
 let temperature="UNCLASSIFIED";
 const detail=()=>({id,businessName:"Business 1",contactName:"Contact 1",phone:"9000000000",businessType:null,location:null,googleMapsUrl:null,websiteUrl:null,instagramUrl:null,source:"COLD_CALL",status:"PENDING",temperature,stageNote:"",assignedToId:null,createdById:"user",nextFollowUpAt:null,meetingAt:null,version:1,createdAt:"2026-11-10T10:00:00Z",canEdit:true,activities:[]});
 await page.route("**/api/v1/leads/"+id,async route=>{
  if(route.request().method()==="PUT"){temperature=route.request().postDataJSON().temperature;expect(temperature).toBe("HOT");}
  await route.fulfill({json:{data:detail()}});
 });
 await page.goto("/app/leads");
 const row=page.getByRole("table",{name:"Leads directory"}).getByRole("row").filter({hasText:"Business 1"}).first();
 await expect(row.getByRole("img",{name:"Lead temperature: Unclassified"})).toBeVisible();
 await row.getByText("Business 1",{exact:true}).click();
 const picker=page.getByLabel("Lead temperature",{exact:true});
 await expect(picker).toHaveValue("UNCLASSIFIED");
 await picker.selectOption("HOT");
 await page.getByRole("button",{name:"Save details and stage"}).click();
 await expect(page.getByText("Shared lead and status note saved.")).toBeVisible();
 await expect(picker).toHaveValue("HOT");
 const filtered=page.waitForRequest(req=>new URL(req.url()).pathname==="/api/v1/leads"&&new URL(req.url()).searchParams.get("temperature")==="HOT");
 await page.getByLabel("Filter by temperature").selectOption("HOT");
 await filtered;
 await page.getByRole("button",{name:"Clear filters"}).click();
 await expect(page.getByLabel("Filter by temperature")).toHaveValue("");
});

test("follow-up workspace searches globally, reschedules and updates lead details without leaving the register",async({page})=>{
 await mockWorkspace(page);
 const id="00000000-0000-4000-8000-000000000009";
 let day="2026-11-15",note="Call to finalize",temperature="HOT",status="FOLLOW_UP",version=1;
 const detail=()=>({id,businessName:"Earlier cycle prospect",contactName:"Contact",phone:"9000000000",nextFollowUpAt:day+"T12:00:00Z",temperature,stageNote:note,status,version,canEdit:true,meetingAt:null});
 await page.route("**/api/v1/leads/follow-ups?*",async route=>{
   const q=new URL(route.request().url()).searchParams;
   expect(q.has("cycle")).toBe(false);
   const active=status==="FOLLOW_UP",bucket=day<"2026-11-17"?"overdue":day==="2026-11-17"?"today":"upcoming";
   const matches=active&&(!q.get("q")||"Earlier cycle prospect".toLowerCase().includes(q.get("q")!.toLowerCase()))&&(!q.get("temperature")||q.get("temperature")===temperature)&&(!q.get("from")||day>=q.get("from")!)&&(!q.get("to")||day<=q.get("to")!);
   const filtered=matches&&(!q.get("view")||q.get("view")==="all"||q.get("view")===bucket);
   await route.fulfill({json:{data:{items:filtered?[detail()]:[],nextCursor:null,total:filtered?1:0,today:"2026-11-17",summary:{all:matches?1:0,overdue:matches&&bucket==="overdue"?1:0,today:matches&&bucket==="today"?1:0,upcoming:matches&&bucket==="upcoming"?1:0},calendar:active?{[day]:1}:{}}}});
 });
 await page.route("**/api/v1/leads/"+id,async route=>{
   if(route.request().method()==="PUT"){
     const body=route.request().postDataJSON();
     expect(body.version).toBe(version);
     day=body.followUpOn??day;note=body.stageNote??note;temperature=body.temperature??temperature;status=body.status;version++;
   }
   await route.fulfill({json:{data:detail()}});
 });
 await page.goto("/app/follow-ups");
 const table=page.getByRole("table",{name:"Follow-up register"});
 await expect(table.getByText("2 days overdue")).toBeVisible();
 await expect(table.getByRole("link",{name:"Call 9000000000"})).toHaveAttribute("href","tel:9000000000");
 await expect(table.getByText("Call to finalize")).toBeVisible();
 await page.getByRole("textbox",{name:"Search follow-ups"}).fill("does not exist");
 await expect(table.locator("tbody tr")).toHaveCount(0);
 await page.getByRole("textbox",{name:"Search follow-ups"}).fill("");
 await expect(table.getByText("Earlier cycle prospect")).toBeVisible();
 await page.getByRole("button",{name:"Actions for Earlier cycle prospect"}).click();
 const editor=page.getByRole("dialog",{name:"Update follow-up"});
 await editor.getByRole("button",{name:"Tomorrow"}).click();
 await expect(editor.getByLabel("Follow-up date")).toHaveValue("2026-11-18");
 await editor.getByLabel("Short notes").fill("Client requested tomorrow");
 await editor.getByLabel("Lead temperature").selectOption("WARM");
 await editor.getByRole("button",{name:"Save follow-up"}).click();
 await expect(table.getByText("Client requested tomorrow")).toBeVisible();
 await expect(table.getByRole("img",{name:"Lead temperature: Warm"})).toBeVisible();
 await page.getByRole("button",{name:"Calendar",exact:true}).click();
 const calendar=page.getByRole("region",{name:"Follow-up calendar"});
 await expect(calendar.getByRole("button",{name:"18 Nov 2026: 1 follow-ups"})).toBeVisible();
 await calendar.getByRole("button",{name:"18 Nov 2026: 1 follow-ups"}).click();
 await expect(page.getByLabel("Follow-ups from")).toHaveValue("2026-11-18");
 await page.getByRole("button",{name:"Actions for Earlier cycle prospect"}).click();
 await editor.getByLabel("Lead stage").selectOption("DECISION_PENDING");
 await editor.getByRole("button",{name:"Save follow-up"}).click();
 await expect(table.locator("tbody tr")).toHaveCount(0);
 await expect(page.getByText("Lead stage updated. Removed from scheduled follow-ups.")).toBeVisible();
});

test("meeting actions preserve the original lead, warn about overlaps and retain recorded outcomes",async({page})=>{
 await mockWorkspace(page);
 const id="00000000-0000-4000-8000-000000000009";
 let at="2026-11-18T09:00:00.000Z",status="MEETING_PROCESS",version=1,note="Discuss services",type="UNSPECIFIED",join="",temperature="UNCLASSIFIED",duration=60;
 const recorded:unknown[]=[];
 const detail=()=>({id,businessName:"Earlier cycle meeting",contactName:"Owner",phone:"9000000000",location:"Example address",googleMapsUrl:"https://maps.app.goo.gl/abcdEFG123",meetingAt:at,status,version,stageNote:note,meetingType:type,meetingJoinUrl:join,temperature,meetingDurationMinutes:duration,canEdit:true});
 await page.route("**/api/v1/leads/meetings?*",async route=>{
   const q=new URL(route.request().url()).searchParams;expect(q.has("cycle")).toBe(false);
   const active=status==="MEETING_PROCESS",day=new Date(Date.parse(at)+330*60000).toISOString().slice(0,10);
   const matches=active&&(!q.get("q")||"Earlier cycle meeting".toLowerCase().includes(q.get("q")!.toLowerCase()))&&(!q.get("from")||day>=q.get("from")!)&&(!q.get("to")||day<=q.get("to")!);
   await route.fulfill({json:{data:{items:matches?[detail()]:[],total:matches?1:0,nextCursor:null,today:"2026-11-17",now:"2026-11-17T12:00:00Z",summary:{all:matches?1:0,overdue:0,today:0,upcoming:matches?1:0},calendar:active?{[day]:1}:{}}}});
 });
 await page.route("**/api/v1/leads/meetings/conflicts?*",async route=>route.fulfill({json:{data:{count:1}}}));
 await page.route("**/api/v1/leads/meetings/history?*",async route=>route.fulfill({json:{data:{items:recorded,total:recorded.length,nextCursor:null}}}));
 await page.route("**/api/v1/leads/"+id,async route=>{
   if(route.request().method()==="PUT"){
     const b=route.request().postDataJSON();expect(b.version).toBe(version);
     const previous=at;
     if(b.meetingOn)at=new Date(b.meetingOn+"T"+b.meetingTime+":00+05:30").toISOString();
     note=b.stageNote??note;type=b.meetingType??type;join=b.meetingJoinUrl??join;temperature=b.temperature??temperature;duration=b.meetingDurationMinutes??duration;status=b.status;version++;
     if(b.meetingOutcome)recorded.unshift({id:"event"+version,leadId:id,createdAt:"2026-11-17T12:00:00Z",note,metadata:{scheduledAt:previous,meetingOutcome:b.meetingOutcome,toStatus:status},lead:{businessName:"Earlier cycle meeting",contactName:"Owner",status}});
   }
   await route.fulfill({json:{data:detail()}});
 });
 await page.goto("/app/meetings");
 const table=page.getByRole("table",{name:"Meetings register"});
 await expect(table.getByText("Discuss services")).toBeVisible();
 await expect(table.getByRole("link",{name:"Call 9000000000"})).toHaveAttribute("href","tel:9000000000");
 await page.getByRole("button",{name:"Actions for Earlier cycle meeting"}).click();
 const editor=page.getByRole("dialog",{name:"Update meeting"});
 await editor.getByLabel("Meeting outcome").selectOption("RESCHEDULED");
 await editor.getByRole("button",{name:"After 3 days"}).click();
 await editor.getByLabel("Meeting type").selectOption("GOOGLE_MEET");
 await editor.getByLabel("Google Meet link").fill("https://meet.google.com/abc-defg-hij");
 await editor.getByLabel("Lead temperature").selectOption("HOT");
 await editor.getByRole("button",{name:"Save meeting"}).click();
 await expect(editor.getByText("1 other scheduled meeting(s) overlap this time.",{exact:false})).toBeVisible();
 await expect(editor.getByRole("button",{name:"Save meeting"})).toBeDisabled();
 await editor.getByLabel("Save anyway").check();
 await editor.getByRole("button",{name:"Save meeting"}).click();
 await expect(table.getByRole("link",{name:"Join meeting for Earlier cycle meeting"})).toHaveAttribute("href","https://meet.google.com/abc-defg-hij");
 await expect(table.getByRole("img",{name:"Lead temperature: Hot"})).toBeVisible();
 await page.getByRole("button",{name:"Calendar",exact:true}).click();
 await expect(page.getByRole("button",{name:"2026-11-20: 1 meetings"})).toBeVisible();
 await page.getByRole("button",{name:"Actions for Earlier cycle meeting"}).click();
 await editor.getByLabel("Meeting outcome").selectOption("NO_SHOW");
 await editor.getByLabel("Follow-up date").fill("2026-11-21");
 await editor.getByLabel("Meeting notes").fill("Client did not attend");
 await editor.getByRole("button",{name:"Save meeting"}).click();
 await expect(table.locator("tbody tr")).toHaveCount(0);
 expect(status).toBe("FOLLOW_UP");
 await page.getByRole("button",{name:"History",exact:true}).click();
 const history=page.getByRole("table",{name:"Meeting history register"});
 await expect(history.getByText("Client did not attend",{exact:true})).toHaveCount(2);
 await expect(history.getByText("Reschedule meeting")).toBeVisible();
});
