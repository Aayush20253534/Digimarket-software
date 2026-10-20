import {Prisma,type PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {AuthError,forbidden,invalid} from "../auth/errors";
import type {FounderCreate,FounderUpdate,CompanySettingsUpdate,BillingSettingsUpdate} from "@digimarket/contracts";
const requireGrant=(a:Principal,key:string)=>{if(!a.permissions.has(key))throw forbidden();};
const missing=()=>new AuthError(404,"NOT_FOUND","Company resource not found");
const conflict=()=>new AuthError(409,"VERSION_CONFLICT","Settings changed; reload before saving");
const duplicate=()=>new AuthError(409,"ALREADY_LINKED","This staff account already has a founder profile");
const serial={isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000};
const defaultBilling=(organizationId:string)=>({
 organizationId,invoicePrefix:"INV",defaultDueDays:14,paymentInstructions:null as string|null,version:1
});
async function retry<T>(cb:()=>Promise<T>):Promise<T>{
 for(let n=0;n<4;n++)try{return await cb();}
 catch(e){if((e as {code?:string}).code!=="P2034"||n===3)throw e;}throw conflict();
}
export class CompanyService{
 constructor(private readonly db:PrismaClient){}
 async founders(a:Principal){
  requireGrant(a,"founders.read");
  const canEdit=a.permissions.has("founders.edit");
  return this.db.founderProfile.findMany({where:{organizationId:a.organizationId,
    ...(canEdit?{}:{isActive:true})},orderBy:[{sortOrder:"asc"},{displayName:"asc"},{id:"asc"}],
    select:{id:true,displayName:true,title:true,responsibilities:true,sortOrder:true,
      version:true,isActive:true,userId:true,updatedAt:true}});
 }
 async eligibleStaff(a:Principal){
  requireGrant(a,"founders.edit");
  return this.db.user.findMany({where:{organizationId:a.organizationId,status:"ACTIVE"},
    orderBy:{displayName:"asc"},take:500,select:{id:true,displayName:true,loginId:true}});
 }
 private async checkUser(a:Principal,userId:string|null|undefined){
  if(!userId)return;
  const found=await this.db.user.findFirst({where:{organizationId:a.organizationId,id:userId,status:"ACTIVE"}});
  if(!found)throw missing();
 }
 async createFounder(a:Principal,input:FounderCreate){
  requireGrant(a,"founders.edit");
  await this.checkUser(a,input.userId);
  try{return await this.db.$transaction(async tx=>{
    const founder=await tx.founderProfile.create({data:{organizationId:a.organizationId,
      userId:input.userId??null,displayName:input.displayName,title:input.title,
      responsibilities:input.responsibilities,sortOrder:input.sortOrder}});
    await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
      action:"founders.profile_created",entityType:"FounderProfile",entityId:founder.id,
      afterRedacted:{hasLinkedUser:!!founder.userId}}});
    return founder;
  });}catch(e){if((e as {code?:string}).code==="P2002")throw duplicate();throw e;}
 }
 async updateFounder(a:Principal,id:string,input:FounderUpdate){
  requireGrant(a,"founders.edit");
  await this.checkUser(a,input.userId);
  try{return await this.db.$transaction(async tx=>{
    const changed=await tx.founderProfile.updateMany({where:{id,organizationId:a.organizationId,
      version:input.version},data:{displayName:input.displayName,title:input.title,
      responsibilities:input.responsibilities,sortOrder:input.sortOrder,
      userId:input.userId??null,isActive:input.isActive,version:{increment:1}}});
    if(changed.count!==1){
      if(!await tx.founderProfile.count({where:{id,organizationId:a.organizationId}}))throw missing();
      throw conflict();
    }
    await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
      action:"founders.profile_updated",entityType:"FounderProfile",entityId:id,
      afterRedacted:{version:input.version+1,active:input.isActive,linked:!!input.userId}}});
    return tx.founderProfile.findUniqueOrThrow({where:{id}});
  });}catch(e){if((e as {code?:string}).code==="P2002")throw duplicate();throw e;}
 }
 async settings(a:Principal){
  requireGrant(a,"organization.settings.manage");
  const [org,billing,categories,policies,schedules]=await Promise.all([
    this.db.organization.findUnique({where:{id:a.organizationId},select:{
      id:true,name:true,timezone:true,defaultCurrency:true,settingsVersion:true,createdAt:true}}),
    this.db.organizationBillingSettings.findUnique({where:{organizationId:a.organizationId}}),
    this.db.financialCategory.groupBy({by:["kind"],where:{organizationId:a.organizationId,active:true},
      _count:{_all:true}}),
    this.db.approvalPolicy.findMany({where:{organizationId:a.organizationId},
      select:{category:true,name:true,active:true,approverRoleKeys:true},orderBy:{category:"asc"}}),
    this.db.billingSchedule.count({where:{organizationId:a.organizationId,enabled:true}}),
  ]);
  if(!org)throw missing();
  return {organization:org,billing:billing??defaultBilling(a.organizationId),
    financeCategories:categories.map(c=>({kind:c.kind,activeCount:c._count._all})),
    approvalPolicies:policies,activeBillingSchedules:schedules};
 }
 async billingDefaults(a:Principal){
  requireGrant(a,"invoices.draft");
  const settings=await this.db.organizationBillingSettings.findUnique({
    where:{organizationId:a.organizationId},
    select:{invoicePrefix:true,defaultDueDays:true,paymentInstructions:true}});
  return settings??{invoicePrefix:"INV",defaultDueDays:14,paymentInstructions:null};
 }
 async updateCompany(a:Principal,input:CompanySettingsUpdate){
  requireGrant(a,"organization.settings.manage");
  try{new Intl.DateTimeFormat("en",{timeZone:input.timezone});}
  catch{throw invalid("Use a valid IANA timezone, e.g. Asia/Kolkata");}
  return this.db.$transaction(async tx=>{
    const changed=await tx.organization.updateMany({where:{id:a.organizationId,
      settingsVersion:input.version},data:{name:input.name,timezone:input.timezone,
        settingsVersion:{increment:1}}});
    if(changed.count!==1)throw conflict();
    await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
      action:"organization.settings_updated",entityType:"Organization",entityId:a.organizationId,
      afterRedacted:{version:input.version+1,nameUpdated:true,timezoneUpdated:true}}});
    await tx.outboxEvent.create({data:{organizationId:a.organizationId,
      eventKey:"company.settings."+a.organizationId+"."+(input.version+1),
      kind:"organization.settings_updated",aggregateType:"Organization",
      aggregateId:a.organizationId,payloadMinimal:{version:input.version+1}}});
    return tx.organization.findUniqueOrThrow({where:{id:a.organizationId},
      select:{id:true,name:true,timezone:true,defaultCurrency:true,settingsVersion:true}});
  });
 }
 async updateBilling(a:Principal,input:BillingSettingsUpdate){
  requireGrant(a,"organization.settings.manage");
  return retry(()=>this.db.$transaction(async tx=>{
    const stored=await tx.organizationBillingSettings.findUnique({where:{organizationId:a.organizationId}});
    if((stored?.version??1)!==input.version)throw conflict();
    const data={invoicePrefix:input.invoicePrefix,defaultDueDays:input.defaultDueDays,
      paymentInstructions:input.paymentInstructions?.trim()||null};
    let billing;
    if(stored){
      const changed=await tx.organizationBillingSettings.updateMany({where:{
        organizationId:a.organizationId,version:input.version},
        data:{...data,version:{increment:1}}});
      if(changed.count!==1)throw conflict();
      billing=await tx.organizationBillingSettings.findUniqueOrThrow({where:{organizationId:a.organizationId}});
    }else{
      billing=await tx.organizationBillingSettings.create({data:{
        organizationId:a.organizationId,...data,version:2}});
    }
    await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
      action:"organization.billing_settings_updated",entityType:"OrganizationBillingSettings",
      entityId:a.organizationId,afterRedacted:{
        invoicePrefix:billing.invoicePrefix,defaultDueDays:billing.defaultDueDays,
        version:billing.version,hasPaymentInstructions:!!billing.paymentInstructions}}});
    await tx.outboxEvent.create({data:{organizationId:a.organizationId,
      eventKey:"billing.settings."+a.organizationId+"."+billing.version,
      kind:"organization.billing_settings_updated",aggregateType:"Organization",
      aggregateId:a.organizationId,payloadMinimal:{version:billing.version}}});
    return billing;
  },serial));
 }
}
