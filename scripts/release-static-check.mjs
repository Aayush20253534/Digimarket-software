// Static, secret-free deploy manifest checks run in CI.
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
const raw=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const render=raw("render.yaml"),vercel=JSON.parse(raw("apps/web/vercel.json"));
const gitignore=raw(".gitignore");
assert.equal(vercel.framework,"nextjs");
assert.ok(vercel.buildCommand.includes("@digimarket/contracts build"));
assert.ok(vercel.buildCommand.includes("@digimarket/web build"));
assert.ok(render.includes("name: digimarket-api")&&render.includes("plan: free"));
assert.ok(!render.includes("name: digimarket-worker"),"Paid worker must not be provisioned by free Blueprint");
assert.ok(render.includes("autoDeployTrigger: off"));
assert.ok(!render.includes("preDeployCommand:"),"Render Free cannot run pre-deploy hook");
assert.ok(render.includes("startCommand:")&&render.includes("db:migrate:deploy")&&render.includes("seed.ts")&&render.includes("@digimarket/api start"));
assert.ok(render.includes("healthCheckPath: /api/v1/ready"));
for(const key of ["DATABASE_URL","DIRECT_DATABASE_URL","JWT_ACCESS_SECRET","JWT_CHALLENGE_SECRET",
 "CORS_ALLOWED_ORIGINS","CLOUDINARY_API_SECRET","OPS_MONITOR_TOKEN"]){
 assert.ok(render.includes("key: "+key),"Missing template variable "+key);
}
for(const value of ["*.age","*.dump",".env.production.example"]){
 assert.ok(gitignore.includes(value),"Gitignore gap "+value);
}
assert.ok(raw("scripts/db-recovery.mjs").includes("YES_RESTORE_DISPOSABLE_DB"));
assert.ok(raw("scripts/postdeploy-smoke.mjs").includes("/api/v1/ready"));
console.info("PASS production manifests, secret exclusion and recovery guard static checks");
