import { Prisma, type PrismaClient } from "@digimarket/db";
import { financeProofPrefix } from "../assets/service";
import { founderPolicy, isFounder } from "../approvals/founder";
import type { FinanceCategoryInput, FinanceEntryInput, FinanceEntryAdminEdit, FinanceKind, FinanceBreakdownQuery } from "@digimarket/contracts";
import type { Principal } from "../auth/service";
import { AuthError, forbidden, invalid } from "../auth/errors";

const need=(actor:Principal,key:string)=>{if(!actor.permissions.has(key))throw forbidden();};
const duplicate=()=>new AuthError(409,"DUPLICATE","A record with this identifier already exists");
const normalize=(value:string)=>value.trim().replace(/\s+/g," ").toLocaleLowerCase("en-US");
const isMetaAds=(name:string)=>/^meta[\s_-]*(?:ads?|advertising|advertisements?)$/i.test(name.trim());
const csvCell=(value:string)=> {
  const safe=/^[=+@\-\t\r]/.test(value)?"'"+value:value;
  return '"'+safe.replaceAll('"','""')+'"';
};
type View="mine"|"all";
export class FinanceService {
  constructor(private readonly db:PrismaClient){}

  // Contract projections are separate from posted financial transactions.
  async recurringIncome(actor:Principal){
    need(actor,"finance.read.all");
    const now=new Date();
    const year=now.getUTCFullYear(),month=now.getUTCMonth();
    const periodStart=new Date(Date.UTC(year,month,1));
    const periodEnd=new Date(Date.UTC(year,month+1,1));
    const clients=await this.db.client.findMany({
      where:{organizationId:actor.organizationId,status:"ACTIVE",
        OR:[{contractStartOn:null},{contractStartOn:{lt:periodEnd}}],
        AND:[{OR:[{contractEndOn:null},{contractEndOn:{gte:periodStart}}]}]},
      select:{id:true,businessName:true,monthlyFee:true,monthlyAdBudget:true,contractStartOn:true,contractEndOn:true},
      orderBy:{businessName:"asc"},
    });
    const zero=new Prisma.Decimal(0);
    let serviceTotal=zero,adBudgetTotal=zero;
    const items=clients.filter(c=>c.monthlyFee!==null||c.monthlyAdBudget!==null).map(c=>{
      const service=c.monthlyFee??zero,ads=c.monthlyAdBudget??zero;
      serviceTotal=serviceTotal.add(service);adBudgetTotal=adBudgetTotal.add(ads);
      return {id:c.id,businessName:c.businessName,monthlyServiceCharge:service.toFixed(4),
        monthlyAdBudget:ads.toFixed(4),monthlyCombined:service.add(ads).toFixed(4),
        contractStartOn:c.contractStartOn?.toISOString().slice(0,10)??null,
        contractEndOn:c.contractEndOn?.toISOString().slice(0,10)??null};
    });
    return {month:periodStart.toISOString().slice(0,7),currency:"INR",items,
      monthlyServiceTotal:serviceTotal.toFixed(4),monthlyAdBudgetTotal:adBudgetTotal.toFixed(4),
      monthlyCombinedTotal:serviceTotal.add(adBudgetTotal).toFixed(4)};
  }

  private scope(actor:Principal,view:View,owner:"agency"|"client_ads"|"all"="agency"):Prisma.FinancialTransactionWhereInput{
    if(view==="all")need(actor,"finance.read.all");
    else need(actor,"finance.entry.read.own");
    return {organizationId:actor.organizationId,
      ...(view==="mine"?{enteredById:actor.userId}:{}),
      ...(owner==="all"?{}:{clientId:owner==="client_ads"?{not:null}:null})};
  }

  // Never infer Meta advertising from a non-null client ID: that would also
  // include travel, software and other historical expenses in the ad register.
  private async metaAdsWhere(actor:Principal,view:View,owner:"all"|"client_ads"):Promise<Prisma.FinancialTransactionWhereInput>{
    const base=this.scope(actor,view,owner);
    const categories=await this.db.financialCategory.findMany({
      where:{organizationId:actor.organizationId,kind:"EXPENSE"},
      select:{id:true,name:true},
    });
    return {...base,kind:"EXPENSE",
      categoryId:{in:categories.filter(c=>isMetaAds(c.name)).map(c=>c.id)}};
  }

  async metaAdClients(actor:Principal){
    if(!actor.permissions.has("finance.entry.create")&&!actor.permissions.has("finance.category.manage"))throw forbidden();
    return this.db.client.findMany({where:{organizationId:actor.organizationId,status:"ACTIVE"},
      select:{id:true,businessName:true},orderBy:{businessName:"asc"},take:1000});
  }

  async categories(actor:Principal){
    if(!actor.permissions.has("finance.entry.create")&&!actor.permissions.has("finance.read.all")) throw forbidden();
    return this.db.financialCategory.findMany({
      where:{organizationId:actor.organizationId},orderBy:[{kind:"asc"},{name:"asc"}],
      select:{id:true,kind:true,name:true,active:true,createdAt:true},
    });
  }

  async addCategory(actor:Principal,input:FinanceCategoryInput){
    need(actor,"finance.category.manage");
    const normalizedName=normalize(input.name);
    if(input.kind==="EXPENSE"&&normalizedName==="salary")throw invalid("Salary is system-linked; record salary payments in the Salary module");
    try {
      return await this.db.$transaction(async tx=>{
        const category=await tx.financialCategory.create({data:{
          organizationId:actor.organizationId,kind:input.kind,
          name:input.name.trim(),normalizedName,
        }});
        await tx.auditLog.create({data:{organizationId:actor.organizationId,actorId:actor.userId,
          action:"finance.category_created",entityType:"FinancialCategory",entityId:category.id}});
        return category;
      });
    }catch(error){
      if((error as {code?:string}).code==="P2002")throw duplicate();
      throw error;
    }
  }

  async setCategoryActive(actor:Principal,id:string,active:boolean){
    need(actor,"finance.category.manage");
    return this.db.$transaction(async tx=>{
      const result=await tx.financialCategory.updateMany({where:{id,organizationId:actor.organizationId},data:{active}});
      if(result.count!==1)throw new AuthError(404,"NOT_FOUND","Category not found");
      await tx.auditLog.create({data:{organizationId:actor.organizationId,actorId:actor.userId,
        action:"finance.category_status",entityType:"FinancialCategory",entityId:id,
        afterRedacted:{active}}});
      return {id,active};
    });
  }

  private administrator(actor:Principal){
    if(!actor.roles.some(role=>role==="ADMIN"||role==="SUPER_ADMIN"))throw forbidden();
    need(actor,"finance.category.manage");
    need(actor,"finance.read.all");
  }

  async renameCategory(actor:Principal,id:string,name:string){
    this.administrator(actor);
    const normalizedName=normalize(name);
    if(normalizedName==="salary")throw invalid("Salary is a reserved payroll category");
    try{
      return await this.db.$transaction(async tx=>{
        const updated=await tx.financialCategory.updateMany({
          where:{id,organizationId:actor.organizationId},
          data:{name:name.trim(),normalizedName},
        });
        if(updated.count!==1)throw new AuthError(404,"NOT_FOUND","Category not found");
        const row=await tx.financialCategory.findUniqueOrThrow({where:{id}});
        await tx.auditLog.create({data:{
          organizationId:actor.organizationId,actorId:actor.userId,
          action:"finance.category_renamed",entityType:"FinancialCategory",entityId:id,
          afterRedacted:{name:row.name},
        }});
        return {id:row.id,name:row.name,kind:row.kind,active:row.active};
      });
    }catch(error){
      if((error as {code?:string}).code==="P2002")throw duplicate();
      throw error;
    }
  }

  async removeCategory(actor:Principal,id:string){
    this.administrator(actor);
    return this.db.$transaction(async tx=>{
      const row=await tx.financialCategory.findFirst({where:{id,organizationId:actor.organizationId}});
      if(!row)throw new AuthError(404,"NOT_FOUND","Category not found");
      const [entries,payments]=await Promise.all([
        tx.financialTransaction.count({where:{categoryId:id,organizationId:actor.organizationId}}),
        tx.payment.count({where:{categoryId:id,organizationId:actor.organizationId}}),
      ]);
      if(entries||payments){
        await tx.financialCategory.update({where:{id},data:{active:false}});
      }else{
        await tx.financialCategory.delete({where:{id}});
      }
      await tx.auditLog.create({data:{organizationId:actor.organizationId,actorId:actor.userId,
        action:entries||payments?"finance.category_archived":"finance.category_deleted",
        entityType:"FinancialCategory",entityId:id,
        afterRedacted:{hasHistoricalReferences:!!(entries||payments)},
      }});
      return {id,archived:!!(entries||payments)};
    });
  }

  async assignees(actor:Principal){
    const adminAllowed=actor.roles.some(role=>role==="ADMIN"||role==="SUPER_ADMIN")&&
      actor.permissions.has("finance.category.manage")&&actor.permissions.has("finance.read.all");
    if(!adminAllowed&&!actor.permissions.has("finance.entry.create"))throw forbidden();
    // Admins and founders may allocate transactions to colleagues.
    // Regular employees must explicitly select themselves; this is not a privilege escalation.
    const canAssignOthers=adminAllowed||isFounder(actor);
    return this.db.user.findMany({
      where:{organizationId:actor.organizationId,status:"ACTIVE",
        ...(canAssignOthers?{}:{id:actor.userId})},
      orderBy:[{displayName:"asc"},{id:"asc"}],
      select:{id:true,displayName:true,loginId:true},take:1000,
    });
  }

  async editEntry(actor:Principal,id:string,input:FinanceEntryAdminEdit){
    this.administrator(actor);
    const amount=new Prisma.Decimal(input.amount);
    if(!amount.isFinite()||amount.lte(0))throw invalid("Amount must be greater than zero");
    return this.db.$transaction(async tx=>{
      const entry=await tx.financialTransaction.findFirst({
        where:{id,organizationId:actor.organizationId},
        include:{verifiedPayment:{select:{id:true}}},
      });
      if(!entry)throw new AuthError(404,"NOT_FOUND","Financial entry not found");
      if(entry.status==="CANCELLED"||entry.verifiedPayment)
        throw new AuthError(409,"FINANCE_IMMUTABLE","Cancelled or reconciled entries cannot be edited");
      const category=await tx.financialCategory.findFirst({
        where:{id:input.categoryId,organizationId:actor.organizationId,kind:entry.kind,
          ...(input.categoryId===entry.categoryId?{}:{active:true})},
      });
      if(!category)throw invalid("Choose a valid "+entry.kind.toLowerCase()+" category in this organization");
      if(entry.kind==="EXPENSE"&&normalize(category.name)==="salary")throw invalid("Salary entries are managed through Salary");
      const requestedClientId=input.clientId===undefined?entry.clientId:input.clientId;
      if(requestedClientId&&!isMetaAds(category.name))
        throw invalid("A client can only be linked to a Meta Ads expense");
      if(requestedClientId){
        const client=await tx.client.findFirst({where:{id:requestedClientId,organizationId:actor.organizationId},
          select:{id:true}});
        if(!client)throw invalid("Select a client in this workspace");
      }
      const assignedUserId=input.enteredById??entry.enteredById;
      if(assignedUserId!==entry.enteredById){
        const assignedUser=await tx.user.findFirst({where:{
          id:assignedUserId,organizationId:actor.organizationId,status:"ACTIVE",
        },select:{id:true}});
        if(!assignedUser)throw invalid("Assigned user must be an active member of this organization");
      }
      const updated=await tx.financialTransaction.update({where:{id},data:{
        categoryId:category.id,amount,occurredOn:new Date(input.occurredOn+"T00:00:00.000Z"),
        method:input.method,merchantOrSource:input.merchantOrSource,description:input.description,
        clientId:requestedClientId??null,enteredById:assignedUserId,
      }});
      await tx.auditLog.create({data:{organizationId:actor.organizationId,actorId:actor.userId,
        action:entry.kind==="INCOME"?"finance.income_edited":"finance.expense_edited",
        entityType:"FinancialTransaction",entityId:id,
        beforeRedacted:{amount:entry.amount.toFixed(4),categoryId:entry.categoryId,status:entry.status,
          assignedUserId:entry.enteredById,clientId:entry.clientId},
        afterRedacted:{amount:updated.amount.toFixed(4),categoryId:updated.categoryId,status:updated.status,
          assignedUserId:updated.enteredById,clientId:updated.clientId},
      }});
      // ApprovalRequest.requesterId remains immutable as the original submitter.
      return {id,amount:updated.amount.toFixed(4),categoryId:updated.categoryId,
        status:updated.status,enteredById:updated.enteredById};
    });
  }

  // Preserve the existing expense-only service method used by older callers.
  async editExpense(actor:Principal,id:string,input:FinanceEntryAdminEdit){
    this.administrator(actor);
    const entry=await this.db.financialTransaction.findFirst({
      where:{id,organizationId:actor.organizationId,kind:"EXPENSE"},select:{id:true},
    });
    if(!entry)throw new AuthError(404,"NOT_FOUND","Expense not found");
    return this.editEntry(actor,id,input);
  }

  async removeEntry(actor:Principal,id:string){
    this.administrator(actor);
    return this.db.$transaction(async tx=>{
      const entry=await tx.financialTransaction.findFirst({
        where:{id,organizationId:actor.organizationId},
        include:{verifiedPayment:{select:{id:true}}},
      });
      if(!entry)throw new AuthError(404,"NOT_FOUND","Financial entry not found");
      if(entry.status==="CANCELLED")throw new AuthError(409,"ALREADY_CANCELLED","Financial entry already cancelled");
      if(entry.verifiedPayment)throw new AuthError(409,"FINANCE_IMMUTABLE","Reconciled entries cannot be cancelled");
      await tx.financialTransaction.update({
        where:{id},data:{status:"CANCELLED",postedAt:null},
      });
      // Pending approvals must not subsequently post cancelled finance entries.
      await tx.approvalRequest.updateMany({
        where:{id:entry.approvalRequestId,organizationId:actor.organizationId,status:"PENDING"},
        data:{status:"CANCELLED",decidedAt:new Date()},
      });
      await tx.auditLog.create({data:{
        organizationId:actor.organizationId,actorId:actor.userId,
        action:entry.kind==="INCOME"?"finance.income_cancelled":"finance.expense_cancelled",
        entityType:"FinancialTransaction",entityId:id,
        beforeRedacted:{kind:entry.kind,status:entry.status,amount:entry.amount.toFixed(4)},
        afterRedacted:{kind:entry.kind,status:"CANCELLED"},
      }});
      return {id,kind:entry.kind,status:"CANCELLED" as const};
    });
  }

  // Retain the expense-specific service for older integrations.
  async removeExpense(actor:Principal,id:string){
    this.administrator(actor);
    const entry=await this.db.financialTransaction.findFirst({
      where:{id,organizationId:actor.organizationId,kind:"EXPENSE"},select:{id:true},
    });
    if(!entry)throw new AuthError(404,"NOT_FOUND","Expense not found");
    return this.removeEntry(actor,id);
  }

  async submit(actor:Principal,input:FinanceEntryInput){
    need(actor,"finance.entry.create");
    const founder=isFounder(actor);
    if(!founder)need(actor,"approvals.submit");
    const enteredById=input.enteredById??actor.userId; // Legacy callers remain compatible.
    const canAssignOthers=founder||(
      actor.roles.some(role=>role==="ADMIN"||role==="SUPER_ADMIN")&&
      actor.permissions.has("finance.category.manage")&&actor.permissions.has("finance.read.all"));
    if(enteredById!==actor.userId&&!canAssignOthers)throw forbidden();
    const amount=new Prisma.Decimal(input.amount);
    if(!amount.isFinite()||amount.lte(0))throw invalid("Amount must be greater than zero");
    const [category,policy,organization,assignedUser]=await Promise.all([
      this.db.financialCategory.findFirst({where:{id:input.categoryId,organizationId:actor.organizationId,kind:input.kind,active:true}}),
      founder?Promise.resolve(null):this.db.approvalPolicy.findUnique({where:{organizationId_category:{organizationId:actor.organizationId,category:"FINANCE"}}}),
      this.db.organization.findUnique({where:{id:actor.organizationId},select:{defaultCurrency:true}}),
      this.db.user.findFirst({where:{id:enteredById,organizationId:actor.organizationId,status:"ACTIVE"},select:{id:true}}),
    ]);
    if(!category)throw invalid("Select an active category belonging to this workspace and type");
    if(input.kind==="EXPENSE"&&normalize(category.name)==="salary")throw invalid("Record salary payments through Salary to avoid duplicate expense accounting");
    if(input.clientId){
      if(input.kind!=="EXPENSE"||!isMetaAds(category.name))
        throw invalid("A client can only be linked to a Meta Ads expense");
      const client=await this.db.client.findFirst({where:{id:input.clientId,
        organizationId:actor.organizationId,status:"ACTIVE"},select:{id:true}});
      if(!client)throw invalid("Select an active client in this workspace");
    }
    if(!assignedUser)throw invalid("Select an active person in this organization");
    if(!founder&&(!policy?.active||!policy.approverRoleKeys.length))throw invalid("An administrator must activate a FINANCE approval policy");
    if(!organization||organization.defaultCurrency!=="INR")throw invalid("This finance module currently supports INR workspaces only");
    if(input.receiptAssetId){
      const proof=await this.db.asset.findFirst({where:{
        id:input.receiptAssetId,organizationId:actor.organizationId,uploadedById:actor.userId,
        status:"ACTIVE",clientId:null,resourceType:{in:["IMAGE","RAW"]},
        publicId:{startsWith:financeProofPrefix(actor.organizationId)}}});
      if(!proof)throw invalid("Receipt image or PDF must belong to your workspace and account");
      const used=await this.db.financialTransaction.findFirst({where:{organizationId:actor.organizationId,receiptAssetId:proof.id},select:{id:true}});
      if(used)throw invalid("This receipt is already linked to another entry");
    }
    try{
      return await this.db.$transaction(async tx=>{
        const appliedPolicy=founder?await founderPolicy(tx,actor.organizationId,"FINANCE"):policy!;
        const now=new Date();
        const approval=await tx.approvalRequest.create({data:{
          organizationId:actor.organizationId,policyId:appliedPolicy.id,requesterId:actor.userId,
          title:(input.kind==="EXPENSE"?"Expense: ":"Income: ")+category.name,
          description:input.description?.trim() || (input.merchantOrSource?.trim()||category.name),
          referenceType:"FINANCE_ENTRY",approverRoleKeys:appliedPolicy.approverRoleKeys,
          ...(founder?{status:"APPROVED" as const,decidedAt:now}:{}),
        }});
        const entry=await tx.financialTransaction.create({data:{
          organizationId:actor.organizationId,enteredById,
          categoryId:category.id,approvalRequestId:approval.id,
          clientId:input.clientId??null,
          idempotencyKey:input.idempotencyKey,kind:input.kind,
          amount:amount.toFixed(4),currencyCode:organization.defaultCurrency,
          occurredOn:new Date(input.occurredOn+"T00:00:00.000Z"),
          merchantOrSource:input.merchantOrSource?.trim()||null,
          method:input.method,description:input.description?.trim()||null,
          receiptAssetId:input.receiptAssetId??null,
          ...(founder?{status:"POSTED" as const,postedAt:now}:{}),
        }});
        await tx.approvalRequest.update({where:{id:approval.id},data:{referenceId:entry.id}});
        if(founder)await tx.approvalDecision.create({data:{
          requestId:approval.id,actorId:actor.userId,outcome:"APPROVED",
          reason:"Founder entry posted automatically without review",
        }});
        await tx.auditLog.create({data:{organizationId:actor.organizationId,actorId:actor.userId,
          action:founder?"finance.founder_posted":"finance.submitted",entityType:"FinancialTransaction",entityId:entry.id,
          afterRedacted:{kind:entry.kind,status:entry.status,currency:entry.currencyCode,
            enteredById:entry.enteredById,submittedById:actor.userId}}});
        await tx.outboxEvent.create({data:{
          organizationId:actor.organizationId,eventKey:(founder?"finance.resolved.":"finance.submitted.")+entry.id,
          kind:founder?"finance.resolved":"finance.submitted",aggregateType:"FinancialTransaction",aggregateId:entry.id,
          payloadMinimal:founder?{transactionId:entry.id,outcome:"APPROVED"}:{transactionId:entry.id,approvalId:approval.id},
        }});
        return this.present(entry);
      });
    }catch(error){
      if((error as {code?:string}).code==="P2002")throw duplicate();
      throw error;
    }
  }

  // Use the identical posted, occurredOn UTC calendar-day scope as
  // InsightsService.report cashLedger. Search applies to ledger/CSV only;
  // summary, category and monthly totals always reconcile to Reports.
  private breakdownScope(actor:Principal,input:FinanceBreakdownQuery){
    need(actor,"reports.business.read");
    need(actor,"finance.read.all");
    const period={organizationId:actor.organizationId,clientId:null,kind:input.kind,status:"POSTED" as const,
      occurredOn:{gte:new Date(input.from+"T00:00:00.000Z"),lte:new Date(input.to+"T23:59:59.999Z")}};
    const query=input.q.trim();
    // Only match enum-valued methods when the query is itself a valid
    // method. Passing arbitrary search strings to a Prisma enum filter
    // would cause a runtime error and break otherwise valid text searches.
    const normalizedMethod=query.toUpperCase().replaceAll(" ","_");
    const methods=["CASH","UPI","BANK_TRANSFER","CARD","OTHER"] as const;
    const method=methods.find(value=>value===normalizedMethod);
    const search=query?{OR:[
      {merchantOrSource:{contains:query,mode:"insensitive" as const}},
      {description:{contains:query,mode:"insensitive" as const}},
      {category:{name:{contains:query,mode:"insensitive" as const}}},
      {enteredBy:{displayName:{contains:query,mode:"insensitive" as const}}},
      ...(method?[{method}]:[]),
    ]}: {};
    return {period,where:{...period,...(input.day?{occurredOn:new Date(input.day+"T00:00:00.000Z")}:{}) ,
      ...(input.personId?{enteredById:input.personId}:{}),...search}};
  }
  async breakdown(actor:Principal,input:FinanceBreakdownQuery){
    const {period,where}=this.breakdownScope(actor,input);
    const [categories,months,people,transactions,count,filteredSum]=await Promise.all([
      this.db.financialTransaction.groupBy({by:["categoryId"],where:period,
        _sum:{amount:true},_count:{_all:true}}),
      this.db.financialTransaction.groupBy({by:["occurredOn"],where:period,
        _sum:{amount:true},_count:{_all:true},orderBy:{occurredOn:"asc"}}),
      this.db.financialTransaction.groupBy({by:["enteredById"],where:period,
        _sum:{amount:true},_count:{_all:true}}),
      this.db.financialTransaction.findMany({where,orderBy:[{occurredOn:"desc"},{id:"desc"}],
        skip:(input.page-1)*input.limit,take:input.limit,
        select:{id:true,amount:true,occurredOn:true,method:true,
          merchantOrSource:true,description:true,postedAt:true,
          category:{select:{name:true}},
          enteredBy:{select:{displayName:true,loginId:true}}},
      }),
      this.db.financialTransaction.count({where}),
      this.db.financialTransaction.aggregate({where,_sum:{amount:true}}),
    ]);
    const categoryIds=categories.map(c=>c.categoryId);
    const names=categoryIds.length?await this.db.financialCategory.findMany({
      where:{organizationId:actor.organizationId,id:{in:categoryIds}},
      select:{id:true,name:true},
    }):[];
    const userIds=people.map(p=>p.enteredById);
    const users=userIds.length?await this.db.user.findMany({
      where:{organizationId:actor.organizationId,id:{in:userIds}},
      select:{id:true,displayName:true,loginId:true},
    }):[];
    const userNames=new Map(users.map(u=>[u.id,u]));
    const categoryNames=new Map(names.map(c=>[c.id,c.name]));
    const fullTotal=categories.reduce((sum,c)=>sum.plus(c._sum.amount??0),new Prisma.Decimal(0));
    const monthly=new Map<string,{amount:Prisma.Decimal,count:number}>();
    for(const group of months){
      const month=group.occurredOn.toISOString().slice(0,7);
      const existing=monthly.get(month)??{amount:new Prisma.Decimal(0),count:0};
      existing.amount=existing.amount.plus(group._sum.amount??0);
      existing.count+=group._count._all;
      monthly.set(month,existing);
    }
    const series:{month:string;total:string;count:number}[]=[];
    const start=new Date(input.from+"T00:00:00.000Z"),end=new Date(input.to+"T00:00:00.000Z");
    const cursor=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),1));
    for(let i=0;i<1200&&cursor<=end;i++){
      const month=cursor.toISOString().slice(0,7),entry=monthly.get(month);
      series.push({month,total:(entry?.amount??new Prisma.Decimal(0)).toFixed(4),
        count:entry?.count??0});
      cursor.setUTCMonth(cursor.getUTCMonth()+1);
    }
    return {kind:input.kind,from:input.from,to:input.to,currency:"INR",
      total:fullTotal.toFixed(4),transactionCount:categories.reduce((n,c)=>n+c._count._all,0),
      categories:categories.map(c=>({id:c.categoryId,
        name:categoryNames.get(c.categoryId)??"Uncategorized",
        total:(c._sum.amount??new Prisma.Decimal(0)).toFixed(4),count:c._count._all}))
        .sort((a,b)=>new Prisma.Decimal(b.total).cmp(a.total)),
      monthly:series,
      daily:months.map(m=>({date:m.occurredOn.toISOString().slice(0,10),
        total:(m._sum.amount??new Prisma.Decimal(0)).toFixed(4),count:m._count._all})),
      people:people.map(p=>({id:p.enteredById,
        name:userNames.get(p.enteredById)?.displayName??"Former member",
        loginId:userNames.get(p.enteredById)?.loginId??"",
        total:(p._sum.amount??new Prisma.Decimal(0)).toFixed(4),count:p._count._all}))
        .sort((a,b)=>new Prisma.Decimal(b.total).cmp(a.total)||a.name.localeCompare(b.name)),
      search:input.q,matchingTotal:(filteredSum._sum.amount??new Prisma.Decimal(0)).toFixed(4),
      matchingCount:count,page:input.page,limit:input.limit,
      hasMore:input.page*input.limit<count,
      transactions:transactions.map(t=>({
        id:t.id,amount:t.amount.toFixed(4),occurredOn:t.occurredOn.toISOString().slice(0,10),
        method:t.method,merchantOrSource:t.merchantOrSource,description:t.description,
        postedAt:t.postedAt?.toISOString()??null,
        category:t.category.name,enteredBy:t.enteredBy.displayName,
      })),
    };
  }
  async exportBreakdown(actor:Principal,input:FinanceBreakdownQuery){
    const {where}=this.breakdownScope(actor,input);
    const rows=await this.db.financialTransaction.findMany({where,
      orderBy:[{occurredOn:"desc"},{id:"desc"}],take:5001,
      select:{id:true,amount:true,occurredOn:true,method:true,
        merchantOrSource:true,description:true,postedAt:true,
        category:{select:{name:true}},enteredBy:{select:{displayName:true,loginId:true}}},
    });
    if(rows.length>5000)throw new AuthError(422,"EXPORT_LIMIT",
      "This export exceeds 5,000 transactions. Select a shorter date range or refine your search.");
    const header=["id","kind","occurred_on","amount_inr","category","payment_method",
      "merchant_or_source","description","recorded_by","login_id","posted_at"];
    const lines=rows.map(t=>[t.id,input.kind,t.occurredOn.toISOString().slice(0,10),
      t.amount.toFixed(4),t.category.name,t.method,t.merchantOrSource??"",
      t.description??"",t.enteredBy.displayName,t.enteredBy.loginId,
      t.postedAt?.toISOString()??""].map(csvCell).join(","));
    return {filename:"amplifyworld-"+input.kind.toLowerCase()+"-"+input.from+"-to-"+input.to+".csv",
      csv:[header.map(csvCell).join(","),...lines].join("\r\n")+"\r\n",count:rows.length};
  }

  private present(row:{id:string;kind:FinanceKind;amount:Prisma.Decimal;currencyCode:string;occurredOn:Date;status:string;
    categoryId:string;enteredById:string;approvalRequestId:string;description:string|null;merchantOrSource:string|null;
    method:string;createdAt:Date;postedAt:Date|null;clientId:string|null}){
    return {...row,amount:row.amount.toFixed(4),occurredOn:row.occurredOn.toISOString().slice(0,10)};
  }

  /**
   * Read-only projection of funding allocations. Never create normal Finance
   * transactions for salaries: totals already subtract the underlying payment.
   * Only founders can inspect other people's salary records.
   */
  private async salaryExpenseEntries(actor:Principal,view:View,take:number){
    if(!isFounder(actor))return [];
    const shares=await this.db.salaryFundingAllocation.findMany({
      where:{payment:{organizationId:actor.organizationId},
        account:{organizationId:actor.organizationId,
          ...(view==="mine"?{founderUserId:actor.userId}:{})}},
      include:{
        account:{select:{name:true,founderUserId:true,
          founder:{select:{displayName:true,loginId:true}}}},
        payment:{select:{id:true,paidOn:true,createdAt:true,method:true,
          status:true,salaryMonth:true,reference:true,note:true,
          recipient:{select:{displayName:true}},
          recorder:{select:{displayName:true}}}},
      },
      orderBy:[{payment:{createdAt:"desc"}},{id:"desc"}],take,
    });
    return shares.map(share=>{
      const payment=share.payment;
      const notes=[
        "Salary for "+payment.salaryMonth+" · Recipient: "+payment.recipient.displayName,
        "Funding source: "+share.account.name,
        payment.note||"",
        payment.reference?"Reference: "+payment.reference:"",
      ].filter(Boolean).join(" · ");
      return {
        id:"salary:"+share.id,sourceType:"SALARY" as const,
        salaryPaymentId:payment.id,salaryMonth:payment.salaryMonth,
        kind:"EXPENSE" as const,
        status:payment.status==="VOID"?"CANCELLED" as const:"POSTED" as const,
        category:{id:"salary-system",name:"Salary",active:true},
        categoryId:"salary-system",
        amount:share.amount.toFixed(4),currencyCode:"INR",
        occurredOn:payment.paidOn.toISOString().slice(0,10),
        method:payment.method,merchantOrSource:payment.recipient.displayName,
        description:notes,createdAt:payment.createdAt.toISOString(),
        postedAt:payment.status==="PAID"?payment.createdAt.toISOString():null,
        enteredById:share.account.founderUserId,
        enteredBy:share.account.founder,
        submittedBy:payment.recorder,approvalRequestId:null,
        clientId:null,client:null,receiptAssetId:null,
      };
    });
  }

  async entries(actor:Principal,view:View,scope:"agency"|"client_ads"|"meta_ads"="agency"){
    const where=scope==="agency"?this.scope(actor,view):
      await this.metaAdsWhere(actor,view,scope==="client_ads"?"client_ads":"all");
    const rows=await this.db.financialTransaction.findMany({
      where,orderBy:[{createdAt:"desc"},{id:"desc"}],take:200,
      include:{category:{select:{id:true,name:true,active:true}},
        client:{select:{id:true,businessName:true}},
        enteredBy:{select:{displayName:true,loginId:true}},
        approvalRequest:{select:{requester:{select:{displayName:true}}}}},
    });
    const financeRows=rows.map(r=>({...this.present(r),sourceType:"FINANCE" as const,
      createdAt:r.createdAt.toISOString(),category:r.category,client:r.client,
      enteredBy:r.enteredBy,submittedBy:r.approvalRequest.requester}));
    if(scope!=="agency"||!isFounder(actor))return financeRows;
    const salaryRows=await this.salaryExpenseEntries(actor,view,200);
    return [...financeRows,...salaryRows]
      .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))
      .slice(0,200);
  }

  async totals(actor:Principal,view:View){
    const clientAdWhere=await this.metaAdsWhere(actor,view,"client_ads");
    const [grouped,clientGroups,salaryExpense]=await Promise.all([
      this.db.financialTransaction.groupBy({
        by:["kind","status"],where:this.scope(actor,view),
        _sum:{amount:true},_count:{_all:true},
      }),
      this.db.financialTransaction.groupBy({
        by:["status"],where:clientAdWhere,
        _sum:{amount:true},_count:{_all:true},
      }),
      view==="all"?this.db.salaryPayment.aggregate({
        where:{organizationId:actor.organizationId,status:"PAID"},_sum:{amount:true}
      }):this.db.salaryFundingAllocation.aggregate({
        where:{payment:{organizationId:actor.organizationId,status:"PAID"},
         account:{organizationId:actor.organizationId,founderUserId:actor.userId}},_sum:{amount:true}
      }),
    ]);
    const entries=grouped.map(g=>({kind:g.kind,status:g.status,
      amount:(g._sum.amount??new Prisma.Decimal(0)).toFixed(4),count:g._count._all}));
    const sum=(kind:FinanceKind,status:"POSTED"|"PENDING")=>grouped
      .filter(g=>g.kind===kind&&g.status===status)
      .reduce((acc,g)=>acc.plus(g._sum.amount??new Prisma.Decimal(0)),new Prisma.Decimal(0));
    const income=sum("INCOME","POSTED"),expense=sum("EXPENSE","POSTED");
    const clientSum=(status:"POSTED"|"PENDING")=>clientGroups
      .filter(g=>g.status===status)
      .reduce((acc,g)=>acc.plus(g._sum.amount??new Prisma.Decimal(0)),new Prisma.Decimal(0));
    // Client-funded Meta Ads are outside agency expenses, but posted spend
    // reduces the net amount retained from received income. Pending, rejected
    // and cancelled client spending must never reduce the posted net.
    const postedClientAds=clientSum("POSTED");
    // One salary payment is a single agency expense, regardless of how many
    // founder accounts funded it. "Mine" charges the funding founder, not
    // the person recording the payment or receiving their salary.
    const postedSalaryExpense=salaryExpense._sum.amount??new Prisma.Decimal(0);
    const beforeSalary=income.minus(expense).minus(postedClientAds);
    return {currency:"INR",postedIncome:income.toFixed(4),postedExpense:expense.toFixed(4),
      postedSalaryExpense:postedSalaryExpense.toFixed(4),
      postedExpenseIncludingSalary:expense.plus(postedSalaryExpense).toFixed(4),
      postedNetBeforeSalary:beforeSalary.toFixed(4),
      postedNet:beforeSalary.minus(postedSalaryExpense).toFixed(4),
      pendingIncome:sum("INCOME","PENDING").toFixed(4),
      pendingExpense:sum("EXPENSE","PENDING").toFixed(4),groups:entries,
      clientAdSpend:{posted:postedClientAds.toFixed(4),pending:clientSum("PENDING").toFixed(4),
        count:clientGroups.filter(g=>g.status!=="CANCELLED").reduce((n,g)=>n+g._count._all,0)},
       ...(view==="all"?{recurringIncome:await this.recurringIncome(actor)}:{})};
  }

  async exportCsv(actor:Principal,view:View,scope:"agency"|"client_ads"|"meta_ads"="agency"){
    const where=scope==="agency"?this.scope(actor,view):
      await this.metaAdsWhere(actor,view,scope==="client_ads"?"client_ads":"all");
    const rows=await this.db.financialTransaction.findMany({
      where,
      orderBy:[{createdAt:"desc"},{id:"desc"}],take:5001,
      include:{category:{select:{name:true}},client:{select:{businessName:true}},
        enteredBy:{select:{loginId:true}}},
    });
    const salaryRows=scope==="agency"&&isFounder(actor)
      ?await this.salaryExpenseEntries(actor,view,5001):[];
    if(rows.length+salaryRows.length>5000)
      throw new AuthError(422,"EXPORT_LIMIT","Export exceeds 5000 records; narrow the reporting scope");
    const header=["id","kind","status","category","amount","currency","occurred_on","payment_method","merchant_or_source","description","entered_by","approval_request_id","posted_at","client"];
    const records=rows.map(r=>[r.id,r.kind,r.status,r.category.name,r.amount.toFixed(4),
      r.currencyCode,r.occurredOn.toISOString().slice(0,10),r.method,r.merchantOrSource??"",
      r.description??"",r.enteredBy.loginId,r.approvalRequestId,r.postedAt?.toISOString()??"",r.client?.businessName??""]
      .map(csvCell).join(","));
    const salaryRecords=salaryRows.map(r=>[
      r.id,r.kind,r.status,r.category.name,r.amount,r.currencyCode,r.occurredOn,
      r.method,r.merchantOrSource??"",r.description??"",
      r.enteredBy.loginId,"",r.postedAt??"",""
    ].map(csvCell).join(","));
    return {filename:"digimarket-finance-"+scope+"-"+view+".csv",
      csv:[header.join(","),...records,...salaryRecords].join("\r\n")+"\r\n"};
  }
}
