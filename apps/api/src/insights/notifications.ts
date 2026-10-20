import type {PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {AuthError,forbidden} from "../auth/errors";
const read=(a:Principal)=>{if(!a.permissions.has("notifications.read"))throw forbidden();};
const missing=()=>new AuthError(404,"NOT_FOUND","Notification not found");
export class NotificationService{
 constructor(private readonly db:PrismaClient){}
 async list(a:Principal,limit=30,unread=false){
  read(a);
  const where={organizationId:a.organizationId,recipientId:a.userId,...(unread?{readAt:null}:{})};
  const [items,count]=await Promise.all([
    this.db.notification.findMany({where,orderBy:[{createdAt:"desc"},{id:"desc"}],
      take:Math.min(limit,100),select:{id:true,kind:true,title:true,body:true,href:true,readAt:true,createdAt:true}}),
    this.db.notification.count({where:{organizationId:a.organizationId,recipientId:a.userId,readAt:null}}),
  ]);
  return {items,unreadCount:count};
 }
 async markRead(a:Principal,id:string){
  read(a);
  const changed=await this.db.notification.updateMany({where:{
    id,organizationId:a.organizationId,recipientId:a.userId,readAt:null},
    data:{readAt:new Date()}});
  if(changed.count===0){
    const exists=await this.db.notification.count({where:{
      id,organizationId:a.organizationId,recipientId:a.userId}});
    if(!exists)throw missing();
  }
  return {id,read:true};
 }
 async readAll(a:Principal){
  read(a);
  const result=await this.db.notification.updateMany({where:{
    organizationId:a.organizationId,recipientId:a.userId,readAt:null},
    data:{readAt:new Date()}});
  return {updated:result.count};
 }
 async cursor(a:Principal){
  read(a);
  const [last,unread]=await Promise.all([
    this.db.notification.findFirst({where:{organizationId:a.organizationId,recipientId:a.userId},
      orderBy:[{createdAt:"desc"},{id:"desc"}],select:{id:true,createdAt:true,readAt:true}}),
    this.db.notification.count({where:{organizationId:a.organizationId,recipientId:a.userId,readAt:null}}),
  ]);
  return {id:last?.id??null,unreadCount:unread};
 }
}
