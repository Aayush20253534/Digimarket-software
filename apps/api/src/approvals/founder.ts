import type { Prisma } from "@digimarket/db";
import type { ApprovalCategory } from "@digimarket/contracts";
import type { Principal } from "../auth/service";

export const isFounder=(actor:Pick<Principal,"roles">)=>actor.roles.includes("FOUNDER");

// Keep the mandatory history reference without activating a policy for staff.
export async function founderPolicy(tx:Prisma.TransactionClient,organizationId:string,category:ApprovalCategory){
 return tx.approvalPolicy.upsert({
  where:{organizationId_category:{organizationId,category}},
  create:{organizationId,category,name:category+" (founder direct entries)",active:false,approverRoleKeys:[]},
  update:{},
 });
}
