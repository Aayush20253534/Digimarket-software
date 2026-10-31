/** Download a vector-layout, image-backed A4 PDF without requiring a PDF provider.
 * Text is drawn onto a high-resolution canvas, then embedded as one JPEG PDF page.
 * The existing approved SVG wordmark is loaded from the same-origin app assets.
 */
export type QuotationFields = {
 clientName:string; packageTitle:string; quoteDate:string; serviceFee:string;
 feePeriod:"monthly"|"one-time"; servicePayment:"at signing"|"monthly"|"milestone";
 adBudget:string; adBudgetMode:"optional"|"mandatory"|"not applicable";
 adPlatform:"Meta"|"Google"|"Meta and Google"|"other";
 adPayment:"at signing"|"before ads run"|"per schedule";
 adFlexibility:"fixed"|"client-adjustable";
 taxMode:"inclusive"|"extra"|"not charged"; gstRate:number; gstin:string;
 influencerFees:"included"|"extra"|"not applicable";
 domainHosting:"included"|"extra"|"client-provided"|"not applicable";
 reels:number;posts:number;validityDays:number;serviceTerm:string;
 services:{name:string;description:string}[];exclusions:string;
};
export type SavedQuotation = {
 id:string;quoteNumber:string;clientName:string;quoteDate:string;payload:QuotationFields;
 serviceFee:string;adBudget:string;taxAmount:string;total:string;createdAt:string;
};
const W=595,H=842;
const violet="#51217B",magenta="#D816D3",muted="#79658C",line="#D7B9E5",light="#F4E9F9";
const inr=(v:string|number)=>"₹ "+Number(v).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const dateText=(value:string)=>new Date(value.slice(0,10)+"T12:00:00Z")
 .toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric",timeZone:"UTC"}).toUpperCase();

async function loadBrand():Promise<HTMLImageElement>{
 const img=new Image();img.decoding="async";img.src="/brand/amplifyworld-wordmark.svg";
 await img.decode();return img;
}
function pdfFromJpeg(bytes:Uint8Array,width:number,height:number):Uint8Array {
 const enc=new TextEncoder();const pieces:Uint8Array[]=[];const positions:number[]=[0];let length=0;
 const write=(text:string)=>{const b=enc.encode(text);pieces.push(b);length+=b.length;};
 const raw=(b:Uint8Array)=>{pieces.push(b);length+=b.length;};
 const obj=(id:number,body:string)=>{positions[id]=length;write(id+" 0 obj\n"+body+"\nendobj\n");};
 write("%PDF-1.4\n");
 obj(1,"<< /Type /Catalog /Pages 2 0 R >>");
 obj(2,"<< /Type /Pages /Count 1 /Kids [3 0 R] >>");
 obj(3,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
 positions[4]=length;
 write("4 0 obj\n<< /Type /XObject /Subtype /Image /Width "+width+" /Height "+height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+bytes.length+" >>\nstream\n");
 raw(bytes);write("\nendstream\nendobj\n");
 const stream="q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n";
 obj(5,"<< /Length "+enc.encode(stream).length+" >>\nstream\n"+stream+"endstream");
 const xref=length;
 write("xref\n0 6\n0000000000 65535 f \n");
 for(let i=1;i<=5;i++)write(String(positions[i]).padStart(10,"0")+" 00000 n \n");
 write("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF");
 const result=new Uint8Array(length);let offset=0;
 for(const part of pieces){result.set(part,offset);offset+=part.length;}
 return result;
}

export async function downloadQuotationPdf(quote:SavedQuotation):Promise<void>{
 const c=document.createElement("canvas");c.width=W*2;c.height=H*2;
 const g=c.getContext("2d");
 if(!g)throw new Error("Your browser cannot generate the quotation PDF.");
 g.scale(2,2);g.fillStyle="#FFFFFF";g.fillRect(0,0,W,H);
 const rect=(x:number,y:number,w:number,h:number,color:string)=>{g.fillStyle=color;g.fillRect(x,y,w,h);};
 const stroke=(x:number,y:number,w:number,h:number,color:string)=>{g.strokeStyle=color;g.lineWidth=.8;g.strokeRect(x+.4,y+.4,w-.8,h-.8);};
 const text=(value:string,x:number,y:number,size:number,color=violet,bold=false,maxWidth?:number)=>{
  g.fillStyle=color;g.font=(bold?"700 ":"400 ")+size+"px Arial, Helvetica, sans-serif";
  if(maxWidth!==undefined)g.fillText(value,x,y,maxWidth);
  else g.fillText(value,x,y);
 };
 const right=(value:string,rightX:number,y:number,size:number,color=violet,bold=false)=>{
  g.font=(bold?"700 ":"400 ")+size+"px Arial, Helvetica, sans-serif";
  text(value,rightX-g.measureText(value).width,y,size,color,bold);
 };
 const wrap=(value:string,x:number,y:number,max:number,size:number,leading:number,color=muted,bold=false,maxLines=3)=>{
  g.font=(bold?"700 ":"400 ")+size+"px Arial, Helvetica, sans-serif";
  const words=value.trim().split(/\s+/);const lines:string[]=[];let current="";
  for(const word of words){const next=current?current+" "+word:word;
   if(g.measureText(next).width<=max)current=next;
   else{if(current)lines.push(current);current=word;}}
  if(current)lines.push(current);
  for(let i=0;i<Math.min(lines.length,maxLines);i++){
   let content=lines[i];
   if(i===maxLines-1&&lines.length>maxLines){
    while(content.length&&g.measureText(content+"…").width>max)content=content.slice(0,-1);
    content+="…";
   }
   text(content,x,y+i*leading,size,color,bold,max);
  }
 };
 const p=quote.payload;
 try{const brand=await loadBrand();g.drawImage(brand,30,26,185,64);}
 catch{ text("AmplifyWorld",32,76,29,magenta,true); }
 text("SERVICE QUOTATION",445,32,12,violet,true,135);
 right("DATE: "+dateText(p.quoteDate),565,47,8,muted);
 rect(20,99,555,1,line);
 text(p.packageTitle.toUpperCase(),20,125,17,violet,true,540);
 text("Marketing services tailored for "+p.clientName+".",20,142,9,muted,false,540);
 rect(15,155,565,46,light);stroke(15,155,565,46,line);
 rect(371,155,1,46,line);
 text("PREPARED FOR",27,169,8,magenta,true);
 text("QUOTATION NO.",393,169,8,magenta,true);
 text(p.clientName.toUpperCase(),27,189,11,violet,true,326);
 right(quote.quoteNumber,566,189,10,violet,true);
 rect(15,214,565,72,"#FAF4FC");stroke(15,214,565,72,line);
 rect(15,214,3,72,magenta);rect(298,214,3,72,violet);
 text("AGENCY SERVICE CHARGES",27,231,8,violet,true);
 text("ADVERTISING BUDGET",312,231,8,violet,true);
 text(inr(quote.serviceFee),27,257,17,magenta,true);
 text(p.adBudgetMode==="not applicable"?"Not applicable":inr(quote.adBudget),312,257,16,violet,true,260);
 text(p.feePeriod,27,274,8,muted);
 text(p.adBudgetMode,312,274,8,muted);
 stroke(15,300,565,44,magenta);rect(378,300,1,44,magenta);
 text("TOTAL PACKAGE VALUE",26,317,9,violet,true);
 text((p.taxMode==="inclusive"?"tax inclusive":p.taxMode==="extra"?"tax extra":"no tax")+" • "+p.feePeriod,26,333,8,muted);
 right(inr(quote.total),567,329,17,magenta,true);
 text("INCLUDED SERVICES",20,367,11,violet,true);
 text("Approved services and their deliverables",20,383,8,muted);
 const x0=15,y0=395,cw=282.5,ch=59;
 for(let row=0;row<3;row++)for(let col=0;col<2;col++){
  const k=row*2+col,x=x0+col*cw,y=y0+row*ch;
  rect(x,y,cw,ch,((row+col)%2===0)?"#FBF7FD":"#F9F2FC");
  stroke(x,y,cw,ch,line);
  if(k<p.services.length){
   const s=p.services[k];
   text(String(k+1).padStart(2,"0")+"  "+s.name.toUpperCase(),x+12,y+16,8.5,violet,true,cw-25);
   wrap(s.description,x+12,y+31,cw-25,7.8,10,muted,false,3);
  }
 }
 rect(15,590,565,29,magenta);
 text("APPROXIMATE MONTHLY CONTENT",27,608,9,"#FFFFFF",true);
 right(p.reels+" REELS  |  "+p.posts+" POSTS",568,608,9,"#FFFFFF",true);
 text("PAYMENT & COMMERCIAL TERMS",20,640,11,violet,true);
 const termLines=[
  "Service fee: "+inr(quote.serviceFee)+" payable "+p.servicePayment+".",
  "Ad budget: "+(p.adBudgetMode==="not applicable"?"Not applicable":inr(quote.adBudget)+" for "+p.adPlatform+", payable "+p.adPayment+"; "+p.adFlexibility+"."),
  "Taxes: "+(p.taxMode==="inclusive"?"included in quoted fee":p.taxMode==="extra"?"added at "+p.gstRate+"% on the service fee":"not charged")+(p.gstin?"; GSTIN: "+p.gstin:"")+".",
  "Influencer fees: "+p.influencerFees+". Domain & hosting: "+p.domainHosting+".",
  "Additional work requires prior written approval. Valid for "+p.validityDays+" days; service term: "+p.serviceTerm+"."
 ];
 let ty=660;
 for(const item of termLines){rect(22,ty-6,2,2,magenta);wrap(item,30,ty,542,8,11,muted,false,2);ty+=item.length>118?24:16;}
 if(p.exclusions.trim()){text("Exclusions:",22,ty+1,8,violet,true);wrap(p.exclusions,75,ty+1,485,8,10,muted,false,2);ty+=21;}
 const signatureY=Math.max(754,ty+20);
 text("For AmplifyWorld",23,signatureY,9,violet,true);
 text("For "+p.clientName,313,signatureY,9,violet,true,256);
 rect(23,signatureY+18,220,.75,line);rect(313,signatureY+18,220,.75,line);
 right("amplifyworld.in   |   amplifyworld.official@gmail.com   |   +91 89318 01405",565,827,7.5,muted);
 const b64=c.toDataURL("image/jpeg",.95).split(",")[1];
 const binary=atob(b64);const jpeg=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)jpeg[i]=binary.charCodeAt(i);
 const pdf=pdfFromJpeg(jpeg,c.width,c.height);
 const blob=new Blob([new Uint8Array(pdf).buffer],{type:"application/pdf"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=quote.quoteNumber+"-"+p.clientName.replace(/[^a-z0-9-_]+/gi,"-")+".pdf";
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),20000);
}
