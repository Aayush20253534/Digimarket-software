import {expect,test,type Page} from "@playwright/test";

async function mockWorkspace(page:Page,role="FOUNDER"){
 const requests:{path:string;from:string|null;to:string|null}[]=[];
 let leads=Array.from({length:20},(_,i)=>({id:"00000000-0000-4000-8000-"+String(i+1).padStart(12,"0"),
  businessName:"Business "+(i+1),contactName:"Contact "+(i+1),phone:"900000"+String(i).padStart(4,"0"),
  status:"PENDING",source:"COLD_CALL",version:1,createdAt:"2026-11-10T10:00:00Z",updatedAt:"2026-11-10T10:00:00Z",
  businessType:null,location:null,googleMapsUrl:null,stageNote:null,meetingAt:null,assignedToId:null,assignee:null}));
 const deleted:string[][]=[];
 const permissions=["leads.read","clients.read","tasks.read","finance.entry.read.own","finance.read.all","reports.business.read"];
 const totals={currency:"INR",postedIncome:"1000",postedExpense:"200",postedSalaryExpense:"50",postedExpenseIncludingSalary:"250",
  agencyOperatingNet:"750",postedNet:"650",pendingIncome:"0",pendingExpense:"0",groups:[],clientAdSpend:{posted:"100",pending:"0",count:1}};
 await page.clock.setFixedTime(new Date("2026-11-17T12:00:00Z"));
 await page.route("**/api/v1/**",async route=>{
  const url=new URL(route.request().url()),path=url.pathname.slice("/api/v1".length);
  requests.push({path,from:url.searchParams.get("from"),to:url.searchParams.get("to")});
  let data:unknown=[];
  if(path==="/auth/refresh")data={next:"SIGNED_IN",accessToken:"test",user:{id:"user",organizationId:"org",loginId:"test",displayName:"Test Founder",status:"ACTIVE",mustChangePassword:false}};
  else if(path==="/me")data={userId:"user",organizationId:"org",roles:[role],permissions};
  else if(path==="/notifications")data={items:[],unreadCount:0};
  else if(path==="/notifications/push-key")data={publicKey:null};
  else if(path==="/messages/users")data={items:[]};
  else if(path==="/leads"){
   const start=url.searchParams.has("cursor")?10:0;
   data={items:leads.slice(start,start+10),total:leads.length,nextCursor:start+10<leads.length?leads[start+9].id:null};
  }else if(path==="/leads/metrics")data={total:leads.length,pending:leads.length,yetToCall:0,meetingProcess:0,decisionPending:0,agreementPending:0,followUp:0,approved:0,rejected:0,converted:0,conversionRatePercent:0};
  else if(path==="/leads/bulk-delete"){
   const rows=route.request().postDataJSON().leads as {id:string;version:number}[];
   deleted.push(rows.map(row=>row.id));leads=leads.filter(lead=>!rows.some(row=>row.id===lead.id));
   data={deletedCount:rows.length,ids:rows.map(row=>row.id)};
  }else if(path==="/finance/register")data={items:[],total:0,page:1,limit:25};
  else if(path==="/finance/summary")data=totals;
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

test("finance overview cards keep details on separate pages and preserve the work cycle",async({page})=>{
 const {requests}=await mockWorkspace(page);
 await page.goto("/app/finance");
 await expect(page.getByLabel("Work cycle from")).toHaveValue("2026-10-22");
 await expect(page.getByLabel("Work cycle through")).toHaveValue("2026-11-21");
 await expect(page.getByText("Net operating money",{exact:true})).toBeVisible();
 await expect(page.getByRole("navigation",{name:"Finance categories"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"New income or expense"})).toHaveCount(0);
 await expect(page.getByRole("region",{name:"Financial register",exact:true})).toHaveCount(0);
 expect(requests.some(row=>row.path==="/finance/register"||row.path==="/finance/meta-ads-distribution")).toBe(false);
 await page.getByRole("button",{name:"Next cycle",exact:true}).click();
 await page.getByRole("link",{name:/Meta Ads Self and client/}).click();
 await expect(page).toHaveURL(/finance\/ads/);
 await expect(page.getByLabel("Work cycle from")).toHaveValue("2026-11-22");
 for(const path of ["/finance/register","/finance/meta-ads-distribution"])
  await expect.poll(()=>requests.some(row=>row.path===path&&row.from==="2026-11-22"&&row.to==="2026-12-21")).toBe(true);
 await page.getByRole("link",{name:"← Finance overview"}).click();
 await page.getByRole("link",{name:"New entry / register"}).click();
 await expect(page.getByLabel("Work cycle from")).toHaveValue("2026-11-22");
 await expect.poll(()=>requests.some(row=>row.path==="/salary/summary"&&row.from==="2026-11-22")).toBe(true);
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
