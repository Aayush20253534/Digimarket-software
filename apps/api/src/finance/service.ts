import { Prisma, type PrismaClient } from "@digimarket/db";
import { financeProofPrefix } from "../assets/service";
import type { FinanceCategoryInput, FinanceEntryInput, FinanceEntryAdminEdit, FinanceKind } from "@digimarket/contracts";
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

  async editExpense(actor:Principal,id:string,input:FinanceEntryAdminEdit){
    this.administrator(actor);
    const amount=new Prisma.Decimal(input.amount);
    if(!amount.isFinite()||amount.lte(0))throw invalid("Amount must be greater than zero");
    return this.db.$transaction(async tx=>{
      const entry=await tx.financialTransaction.findFirst({
        where:{id,organizationId:actor.organizationId,kind:"EXPENSE"},
        include:{verifiedPayment:{select:{id:true}}},
      });
      if(!entry)throw new AuthError(404,"NOT_FOUND","Expense not found");
      if(entry.status==="CANCELLED"||entry.verifiedPayment)
        throw new AuthError(409,"FINANCE_IMMUTABLE","Cancelled or reconciled expenses cannot be edited");
      const category=await tx.financialCategory.findFirst({
        where:{id:input.categoryId,organizationId:actor.organizationId,kind:"EXPENSE",active:true},
      });
      if(!category)throw invalid("Choose an active expense category in this organization");
      const updated=await tx.financialTransaction.update({where:{id},data:{
        categoryId:category.id,amount,occurredOn:new Date(input.occurredOn+"T00:00:00.000Z"),
        method:input.method,merchantOrSource:input.merchantOrSource,description:input.description,
      }});
      await tx.auditLog.create({data:{organizationId:actor.organizationId,actorId:actor.userId,
        action:"finance.expense_edited",entityType:"FinancialTransaction",entityId:id,
        beforeRedacted:{amount:entry.amount.toFixed(4),categoryId:entry.categoryId,status:entry.status},
        afterRedacted:{amount:updated.amount.toFixed(4),categoryId:updated.categoryId,status:updated.status},
      }});
      return {id,amount:updated.amount.toFixed(4),categoryId:updated.categoryId,status:updated.status};
    });
  }

  async removeExpense(actor:Principal,id:string){
    this.administrator(actor);
    return this.db.$transaction(async tx=>{
      const entry=await tx.financialTransaction.findFirst({
        where:{id,organizationId:actor.organizationId,kind:"EXPENSE"},
        include:{verifiedPayment:{select:{id:true}}},
      });
      if(!entry)throw new AuthError(404,"NOT_FOUND","Expense not found");
      if(entry.status==="CANCELLED")throw new AuthError(409,"ALREADY_CANCELLED","Expense already cancelled");
      if(entry.verifiedPayment)throw new AuthError(409,"FINANCE_IMMUTABLE","Reconciled expense cannot be cancelled");
      await tx.financialTransaction.update({where:{id},data:{status:"CANCELLED",postedAt:null}});
      await tx.approvalRequest.updateMany({
        where:{id:entry.approvalRequestId,organizationId:actor.organizationId,status:"PENDING"},
        data:{status:"CANCELLED",decidedAt:new Date()},
      });
      await tx.auditLog.create({data:{organizationId:actor.organizationId,actorId:actor.userId,
        action:"finance.expense_cancelled",entityType:"FinancialTransaction",entityId:id,
        beforeRedacted:{status:entry.status,amount:entry.amount.toFixed(4)},
        afterRedacted:{status:"CANCELLED"},
      }});
      return {id,status:"CANCELLED" as const};
    });
  }

  async submit(actor:Principal,input:FinanceEntryInput){
    need(actor,"finance.entry.create");
    need(actor,"approvals.submit");
    const amount=new Prisma.Decimal(input.amount);
    if(!amount.isFinite()||amount.lte(0))throw invalid("Amount must be greater than zero");
    const [category,policy,organization]=await Promise.all([
      this.db.financialCategory.findFirst({where:{id:input.categoryId,organizationId:actor.organizationId,kind:input.kind,active:true}}),
      this.db.approvalPolicy.findUnique({where:{organizationId_category:{organizationId:actor.organizationId,category:"FINANCE"}}}),
      this.db.organization.findUnique({where:{id:actor.organizationId},select:{defaultCurrency:true}}),
    ]);
    if(!category)throw invalid("Select an active category belonging to this workspace and type");
    if(!policy?.active||!policy.approverRoleKeys.length)throw invalid("An administrator must activate a FINANCE approval policy");
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
        const approval=await tx.approvalRequest.create({data:{
          organizationId:actor.organizationId,policyId:policy.id,requesterId:actor.userId,
          title:(input.kind==="EXPENSE"?"Expense: ":"Income: ")+category.name,
          description:input.description?.trim() || (input.merchantOrSource?.trim()||category.name),
          referenceType:"FINANCE_ENTRY",approverRoleKeys:policy.approverRoleKeys,
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
        }});
        await tx.approvalRequest.update({where:{id:approval.id},data:{referenceId:entry.id}});
        await tx.auditLog.create({data:{organizationId:actor.organizationId,actorId:actor.userId,
          action:"finance.submitted",entityType:"FinancialTransaction",entityId:entry.id,
          afterRedacted:{kind:entry.kind,status:entry.status,currency:entry.currencyCode}}});
        await tx.outboxEvent.create({data:{
          organizationId:actor.organizationId,eventKey:"finance.submitted."+entry.id,
          kind:"finance.submitted",aggregateType:"FinancialTransaction",aggregateId:entry.id,
          payloadMinimal:{transactionId:entry.id,approvalId:approval.id},
        }});
        return this.present(entry);
      });
    }catch(error){
      if((error as {code?:string}).code==="P2002")throw duplicate();
      throw error;
    }
  }

  private present(row:{id:string;kind:FinanceKind;amount:Prisma.Decimal;currencyCode:string;occurredOn:Date;status:string;
    categoryId:string;enteredById:string;approvalRequestId:string;description:string|null;merchantOrSource:string|null;
    method:string;createdAt:Date;postedAt:Date|null}){
    return {...row,amount:row.amount.toFixed(4),occurredOn:row.occurredOn.toISOString().slice(0,10)};
  }

  async entries(actor:Principal,view:View){
    const rows=await this.db.financialTransaction.findMany({
      where:this.scope(actor,view),orderBy:{createdAt:"desc"},take:200,
      include:{category:{select:{name:true}},enteredBy:{select:{displayName:true,loginId:true}}},
    });
    return rows.map(r=>({...this.present(r),category:r.category,enteredBy:r.enteredBy}));
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
