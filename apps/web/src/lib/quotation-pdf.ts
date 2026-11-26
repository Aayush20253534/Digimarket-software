import {savePdf,appendTextPages} from "./document-pdf";
/** Download a vector-layout, image-backed A4 PDF without requiring a PDF provider.
 * Text is drawn onto a high-resolution canvas, then embedded as one JPEG PDF page.
 * The existing approved SVG wordmark is loaded from the same-origin app assets.
 */
export type QuotationFields = {
 mode?:"default"|"new";
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
 const img=new Image();img.decoding="async";img.src="/brand/amplifyworld-quotation-wordmark.svg";
 await img.decode();return img;
}
export async function downloadQuotationPdf(quote:SavedQuotation):Promise<void>{savePdf(await renderQuotationPages(quote),quote.quoteNumber,quote.clientName);}
async function renderFixedQuotation(quote:SavedQuotation):Promise<HTMLCanvasElement[]>{
 const p=quote.payload;
 const c=document.createElement("canvas");c.width=W*2;c.height=H*2;
 const g=c.getContext("2d");
 if(!g)throw new Error("Your browser cannot generate the quotation PDF.");
 g.scale(2,2);g.fillStyle="#FFFFFF";g.fillRect(0,0,W,H);
 const plum="#64258D",magenta="#C62FCB",soft="#887397",line="#E2D4EA",panel="#FAF6FC";
 const box=(x:number,y:number,w:number,h:number,fill:string,border=line,radius=10)=>{
  g.beginPath();g.roundRect(x,y,w,h,radius);g.fillStyle=fill;g.fill();
  g.strokeStyle=border;g.lineWidth=.8;g.stroke();
 };
 const text=(value:string,x:number,y:number,size:number,color=plum,bold=false,maxWidth?:number)=>{
  g.font=(bold?"700 ":"400 ")+size+"px Arial, Helvetica, sans-serif";g.fillStyle=color;
  if(maxWidth===undefined)g.fillText(value,x,y);else g.fillText(value,x,y,maxWidth);
 };
 const right=(value:string,x:number,y:number,size:number,color=plum,bold=false)=>{
  g.font=(bold?"700 ":"400 ")+size+"px Arial, Helvetica, sans-serif";
  text(value,x-g.measureText(value).width,y,size,color,bold);
 };
 const wrap=(value:string,x:number,y:number,width:number,size:number,leading:number,maxLines=2)=>{
  g.font="400 "+size+"px Arial, Helvetica, sans-serif";
  const words=value.trim().split(/\s+/);const rows:string[]=[];let current="";
  for(const word of words){
   const next=current?current+" "+word:word;
   if(g.measureText(next).width<=width)current=next;
   else{if(current)rows.push(current);current=word;}
  }
  if(current)rows.push(current);
  for(let i=0;i<Math.min(rows.length,maxLines);i++)
   text(rows[i],x,y+i*leading,size,soft,false,width);
 };
 // Preserve the approved six-service A4 layout while reflecting the
 // selected monthly content counts in the service scopes and commitment.
 g.fillStyle=magenta;g.fillRect(0,0,W,7);
 try{
  const brand=await loadBrand();const natural=brand.naturalWidth/brand.naturalHeight||3.8;
  const w=Math.min(225,natural*50),h=w/natural;
  g.drawImage(brand,40,20+(51-h)/2,w,h);
 }catch{text("AmplifyWorld",42,61,26,plum,true);}
 right("SERVICE QUOTATION",554,33,11,plum,true);
 right(dateText(p.quoteDate),554,49,8,soft);
 g.fillStyle=line;g.fillRect(40,78,514,1);
 text("CUSTOM MARKETING PACKAGE",40,103,17,plum,true);
 text("Monthly digital marketing services for "+p.clientName+".",40,122,9,soft,false,510);
 box(40,139,514,47,"#F6EDF9");
 text("PREPARED FOR",55,155,8,magenta,true);
 right("QUOTATION NO.",539,155,8,magenta,true);
 text(p.clientName.toUpperCase(),55,175,11,plum,true,290);
 right(quote.quoteNumber,539,175,10,plum,true);
 box(40,199,252,80,panel);
 box(302,199,252,80,panel);
 g.fillStyle=magenta;g.fillRect(40,219,4,42);g.fillRect(302,219,4,42);
 text("AGENCY SERVICE CHARGES",54,216,8,plum,true);
 text("META ADS BUDGET",316,216,8,plum,true);
 text(inr(quote.serviceFee),54,248,19,magenta,true,197);
 text("/ month",224,251,8,soft);
 text(inr(quote.adBudget),316,248,19,magenta,true,180);
 text("/ month",489,251,8,soft);
 box(40,292,514,45,"#FFFFFF",magenta,11);
 text("TOTAL MONTHLY PACKAGE",53,319,10,plum,true);
 right(inr(quote.total),540,320,20,magenta,true);
 text("INCLUDED SERVICES",40,361,12,plum,true);
 text("Scope of work within the proposed monthly package",40,377,8.5,soft);
 const services=p.services;
 for(let i=0;i<6;i++){
  const col=i%2,row=Math.floor(i/2),x=40+col*262,y=393+row*68;
  box(x,y,252,60,panel,line,10);
  const service=services[i];if(!service)continue;
  box(x+12,y+10,28,18,"#F2DDFC","#F2DDFC",5);
  text(String(i+1).padStart(2,"0"),x+18,y+23,8,magenta,true);
  text(service.name.toUpperCase(),x+47,y+23,8,plum,true,195);
  wrap(service.description,x+14,y+41,224,7.7,10,2);
 }
 box(40,606,514,30,magenta,magenta,7);
 text("MONTHLY CONTENT COMMITMENT",53,626,9,"#FFFFFF",true);
 right(p.reels+" REELS  |  "+p.posts+" POSTS",540,626,10,"#FFFFFF",true);
 text("COMMERCIAL TERMS",40,664,12,plum,true);
 const terms=[
  inr(quote.serviceFee)+"/month covers the services above; "+inr(quote.adBudget)+"/month is allocated to Meta ad spend.",
  "Meta campaigns will run on Facebook and Instagram, with regular optimization and reporting.",
  "Domain, hosting, paid tools and external third-party costs, if needed, are separately approved.",
  "Any services beyond the agreed scope will be quoted and approved before execution.",
  "Applicable taxes, if any, will be itemized on the final invoice. Quote valid for 7 days.",
 ];
 terms.forEach((value,i)=>{
  const y=681+i*18;g.beginPath();g.arc(43,y-3,2.1,0,Math.PI*2);g.fillStyle=magenta;g.fill();
  text(value,51,y,8,soft,false,498);
 });
 g.fillStyle=line;g.fillRect(40,781,514,.8);
 text("For AmplifyWorld",40,799,9,plum,true);
 right("Authorized Representative",554,799,9,plum);
 g.fillStyle=line;g.fillRect(40,810,514,.8);
 text("amplifyworld.in   |   amplifyworld.official@gmail.com   |   +91 89318 01405",40,828,7.5,soft);
 right("1/1",554,828,7.5,soft);
 return [c];
}

export async function renderQuotationPages(quote:SavedQuotation):Promise<HTMLCanvasElement[]>{
 if(quote.payload.mode==="default")return renderFixedQuotation(quote);
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
 const overflow:string[]=[];
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
    overflow.push(value);
    content="Full text on continuation page";
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
 for(const item of termLines){if(ty>744){overflow.push(item);continue;}rect(22,ty-6,2,2,magenta);wrap(item,30,ty,542,8,11,muted,false,2);ty+=item.length>118?24:16;}
 if(p.exclusions.trim()){if(ty>744)overflow.push("Exclusions: "+p.exclusions);else{text("Exclusions:",22,ty+1,8,violet,true);wrap(p.exclusions,75,ty+1,485,8,10,muted,false,2);ty+=21;}}
 if(overflow.length)text("Additional terms continue on the next page.",20,765,8,muted);
 const signatureY=784;
 text("For AmplifyWorld",23,signatureY,9,violet,true);
 text("For "+p.clientName,313,signatureY,9,violet,true,256);
 rect(23,signatureY+18,220,.75,line);rect(313,signatureY+18,220,.75,line);
 right("amplifyworld.in   |   amplifyworld.official@gmail.com   |   +91 89318 01405",565,827,7.5,muted);
 return overflow.length?[c,...await appendTextPages("QUOTATION / CONTINUATION",quote.quoteNumber,overflow)]:[c];
}
