import {expect,test,type Page} from "@playwright/test";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";

/*
 * This is deliberately opt-in: the existing workspace integration spec rotates
 * the isolated bootstrap admin password. Capture only AFTER that suite ran.
 * Never point this at a production account or record screenshots of real clients.
 */
const enabled=process.env.UI_BASELINE_CAPTURE==="1";
const OUTPUT=path.resolve(process.cwd(),"artifacts/ui-v2-phase0");
const routes=[
 {slug:"overview",href:"/app/dashboard"},
 {slug:"leads",href:"/app/leads"},
 {slug:"follow-ups",href:"/app/follow-ups"},
 {slug:"meetings",href:"/app/meetings"},
 {slug:"clients",href:"/app/clients"},
 {slug:"deliveries",href:"/app/deliveries"},
 {slug:"tasks",href:"/app/tasks"},
 {slug:"task-history",href:"/app/task-history"},
 {slug:"finance",href:"/app/finance"},
 {slug:"quotations",href:"/app/quotations"},
 {slug:"agreements",href:"/app/agreements"},
 {slug:"reports",href:"/app/reports"},
 {slug:"messages",href:"/app/messages"},
 {slug:"approvals",href:"/app/approvals"},
 {slug:"settings",href:"/app/settings"},
 {slug:"profile",href:"/app/profile"},
] as const;
const responsive=new Set(["overview","leads","clients","deliveries","tasks","finance","reports","messages"]);
type Palette="dark"|"light";
type Captured={role:"admin";route:string;theme:Palette;viewport:{width:number;height:number};
  documentWidth:number;viewportWidth:number;scrollbarColor:string;sidebarLinks:string[];
  screenshot:string};

async function capture(page:Page,entry:{slug:string;href:string},theme:Palette,
  viewport:{width:number;height:number},captures:Captured[]){
 await page.setViewportSize(viewport);
 await page.goto(entry.href);
 const workspace=page.locator(".aw-workspace");
 // Capturing dozens of full document navigations can expire isolated E2E
 // sessions. Recover a login redirect once; do not ignore real route errors.
 try{
  await workspace.waitFor({state:"visible",timeout:9000});
 }catch{
  const currentPath=new URL(page.url()).pathname;
  if(currentPath==="/login"){
   const pwd=process.env.E2E_ADMIN_UPDATED_PASSWORD;
   if(!pwd)throw new Error("Cannot recover isolated E2E session without admin password");
   await page.getByLabel("Login ID").fill(process.env.BOOTSTRAP_ADMIN_LOGIN??"admin-e2e");
   await page.getByLabel("Password",{exact:true}).fill(pwd);
   await page.getByRole("button",{name:"Sign in",exact:true}).click();
  }
  // One retry also handles a transient hydration/session refresh race.
  await page.goto(entry.href);
 }
 await expect(workspace,"Protected workspace on "+entry.href+" (actual: "+page.url()+")")
  .toBeVisible({timeout:20000});
 await expect(workspace).toHaveAttribute("data-theme",theme,{timeout:15000});
 // Font readiness and transitions matter for stable screenshot review. No
 // networkidle wait: the workspace may keep notification connections alive.
 await page.evaluate(()=>document.fonts.ready);
 const metrics=await page.evaluate(()=>{
   const nav=document.querySelector('nav[aria-label="Workspace navigation"]');
   return{
     documentWidth:document.documentElement.scrollWidth,
     viewportWidth:document.documentElement.clientWidth,
     scrollbarColor:getComputedStyle(document.documentElement).scrollbarColor,
     sidebarLinks:Array.from(nav?.querySelectorAll("a")??[])
       .map(el=>el.textContent?.trim()??"").filter(Boolean),
   };
 });
 const screenshot=path.join(theme,viewport.width+"x"+viewport.height,entry.slug+".png");
 const destination=path.join(OUTPUT,screenshot);
 await mkdir(path.dirname(destination),{recursive:true});
 await page.screenshot({path:destination,animations:"disabled",fullPage:false,timeout:20000});
 captures.push({role:"admin",route:entry.href,theme,viewport,...metrics,screenshot:screenshot.replaceAll(path.sep,"/")});
 // Keep partial CI evidence when a later route fails. Never store credentials.
 await writeFile(path.join(OUTPUT,"admin-manifest.json"),JSON.stringify({
   kind:"UI v2 isolated browser capture",isolatedCiData:true,captures,
 },null,2),"utf8");
}

test("Phase 0 capture: existing admin navigation, two themes, and responsive surfaces",async({page})=>{
 test.skip(!enabled,"Baseline only runs after the isolated password-rotation integration suite.");
 test.setTimeout(600000);
 page.setDefaultTimeout(20000);
 const login=process.env.BOOTSTRAP_ADMIN_LOGIN??"admin-e2e";
 const password=process.env.E2E_ADMIN_UPDATED_PASSWORD;
 if(!password)throw new Error("Phase 0 capture requires isolated E2E_ADMIN_UPDATED_PASSWORD.");
 await page.setViewportSize({width:1440,height:900});
 await page.goto("/login");
 await page.getByLabel("Login ID").fill(login);
 await page.getByLabel("Password",{exact:true}).fill(password);
 await page.getByRole("button",{name:"Sign in",exact:true}).click();
 await expect(page.locator(".aw-workspace")).toBeVisible({timeout:30000});
 // Approved Phase 1 behaviour: dark is the default without a stored choice.
 await page.evaluate(()=>localStorage.removeItem("aw-workspace-theme"));
 await page.reload();
 await expect(page.locator(".aw-workspace")).toHaveAttribute("data-theme","dark");
 await expect(page.locator("html")).toHaveAttribute("data-aw-theme","dark");
 const darkRoot=await page.evaluate(()=>({
   background:getComputedStyle(document.documentElement).backgroundColor,
   bodyBackground:getComputedStyle(document.body).backgroundColor,
   scrollbar:getComputedStyle(document.documentElement).scrollbarColor,
 }));
 expect(darkRoot.background).toBe("rgb(11, 11, 12)");
 expect(darkRoot.bodyBackground).toBe("rgb(11, 11, 12)");
 expect(darkRoot.scrollbar).not.toBe("auto");
 const captures:Captured[]=[];
 // Verify the existing theme control and browser storage behavior without
 // modifying application code. Phase 1 is allowed to replace its CSS.
 await page.evaluate(()=>localStorage.setItem("aw-workspace-theme","dark"));
 await page.reload();
 await expect(page.locator(".aw-workspace")).toHaveAttribute("data-theme","dark");
 await page.getByRole("button",{name:"Switch to light theme"}).click();
 await expect(page.locator(".aw-workspace")).toHaveAttribute("data-theme","light");
 await expect(page.locator("html")).toHaveAttribute("data-aw-theme","light");
 const lightRoot=await page.evaluate(()=>({
   background:getComputedStyle(document.documentElement).backgroundColor,
   bodyBackground:getComputedStyle(document.body).backgroundColor,
   scrollbar:getComputedStyle(document.documentElement).scrollbarColor,
 }));
 expect(lightRoot.background).toBe("rgb(246, 246, 247)");
 expect(lightRoot.bodyBackground).toBe("rgb(246, 246, 247)");
 expect(lightRoot.scrollbar).not.toBe("auto");
 expect(lightRoot.scrollbar).not.toBe(darkRoot.scrollbar);
 expect(await page.evaluate(()=>localStorage.getItem("aw-workspace-theme"))).toBe("light");
 await page.reload();
 await expect(page.locator(".aw-workspace")).toHaveAttribute("data-theme","light");
 await page.getByRole("button",{name:"Switch to dark theme"}).click();
 await expect(page.locator(".aw-workspace")).toHaveAttribute("data-theme","dark");

 // Diagnostic screenshots are best-effort, unlike the functional workflow
 // test immediately before this run. If a long sequence loses its isolated
 // browser session, retain evidence and record the exact incomplete route.
 // Alternate themes early so partial evidence includes BOTH appearances.
 const incomplete:{route:string;theme:Palette;viewport:string;reason:string}[]=[];
 let stopped=false;
 async function attempt(entry:{slug:string;href:string},theme:Palette,viewport:{width:number;height:number}){
  try{
   await page.evaluate(next=>window.localStorage.setItem("aw-workspace-theme",next),theme);
   await capture(page,entry,theme,viewport,captures);
   return true;
  }catch(e){
   incomplete.push({route:entry.href,theme,viewport:viewport.width+"x"+viewport.height,
    reason:e instanceof Error?e.message.slice(0,300):"Capture failed"});
   console.warn("UI screenshot capture incomplete:",entry.href,theme,viewport.width);
   return false;
  }
 }
 for(const entry of routes){
  for(const theme of ["dark","light"] as const){
   if(!await attempt(entry,theme,{width:1440,height:900})){stopped=true;break;}
   if(responsive.has(entry.slug)){
    if(!await attempt(entry,theme,{width:390,height:844})){stopped=true;break;}
   }
  }
  if(stopped)break;
 }
 if(!stopped){
  for(const entry of routes.filter(x=>["overview","leads","finance","reports"].includes(x.slug))){
   if(!await attempt(entry,"dark",{width:768,height:900}))break;
  }
 }
 await mkdir(OUTPUT,{recursive:true});
 await writeFile(path.join(OUTPUT,"admin-manifest.json"),JSON.stringify({
   kind:"pre-redesign Phase 0 baseline",role:"ADMIN",buildSha:process.env.GITHUB_SHA??"local",
   isolatedCiData:true,screenshots:captures.length,captures,incomplete,
 },null,2)+"\n","utf8");
 // The full workflow coverage is enforced by workspace.spec.ts. This test
 // enforces a usable cross-theme visual sample, not completion of all screenshots.
 expect(captures.length).toBeGreaterThanOrEqual(6);
});
