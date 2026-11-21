import {dateOnlyRange,type ReportingPeriod} from "@digimarket/contracts";
import {Prisma,type PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {AuthError,forbidden} from "../auth/errors";
import {financeLock,openPeriod,ensurePersonalMoneyAccount} from "./ledger-service";

const missing=()=>new AuthError(404,"NOT_FOUND","Internal settlement not found");
const founder=(actor:Principal)=>{
 if(!actor.roles.includes("FOUNDER")||!actor.permissions.has("finance.entry.read.own"))throw forbidden();
};
export type SettlementInput={
 recipientId:string;amount:string;occurredOn:string;
 method:"CASH"|"UPI"|"BANK_TRANSFER"|"CARD"|"OTHER";
 note?:string;idempotencyKey:string
};

/** One settlement creates two opposite personal clearing-account movements.
 * Agency income and expense totals remain unchanged. */
export class InternalSettlementService{
 async cycleBalance(actor:Principal,view:"mine"|"all",period:ReportingPeriod){
  if(view==="mine"){
   if(!actor.permissions.has("finance.entry.read.own"))throw forbidden();
  }else if(!actor.permissions.has("finance.read.all"))throw forbidden();
  const from=new Date(period.from+"T00:00:00.000Z"),to=new Date(period.to+"T00:00:00.000Z");
  const own=view==="mine"?Prisma.sql`AND a."ownerUserId"=${actor.userId}::uuid`:Prisma.empty;
  const [balance]=await this.db.$queryRaw<{opening:string;movement:string;remaining:string}[]>(Prisma.sql`
   WITH account_balances AS (
    SELECT a."id",
      (CASE WHEN a."openingOn"<${from} THEN a."openingBalance" ELSE 0 END
       + COALESCE(SUM(m."amount") FILTER(WHERE m."occurredOn"<${from}),0)) AS opening,
      (CASE WHEN a."openingOn"<=${to} THEN a."openingBalance" ELSE 0 END
       + COALESCE(SUM(m."amount"),0)) AS closing
    FROM "MoneyAccount" a LEFT JOIN "FinanceMoneyMovement" m
      ON m."moneyAccountId"=a."id" AND m."organizationId"=a."organizationId"
      AND m."occurredOn">=a."openingOn" AND m."occurredOn"<=${to}
    WHERE a."organizationId"=${actor.organizationId}::uuid AND a."openingOn"<=${to} ${own}
    GROUP BY a."id"
   ) SELECT COALESCE(SUM(opening),0)::text AS opening,
    COALESCE(SUM(closing-opening),0)::text AS movement,
    COALESCE(SUM(closing),0)::text AS remaining FROM account_balances`);
  return {from:period.from,to:period.to,view,currency:"INR",
   opening:new Prisma.Decimal(balance.opening).toFixed(4),
   movement:new Prisma.Decimal(balance.movement).toFixed(4),
   remaining:new Prisma.Decimal(balance.remaining).toFixed(4)};
 }

 constructor(private readonly db:PrismaClient){}
 async founders(actor:Principal){
  founder(actor);
  return this.db.user.findMany({
   where:{organizationId:actor.organizationId,status:"ACTIVE",id:{not:actor.userId},
    roles:{some:{role:{organizationId:actor.organizationId,key:"FOUNDER"}}}},
   select:{id:true,displayName:true,loginId:true},
   orderBy:[{displayName:"asc"},{id:"asc"}],take:1000
  });
 }
 async record(actor:Principal,input:SettlementInput){
  founder(actor);
  if(!actor.permissions.has("finance.entry.create"))throw forbidden();
  if(input.recipientId===actor.userId)
   throw new AuthError(422,"SELF_SETTLEMENT","Sender and recipient must be different founders");
  const amount=new Prisma.Decimal(input.amount);
  if(!amount.isFinite()||amount.lte(0))throw new AuthError(422,"INVALID_AMOUNT","Amount must be positive");
  const recipient=await this.db.user.findFirst({where:{
   id:input.recipientId,organizationId:actor.organizationId,status:"ACTIVE",
   roles:{some:{role:{key:"FOUNDER",organizationId:actor.organizationId}}}
  },select:{id:true}});
  if(!recipient)throw new AuthError(422,"INVALID_RECIPIENT","Select an active founder from your organization");
  try{
   const settlement=await this.db.$transaction(async tx=>{
    await financeLock(tx,actor.organizationId);
    await openPeriod(tx,actor.organizationId,input.occurredOn);
    await ensurePersonalMoneyAccount(tx,actor.organizationId,actor.userId);
    await ensurePersonalMoneyAccount(tx,actor.organizationId,input.recipientId);
    const row=await tx.internalSettlement.create({data:{
     organizationId:actor.organizationId,senderId:actor.userId,
     recipientId:input.recipientId,idempotencyKey:input.idempotencyKey,
     amount,occurredOn:new Date(input.occurredOn+"T00:00:00.000Z"),
     method:input.method,note:input.note?.trim()||null
    }});
    await tx.auditLog.create({data:{
     organizationId:actor.organizationId,actorId:actor.userId,
     action:"finance.internal_settlement_recorded",entityType:"InternalSettlement",entityId:row.id,
     afterRedacted:{senderId:actor.userId,recipientId:input.recipientId,amount:amount.toFixed(2)}
    }});
    return row;
   });
   return {id:settlement.id,status:"RECORDED" as const};
  }catch(e){
   if((e as {code?:string}).code==="P2002")throw new AuthError(409,"DUPLICATE_SETTLEMENT","This settlement has already been recorded");
   throw e;
  }
 }
 async void(actor:Principal,id:string,reason:string){
  founder(actor);
  if(!actor.permissions.has("finance.entry.create"))throw forbidden();
  return this.db.$transaction(async tx=>{
   await financeLock(tx,actor.organizationId);
   const row=await tx.internalSettlement.findFirst({where:{id,organizationId:actor.organizationId,senderId:actor.userId},
    select:{id:true,voidedAt:true,occurredOn:true}});
   if(!row)throw missing();
   if(row.voidedAt)throw new AuthError(409,"ALREADY_VOID","Settlement was already voided");
   await openPeriod(tx,actor.organizationId,row.occurredOn.toISOString().slice(0,10));
   const updated=await tx.internalSettlement.updateMany({
    where:{id,organizationId:actor.organizationId,senderId:actor.userId,voidedAt:null},
    data:{voidedAt:new Date(),voidedById:actor.userId,voidReason:reason.trim()}
   });
   if(updated.count!==1)throw new AuthError(409,"ALREADY_VOID","Settlement was already voided");
   await tx.auditLog.create({data:{organizationId:actor.organizationId,actorId:actor.userId,
    action:"finance.internal_settlement_voided",entityType:"InternalSettlement",entityId:id,
    afterRedacted:{reason:reason.trim()}}});
   return {id,status:"VOID" as const};
  });
 }
 /**
  * Agency-wide history, including voided records, paginated without truncation.
  * Each live settlement counts once as money transferred. Both account sides
  * appear in the ledger but their combined effect on company funds is zero.
  */
 async projectAll(actor:Principal,period:ReportingPeriod,page=1,limit=50){
  if(!actor.permissions.has("finance.read.all"))throw forbidden();
  const where:Prisma.InternalSettlementWhereInput={
   organizationId:actor.organizationId,occurredOn:dateOnlyRange(period)
  };
  const [rows,total,posted,voided]=await Promise.all([
   this.db.internalSettlement.findMany({
    where,
    include:{sender:{select:{displayName:true}},recipient:{select:{displayName:true}}},
    orderBy:[{occurredOn:"desc"},{createdAt:"desc"},{id:"desc"}],
    skip:(page-1)*limit,take:limit
   }),
   this.db.internalSettlement.count({where}),
   this.db.internalSettlement.aggregate({where:{...where,voidedAt:null},
    _sum:{amount:true},_count:{_all:true}}),
   this.db.internalSettlement.count({where:{...where,voidedAt:{not:null}}})
  ]);
  return {from:period.from,to:period.to,page,limit,total,
   postedCount:posted._count._all,voidedCount:voided,
   postedTotal:(posted._sum.amount??new Prisma.Decimal(0)).toFixed(4),
   items:rows.map(row=>({
    id:row.id,occurredOn:row.occurredOn.toISOString().slice(0,10),
    senderName:row.sender.displayName,recipientName:row.recipient.displayName,
    amount:row.amount.toFixed(4),method:row.method,
    status:row.voidedAt?"CANCELLED" as const:"POSTED" as const,
    note:row.note,voidReason:row.voidReason
   }))
  };
 }

 async projectMine(actor:Principal,take=200,period?:ReportingPeriod){
  founder(actor);
  const rows=await this.db.internalSettlement.findMany({
   where:{organizationId:actor.organizationId,...(period?{occurredOn:dateOnlyRange(period)}:{}),OR:[{senderId:actor.userId},{recipientId:actor.userId}]},
   include:{sender:{select:{displayName:true,loginId:true}},
    recipient:{select:{displayName:true,loginId:true}}},
   orderBy:[{createdAt:"desc"},{id:"desc"}],take
  });
  return rows.map(row=>{
   const outgoing=row.senderId===actor.userId;
   const counterparty=outgoing?row.recipient:row.sender;
   const enteredBy=outgoing?row.sender:row.recipient;
   return {
    id:"settlement:"+row.id,
    sourceType:"SETTLEMENT" as const,
    settlementId:row.id,
    settlementDirection:outgoing?"OUTGOING" as const:"INCOMING" as const,
    kind:outgoing?"EXPENSE" as const:"INCOME" as const,
    status:row.voidedAt?"CANCELLED" as const:"POSTED" as const,
    category:{id:"internal-settlement",name:"Internal Settlement",active:true},
    categoryId:"internal-settlement",
    amount:row.amount.toFixed(4),currencyCode:"INR",
    occurredOn:row.occurredOn.toISOString().slice(0,10),
    method:row.method,merchantOrSource:counterparty.displayName,
    description:[outgoing?"Outgoing to "+counterparty.displayName:"Incoming from "+counterparty.displayName,
     row.note||"",row.voidReason?"Voided: "+row.voidReason:""].filter(Boolean).join(" · "),
    createdAt:row.createdAt.toISOString(),postedAt:null,
    enteredById:actor.userId,enteredBy,submittedBy:row.sender,
    approvalRequestId:null,clientId:null,client:null,receiptAssetId:null
   };
  });
 }
}
