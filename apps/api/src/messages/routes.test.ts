import express,{type NextFunction,type Request,type Response} from "express";
import request from "supertest";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {registerWorkspaceMessages} from "./routes";
import {AuthError} from "../auth/errors";
import type {AuthService} from "../auth/service";

const org="22222222-2222-4222-8222-222222222222";
const owner="11111111-1111-4111-8111-111111111111";
const teammate="33333333-3333-4333-8333-333333333333";
const outside="44444444-4444-4444-8444-444444444444";
const member={id:teammate,displayName:"Teammate",loginId:"employee",avatarData:null};
const database={
 user:{findMany:vi.fn(),findFirst:vi.fn()},
 workspaceMessage:{groupBy:vi.fn(),updateMany:vi.fn()}
};
function makeApp(){
 const app=express();app.use(express.json());
 const auth={database,authenticate:vi.fn().mockResolvedValue({
  organizationId:org,userId:owner,roles:["EMPLOYEE"],permissions:new Set()
 })} as unknown as AuthService;
 registerWorkspaceMessages(app,auth);
 app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
  if(error instanceof AuthError)return res.status(error.status).json({error:{code:error.code}});
  return res.status(500).json({error:{code:"INTERNAL_ERROR"}});
 });
 return app;
}
beforeEach(()=>{vi.resetAllMocks();});
describe("private messages and unread counters",()=>{
 it("counts only incoming unread messages for the signed-in recipient",async()=>{
  database.user.findMany.mockResolvedValue([member,{id:outside,displayName:"Other",loginId:"other",avatarData:null}]);
  database.workspaceMessage.groupBy.mockResolvedValue([{senderId:teammate,_count:{_all:2}}]);
  const res=await request(makeApp()).get("/api/v1/messages/users").set("Authorization","Bearer token");
  expect(res.status).toBe(200);
  expect(res.body.data.items[0].unreadCount).toBe(2);
  expect(res.body.data.items[1].unreadCount).toBe(0);
  expect(database.workspaceMessage.groupBy).toHaveBeenCalledWith(expect.objectContaining({
   by:["senderId"],where:{organizationId:org,recipientId:owner,readAt:null}
  }));
  expect(database.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{organizationId:org,status:"ACTIVE",id:{not:owner}}
  }));
 });
 it("marks only the selected sender's incoming messages, never another conversation",async()=>{
  database.user.findFirst.mockResolvedValue({id:teammate});
  database.workspaceMessage.updateMany.mockResolvedValue({count:1});
  const res=await request(makeApp()).post("/api/v1/messages/read/"+teammate).set("Authorization","Bearer token");
  expect(res.status).toBe(200);
  expect(res.body.data.marked).toBe(1);
  expect(database.workspaceMessage.updateMany).toHaveBeenCalledWith({
   where:{organizationId:org,senderId:teammate,recipientId:owner,readAt:null},
   data:{readAt:expect.any(Date)}
  });
 });
 it("rejects cross-organization or nonactive targets",async()=>{
  database.user.findFirst.mockResolvedValue(null);
  const res=await request(makeApp()).post("/api/v1/messages/read/"+outside).set("Authorization","Bearer token");
  expect(res.status).toBe(404);
  expect(database.workspaceMessage.updateMany).not.toHaveBeenCalled();
  expect(database.user.findFirst).toHaveBeenCalledWith({
   where:{id:outside,organizationId:org,status:"ACTIVE"},select:{id:true}
  });
 });
 it("requires authentication before revealing members or unread counts",async()=>{
  const res=await request(makeApp()).get("/api/v1/messages/users");
  expect(res.status).toBe(401);
  expect(database.workspaceMessage.groupBy).not.toHaveBeenCalled();
 });
});
