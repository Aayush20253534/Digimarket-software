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

export type StoredWeek={month:string;week:number;periodFrom?:Date|null;periodTo?:Date|null};
export type ClientSchedule={contractStartOn:Date|null;contractEndOn:Date|null;agreementEndedOn?:Date|null;currentAgreementStartOn?:Date|null};
export type DatedWeek={storageMonth:string;storageWeek:number;from:string;to:string;legacy:boolean};
const date=(s:string)=>Date.parse(s+"T00:00:00Z");
const nextDay=(s:string)=>iso(date(s)+DAY);
const previousDay=(s:string)=>iso(date(s)-DAY);
const min=(a:string,b:string)=>a<b?a:b;
const max=(a:string,b:string)=>a>b?a:b;
export function shiftMonth(month:string,offset:number){const [y,m]=month.split("-").map(Number);return iso(Date.UTC(y,m-1+offset,1)).slice(0,7);}
function anniversary(month:string,day:number){const [y,m]=month.split("-").map(Number);return iso(Date.UTC(y,m-1,Math.min(day,new Date(Date.UTC(y,m,0)).getUTCDate())));}
export function clientCycle(anchor:string,month:string){
 const day=Number(anchor.slice(8,10)),from=anniversary(month,day),endExclusive=anniversary(shiftMonth(month,1),day);
 return {key:month,from,to:previousDay(endExclusive),endExclusive};
}
export function clientCycleKey(anchor:string,on:string){
 const key=on.slice(0,7);return on<clientCycle(anchor,key).from?shiftMonth(key,-1):key;
}
const dateValue=(d:Date|null|undefined)=>d?iso(d.getTime()):null;
export function datedStoredWeek(row:StoredWeek,c:ClientSchedule):DatedWeek{
 if(row.periodFrom&&row.periodTo)return {storageMonth:row.month,storageWeek:row.week,from:dateValue(row.periodFrom)!,to:dateValue(row.periodTo)!,legacy:row.week<=5};
 if(row.week>5)throw Error("Client readiness interval is missing its saved dates");
 const slot=monthWeeks(row.month,c.contractStartOn,c.contractEndOn).find(w=>w.week===row.week)
   ??monthWeeks(row.month,c.contractStartOn,null).find(w=>w.week===row.week);
 if(!slot)throw Error("Existing readiness week cannot be resolved");
 return {storageMonth:row.month,storageWeek:row.week,from:slot.from,to:slot.to,legacy:true};
}
export function compareStoredWeeks(a:StoredWeek,b:StoredWeek,c:ClientSchedule){
 return datedStoredWeek(a,c).from.localeCompare(datedStoredWeek(b,c).from)||a.month.localeCompare(b.month)||a.week-b.week;
}
const keyOf=(w:DatedWeek)=>w.storageMonth+":"+w.storageWeek;
export function clientReadinessPlan(c:ClientSchedule,entries:StoredWeek[],requestedMonth:string|undefined,today:string){
 const anchor=dateValue(c.contractStartOn),end=dateValue(c.agreementEndedOn??c.contractEndOn);
 // The two ledgers share one date grid, but quantities never mix.
 const stored=[...new Map(entries.map(row=>{const w=datedStoredWeek(row,c);return [keyOf(w),w] as const;})).values()];
 const legacyEnd=stored.filter(w=>w.legacy).reduce<string|null>((last,w)=>last===null?w.to:max(last,w.to),null);
 const currentDay=end&&end<today?end:today;
 const month=requestedMonth??(anchor?clientCycleKey(anchor,max(anchor,currentDay)):currentDay.slice(0,7));
 if(!anchor)return {month,from:null,to:null,agreementAligned:false,legacyThrough:legacyEnd,weeks:[] as DatedWeek[]};
 const cycle=clientCycle(anchor,month),currentStart=dateValue(c.currentAgreementStartOn);
 const weeks=new Map<string,DatedWeek>();
 const add=(w:DatedWeek)=>{if(w.from>=cycle.from&&w.from<=cycle.to)weeks.set(keyOf(w),w);};
 // Stored periods are never shifted, including on an early agreement end.
 for(const w of stored)add(w);
 if(legacyEnd){
   for(const m of [month,shiftMonth(month,1)]){
     for(const w of monthWeeks(m,c.contractStartOn,null)){
       if(w.to>legacyEnd||(end&&w.from>end))continue;
       const legacy={storageMonth:m,storageWeek:w.week,from:w.from,to:w.to,legacy:true};
       if(!weeks.has(keyOf(legacy)))add(legacy);
     }
   }
 }
 // New intervals follow the monthly anniversary and never overlap preserved
 // rows. If a saved interval crosses an anniversary, its full quantity belongs
 // to the cycle where it started. The next open slot starts after it.
 for(let n=0;n<5;n++){
   const normalFrom=iso(date(cycle.from)+n*7*DAY);if(normalFrom>cycle.to)break;
   let from=max(normalFrom,anchor);
   if(legacyEnd)from=max(from,nextDay(legacyEnd));
   if(currentStart)from=max(from,currentStart);
   const to=min(min(iso(date(normalFrom)+6*DAY),cycle.to),end??cycle.to);
   if(from>to)continue;
   // Split only UNSAVED empty time, not previously recorded movements.
   const occupied=stored.filter(w=>w.from<=to&&w.to>=from).sort((a,b)=>a.from.localeCompare(b.from));
   const insert=(start:string,finish:string)=>{
     if(start<=finish)add({storageMonth:start.slice(0,7),storageWeek:5+Number(start.slice(8,10)),from:start,to:finish,legacy:false});
   };
   for(const w of occupied){
     if(w.to<from)continue;
     if(w.from>from)insert(from,previousDay(w.from));
     from=max(from,nextDay(w.to));
   }
   insert(from,to);
 }
 return {month,from:cycle.from,to:cycle.to,agreementAligned:true,legacyThrough:legacyEnd,weeks:[...weeks.values()].sort((a,b)=>a.from.localeCompare(b.from)||a.storageWeek-b.storageWeek)};
}
