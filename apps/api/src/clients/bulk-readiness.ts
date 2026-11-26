import type {PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {AuthError,forbidden} from "../auth/errors";
import {ClientVideoReadinessService,videoCycleSelect,type VideoCycleRow} from "./video-readiness-service";
import {ClientPostReadinessService,postCycleSelect,type PostCycleRow} from "./post-readiness-service";

function group<T extends {clientId:string}>(rows:T[]){
 const map=new Map<string,T[]>();
 for(const row of rows){const existing=map.get(row.clientId);if(existing)existing.push(row);else map.set(row.clientId,[row]);}
 return map;
}

/** Bounded, tenant-scoped bulk retrieval; reuses exactly the individual cycle calculations. */
export async function bulkClientReadiness(db:PrismaClient,actor:Principal,ids:string[],today:string){
 if(!actor.permissions.has("clients.read"))throw forbidden();
 const videos=new ClientVideoReadinessService(db),posts=new ClientPostReadinessService(db);
 const result=new Map<string,{v:ReturnType<typeof videos.calculateClientCycle>;p:ReturnType<typeof posts.calculateClientCycle>}>();
 const unique=[...new Set(ids)];
 for(let offset=0;offset<unique.length;offset+=100){
  const batch=unique.slice(offset,offset+100);
  const [clients,vrows,prows]=await Promise.all([
   db.client.findMany({where:{organizationId:actor.organizationId,id:{in:batch}},select:{id:true,businessName:true,contractStartOn:true,contractEndOn:true,agreementEndedOn:true,currentAgreementStartOn:true}}),
   db.clientVideoWeek.findMany({where:{organizationId:actor.organizationId,clientId:{in:batch},month:{lte:"9999-12"}},select:{...videoCycleSelect,clientId:true}}),
   db.clientPostWeek.findMany({where:{organizationId:actor.organizationId,clientId:{in:batch},month:{lte:"9999-12"}},select:{...postCycleSelect,clientId:true}}),
  ]);
  if(clients.length!==batch.length)throw new AuthError(404,"NOT_FOUND","Client not found");
  const byVideo=group<VideoCycleRow & {clientId:string}>(vrows),byPost=group<PostCycleRow & {clientId:string}>(prows);
  for(const client of clients){
   const vr=byVideo.get(client.id)??[],pr=byPost.get(client.id)??[];
   result.set(client.id,{v:videos.calculateClientCycle(client,vr,pr,undefined,today),p:posts.calculateClientCycle(client,pr,vr,undefined,today)});
  }
 }
 return result;
}
