import "dotenv/config";
import assert from "node:assert/strict";
import {createDatabaseClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {CompanyService} from "./service";
import {BillingService} from "../billing/service";
import {companySettingsSchema,billingSettingsSchema,founderCreateSchema} from "@digimarket/contracts";
if(process.env.NODE_ENV!=="test"||!process.env.DATABASE_URL?.includes("digimarket_ci"))
 throw new Error("Module 15 integration requires disposable digimarket_ci PostgreSQL");
const db=createDatabaseClient(),company=new CompanyService(db),billing=new BillingService(db);
const principal=(userId:string,organizationId:string,permissions:string[],roles:string[]=["EMPLOYEE"]):Principal=>({
 userId,organizationId,permissions:new Set(permissions),roles,sessionId:"company-ci",
});
const adminKeys=["founders.read","founders.edit","organization.settings.manage",
 "invoices.read","invoices.draft","invoices.issue"];
const failure=(status:number)=>(e:{status?:number})=>e.status===status;
try{
 const org=await db.organization.create({data:{name:"Settings CI"}});
 const other=await db.organization.create({data:{name:"Foreign Settings CI"}});
 const [adminUser,staffUser,otherUser]=await Promise.all([
  db.user.create({data:{organizationId:org.id,loginId:"company-admin",displayName:"Admin",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:org.id,loginId:"company-worker",displayName:"Campaign Operator",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:other.id,loginId:"company-outsider",displayName:"Outside",status:"ACTIVE"}}),
 ]);
 const admin=principal(adminUser.id,org.id,adminKeys,["ADMIN"]);
 const employee=principal(staffUser.id,org.id,["founders.read"],["EMPLOYEE"]);
 const outsider=principal(otherUser.id,other.id,adminKeys,["ADMIN"]);
 const noAccess=principal(staffUser.id,org.id,[],["EMPLOYEE"]);
 const baseline=await company.settings(admin);
 assert.equal(baseline.organization.settingsVersion,1);
 assert.equal(baseline.organization.defaultCurrency,"INR");
 assert.equal(baseline.billing.invoicePrefix,"INV");
 assert.equal(baseline.billing.defaultDueDays,14);
 assert.equal((await company.billingDefaults(admin)).invoicePrefix,"INV");
 await assert.rejects(()=>company.billingDefaults(employee),failure(403));
 assert.equal((await company.founders(employee)).length,0);
 await assert.rejects(()=>company.founders(noAccess),failure(403));
 await assert.rejects(()=>company.settings(employee),failure(403));
 assert.equal((await company.settings(outsider)).organization.id,other.id);
 assert.equal(founderCreateSchema.safeParse({
   displayName:"Al",title:"Leadership",responsibilities:"Campaign strategy",sortOrder:0,
   role:"SUPER_ADMIN",
 }).success,false);
 await assert.rejects(()=>company.createFounder(admin,{displayName:"Foreign",
  title:"Growth",responsibilities:"Manage campaigns",userId:otherUser.id,sortOrder:0}),failure(404));
 const record=await company.createFounder(admin,{displayName:"Creative Lead",title:"Chief Marketing Officer",
  responsibilities:"Creative direction and new leads",userId:staffUser.id,sortOrder:1});
 assert.equal(record.version,1);
 assert.equal((await company.founders(employee)).length,1);
 assert.equal((await db.userRole.count({where:{userId:staffUser.id}})),0);
 assert.equal((await db.user.findUniqueOrThrow({where:{id:staffUser.id}})).status,"ACTIVE");
 await assert.rejects(()=>company.createFounder(admin,{displayName:"Second",
  title:"Finance Chief",responsibilities:"Finance and operations",userId:staffUser.id,sortOrder:2}),failure(409));
 await assert.rejects(()=>company.updateFounder(outsider,record.id,{
  version:1,displayName:"Wrong",title:"External",responsibilities:"Do nothing",
  sortOrder:0,userId:null,isActive:true}),failure(404));
 const updated=await company.updateFounder(admin,record.id,{
  version:1,displayName:"Creative Lead",title:"Performance & Growth",
  responsibilities:"Paid media, leads, content production",sortOrder:0,
  userId:staffUser.id,isActive:false});
 assert.equal(updated.version,2);assert.equal(updated.isActive,false);
 assert.equal((await company.founders(employee)).length,0);
 assert.equal((await company.founders(admin)).length,1);
 await assert.rejects(()=>company.updateFounder(admin,record.id,{
  version:1,displayName:"Stale",title:"Leadership",responsibilities:"Cannot overwrite",
  sortOrder:0,userId:staffUser.id,isActive:true}),failure(409));
 await company.updateFounder(admin,record.id,{
  version:2,displayName:"Creative Lead",title:"Performance & Growth",
  responsibilities:"Paid media, leads, content production",sortOrder:0,
  userId:staffUser.id,isActive:true});
 assert.equal((await company.founders(employee)).length,1);
 assert.equal((await db.userRole.count({where:{userId:staffUser.id}})),0);
 assert.equal(companySettingsSchema.safeParse({version:1,name:"Company",timezone:"Asia/Kolkata",defaultCurrency:"USD"}).success,false);
 await assert.rejects(()=>company.updateCompany(admin,{version:1,name:"Settings CI",
  timezone:"Mars/Olympus"}),failure(422));
 const renamed=await company.updateCompany(admin,{version:1,name:"Agency Partnership",
  timezone:"Asia/Kathmandu"});
 assert.equal(renamed.settingsVersion,2);
 assert.equal(renamed.defaultCurrency,"INR");
 await assert.rejects(()=>company.updateCompany(admin,{version:1,name:"Stale Agency",
  timezone:"Asia/Kolkata"}),failure(409));
 await assert.rejects(()=>company.updateCompany(employee,{version:2,name:"Employee Agency",
  timezone:"UTC"}),failure(403));
 assert.equal(billingSettingsSchema.safeParse({version:1,invoicePrefix:"inv",defaultDueDays:14,
  paymentInstructions:null}).success,false);
 const config=await company.updateBilling(admin,{version:1,invoicePrefix:"AW",defaultDueDays:21,
  paymentInstructions:"  Pay using the invoice reference  "});
 assert.equal(config.version,2);
 assert.equal(config.invoicePrefix,"AW");
 assert.equal(config.paymentInstructions,"Pay using the invoice reference");
 assert.equal((await company.billingDefaults(admin)).defaultDueDays,21);
 await assert.rejects(()=>company.updateBilling(admin,{version:1,invoicePrefix:"OLD",
  defaultDueDays:0,paymentInstructions:null}),failure(409));
 await assert.rejects(()=>company.updateBilling(employee,{version:2,invoicePrefix:"INTR",
  defaultDueDays:14,paymentInstructions:null}),failure(403));
 const client=await db.client.create({data:{organizationId:org.id,createdById:adminUser.id,businessName:"Test Cafe"}});
 const invoiceInput={clientId:client.id,sellerName:"Agency Partnership",sellerAddress:"Prayagraj",
  buyerName:"Test Cafe",dueOn:"2026-11-20",
  lines:[{description:"Performance ads management",quantity:"1",unitPrice:"100",taxRate:"0"}]};
 const invoice=await billing.create(admin,invoiceInput);
 const issued=await billing.issue(admin,invoice.id,invoice.version);
 assert.match(issued.number??"",/^AW-\d{4}-000001$/);
 assert.equal((await billing.detail(admin,invoice.id)).number,issued.number);
 const after=await company.updateBilling(admin,{version:2,invoicePrefix:"NEW",defaultDueDays:30,
  paymentInstructions:null});
 assert.equal(after.version,3);
 const second=await billing.create(admin,invoiceInput);
 const newIssued=await billing.issue(admin,second.id,second.version);
 assert.match(newIssued.number??"",/^NEW-\d{4}-000002$/);
 assert.equal((await billing.detail(admin,invoice.id)).number,issued.number);
 assert.equal((await db.invoiceCounter.findUniqueOrThrow({where:{organizationId:org.id}})).nextNumber,2);
 const overview=await company.settings(admin);
 assert.equal(overview.organization.name,"Agency Partnership");
 assert.equal(overview.billing.invoicePrefix,"NEW");
 assert.equal(overview.billing.defaultDueDays,30);
 assert.equal((await company.founders(outsider)).length,0);
 assert.ok((await db.auditLog.count({where:{organizationId:org.id,entityType:"FounderProfile"}}))>=3);
 assert.ok((await db.auditLog.count({where:{organizationId:org.id,entityType:"OrganizationBillingSettings"}}))>=2);
 assert.equal((await db.outboxEvent.count({where:{organizationId:org.id,kind:"organization.billing_settings_updated"}})),2);
 console.info("Module 15 PASS: founder ACL and non-escalation, active display, duplicate user links, tenant isolation, settings CAS, timezone validation, billing prefixes, immutable invoice numbers, audit and outbox.");
}finally{await db.$disconnect();}
