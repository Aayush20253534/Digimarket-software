import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerNotesRoutes } from "./routes";
import { AuthError } from "../auth/errors";
import type { AuthService } from "../auth/service";

const userId="11111111-1111-4111-8111-111111111111";
const organizationId="22222222-2222-4222-8222-222222222222";
const noteId="33333333-3333-4333-8333-333333333333";
const valid={title:"Design ideas",body:"**New homepage**",strokes:"[]"};
const principal={userId,organizationId,sessionId:"session",roles:["EMPLOYEE"],permissions:new Set<string>()};
const db={
 personalNote:{
  findMany:vi.fn(),findFirst:vi.fn(),findFirstOrThrow:vi.fn(),create:vi.fn(),updateMany:vi.fn(),deleteMany:vi.fn(),
 }
};
function app(){
 const expressApp=express();
 expressApp.use(express.json());
 const auth={database:db,authenticate:vi.fn().mockResolvedValue(principal)} as unknown as AuthService;
 registerNotesRoutes(expressApp,auth);
 expressApp.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
  void _next;
  if(error instanceof AuthError)return res.status(error.status).json({error:{code:error.code,message:error.message}});
  return res.status(500).json({error:{code:"INTERNAL_ERROR"}});
 });
 return expressApp;
}
beforeEach(()=>{vi.resetAllMocks();});
describe("private notes API isolation and version protection",()=>{
 it("rejects missing access token",async()=>{
  const response=await request(app()).get("/api/v1/notes");
  expect(response.status).toBe(401);
  expect(db.personalNote.findMany).not.toHaveBeenCalled();
 });
 it("never fetches other organizations or owners in lists",async()=>{
  db.personalNote.findMany.mockResolvedValue([]);
  const response=await request(app()).get("/api/v1/notes").set("Authorization","Bearer token");
  expect(response.status).toBe(200);
  expect(db.personalNote.findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{organizationId,ownerId:userId},take:100
  }));
 });
 it("does not disclose a foreign note by id",async()=>{
  db.personalNote.findFirst.mockResolvedValue(null);
  const result=await request(app()).get("/api/v1/notes/"+noteId).set("Authorization","Bearer token");
  expect(result.status).toBe(404);
  expect(db.personalNote.findFirst).toHaveBeenCalledWith({where:{id:noteId,organizationId,ownerId:userId}});
 });
 it("binds owner on creation and rejects malformed drawing",async()=>{
  const bad=await request(app()).post("/api/v1/notes").set("Authorization","Bearer token")
   .send({...valid,strokes:'[{"color":"not-ink","points":[]}]'});
  expect(bad.status).toBe(422);
  expect(db.personalNote.create).not.toHaveBeenCalled();
  db.personalNote.create.mockResolvedValue({id:noteId,...valid,version:1});
  const good=await request(app()).post("/api/v1/notes").set("Authorization","Bearer token").send(valid);
  expect(good.status).toBe(201);
  expect(db.personalNote.create).toHaveBeenCalledWith({data:{...valid,organizationId,ownerId:userId}});
 });
 it("uses compare-and-swap revisions for updates",async()=>{
  db.personalNote.updateMany.mockResolvedValue({count:0});
  db.personalNote.findFirst.mockResolvedValue({id:noteId});
  const response=await request(app()).put("/api/v1/notes/"+noteId)
   .set("Authorization","Bearer token").send({...valid,version:2});
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe("VERSION_CONFLICT");
  expect(db.personalNote.updateMany).toHaveBeenCalledWith({
   where:{id:noteId,organizationId,ownerId:userId,version:2},
   data:{...valid,version:{increment:1}},
  });
 });
 it("requires matching ownership and version on deletion",async()=>{
  db.personalNote.deleteMany.mockResolvedValue({count:0});
  const response=await request(app()).delete("/api/v1/notes/"+noteId+"?version=1")
   .set("Authorization","Bearer token");
  expect(response.status).toBe(409);
  expect(db.personalNote.deleteMany).toHaveBeenCalledWith({
   where:{id:noteId,organizationId,ownerId:userId,version:1},
  });
 });
});
