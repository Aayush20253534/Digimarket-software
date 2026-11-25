import {savePdf} from "./document-pdf";
/** Client-side four-page A4 agreement matching the approved AmplifyWorld legal template. */
export type AgreementFields={
 mode:"default"|"custom";
 clientName:string;clientAddress:string;clientRepresentative:string;clientDesignation:string;clientEmail:string;
 agencyRepresentative:string;agencyDesignation:string;agreementDate:string;startDate:string;endDate:string;
 serviceFee:string;feePeriod:"monthly"|"one-time";
 servicePayment:"full advance"|"monthly advance"|"instalments";advanceAmount:string;paymentSchedule:string;
 adBudget:string;adBudgetMode:"optional"|"mandatory"|"not applicable";
 adPayment:"at signing"|"before ads run"|"per schedule";
 taxMode:"inclusive"|"extra"|"not charged";gstRate:number;
 reels:number;posts:number;services:{name:string;description:string}[];
 exclusions:string;additionalTerms:string;noticeDays:number;
};
export type SavedAgreement={
 id:string;agreementNumber:string;clientName:string;agreementDate:string;
 startDate:string;endDate:string;serviceFee:string;adBudget:string;total:string;
 payload:AgreementFields;createdAt:string;
};
const PW=595,PH=842,scale=2;
const purple="#51217B",muted="#50475A",border="#E0D3E9";
const money=(v:string)=>"INR "+Number(v).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmt=(value:string)=>new Date(value.slice(0,10)+"T12:00:00Z")
  .toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});
type Painter={
 canvas:HTMLCanvasElement;g:CanvasRenderingContext2D;
 text:(value:string,x:number,y:number,size?:number,color?:string,bold?:boolean,maxWidth?:number)=>void;
 wrap:(value:string,x:number,y:number,width:number,size?:number,leading?:number,color?:string,bold?:boolean)=>number;
 line:(y:number)=>void;
 section:(title:string,y:number)=>number;
};
function painter():Painter{
 const canvas=document.createElement("canvas");canvas.width=PW*scale;canvas.height=PH*scale;
 const g=canvas.getContext("2d");if(!g)throw new Error("Canvas unavailable for agreement PDF.");
 g.scale(scale,scale);g.fillStyle="#FFFFFF";g.fillRect(0,0,PW,PH);
 const text=(v:string,x:number,y:number,size=9,color=muted,bold=false,maxWidth?:number)=>{
  g.fillStyle=color;g.font=(bold?"700 ":"400 ")+size+"px Arial, Helvetica, sans-serif";
  if(maxWidth)g.fillText(v,x,y,maxWidth);else g.fillText(v,x,y);
 };
 const wrap=(v:string,x:number,y:number,width:number,size=9,leading=13,color=muted,bold=false)=>{
  g.font=(bold?"700 ":"400 ")+size+"px Arial, Helvetica, sans-serif";
  const words=v.trim().split(/\s+/);let row="";let current=y;
  for(const word of words){
   const next=row?row+" "+word:word;
   if(g.measureText(next).width<=width){row=next;continue;}
   if(row){text(row,x,current,size,color,bold);current+=leading;}
   row=word;
  }
  if(row){text(row,x,current,size,color,bold);current+=leading;}
  return current;
 };
 const line=(y:number)=>{g.fillStyle=border;g.fillRect(36,y,PW-72,.8);};
 const section=(title:string,y:number)=>{text(title.toUpperCase(),40,y,10,purple,true);return y+18;};
 return {canvas,g,text,wrap,line,section};
}
export async function downloadAgreementPdf(row:SavedAgreement):Promise<void>{savePdf(await renderAgreementPages(row),row.agreementNumber,row.clientName);}
export async function renderAgreementPages(row:SavedAgreement):Promise<HTMLCanvasElement[]>{
 const p=row.payload;
 const pages=[painter(),painter(),painter(),painter()];
 const ordered:Painter[]=[...pages];
 const current=new Map<Painter,Painter>(pages.map(p=>[p,p]));
 const navy="#39204F", lavender="#F3ECF8", violet="#7225BB", pale="#EEDFF8";
 const brand=new Image();brand.decoding="async";brand.src="/brand/amplifyworld-quotation-wordmark.svg";
 let branded=false;
 try{await brand.decode();branded=true;}catch{/* Keep text fallback for offline PDFs. */}
 const active=(a:Painter)=>current.get(a)??a;
 const next=(logical:Painter)=>{const prior=active(logical),page=painter();ordered.splice(ordered.indexOf(prior)+1,0,page);current.set(logical,page);page.text("AGREEMENT / CONTINUATION",40,111,13,navy,true);return page;};
 const flow=(logical:Painter,value:string,y:number,x=40,width=515,size=8.8,leading=12.4,color=navy,bold=false)=>{
  let page=active(logical);page.g.font=(bold?"700 ":"400 ")+size+"px Arial, Helvetica, sans-serif";
  const lines:string[]=[];let line="";
  for(const token of value.split(/\s+/)){let word=token;while(page.g.measureText(word).width>width){let n=1;while(n<word.length&&page.g.measureText(word.slice(0,n+1)).width<=width)n++;if(line){lines.push(line);line=""}lines.push(word.slice(0,n));word=word.slice(n);}
   if(!word)continue;const candidate=line?line+" "+word:word;if(page.g.measureText(candidate).width>width&&line){lines.push(line);line=word}else line=candidate;}
  if(line)lines.push(line);
  for(const text of lines){if(y>767){page=next(logical);y=140;}page.text(text,x,y,size,color,bold);y+=leading;}return y;
 };
 const paragraph=(a:Painter,value:string,y:number)=>flow(a,value,y)+7;
 const heading=(a:Painter,number:string,title:string,y:number)=>{
  if(y>735){next(a);y=140;}
  active(a).text(number+"  "+title.toUpperCase(),40,y,10,violet,true);
  return y+18;
 };
 const section=(a:Painter,number:string,title:string,value:string,y:number)=>{
  const top=heading(a,number,title,y);
  return paragraph(a,value,top)+4;
 };
 const rowBox=(a:Painter,label:string,value:string,y:number,height=28)=>{
  let page=active(a);page.g.font="700 8.4px Arial, Helvetica, sans-serif";let lines=1,line="";for(const word of value.split(/\s+/)){const candidate=line?line+" "+word:word;if(page.g.measureText(candidate).width>295&&line){lines++;line=word}else line=candidate;}
  const needed=Math.max(height,lines*10.5+14);if(y+needed>765){page=next(a);y=140;}page.g.fillStyle=y%2<1?lavender:"#F9F5FC";page.g.fillRect(40,y,515,needed-1);page.text(label.toUpperCase(),51,y+14,7.3,"#58446F",true);const end=flow(a,value,y+14,248,295,8.4,10.5,navy,true);return end<y?end+5:Math.max(y+needed,end+5);
 };
 const tax=p.taxMode==="inclusive"?"Applicable taxes included in quoted fees":p.taxMode==="extra"?"GST at "+p.gstRate+"% extra on agency charges":"No taxes charged";
 const serviceFee=money(row.serviceFee),ads=money(row.adBudget),total=money(row.total);
 const adsActive=p.adBudgetMode!=="not applicable";
 const adsSummary=adsActive?ads+" | "+p.adBudgetMode+"; "+p.adPayment:"Not applicable";
 const payment=p.servicePayment==="instalments"
  ?"Instalments: "+p.paymentSchedule
  :p.servicePayment==="full advance"?"Service fee payable at signing":"Monthly advance payments as agreed";
 const servicePeriod=fmt(p.startDate)+" to "+fmt(p.endDate);
 const optional=p.adBudgetMode==="optional";
 const adsSentence=!adsActive?"No advertising budget is included.":
  optional?"The advertising budget is optional at signing, but must be approved and funded before ads run.":
  "The advertising budget must be approved and funded before ads run.";
 const page1=pages[0];
 page1.text("CLIENT SERVICES / DIGITAL MARKETING",40,98,7.4,violet,true);
 page1.text("DIGITAL MARKETING SERVICES AGREEMENT",40,119,15,navy,true);
 page1.text("AmplifyWorld × "+p.clientName+"  |  "+servicePeriod,40,137,8,"#746688",false,515);
 let y=151;
 y=rowBox(page1,"Client / business",p.clientName,y);
 y=rowBox(page1,"Service term",servicePeriod,y);
 y=rowBox(page1,"Agency service fee",serviceFee+" | "+p.feePeriod+" service charges",y);
 y=rowBox(page1,"Advertising budget",adsSummary,y);
 y=rowBox(page1,"Illustrative package value",total+" | "+tax,y);
 y=rowBox(page1,"Payment terms",payment,y,36);
 y=rowBox(page1,"Effective / start date",fmt(p.startDate)+" | Agreement dated "+fmt(p.agreementDate),y);
 if(y+90>760){next(page1);y=140;}
 active(page1).g.fillStyle=pale;active(page1).g.fillRect(40,y+13,515,49);
 active(page1).text("PAYMENT CLARITY:",52,y+30,8,violet,true);
 active(page1).wrap("The Agency fee is "+serviceFee+" ("+p.feePeriod+"). Initial payment: "+money(p.advanceAmount)+". "+adsSentence+" No additional fee is payable without the Client's written approval.",52,y+43,490,8,11,violet);
 y+=82;
 y=section(page1,"01","Parties and appointment",
  "This Digital Marketing Services Agreement (the Agreement) is entered into by AmplifyWorld, a marketing service provider operating in Prayagraj, Uttar Pradesh (the Agency), represented by "+p.agencyRepresentative+", and "+p.clientName+" (the Client), represented by "+p.clientRepresentative+". The Client appoints the Agency to perform the agreed services in Schedule A.",y);
 y=section(page1,"02","Term and effective date",
  "The services begin on "+fmt(p.startDate)+" and end on "+fmt(p.endDate)+". There is no automatic renewal. An extension requires documented consent of both parties. The agreed start date is subject to any applicable advance-payment conditions.",y);
 y=section(page1,"03","Package amount and payment",
  "The Agency fee is "+serviceFee+" "+(p.feePeriod==="monthly"?"per month":"on a one-time basis")+
  ". "+payment+". An initial payment of "+money(p.advanceAmount)+" is agreed. "+
  adsSentence+" The illustrative package value is "+total+". "+tax+". Any additional work or charge requires prior written approval.",y);

 const page2=pages[1];
 page2.text("SERVICES, CAMPAIGNS & CLIENT RESPONSIBILITIES",40,111,14,navy,true);
 y=140;
 const scope=p.services.map((s,i)=>"("+String.fromCharCode(97+i)+") "+s.name+": "+s.description).join("; ")+".";
 y=section(page2,"04","Agreed scope of services",
  "During the agreed term the Agency shall provide the following services: "+scope+
  " Monthly content targets, if applicable, are "+p.reels+" reels and "+p.posts+" branded posts. Advertising spend is separately controlled.",y);
 y=section(page2,"05","Content, access and approval process",
  "The Client shall supply accurate business details, pricing, branding, account access, permissions and timely approvals. Material messaging, creatives, budgets and publishing schedules are subject to Client approval, which may be recorded through acknowledged email or WhatsApp. Delays in access or third-party reviews may affect execution timelines.",y);
 y=section(page2,"06","Advertising budget and records",
  adsSentence+" The Agency shall not exceed an approved media budget without written consent. Platform fees or deductions are part of the agreed allocation. The Agency will summarize campaign spend and reconcile any unspent or uncommitted funds, refunding or crediting as applicable.",y);
 y=section(page2,"07","Brand claims and platform guidelines",
  "The Client is responsible for the accuracy, ownership and legality of supplied product claims, images, offers and testimonials. Campaign performance, reach and approval times depend on external platforms and market conditions; forecasts are planning estimates rather than guaranteed outcomes.",y);
 y=section(page2,"08","Reporting, enquiries and account access",
  "The Agency will provide relevant activity and campaign summaries based on available records. The Client remains responsible for responding to customer enquiries and providing its products or services. Account access shall be shared securely and returned or revoked when no longer required.",y);

 const page3=pages[2];
 page3.text("RIGHTS, EXIT & GENERAL TERMS",40,111,14,navy,true);
 y=140;
 y=section(page3,"09","Scope changes and third-party costs",
  "Agreed services and content targets are covered by the Agency fee. Additional deliverables, extra advertising spend, influencer collaborations, domain or hosting, software or special production costs require prior written approval of the scope and price. "+(p.exclusions?"Exclusions: "+p.exclusions:"No optional extras are compulsory."),y);
 y=section(page3,"10","Client materials and intellectual property",
  "The Client authorizes use of its supplied brand materials solely for this agreement and confirms the necessary rights. Upon payment of approved fees, final commissioned deliverables may be used by the Client, subject to third-party licenses and the Agency's pre-existing tools and templates. Client-owned accounts remain with their lawful owner.",y);
 y=section(page3,"11","Confidentiality and data handling",
  "Both parties will protect non-public business, account, campaign and customer information and use it only as necessary to perform this Agreement. Personal data will be handled according to applicable law. Upon completion, confidential materials will be returned or deleted on reasonable request, subject to lawful record-retention obligations.",y);
 y=section(page3,"12","Suspension and early termination",
  "The Agency may suspend work after reasonable notice if required payments, permissions or lawful approvals are withheld. Either party may terminate for material breach remaining uncured after "+p.noticeDays+" days' written notice, or immediately for fraud or unlawful activity. The parties shall reconcile performed services and approved commitments, and refund or credit unspent media funds as appropriate.",y);
 y=section(page3,"13","Liability and independent status",
  "The Agency acts as an independent contractor. Neither party is liable for speculative or indirect losses to the extent permitted by law. Subject to mandatory law, the Agency's contractual liability is limited to service fees received, excluding media pass-through funds, except for fraud, wilful misconduct or liability that cannot lawfully be excluded.",y);
 y=section(page3,"14","Notices, governing law and entire agreement",
  "Written communications may be made using acknowledged email or WhatsApp. The parties will first seek resolution through good-faith discussion for 30 days. Indian law governs this agreement, and competent courts in Prayagraj, Uttar Pradesh have jurisdiction, subject to mandatory rules. Schedule A forms part of the agreement; amendments require mutual written consent.",y);
 if(p.additionalTerms)y=section(page3,"15","Additional agreed terms",p.additionalTerms,y);

 const page4=pages[3];
 active(page4).text("SCHEDULE A / COMMERCIAL TERMS & SIGNATURES",40,111,11,violet,true);
 active(page4).text("To be completed and accepted by both parties before execution.",40,133,8,"#746688");
 y=147;
 y=rowBox(page4,"Client / business",p.clientName,y,24);
 y=rowBox(page4,"Registered legal name",p.clientName,y,24);
 y=rowBox(page4,"Business address",p.clientAddress,y,31);
 y=rowBox(page4,"Effective / start date",fmt(p.startDate),y,24);
 y=rowBox(page4,"Service period",servicePeriod,y,24);
 y=rowBox(page4,"Agency service charges",serviceFee+" / "+p.feePeriod,y,24);
 y=rowBox(page4,"Advertising budget",adsSummary,y,24);
 y=rowBox(page4,"Illustrative total",total,y,24);
 y=rowBox(page4,"Tax treatment",tax,y,24);
 y=rowBox(page4,"Payment at signing",money(p.advanceAmount)+" | "+payment,y,31);
 y=rowBox(page4,"Monthly deliverables",p.reels+" reels + "+p.posts+" posts (where applicable)",y,24);
 if(y>715){next(page4);y=140;}active(page4).text("INCLUDED SERVICES AND DELIVERABLES",40,y+18,9,violet,true);
 y+=34;
 for(let i=0;i<p.services.length;i++){
  const s=p.services[i];
  y=flow(page4,String(i+1).padStart(2,"0")+"  "+s.name+" - "+s.description,y,42,509,8,10,navy)+3;
 }

 if(y>620){next(page4);y=140;}
 const conditionY=Math.max(active(page4)===page4?652:140,y+24);
 y=flow(page4,"PAYMENT CONDITION: "+payment+". "+adsSentence+" Extra charges require written approval. "+tax+".",conditionY,51,492,8,11,violet);
 if(y>695){next(page4);y=140;}
 const signedY=Math.min(713,Math.max(active(page4)===page4?706:145,y+16));
 active(page4).text("FOR AMPLIFYWORLD",40,signedY,8,violet,true);
 active(page4).text("FOR "+p.clientName.toUpperCase(),311,signedY,8,violet,true,235);
 active(page4).text("Signature: _____________________",40,signedY+20,8,navy);
 active(page4).text("Signature: _____________________",311,signedY+20,8,navy);
 active(page4).text("Name: "+p.agencyRepresentative,40,signedY+39,8,navy,false,235);
 active(page4).text("Name: "+p.clientRepresentative,311,signedY+39,8,navy,false,235);
 active(page4).text("Role: "+(p.agencyDesignation||"Authorized Signatory"),40,signedY+56,8,navy,false,235);
 active(page4).text("Role: "+(p.clientDesignation||"Client / Authorized Signatory"),311,signedY+56,8,navy,false,235);
 active(page4).text("Date: ______________________",40,signedY+73,8,navy);
 active(page4).text("Date: ______________________",311,signedY+73,8,navy);
 ordered.forEach((a,index)=>{
  a.g.fillStyle=violet;a.g.fillRect(0,0,PW,7);
  if(branded){
   const ratio=brand.naturalWidth/brand.naturalHeight||4.5;
   const width=Math.min(190,ratio*40);
   a.g.drawImage(brand,40,19,width,width/ratio);
  }else a.text("AmplifyWorld",40,49,24,navy,true);
  a.text("STRATEGY / TECHNOLOGY / MARKETING",40,67,7,violet,true);
  a.g.fillStyle="#DABBEA";a.g.fillRect(40,79,515,.8);
  a.g.fillRect(40,790,515,.8);
  a.text("amplifyworld.in  |  amplifyworld.official@gmail.com  |  +91 89318 01405",40,807,7,"#736681");
  a.text("PAGE "+(index+1)+" / "+ordered.length,510,807,7,navy,true);
 });
 return ordered.map(a=>a.canvas);
}
