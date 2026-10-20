import request from "supertest";
import {describe,it,expect,vi,afterEach} from "vitest";
import type {AuthService} from "../auth/service";
import {createApp} from "../app";
import {validateProductionApiConfig} from "./production";

const live={
 NODE_ENV:"production",DATABASE_URL:"postgresql://dev:secret@db.example.net/agency?sslmode=require",
 DIRECT_DATABASE_URL:"postgresql://dev:secret@db.example.net/agency?sslmode=require",
 JWT_ACCESS_SECRET:"a".repeat(42),JWT_CHALLENGE_SECRET:"b".repeat(42),
 MFA_ENCRYPTION_KEY_BASE64:Buffer.alloc(32,7).toString("base64"),
 CORS_ALLOWED_ORIGINS:"https://agency.example.com",CLOUDINARY_CLOUD_NAME:"private",
 CLOUDINARY_API_KEY:"non-secret-id",CLOUDINARY_API_SECRET:"secret-placeholder",
 OPS_MONITOR_TOKEN:"x".repeat(48),
};
afterEach(()=>{vi.unstubAllEnvs();});
describe("module17 production safeguards",()=>{
 it("rejects missing production credentials without revealing values",()=>{
  expect(()=>validateProductionApiConfig({...live,DATABASE_URL:""})).toThrow("DATABASE_URL");
 });
 it("rejects insecure or localhost production origins",()=>{
  expect(()=>validateProductionApiConfig({...live,CORS_ALLOWED_ORIGINS:"http://localhost:3000"})).toThrow("HTTPS");
  expect(()=>validateProductionApiConfig({...live,CORS_ALLOWED_ORIGINS:"https://a.example/path"})).toThrow("HTTPS");
 });
 it("rejects weak MFA encryption and insecure database connection strings",()=>{
  expect(()=>validateProductionApiConfig({...live,MFA_ENCRYPTION_KEY_BASE64:"MA=="})).toThrow("32 bytes");
  expect(()=>validateProductionApiConfig({...live,DATABASE_URL:"postgresql://a:b@host/db"})).toThrow("sslmode");
 });
 it("accepts complete production configuration with independent secrets",()=>{
  expect(()=>validateProductionApiConfig(live)).not.toThrow();
 });
 it("accepts explicit certificate and hostname verification for Neon URLs",()=>{
  const url="postgresql://dev:secret@db.example.net/agency?sslmode=verify-full";
  expect(()=>validateProductionApiConfig({...live,DATABASE_URL:url,DIRECT_DATABASE_URL:url})).not.toThrow();
 });
 it("disallows weakened libpq compatibility for legacy require URLs",()=>{
  expect(()=>validateProductionApiConfig({...live,
    DATABASE_URL:"postgresql://dev:secret@db.example.net/agency?sslmode=require&uselibpqcompat=true"})).toThrow("verified TLS");
 });
 it("does not force production settings on a local test app",()=>{
  expect(()=>validateProductionApiConfig({NODE_ENV:"test"})).not.toThrow();
 });
 it("has non-cached DB readiness that fails closed without database",async()=>{
  const r=await request(createApp()).get("/api/v1/ready");
  expect(r.status).toBe(503);expect(r.headers["cache-control"]).toBe("no-store");
 });
 it("checks database availability without querying customer records",async()=>{
  const db={$queryRaw:vi.fn().mockResolvedValue([1])};
  const auth={database:db} as unknown as AuthService;
  const r=await request(createApp(undefined,auth)).get("/api/v1/ready");
  expect(r.status).toBe(200);expect(r.body.data.database).toBe("ok");
  expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  db.$queryRaw.mockRejectedValue(new Error("offline"));
  expect((await request(createApp(undefined,auth)).get("/api/v1/ready")).status).toBe(503);
 });
 it("locks operational stats behind independent secret and reports stale worker",async()=>{
  vi.stubEnv("OPS_MONITOR_TOKEN","s".repeat(40));
  const db={
   serviceHeartbeat:{findUnique:vi.fn().mockResolvedValue({lastSeenAt:new Date(Date.now()-10000)})},
   outboxEvent:{count:vi.fn().mockResolvedValue(0)},
  };
  const app=createApp(undefined,{database:db} as unknown as AuthService);
  expect((await request(app).get("/api/v1/ops/health")).status).toBe(404);
  expect((await request(app).get("/api/v1/ops/health").set("x-ops-token","wrong")).status).toBe(404);
  const ok=await request(app).get("/api/v1/ops/health").set("x-ops-token","s".repeat(40));
  expect(ok.status).toBe(200);expect(ok.body.data.workerAlive).toBe(true);
  db.serviceHeartbeat.findUnique.mockResolvedValue({lastSeenAt:new Date(Date.now()-3600000)});
  const stale=await request(app).get("/api/v1/ops/health").set("x-ops-token","s".repeat(40));
  expect(stale.status).toBe(503);expect(stale.body.data.workerAlive).toBe(false);
 });
});
