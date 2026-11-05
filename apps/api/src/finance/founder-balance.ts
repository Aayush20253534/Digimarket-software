import {Prisma, type PrismaClient} from "@digimarket/db";

// Finance is the authoritative founder pool. Each founder's spendable amount is
// their POSTED agency income minus POSTED agency expenses, client-funded Meta
// Ads recorded under that founder, and PAID salary allocations funded by them.
// This is an attributed bookkeeping balance, not an actual bank account balance.
type LedgerDb=Pick<PrismaClient,
 "financialTransaction"|"financialCategory"|"salaryFundingAllocation"|"salaryFundingAccount">;

const isMetaAds=(name:string)=>/^meta[\s_-]*(?:ads?|advertising|advertisements?)$/i.test(name.trim());
const zero=()=>new Prisma.Decimal(0);
export type FounderBalance={
 founderUserId:string;
 financeNetBeforeSalary:Prisma.Decimal;
 salaryFunded:Prisma.Decimal;
 remaining:Prisma.Decimal;
};

export async function founderLedgerBalances(db:LedgerDb,organizationId:string,founderIds:readonly string[]):Promise<Map<string,FounderBalance>>{
 const ids=[...new Set(founderIds)];
 const results=new Map<string,FounderBalance>();
 if(!ids.length)return results;
 const [categories,posted,accounts]=await Promise.all([
  db.financialCategory.findMany({where:{organizationId,kind:"EXPENSE"},
   select:{id:true,name:true}}),
  db.financialTransaction.groupBy({by:["enteredById","kind"],where:{
   organizationId,enteredById:{in:ids},clientId:null,status:"POSTED"
  },_sum:{amount:true}}),
  db.salaryFundingAccount.findMany({where:{organizationId,founderUserId:{in:ids}},
   select:{id:true,founderUserId:true}})
 ]);
 const metaIds=categories.filter(c=>isMetaAds(c.name)).map(c=>c.id);
 const [ads,allocations]=await Promise.all([
  metaIds.length?db.financialTransaction.groupBy({by:["enteredById"],where:{
   organizationId,enteredById:{in:ids},clientId:{not:null},status:"POSTED",
   kind:"EXPENSE",categoryId:{in:metaIds}
  },_sum:{amount:true}}):Promise.resolve([]),
  accounts.length?db.salaryFundingAllocation.groupBy({by:["accountId"],where:{
   accountId:{in:accounts.map(a=>a.id)},
   payment:{organizationId,status:"PAID"}
  },_sum:{amount:true}}):Promise.resolve([])
 ]);
 const income=new Map<string,Prisma.Decimal>(),expense=new Map<string,Prisma.Decimal>();
 for(const row of posted){
  const target=row.kind==="INCOME"?income:expense;
  target.set(row.enteredById,(target.get(row.enteredById)??zero()).plus(row._sum.amount??0));
 }
 const clientAds=new Map<string,Prisma.Decimal>();
 for(const row of ads){
  clientAds.set(row.enteredById,(clientAds.get(row.enteredById)??zero()).plus(row._sum.amount??0));
 }
 const byAccount=new Map(accounts.map(a=>[a.id,a.founderUserId]));
 const salary=new Map<string,Prisma.Decimal>();
 for(const row of allocations){
  const id=byAccount.get(row.accountId);if(!id)continue;
  salary.set(id,(salary.get(id)??zero()).plus(row._sum.amount??0));
 }
 for(const id of ids){
  const financeNetBeforeSalary=(income.get(id)??zero()).minus(expense.get(id)??zero())
   .minus(clientAds.get(id)??zero());
  const salaryFunded=salary.get(id)??zero();
  results.set(id,{founderUserId:id,financeNetBeforeSalary,salaryFunded,
   remaining:financeNetBeforeSalary.minus(salaryFunded)});
 }
 return results;
}
