import "dotenv/config";
import assert from "node:assert/strict";
import {Queue,Worker} from "bullmq";
import {randomUUID} from "node:crypto";

if(process.env.NODE_ENV!=="test" || !process.env.REDIS_URL?.includes("127.0.0.1"))
 throw new Error("BullMQ test requires disposable localhost Redis");
const url=new URL(process.env.REDIS_URL);
const connection={host:url.hostname,port:Number(url.port||6379),maxRetriesPerRequest:null};
const queue=new Queue("digimarket-ci-"+randomUUID(),{connection});
let received=0;
const worker=new Worker(queue.name,async job=>{
 assert.equal(job.name,"test-recurring-job");
 received++;
 return true;
},{connection});
try{
 await queue.upsertJobScheduler("integration-minute",{every:1000},{
  name:"test-recurring-job",data:{},
  opts:{attempts:2,removeOnComplete:20,removeOnFail:20},
 });
 const deadline=Date.now()+12000;
 while(!received && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
 assert.ok(received>=1,"BullMQ scheduled worker job never processed");
 await queue.removeJobScheduler("integration-minute");
 console.info("Module 11 BullMQ PASS: Redis scheduler dispatch and worker consumption");
}finally{
 await worker.close();await queue.obliterate({force:true});await queue.close();
}
