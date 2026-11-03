/** Client-side two-page A4 agreement PDF using the same quotation-only wordmark. */
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
const purple="#51217B",magenta="#D816D3",muted="#50475A",border="#E0D3E9";
const money=(v:string)=>"INR "+Number(v).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmt=(value:string)=>new Date(value.slice(0,10)+"T12:00:00Z")
  .toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});
type Painter={
 canvas:HTMLCanvasElement;g:CanvasRenderingContext2D;
 text:(value:string,x:number,y:number,size?:number,color?:string,bold?:boolean)=>void;
 wrap:(value:string,x:number,y:number,width:number,size?:number,leading?:number,color?:string,bold?:boolean)=>number;
 line:(y:number)=>void;
 section:(title:string,y:number)=>number;
};
function painter():Painter{
 const canvas=document.createElement("canvas");canvas.width=PW*scale;canvas.height=PH*scale;
 const g=canvas.getContext("2d");if(!g)throw new Error("Canvas unavailable for agreement PDF.");
 g.scale(scale,scale);g.fillStyle="#FFFFFF";g.fillRect(0,0,PW,PH);
 const text=(v:string,x:number,y:number,size=9,color=muted,bold=false)=>{
  g.fillStyle=color;g.font=(bold?"700 ":"400 ")+size+"px Arial, Helvetica, sans-serif";
  g.fillText(v,x,y);
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
function pdfFromCanvases(canvases:HTMLCanvasElement[]):Uint8Array{
 const encoder=new TextEncoder(),pieces:Uint8Array[]=[];const positions:number[]=[0];let length=0;
 const write=(s:string)=>{const bytes=encoder.encode(s);pieces.push(bytes);length+=bytes.length;};
 const raw=(a:Uint8Array)=>{pieces.push(a);length+=a.length;};
 const obj=(id:number,body:string)=>{positions[id]=length;write(id+" 0 obj\n"+body+"\nendobj\n");};
 const count=canvases.length;
 write("%PDF-1.4\n");
 obj(1,"<< /Type /Catalog /Pages 2 0 R >>");
 obj(2,"<< /Type /Pages /Count "+count+" /Kids ["+canvases.map((_,i)=>(3+i)+" 0 R").join(" ")+"] >>");
 for(let i=0;i<count;i++){
  const imageId=3+count+i,contentId=3+2*count+i;
  obj(3+i,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 "+imageId+" 0 R >> >> /Contents "+contentId+" 0 R >>");
 }
 for(let i=0;i<count;i++){
  const jpeg=atob(canvases[i].toDataURL("image/jpeg",.95).split(",")[1]);
  const bytes=new Uint8Array(jpeg.length);for(let j=0;j<jpeg.length;j++)bytes[j]=jpeg.charCodeAt(j);
  const id=3+count+i;positions[id]=length;
  write(id+" 0 obj\n<< /Type /XObject /Subtype /Image /Width "+canvases[i].width+" /Height "+canvases[i].height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+bytes.length+" >>\nstream\n");
  raw(bytes);write("\nendstream\nendobj\n");
 }
 for(let i=0;i<count;i++){
  const stream="q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n";
  obj(3+2*count+i,"<< /Length "+encoder.encode(stream).length+" >>\nstream\n"+stream+"endstream");
 }
 const offset=length,totalObjects=2+3*count;
 write("xref\n0 "+(totalObjects+1)+"\n0000000000 65535 f \n");
 for(let i=1;i<=totalObjects;i++)write(String(positions[i]).padStart(10,"0")+" 00000 n \n");
 write("trailer\n<< /Size "+(totalObjects+1)+" /Root 1 0 R >>\nstartxref\n"+offset+"\n%%EOF");
 const all=new Uint8Array(length);let n=0;for(const item of pieces){all.set(item,n);n+=item.length;}
 return all;
}
export async function downloadAgreementPdf(row:SavedAgreement):Promise<void>{
 const p=row.payload;
 const first=painter(),second=painter();
 const brand=new Image();brand.decoding="async";brand.src="/brand/amplifyworld-quotation-wordmark.svg";
 try{await brand.decode();first.g.drawImage(brand,39,24,204,52);second.g.drawImage(brand,39,24,204,52);}
 catch{first.text("AmplifyWorld",40,59,23,purple,true);second.text("AmplifyWorld",40,59,23,purple,true);}
 const head=(a:Painter,n:number)=>{
  a.g.fillStyle=magenta;a.g.fillRect(0,0,PW,6);
  a.text("SERVICE AGREEMENT",390,42,12,purple,true);
  a.text(row.agreementNumber,390,58,9,muted);
  a.line(87);
  a.line(795);
  a.text("AmplifyWorld  |  Digital Marketing Services Agreement",40,812,8,muted);
  a.text(n+" / 2",527,812,8,muted);
 };
 head(first,1);head(second,2);
 let y=114;
 first.text("DIGITAL MARKETING SERVICES AGREEMENT",40,y,15,purple,true);y+=27;
 y=first.wrap("This agreement is entered into on "+fmt(p.agreementDate)+" between AmplifyWorld (the Agency) and "+p.clientName+" (the Client).",40,y,514,9.5,15)+9;
 y=first.section("1. Parties and authorized representatives",y);
 y=first.wrap("AGENCY: AmplifyWorld, represented by "+p.agencyRepresentative+" ("+(p.agencyDesignation||"Authorized Representative")+").",40,y,514,9,13);
 y=first.wrap("CLIENT: "+p.clientName+", "+p.clientAddress+". Represented by "+p.clientRepresentative+" ("+(p.clientDesignation||"Authorized Representative")+").",40,y+5,514,9,13);
 if(p.clientEmail)y=first.wrap("Client email: "+p.clientEmail,40,y+5,514,9,13);
 y=first.section("2. Term and scope of services",y+18);
 y=first.wrap("Effective from "+fmt(p.startDate)+" through "+fmt(p.endDate)+". No automatic renewal is implied; any extension requires mutual written agreement.",40,y,514,9,13)+10;
 y=first.wrap("The Agency will provide the following agreed services and deliverables:",40,y,514,9,13)+6;
 for(let i=0;i<p.services.length;i++){
  const s=p.services[i];y=first.wrap(String(i+1)+". "+s.name+": "+s.description,48,y,498,8.5,12)+3;
  if(y>735)throw new Error("Agreement scope exceeds page one. Shorten service descriptions.");
 }
 y=first.wrap("Content target: "+p.reels+" reels and "+p.posts+" posts per month (where applicable), subject to timely client approvals and assets.",40,y+9,514,9,13)+12;
 if(y>766)throw new Error("Agreement scope is too long for the PDF. Shorten the service descriptions.");
 let z=113;
 z=second.section("3. Fees, taxes and payment",z);
 z=second.wrap("Agency fee: "+money(row.serviceFee)+" "+(p.feePeriod==="monthly"?"per month":"one-time")+". Advertising budget: "+(p.adBudgetMode==="not applicable"?"not applicable":money(row.adBudget)+" ("+p.adBudgetMode+")")+".",40,z,514,9,13)+4;
 z=second.wrap("Quoted package value: "+money(row.total)+". Tax treatment: "+(p.taxMode==="extra"?"GST extra at "+p.gstRate+"% on agency fees":p.taxMode==="inclusive"?"applicable taxes included":"taxes not charged")+".",40,z,514,9,13)+4;
 z=second.wrap("Service payment: "+p.servicePayment+". Advance payable: "+money(p.advanceAmount)+". "+(p.paymentSchedule||"Remaining charges are payable on the agreed billing schedule.")+" Advertising spend is payable "+p.adPayment+". Optional advertising is payable only if approved before campaigns run.",40,z,514,9,13)+12;
 z=second.section("4. Client responsibilities and approvals",z);
 z=second.wrap("The Client will provide accurate information, brand assets, account access, timely approvals and lawful advertising materials. Delays in approvals or assets may alter delivery schedules. The Client retains responsibility for product and business claims.",40,z,514,9,13)+12;
 z=second.section("5. Third-party costs and additional work",z);
 z=second.wrap("Ad platform spend, influencers, domain/hosting, subscriptions and other third-party expenses are excluded unless expressly included above. Additional services or scope changes require written approval and may incur additional fees.",40,z,514,9,13)+7;
 if(p.exclusions)z=second.wrap("Additional exclusions: "+p.exclusions,40,z,514,9,13)+8;
 z=second.section("6. Confidentiality and intellectual property",z);
 z=second.wrap("Each party will protect non-public information received from the other. Client-provided materials remain the Client's property. Agency tools, templates and pre-existing materials remain the Agency's. Final agreed deliverables transfer to the Client after the applicable fees are paid, subject to third-party licenses.",40,z,514,9,13)+12;
 z=second.section("7. Performance and liability",z);
 z=second.wrap("The Agency will use reasonable professional care but cannot guarantee leads, revenue, rankings, reach or advertising-platform approvals. Neither party is liable for indirect or consequential losses, to the extent permitted by law.",40,z,514,9,13)+12;
 z=second.section("8. Termination and governing law",z);
 z=second.wrap("Either party may terminate with "+p.noticeDays+" days' written notice. Fees for services already performed and approved non-refundable third-party costs remain payable. Indian law applies, with disputes subject to competent courts in Prayagraj, Uttar Pradesh.",40,z,514,9,13)+10;
 if(p.additionalTerms)z=second.wrap("Additional agreed terms: "+p.additionalTerms,40,z,514,8.5,12)+8;
 if(z>682)throw new Error("Agreement terms exceed page two. Shorten custom terms or exclusions.");
 second.line(Math.max(z,685));
 const signatureY=Math.max(z+25,710);
 second.text("For AmplifyWorld",40,signatureY,9,purple,true);
 second.text("For "+p.clientName,313,signatureY,9,purple,true);
 second.text(p.agencyRepresentative,40,signatureY+19,9,muted);
 second.text(p.clientRepresentative,313,signatureY+19,9,muted);
 second.text(p.agencyDesignation||"Authorized Representative",40,signatureY+34,8,muted);
 second.text(p.clientDesignation||"Authorized Representative",313,signatureY+34,8,muted);
 second.text("Signature: ____________________",40,signatureY+55,8,purple);
 second.text("Signature: ____________________",313,signatureY+55,8,purple);
 const pdf=pdfFromCanvases([first.canvas,second.canvas]);
 const blob=new Blob([new Uint8Array(pdf).buffer],{type:"application/pdf"}),url=URL.createObjectURL(blob);
 const a=document.createElement("a");a.href=url;
 a.download=row.agreementNumber+"-"+row.clientName.replace(/[^a-z0-9-_]+/gi,"-")+".pdf";
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),20000);
}
