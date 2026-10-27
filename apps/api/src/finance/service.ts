import { Prisma, type PrismaClient } from "@digimarket/db";
import { financeProofPrefix } from "../assets/service";
import { founderPolicy, isFounder } from "../approvals/founder";
import type { FinanceCategoryInput, FinanceEntryInput, FinanceEntryAdminEdit, FinanceKind, FinanceBreakdownQuery } from "@digimarket/contracts";
import type { Principal } from "../auth/service";
import { AuthError, forbidden, invalid } from "../auth/errors";

const need=(actor:Principal,key:string)=>{if(!actor.permissions.has(key))throw forbidden();};
const duplicate=()=>new AuthError(409,"DUPLICATE","A record with this identifier already exists");
const normalize=(value:string)=>value.trim().replace(/\s+/g," ").toLocaleLowerCase("en-US");
const csvCell=(value:string)=> {
  const safe=/^[=+@\-\t\r]/.test(value)?"'"+value:value;
  return '"'+safe.replaceAll('"','""')+'"';
};
type View="mine"|"all";
export class FinanceService {
  constructor(private readonly db:PrismaClient){}

  private scope(actor:Principal,view:View){
    if(view==="all")need(actor,"finance.read.all");
    else need(actor,"finance.entry.read.own");
    return {organizationId:actor.organizationId,...(view==="mine"?{enteredById:actor.userId}:{})};
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
    this.administrator(actor);
    return this.db.user.findMany({
      where:{organizationId:actor.organizationId,status:"ACTIVE"},
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
        enteredById:assignedUserId,
      }});
      await tx.auditLog.create({data:{organizationId:actor.organizationId,actorId:actor.userId,
        action:entry.kind==="INCOME"?"finance.income_edited":"finance.expense_edited",
        entityType:"FinancialTransaction",entityId:id,
        beforeRedacted:{amount:entry.amount.toFixed(4),categoryId:entry.categoryId,status:entry.status,
          assignedUserId:entry.enteredById},
        afterRedacted:{amount:updated.amount.toFixed(4),categoryId:updated.categoryId,status:updated.status,
          assignedUserId:updated.enteredById},
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
    const amount=new Prisma.Decimal(input.amount);
    if(!amount.isFinite()||amount.lte(0))throw invalid("Amount must be greater than zero");
    const [category,policy,organization]=await Promise.all([
      this.db.financialCategory.findFirst({where:{id:input.categoryId,organizationId:actor.organizationId,kind:input.kind,active:true}}),
      founder?Promise.resolve(null):this.db.approvalPolicy.findUnique({where:{organizationId_category:{organizationId:actor.organizationId,category:"FINANCE"}}}),
      this.db.organization.findUnique({where:{id:actor.organizationId},select:{defaultCurrency:true}}),
    ]);
    if(!category)throw invalid("Select an active category belonging to this workspace and type");
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
          organizationId:actor.organizationId,enteredById:actor.userId,
          categoryId:category.id,approvalRequestId:approval.id,
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
          afterRedacted:{kind:entry.kind,status:entry.status,currency:entry.currencyCode}}});
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
    const period={organizationId:actor.organizationId,kind:input.kind,status:"POSTED" as const,
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
    method:string;createdAt:Date;postedAt:Date|null}){
    return {...row,amount:row.amount.toFixed(4),occurredOn:row.occurredOn.toISOString().slice(0,10)};
  }

  async entries(actor:Principal,view:View){
    const rows=await this.db.financialTransaction.findMany({
      where:this.scope(actor,view),orderBy:{createdAt:"desc"},take:200,
      include:{category:{select:{id:true,name:true,active:true}},
        enteredBy:{select:{displayName:true,loginId:true}},
        approvalRequest:{select:{requester:{select:{displayName:true}}}}},
    });
    return rows.map(r=>({...this.present(r),category:r.category,
      enteredBy:r.enteredBy,submittedBy:r.approvalRequest.requester}));
  }

  async totals(actor:Principal,view:View){
    const grouped=await this.db.financialTransaction.groupBy({
      by:["kind","status"],where:this.scope(actor,view),
      _sum:{amount:true},_count:{_all:true},
    });
    const entries=grouped.map(g=>({kind:g.kind,status:g.status,
      amount:(g._sum.amount??new Prisma.Decimal(0)).toFixed(4),count:g._count._all}));
    const sum=(kind:FinanceKind,status:"POSTED"|"PENDING")=>grouped
      .filter(g=>g.kind===kind&&g.status===status)
      .reduce((acc,g)=>acc.plus(g._sum.amount??new Prisma.Decimal(0)),new Prisma.Decimal(0));
    const income=sum("INCOME","POSTED"),expense=sum("EXPENSE","POSTED");
    return {currency:"INR",postedIncome:income.toFixed(4),postedExpense:expense.toFixed(4),
      postedNet:income.minus(expense).toFixed(4),
      pendingIncome:sum("INCOME","PENDING").toFixed(4),
      pendingExpense:sum("EXPENSE","PENDING").toFixed(4),groups:entries};
  }

  async exportCsv(actor:Principal,view:View){
    const rows=await this.db.financialTransaction.findMany({
      where:this.scope(actor,view),orderBy:[{createdAt:"desc"},{id:"desc"}],take:5001,
      include:{category:{select:{name:true}},enteredBy:{select:{loginId:true}}},
    });
    if(rows.length>5000)throw new AuthError(422,"EXPORT_LIMIT","Export exceeds 5000 records; use a shorter reporting period when available");
    const header=["id","kind","status","category","amount","currency","occurred_on","payment_method","merchant_or_source","description","entered_by","approval_request_id","posted_at"];
    const records=rows.map(r=>[r.id,r.kind,r.status,r.category.name,r.amount.toFixed(4),
      r.currencyCode,r.occurredOn.toISOString().slice(0,10),r.method,r.merchantOrSource??"",
      r.description??"",r.enteredBy.loginId,r.approvalRequestId,r.postedAt?.toISOString()??""]
      .map(csvCell).join(","));
    return {filename:"digimarket-finance-"+view+".csv",csv:[header.join(","),...records].join("\r\n")+"\r\n"};
  }
}
