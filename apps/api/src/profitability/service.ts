import {Prisma,type PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {AuthError,forbidden,invalid} from "../auth/errors";
import type {CostAllocationUpdate,ProfitabilityPeriod,RevenueRecognitionCreate,RevenueRecognitionReverse} from "@digimarket/contracts";

const money=(v:Prisma.Decimal)=>v.toFixed(4);
const dec=(s:string|Prisma.Decimal)=>new Prisma.Decimal(s);
const sum=(values:Prisma.Decimal[])=>values.reduce((a,b)=>a.plus(b),dec("0"));
const day=(d:string)=>new Date(d+"T00:00:00.000Z");
const absent=()=>new AuthError(404,"NOT_FOUND","Financial resource not found");
const stale=()=>new AuthError(409,"VERSION_CONFLICT","Attribution changed; reload and retry");
const grant=(a:Principal,key:string)=>{if(!a.permissions.has(key))throw forbidden();};
const serial={isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000};
async function repeat<T>(fn:()=>Promise<T>):Promise<T>{
 for(let i=0;i<4;i++)try{return await fn();}
 catch(e){if((e as {code?:string}).code!=="P2034"||i===3)throw e;}
 throw stale();
}
function csvCell(s:string){
 const safe=/^[=+@\-\t\r]/.test(s)?"'"+s:s;
 return '"'+safe.replaceAll('"','""')+'"';
}
export class ProfitabilityService{
 constructor(private readonly db:PrismaClient){}
 private read(a:Principal){grant(a,"profitability.read");grant(a,"finance.read.all");}
 private write(a:Principal){grant(a,"profitability.manage");grant(a,"finance.read.all");}
 private async ensureClient(a:Principal,id:string){
  const client=await this.db.client.findFirst({where:{id,organizationId:a.organizationId}});
  if(!client)throw absent();
 }
 async expenses(a:Principal,from:string,to:string){
  this.read(a);
  const rows=await this.db.financialTransaction.findMany({where:{
    organizationId:a.organizationId,status:"POSTED",kind:"EXPENSE",
    occurredOn:{gte:day(from),lte:day(to)}},
    orderBy:[{occurredOn:"desc"},{id:"desc"}],take:300,
    include:{category:{select:{name:true}},
      costAllocations:{include:{client:{select:{businessName:true}}}}},
  });
  return rows.map(row=>({...row,amount:money(row.amount),attributed:money(sum(row.costAllocations.map(x=>x.amount))),
    unallocated:money(row.amount.minus(sum(row.costAllocations.map(x=>x.amount)))),
    costAllocations:row.costAllocations.map(x=>({...x,amount:money(x.amount)}))}));
 }
 async setExpenseAllocations(a:Principal,id:string,input:CostAllocationUpdate){
  this.write(a);
  const amounts=input.allocations.map(x=>dec(x.amount));
  if(amounts.some(x=>!x.isFinite()||x.lte(0)))throw invalid("Each cost attribution must be positive");
  return repeat(()=>this.db.$transaction(async tx=>{
    const expense=await tx.financialTransaction.findFirst({where:{id,organizationId:a.organizationId,
      kind:"EXPENSE",status:"POSTED"}});
    if(!expense)throw absent();
    if(expense.costAllocationVersion!==input.version)throw stale();
    const total=sum(amounts);
    if(total.gt(expense.amount))throw invalid("Total attributed cost exceeds posted expense amount");
    const uniqueClients=input.allocations.map(x=>x.clientId);
    const clients=await tx.client.count({where:{organizationId:a.organizationId,id:{in:uniqueClients}}});
    if(clients!==uniqueClients.length)throw absent();
    const projects=input.allocations.filter(x=>x.projectId);
    if(projects.length){
      const found=await tx.project.findMany({where:{organizationId:a.organizationId,
        id:{in:projects.map(x=>x.projectId!)}},select:{id:true,clientId:true}});
      if(projects.some(x=>!found.some(p=>p.id===x.projectId&&p.clientId===x.clientId)))
        throw invalid("Linked project must belong to the same client");
    }
    const changed=await tx.financialTransaction.updateMany({where:{
      id,organizationId:a.organizationId,status:"POSTED",kind:"EXPENSE",
      costAllocationVersion:input.version},
      data:{costAllocationVersion:{increment:1}}});
    if(changed.count!==1)throw stale();
    await tx.costAllocation.deleteMany({where:{expenseId:id}});
    if(input.allocations.length)await tx.costAllocation.createMany({data:input.allocations.map(x=>({
      expenseId:id,organizationId:a.organizationId,clientId:x.clientId,
      projectId:x.projectId??null,amount:dec(x.amount).toFixed(4),note:x.note?.trim()||null,
    }))});
    await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
      action:"profitability.cost_reallocated",entityType:"FinancialTransaction",entityId:id,
      afterRedacted:{version:input.version+1,count:input.allocations.length,attributed:money(total)}}});
    await tx.outboxEvent.create({data:{organizationId:a.organizationId,
      eventKey:"profitability.cost."+id+"."+(input.version+1),kind:"profitability.cost_changed",
      aggregateType:"FinancialTransaction",aggregateId:id,payloadMinimal:{expenseId:id}}});
    return {expenseId:id,version:input.version+1,attributed:money(total),
      unallocated:money(expense.amount.minus(total))};
  },serial));
 }
 async recognize(a:Principal,input:RevenueRecognitionCreate){
  this.write(a);
  const value=dec(input.amount);
  if(!value.isFinite()||value.lte(0))throw invalid("Recognized revenue must be positive");
  try{return await repeat(()=>this.db.$transaction(async tx=>{
    const invoice=await tx.invoice.findFirst({where:{id:input.invoiceId,
      organizationId:a.organizationId,status:"ISSUED"}});
    if(!invoice||!invoice.issuedOn)throw absent();
    if(day(input.recognizedOn)<invoice.issuedOn)throw invalid("Revenue recognition date precedes invoice issuance");
    const recognized=await tx.revenueRecognition.aggregate({where:{invoiceId:invoice.id},_sum:{amount:true}});
    const total=(recognized._sum.amount??dec("0")).plus(value);
    if(total.gt(invoice.subtotal))throw invalid("Recognized revenue exceeds issued invoice subtotal (tax excluded)");
    const lock=await tx.invoice.updateMany({where:{id:invoice.id,organizationId:a.organizationId,
      version:invoice.version,status:"ISSUED"},data:{version:{increment:1}}});
    if(!lock.count)throw stale();
    const record=await tx.revenueRecognition.create({data:{
      organizationId:a.organizationId,invoiceId:invoice.id,clientId:invoice.clientId,
      createdById:a.userId,idempotencyKey:input.idempotencyKey,
      amount:value.toFixed(4),recognizedOn:day(input.recognizedOn),note:input.note,
    }});
    await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
      action:"profitability.revenue_recognized",entityType:"RevenueRecognition",entityId:record.id,
      afterRedacted:{invoiceId:invoice.id,amount:money(value)}}});
    await tx.outboxEvent.create({data:{organizationId:a.organizationId,
      eventKey:"profitability.recognized."+record.id,kind:"profitability.revenue_recognized",
      aggregateType:"RevenueRecognition",aggregateId:record.id,
      payloadMinimal:{recognitionId:record.id,invoiceId:invoice.id}}});
    return record;
  },serial));}catch(e){if((e as {code?:string}).code==="P2002")
    throw new AuthError(409,"DUPLICATE","Recognition already recorded with this key");
    throw e;}
 }
 async reverse(a:Principal,id:string,input:RevenueRecognitionReverse){
  this.write(a);
  try{return await repeat(()=>this.db.$transaction(async tx=>{
    const original=await tx.revenueRecognition.findFirst({where:{id,organizationId:a.organizationId,
      reversalOfId:null},include:{reversal:{select:{id:true}}}});
    if(!original)throw absent();
    if(original.reversal)throw new AuthError(409,"ALREADY_REVERSED","This recognition was already reversed");
    if(day(input.recognizedOn)<original.recognizedOn)
      throw invalid("Reversal date cannot be earlier than its original recognition");
    const invoice=await tx.invoice.findFirst({where:{id:original.invoiceId,organizationId:a.organizationId}});
    if(!invoice)throw absent();
    const lock=await tx.invoice.updateMany({where:{id:invoice.id,version:invoice.version},
      data:{version:{increment:1}}});
    if(!lock.count)throw stale();
    const reversal=await tx.revenueRecognition.create({data:{
      organizationId:a.organizationId,invoiceId:original.invoiceId,clientId:original.clientId,
      createdById:a.userId,idempotencyKey:input.idempotencyKey,
      recognizedOn:day(input.recognizedOn),amount:original.amount.negated(),
      note:input.note,reversalOfId:original.id,
    }});
    await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
      action:"profitability.recognition_reversed",entityType:"RevenueRecognition",entityId:reversal.id,
      afterRedacted:{originalId:original.id,invoiceId:invoice.id}}});
    return reversal;
  },serial));}catch(e){if((e as {code?:string}).code==="P2002")
    throw new AuthError(409,"DUPLICATE","Recognition already reversed or key reused");
    throw e;}
 }
 async recognitions(a:Principal,clientId?:string){
  this.read(a);
  if(clientId)await this.ensureClient(a,clientId);
  const rows=await this.db.revenueRecognition.findMany({where:{organizationId:a.organizationId,
    ...(clientId?{clientId}:{})},
    orderBy:[{createdAt:"desc"},{id:"desc"}],take:200,
    include:{invoice:{select:{number:true}},client:{select:{businessName:true}},
      reversal:{select:{id:true}}}});
  return rows.map(x=>({...x,amount:money(x.amount)}));
 }
 async report(a:Principal,period:ProfitabilityPeriod){
  this.read(a);
  if(period.clientId)await this.ensureClient(a,period.clientId);
  const from=day(period.from),to=day(period.to);
  const window={gte:from,lte:to};
  const clients=await this.db.client.findMany({where:{organizationId:a.organizationId,
    ...(period.clientId?{id:period.clientId}:{})},
    select:{id:true,businessName:true,status:true},orderBy:{businessName:"asc"}});
  const [invoices,payments,recognitions,expenses]=await Promise.all([
    this.db.invoice.findMany({where:{organizationId:a.organizationId,status:"ISSUED",
      issuedOn:window,...(period.clientId?{clientId:period.clientId}:{})},
      select:{clientId:true,subtotal:true,taxTotal:true,total:true}}),
    this.db.paymentAllocation.findMany({where:{payment:{organizationId:a.organizationId,
      status:"VERIFIED",receivedOn:window,...(period.clientId?{clientId:period.clientId}:{})}},
      select:{amount:true,invoice:{select:{clientId:true}}}}),
    this.db.revenueRecognition.findMany({where:{organizationId:a.organizationId,
      recognizedOn:window,...(period.clientId?{clientId:period.clientId}:{})},
      select:{clientId:true,amount:true}}),
    this.db.financialTransaction.findMany({where:{organizationId:a.organizationId,
      kind:"EXPENSE",status:"POSTED",occurredOn:window},
      select:{amount:true,costAllocations:{select:{clientId:true,amount:true}}}}),
  ]);
  type Metrics={billedNet:Prisma.Decimal;billedTax:Prisma.Decimal;billedGross:Prisma.Decimal;
    collectedCash:Prisma.Decimal;recognizedRevenue:Prisma.Decimal;directCosts:Prisma.Decimal};
  const blank=():Metrics=>({billedNet:dec("0"),billedTax:dec("0"),billedGross:dec("0"),
    collectedCash:dec("0"),recognizedRevenue:dec("0"),directCosts:dec("0")});
  const data=new Map(clients.map(c=>[c.id,blank()]));
  for(const i of invoices){const m=data.get(i.clientId);if(m){m.billedNet=m.billedNet.plus(i.subtotal);
    m.billedTax=m.billedTax.plus(i.taxTotal);m.billedGross=m.billedGross.plus(i.total);}}
  for(const p of payments){const m=data.get(p.invoice.clientId);if(m)m.collectedCash=m.collectedCash.plus(p.amount);}
  for(const v of recognitions){const m=data.get(v.clientId);if(m)m.recognizedRevenue=m.recognizedRevenue.plus(v.amount);}
  let unallocated=dec("0"),otherClientCost=dec("0");
  for(const exp of expenses){
    const attributed=sum(exp.costAllocations.map(x=>x.amount));
    unallocated=unallocated.plus(exp.amount.minus(attributed));
    for(const x of exp.costAllocations){const m=data.get(x.clientId);
      if(m)m.directCosts=m.directCosts.plus(x.amount);
      else otherClientCost=otherClientCost.plus(x.amount);}
  }
  const rows=clients.map(client=>{
    const m=data.get(client.id)!;
    const contribution=m.recognizedRevenue.minus(m.directCosts);
    return {clientId:client.id,clientName:client.businessName,status:client.status,
      ...Object.fromEntries(Object.entries(m).map(([k,v])=>[k,money(v)])),
      contribution:money(contribution),
      marginPercent:m.recognizedRevenue.gt(0)?
        contribution.div(m.recognizedRevenue).times(100).toDecimalPlaces(2).toFixed(2):null};
  });
  const totals=rows.reduce((a,v)=>{for(const k of ["billedNet","billedTax","billedGross",
    "collectedCash","recognizedRevenue","directCosts","contribution"] as const)
    a[k]=a[k].plus(dec(v[k]));return a;},
    {billedNet:dec("0"),billedTax:dec("0"),billedGross:dec("0"),
      collectedCash:dec("0"),recognizedRevenue:dec("0"),directCosts:dec("0"),contribution:dec("0")});
  const totalMetrics={...Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,money(v)])),
    marginPercent:totals.recognizedRevenue.gt(0)?
      totals.contribution.div(totals.recognizedRevenue).times(100).toDecimalPlaces(2).toFixed(2):null,
    unallocatedExpense:period.clientId?null:money(unallocated),
    outsideFilterAttributedCost:period.clientId?money(otherClientCost):null};
  return {currency:"INR",period,methodology:{
    billed:"Issued invoice date; before-tax subtotal, tax, and gross separately",
    collected:"Only VERIFIED payment allocations, by received date; not raw income transactions",
    recognized:"Explicit recognition/reversal entries, by recognition date; tax excluded",
    directCosts:"Only posted expense allocations, by original expense occurrence date",
    contribution:"Recognized revenue minus attributed direct costs; excludes unallocated overhead",
    margin:"Contribution / recognized revenue; null when recognition is zero",
    limitations:"Period measures use different event dates. Historical values may change if expenses are reallocated.",
  },totals:totalMetrics,clients:rows};
 }
 async csv(a:Principal,p:ProfitabilityPeriod){
  const report=await this.report(a,p);
  const keys=["Client","Billed net","Tax","Billed gross","Collected","Recognized",
    "Direct cost","Contribution","Margin percent"];
  const lines=report.clients.map(c=>[c.clientName,c.billedNet,c.billedTax,c.billedGross,
    c.collectedCash,c.recognizedRevenue,c.directCosts,c.contribution,c.marginPercent??""]
    .map(x=>csvCell(x)).join(","));
  return {filename:"client-profitability-"+p.from+"-"+p.to+".csv",
    csv:[keys.map(csvCell).join(","),...lines].join("\r\n")+"\r\n"};
 }
}
