import "dotenv/config";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { createDatabaseClient } from "@digimarket/db";
import { sweepRecurrences } from "./recurrence";
import { sweepBillingSchedules } from "./billing-recurrence";

function redisOptions():ConnectionOptions {
 const value=process.env.REDIS_URL;
 if(!value)throw new Error("REDIS_URL is required for task worker");
 const url=new URL(value);
 if(!["redis:","rediss:"].includes(url.protocol))throw new Error("Unsupported Redis URL");
 return {host:url.hostname,port:Number(url.port||6379),
   ...(url.username?{username:decodeURIComponent(url.username)}:{}),
   ...(url.password?{password:decodeURIComponent(url.password)}:{}),
   ...(url.pathname&&url.pathname!=="/"?{db:Number(url.pathname.slice(1))}:{}),
   ...(url.protocol==="rediss:"?{tls:{}}:{}),
   maxRetriesPerRequest:null};
}
if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL required for task worker");
const db=createDatabaseClient(),connection=redisOptions();
const queue=new Queue("digimarket-task-recurrence",{connection});
const worker=new Worker("digimarket-task-recurrence",async job=>{
 if(job.name==="scan-billing-schedules"){
  const result=await sweepBillingSchedules(db,new Date(),100);
  if(result.created||result.paused)console.info("Billing draft sweep",result);
  return result;
 }
 if(job.name!=="scan-recurring-tasks")throw new Error("Unknown worker job");
 const outcome=await sweepRecurrences(db,new Date(),100);
 if(outcome.created||outcome.disabled)console.info("Task recurrence sweep",outcome);
 return outcome;
},{connection,concurrency:1});
worker.on("failed",(job,error)=>console.error("Task recurrence job failed",job?.id,error.message));
await queue.upsertJobScheduler("minute-sweep",{every:60_000},{
 name:"scan-recurring-tasks",data:{},
 opts:{attempts:4,backoff:{type:"exponential",delay:1500},
   removeOnComplete:100,removeOnFail:1000},
});
await queue.upsertJobScheduler("billing-minute-sweep",{every:60_000},{
 name:"scan-billing-schedules",data:{},
 opts:{attempts:4,backoff:{type:"exponential",delay:1500},removeOnComplete:100,removeOnFail:1000},
});
console.info("Task and recurring billing BullMQ worker ready");
let shuttingDown=false;
async function shutdown(){
 if(shuttingDown)return;shuttingDown=true;
 await worker.close();
 await queue.close();
 await db.$disconnect();
}
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>{void shutdown().then(()=>{process.exitCode=0;}).catch(e=>{
 console.error(e);process.exitCode=1;});});
