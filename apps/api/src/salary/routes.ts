import type {Express,Request,Response,NextFunction} from "express";
import {Prisma} from "@digimarket/db";
import {z} from "zod";
import type {AuthService,Principal} from "../auth/service";
import {AuthError,unauthorized,forbidden} from "../auth/errors";
import {paise,exactSplit,rupeePattern} from "./math";
import {founderLedgerBalances} from "../finance/founder-balance";

const amount=z.string().regex(rupeePattern).refine(v=>paise(v)>0n,"Amount must be positive");
// Finance is authoritative: do not independently seed salary wallets.
const zeroOpening=z.enum(["0","0.00"]).optional();
const isoDay=z.iso.date();
const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const accountInput=z.strictObject({
 founderUserId:z.uuid(),name:z.string().trim().min(2).max(100),
 openingBalance:zeroOpening
});
const paymentInput=z.strictObject({
 recipientUserId:z.uuid(),idempotencyKey:z.uuid(),amount,salaryMonth:month,
 paidOn:isoDay,method:z.enum(["CASH","UPI","BANK_TRANSFER","CARD","OTHER"]),
 reference:z.string().trim().max(160).optional(),note:z.string().trim().max(500).optional(),
 confirmedPaid:z.literal(true),
 allocations:z.array(z.strictObject({accountId:z.uuid(),amount})).min(1).max(20)
});
const periodSchema=z.strictObject({from:isoDay.optional(),to:isoDay.optional()});
const voidInput=z.strictObject({reason:z.string().trim().min(4).max(500)});
function parsed<T>(schema:z.ZodType<T>,value:unknown):T{
 const result=schema.safeParse(value);
 if(!result.success)throw new AuthError(422,"VALIDATION_ERROR",
  "Invalid salary fields: "+result.error.issues.map(i=>i.path.join(".")||"request").slice(0,5).join(", "));
 return result.data;
}
const noFound=()=>new AuthError(404,"NOT_FOUND","Salary record not found");
const needFounder=(actor:Principal)=>{
 if(!actor.roles.includes("FOUNDER"))throw forbidden();
};
const date=(value:string)=>new Date(value+"T00:00:00.000Z");
const dec=(value:string)=>new Prisma.Decimal(value);
const own=(res:Response)=>res.locals.principal as Principal;
const days=(input:{from?:string;to?:string})=>{
 if(input.from&&input.to&&input.from>input.to)throw new AuthError(422,"VALIDATION_ERROR","End date precedes start");
 return input.from||input.to ?{
  ...(input.from?{gte:date(input.from)}:{}),
  ...(input.to?{lte:date(input.to)}:{})
 }:undefined;
};

export function registerSalaryRoutes(app:Express,auth:AuthService){
 const db=auth.database;
 const root="/api/v1/salary";
 const authenticate=async(req:Request,res:Response,next:NextFunction)=>{
  try{
   const header=req.get("authorization");
   if(!header?.startsWith("Bearer "))throw unauthorized();
   res.locals.principal=await auth.authenticate(header.slice(7));
   next();
  }catch(e){next(e);}
 };

 app.get(root+"/people",authenticate,async(_req,res)=>{
  const a=own(res);needFounder(a);
  const people=await db.user.findMany({where:{organizationId:a.organizationId,status:"ACTIVE"},
   select:{id:true,displayName:true,loginId:true,roles:{select:{role:{select:{key:true}}}}},
   orderBy:{displayName:"asc"},take:1000});
  res.set("Cache-Control","no-store").json({data:people.map(u=>({
   id:u.id,displayName:u.displayName,loginId:u.loginId,
   isFounder:u.roles.some(r=>r.role.key==="FOUNDER")
  }))});
 });

 app.get(root+"/accounts",authenticate,async(_req,res)=>{
  const a=own(res);needFounder(a);
  const accounts=await db.salaryFundingAccount.findMany({where:{organizationId:a.organizationId},
   include:{founder:{select:{id:true,displayName:true}}},orderBy:[{createdAt:"asc"},{id:"asc"}]});
  const linked=await founderLedgerBalances(db,a.organizationId,accounts.map(x=>x.founderUserId));
  res.set("Cache-Control","no-store").json({data:accounts.map(row=>{
   const balance=linked.get(row.founderUserId);
   return {id:row.id,founderUserId:row.founderUserId,founderName:row.founder.displayName,
    name:row.name,openingBalance:"0.00",
    availableBalance:balance?.remaining.toFixed(4)??"0.0000",
    financeNetBeforeSalary:balance?.financeNetBeforeSalary.toFixed(4)??"0.0000",
    founderSalaryFunded:balance?.salaryFunded.toFixed(4)??"0.0000",
    sharedFinancePool:true,active:row.active,createdAt:row.createdAt};
  })});
 });

 app.post(root+"/accounts",authenticate,async(req,res)=>{
  const a=own(res);needFounder(a);
  const input=parsed(accountInput,req.body);
  const user=await db.user.findFirst({where:{id:input.founderUserId,
   organizationId:a.organizationId,status:"ACTIVE",
   roles:{some:{role:{key:"FOUNDER",organizationId:a.organizationId}}}},
   select:{id:true}});
  if(!user)throw new AuthError(422,"INVALID_FOUNDER","Funding accounts must belong to active founders");
  try{
   const created=await db.$transaction(async tx=>{
    const row=await tx.salaryFundingAccount.create({data:{
     organizationId:a.organizationId,founderUserId:input.founderUserId,createdById:a.userId,
     name:input.name,normalizedName:input.name.trim().replace(/\s+/g," ").toLowerCase(),
     openingBalance:dec("0"),availableBalance:dec("0")
    }});
    await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
     action:"salary.account_created",entityType:"SalaryFundingAccount",entityId:row.id,
     afterRedacted:{founderUserId:input.founderUserId}}});
    return row;
   });
   res.status(201).json({data:{id:created.id,name:created.name}});
  }catch(e){
   if((e as {code?:string}).code==="P2002")throw new AuthError(409,"ACCOUNT_EXISTS","Founder account name already exists");
   throw e;
  }
 });

 app.put(root+"/accounts/:id/status",authenticate,async(req,res)=>{
  const a=own(res);needFounder(a);const id=parsed(z.uuid(),req.params.id);
  const {active}=parsed(z.strictObject({active:z.boolean()}),req.body);
  const record=await db.salaryFundingAccount.updateMany({where:{id,organizationId:a.organizationId},data:{active}});
  if(!record.count)throw noFound();
  res.json({data:{id,active}});
 });

 // Historical manual credits remain auditable, but no longer create salary funds.
 app.post(root+"/accounts/:id/credits",authenticate,async(req)=>{
  const a=own(res);needFounder(a);parsed(z.uuid(),req.params.id);
  throw new AuthError(409,"FINANCE_LINKED","Salary funds now come from Finance. Add posted income to the founder's Finance entries.");
 });

 app.get(root+"/credits",authenticate,async(_req,res)=>{
  const a=own(res);needFounder(a);
  const rows=await db.salaryFundingCredit.findMany({where:{organizationId:a.organizationId},
   orderBy:[{createdAt:"desc"},{id:"desc"}],take:300,
   include:{account:{select:{name:true,founder:{select:{displayName:true}}}},recorder:{select:{displayName:true}}}});
  res.set("Cache-Control","no-store").json({data:rows.map(c=>({
   id:c.id,amount:c.amount.toFixed(2),date:c.recordedOn.toISOString().slice(0,10),
   accountName:c.account.name,founderName:c.account.founder.displayName,
   recordedBy:c.recorder.displayName,description:c.description
  }))});
 });

 app.get(root+"/payments",authenticate,async(req,res)=>{
  const a=own(res),founder=a.roles.includes("FOUNDER");
  const period=parsed(periodSchema,req.query);
  const rows=await db.salaryPayment.findMany({where:{
   organizationId:a.organizationId,...(founder?{}:{recipientUserId:a.userId}),
   ...(days(period)?{paidOn:days(period)}:{})
  },orderBy:[{paidOn:"desc"},{createdAt:"desc"},{id:"desc"}],take:400,
   include:{recipient:{select:{displayName:true,loginId:true}},
    recorder:{select:{displayName:true}},allocations:{
     include:{account:{select:{name:true,founder:{select:{displayName:true}}}}}
    }}});
  res.set("Cache-Control","no-store").json({data:rows.map(payment=>({
   id:payment.id,recipientUserId:payment.recipientUserId,
   recipientName:payment.recipient.displayName,
   recordedBy:payment.recorder.displayName,amount:payment.amount.toFixed(2),
   salaryMonth:payment.salaryMonth,paidOn:payment.paidOn.toISOString().slice(0,10),
   method:payment.method,status:payment.status,reference:payment.reference,note:payment.note,
   voidReason:founder?payment.voidReason:null,
   allocations:founder?payment.allocations.map(x=>({
    accountId:x.accountId,amount:x.amount.toFixed(2),
    accountName:x.account.name,founderName:x.account.founder.displayName
   })):[]
  }))});
 });

 app.post(root+"/payments",authenticate,async(req,res)=>{
  const a=own(res);needFounder(a);
  const input=parsed(paymentInput,req.body);
  if(!exactSplit(input.amount,input.allocations.map(x=>x.amount)))
   throw new AuthError(422,"FUNDING_MISMATCH","All funding shares must be positive and exactly equal the salary");
  if(new Set(input.allocations.map(x=>x.accountId)).size!==input.allocations.length)
   throw new AuthError(422,"DUPLICATE_ACCOUNT","Each funding account may be allocated only once");
  try{
   const result=await db.$transaction(async tx=>{
    const recipient=await tx.user.findFirst({where:{id:input.recipientUserId,
     organizationId:a.organizationId,status:"ACTIVE"},select:{id:true}});
    if(!recipient)throw new AuthError(422,"INVALID_RECIPIENT","Salary recipient must be an active organization member");
    const existing=await tx.salaryPayment.findUnique({where:{organizationId_idempotencyKey:{
     organizationId:a.organizationId,idempotencyKey:input.idempotencyKey}}});
    if(existing)throw new AuthError(409,"DUPLICATE_PAYMENT","Salary already recorded with this request identifier");
    const accountRows=await tx.salaryFundingAccount.findMany({where:{
     id:{in:input.allocations.map(x=>x.accountId)},organizationId:a.organizationId,active:true
    },select:{id:true,founderUserId:true}});
    if(accountRows.length!==input.allocations.length)
     throw new AuthError(422,"INVALID_FUNDING_SOURCE","Funding accounts must be active and belong to this organization");
    const accountFounder=new Map(accountRows.map(x=>[x.id,x.founderUserId]));
    const requestedByFounder=new Map<string,Prisma.Decimal>();
    for(const share of input.allocations){
     const founderId=accountFounder.get(share.accountId);
     if(!founderId)throw new AuthError(422,"INVALID_FUNDING_SOURCE","Funding source not found");
     requestedByFounder.set(founderId,(requestedByFounder.get(founderId)??dec("0")).plus(share.amount));
    }
    // All accounts belonging to a founder share their Finance Net posted pool.
    // Serializable isolation prevents concurrent salaries from spending it twice.
    const founderBalances=await founderLedgerBalances(tx,a.organizationId,[...requestedByFounder.keys()]);
    for(const [founderId,requested] of requestedByFounder){
     const remaining=founderBalances.get(founderId)?.remaining??dec("0");
     if(remaining.lessThan(requested))throw new AuthError(422,"INSUFFICIENT_FINANCE_BALANCE",
      "Founder's remaining Finance Net posted is insufficient for this salary allocation");
    }
    const payment=await tx.salaryPayment.create({data:{
     organizationId:a.organizationId,recipientUserId:input.recipientUserId,createdById:a.userId,
     idempotencyKey:input.idempotencyKey,amount:dec(input.amount),
     salaryMonth:input.salaryMonth,paidOn:date(input.paidOn),method:input.method,
     reference:input.reference||null,note:input.note||null,
     allocations:{create:input.allocations.map(x=>({accountId:x.accountId,amount:dec(x.amount)}))}
    }});
    await tx.notification.create({data:{
     organizationId:a.organizationId,recipientId:input.recipientUserId,
     dedupeKey:"salary.payment."+payment.id,kind:"SALARY_PAYMENT",
     title:"Salary payment recorded",
     body:"A salary payment for "+input.salaryMonth+" was recorded. Review it in My Salary.",
     href:"/app/salary"
    }});
    await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
     action:"salary.payment_recorded",entityType:"SalaryPayment",entityId:payment.id,
     afterRedacted:{recipientUserId:input.recipientUserId,amount:input.amount,
      founderAccountIds:input.allocations.map(x=>x.accountId)}}});
    return payment;
   },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000});
   res.status(201).json({data:{id:result.id,status:result.status}});
  }catch(e){
   if((e as {code?:string}).code==="P2002")throw new AuthError(409,"DUPLICATE_PAYMENT","Salary payment already recorded");
   if((e as {code?:string}).code==="P2034")throw new AuthError(409,"CONCURRENT_UPDATE","Account changed during salary payment. Refresh and retry.");
   throw e;
  }
 });

 app.post(root+"/payments/:id/void",authenticate,async(req,res)=>{
  const a=own(res);needFounder(a);
  const id=parsed(z.uuid(),req.params.id),input=parsed(voidInput,req.body);
  const result=await db.$transaction(async tx=>{
   const payment=await tx.salaryPayment.findFirst({where:{id,organizationId:a.organizationId},
    include:{allocations:true}});
   if(!payment)throw noFound();
   const changed=await tx.salaryPayment.updateMany({where:{id,organizationId:a.organizationId,status:"PAID"},
    data:{status:"VOID",voidedAt:new Date(),voidedById:a.userId,voidReason:input.reason}});
   if(changed.count!==1)throw new AuthError(409,"ALREADY_VOID","Payment was already voided");
   // Voided allocations stop reducing the derived Finance balance automatically.
   await tx.notification.create({data:{
    organizationId:a.organizationId,recipientId:payment.recipientUserId,
    dedupeKey:"salary.void."+id,kind:"SALARY_PAYMENT",
    title:"Salary record reversed",
    body:"A recorded salary payment was voided. Review your salary history.",
    href:"/app/salary"
   }});
   await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
    action:"salary.payment_voided",entityType:"SalaryPayment",entityId:id,
    afterRedacted:{reason:input.reason}}});
   return {id,status:"VOID"};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000});
  res.json({data:result});
 });

 app.get(root+"/summary",authenticate,async(req,res)=>{
  const a=own(res);needFounder(a);
  const period=parsed(periodSchema,req.query),paidOn=days(period);
  const filter={organizationId:a.organizationId,status:"PAID" as const,
   ...(paidOn?{paidOn}:{})};
  const [totals,recipientGroups,allocationGroups,accounts,monthly,founders]=await Promise.all([
   db.salaryPayment.aggregate({where:filter,_sum:{amount:true},_count:{_all:true}}),
   db.salaryPayment.groupBy({by:["recipientUserId"],where:filter,_sum:{amount:true},_count:{_all:true}}),
   db.salaryFundingAllocation.groupBy({by:["accountId"],
    where:{payment:filter},_sum:{amount:true},_count:{_all:true}}),
   db.salaryFundingAccount.findMany({where:{organizationId:a.organizationId},
    select:{id:true,name:true,founderUserId:true,founder:{select:{displayName:true}},
     openingBalance:true,availableBalance:true,active:true},
    orderBy:{createdAt:"asc"}}),
   db.salaryPayment.groupBy({by:["paidOn"],where:filter,_sum:{amount:true},_count:{_all:true},
    orderBy:{paidOn:"asc"}}),
   db.user.findMany({where:{organizationId:a.organizationId,status:"ACTIVE",
    roles:{some:{role:{key:"FOUNDER",organizationId:a.organizationId}}}},
    select:{id:true,displayName:true}})
  ]);
  const names=recipientGroups.length?await db.user.findMany({where:{
   organizationId:a.organizationId,id:{in:recipientGroups.map(x=>x.recipientUserId)}},
   select:{id:true,displayName:true}
  }):[];
  const nameById=new Map(names.map(u=>[u.id,u.displayName]));
  const accountById=new Map(accounts.map(x=>[x.id,x]));
  const founderMap=new Map<string,{founderUserId:string;name:string;amount:Prisma.Decimal;count:number}>();
  const zero=new Prisma.Decimal(0);
  for(const x of allocationGroups){
   const account=accountById.get(x.accountId);if(!account)continue;
   const current=founderMap.get(account.founderUserId)??{
    founderUserId:account.founderUserId,name:account.founder.displayName,amount:zero,count:0};
   current.amount=current.amount.plus(x._sum.amount??0);current.count+=x._count._all;
   founderMap.set(account.founderUserId,current);
  }
  const monthMap=new Map<string,{amount:Prisma.Decimal,count:number}>();
  for(const group of monthly){
   const month=group.paidOn.toISOString().slice(0,7),current=monthMap.get(month)??{amount:zero,count:0};
   monthMap.set(month,{amount:current.amount.plus(group._sum.amount??0),count:current.count+group._count._all});
  }
  const linked=await founderLedgerBalances(db,a.organizationId,
   [...founders.map(x=>x.id),...accounts.map(x=>x.founderUserId)]);
  const summary={
   founderBalances:founders.map(x=>{
    const balance=linked.get(x.id);
    return {founderUserId:x.id,name:x.displayName,
     financeNetBeforeSalary:balance?.financeNetBeforeSalary.toFixed(4)??"0.0000",
     salaryFunded:balance?.salaryFunded.toFixed(4)??"0.0000",
     remaining:balance?.remaining.toFixed(4)??"0.0000"};
   }),
   currency:"INR",totalPaid:(totals._sum.amount??zero).toFixed(2),paymentCount:totals._count._all,
   founderFunding:Array.from(founderMap.values()).map(x=>({
    founderUserId:x.founderUserId,name:x.name,amount:x.amount.toFixed(2),count:x.count
   })).sort((x,y)=>y.amount.localeCompare(x.amount)),
   recipients:recipientGroups.map(x=>({
    userId:x.recipientUserId,name:nameById.get(x.recipientUserId)||"Former member",
    amount:(x._sum.amount??zero).toFixed(2),count:x._count._all
   })),
   monthly:Array.from(monthMap).map(([month,x])=>({month,amount:x.amount.toFixed(2),count:x.count})),
   accounts:accounts.map(x=>({
    id:x.id,founderUserId:x.founderUserId,founderName:x.founder.displayName,
    name:x.name,openingBalance:"0.00",
    availableBalance:linked.get(x.founderUserId)?.remaining.toFixed(4)??"0.0000",
    sharedFinancePool:true,active:x.active
   }))
  };
  res.set("Cache-Control","no-store").json({data:summary});
 });
}
