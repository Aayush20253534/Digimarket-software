#!/usr/bin/env node
// Encrypted PostgreSQL backup and disposable restore rehearsal.
// Never put database passwords into subprocess argv or GitHub artifacts.
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,dirname,resolve,basename} from "node:path";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";

function required(name){const v=process.env[name];if(!v)throw Error("Missing "+name);return v;}
function pgEnv(uri){
 const u=new URL(uri);
 if(!["postgresql:","postgres:"].includes(u.protocol)||!u.hostname||!u.pathname.slice(1))
  throw Error("Invalid PostgreSQL connection information");
 return {
  ...process.env,
  PGHOST:u.hostname,PGPORT:u.port||"5432",PGUSER:decodeURIComponent(u.username),
  PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:decodeURIComponent(u.pathname.slice(1)),
  PGSSLMODE:u.searchParams.get("sslmode")||"require",
 };
}
function run(bin,args,env=process.env){
 const p=spawnSync(bin,args,{env,stdio:["ignore","inherit","inherit"],timeout:240000});
 if(p.error||p.status!==0)throw Error("Database recovery command failed: "+bin);
}
const action=process.argv[2],fileArg=process.argv[3];
if(!["backup","restore"].includes(action)||!fileArg)
 throw Error("Usage: node scripts/db-recovery.mjs backup <absolute-output.age> | restore <input.age>");
const file=resolve(fileArg);
const temporary=mkdtempSync(join(tmpdir(),"digimarket-recovery-"));
try{
 const dump=join(temporary,"db.dump");
 if(action==="backup"){
  if(!file.endsWith(".age"))throw Error("Encrypted backup must have .age suffix");
  if(existsSync(file))throw Error("Refusing to overwrite an existing backup");
  const db=pgEnv(required("DIRECT_DATABASE_URL"));
  const recipient=required("BACKUP_AGE_RECIPIENT");
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  run("pg_dump",["--no-password","--format=custom","--no-owner","--no-privileges","--file",dump],db);
  run("age",["--encrypt","--recipient",recipient,"--output",file,dump]);
  const checksum=createHash("sha256").update(readFileSync(file)).digest("hex");
  writeFileSync(file+".sha256",checksum+"  "+basename(file)+"\n",{flag:"wx",mode:0o600});
  process.stdout.write("Encrypted backup and checksum created; transfer to managed off-site encrypted storage.\n");
 }else{
  if(process.env.RESTORE_REHEARSAL_CONFIRM!=="YES_RESTORE_DISPOSABLE_DB")
   throw Error("Restore requires explicit disposable-database confirmation");
  if(!file.endsWith(".age")||!existsSync(file))throw Error("Encrypted backup file missing");
  const source=new URL(required("DIRECT_DATABASE_URL"));
  const target=new URL(required("RESTORE_DATABASE_URL"));
  const db=decodeURIComponent(target.pathname.slice(1));
  if(!db.endsWith("_restore_rehearsal"))throw Error("Restore target must end with _restore_rehearsal");
  if(source.href===target.href||(!db||db===decodeURIComponent(source.pathname.slice(1))))
   throw Error("Refusing to restore over source database");
  const checksum=file+".sha256";
  if(existsSync(checksum)){
   const expected=readFileSync(checksum,"utf8").trim().split(/\s+/)[0];
   const current=createHash("sha256").update(readFileSync(file)).digest("hex");
   if(expected!==current)throw Error("Backup checksum mismatch");
  }
  run("age",["--decrypt","--identity",required("BACKUP_AGE_IDENTITY_FILE"),
    "--output",dump,file]);
  run("pg_restore",["--no-password","--no-owner","--no-acl","--clean","--if-exists",
    "--exit-on-error","--dbname",db,dump],pgEnv(required("RESTORE_DATABASE_URL")));
  process.stdout.write("Restore into disposable rehearsal database completed. Verify critical table row counts separately.\n");
 }
}finally{rmSync(temporary,{recursive:true,force:true});}
