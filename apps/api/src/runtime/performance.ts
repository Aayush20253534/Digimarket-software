const bounds=[25,50,100,200,400,800,1600,3200,6400,12800] as const;
type Bucket={count:number;errors:number;sum:number;max:number;histogram:number[]};
const buckets=new Map<string,Bucket>();
/** Only fixed route templates and status codes, never URLs, IDs or payloads. */
export function recordLatency(key:string,ms:number,failed=false){
 if(!Number.isFinite(ms)||ms<0)return;
 if(!buckets.has(key)&&buckets.size>=250)key="other";
 let bucket=buckets.get(key);
 if(!bucket){bucket={count:0,errors:0,sum:0,max:0,histogram:Array(bounds.length+1).fill(0)};buckets.set(key,bucket);}
 bucket.count++;bucket.errors+=Number(failed);bucket.sum+=ms;bucket.max=Math.max(bucket.max,ms);
 const index=bounds.findIndex(bound=>ms<=bound);
 bucket.histogram[index<0?bounds.length:index]++;
}
function percentile(b:Bucket,fraction:number){
 let count=0;
 for(let i=0;i<b.histogram.length;i++){count+=b.histogram[i];if(count>=Math.ceil(b.count*fraction))return bounds[i]??Math.ceil(b.max);}
 return 0;
}
export function performanceSnapshot(){
 return [...buckets.entries()].map(([route,b])=>({route,count:b.count,errors:b.errors,meanMs:Math.round(b.sum/b.count),p50UpperMs:percentile(b,.5),p95UpperMs:percentile(b,.95),maxMs:Math.ceil(b.max)})).sort((a,b)=>b.p95UpperMs-a.p95UpperMs);
}
