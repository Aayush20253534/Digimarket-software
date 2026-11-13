/**
 * Contract weeks are seven-day blocks anchored on the client's contract start,
 * continuing across months. A week belongs to its START month, and the final
 * week ends at the contract end date inclusive. No week is duplicated.
 */
const DAY=86400000;
const utcDay=(value:Date)=>Date.UTC(value.getUTCFullYear(),value.getUTCMonth(),value.getUTCDate());
const iso=(timestamp:number)=>new Date(timestamp).toISOString().slice(0,10);
export type ReadinessWeek={week:number;from:string;to:string};
export const monthWeeks=(month:string,startOn:Date|null=null,endOn:Date|null=null):ReadinessWeek[]=>{
 const [year,number]=month.split("-").map(Number);
 const first=Date.UTC(year,number-1,1),last=Date.UTC(year,number,0);
 const end=endOn?utcDay(endOn):Infinity;
 const weeks:ReadinessWeek[]=[];
 if(!startOn){
  // Retain original month buckets when a client lacks contract start.
  for(let start=first;start<=last&&start<=end;start+=7*DAY)
   weeks.push({week:weeks.length+1,from:iso(start),to:iso(Math.min(start+6*DAY,last,end))});
  return weeks;
 }
 const anchor=utcDay(startOn),firstIndex=Math.max(0,Math.ceil((first-anchor)/(7*DAY)));
 for(let start=anchor+firstIndex*7*DAY;start<=last&&start<=end;start+=7*DAY)
  weeks.push({week:weeks.length+1,from:iso(start),to:iso(Math.min(start+6*DAY,end))});
 return weeks;
};
