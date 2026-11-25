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


export function savePdf(canvases:HTMLCanvasElement[],number:string,name:string){
 const pdf=pdfFromCanvases(canvases),url=URL.createObjectURL(new Blob([new Uint8Array(pdf).buffer],{type:"application/pdf"}));
 const a=document.createElement("a");a.href=url;a.download=number+"-"+name.replace(/[^a-z0-9-_]+/gi,"-")+".pdf";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);
}
export async function appendTextPages(title:string,number:string,paragraphs:string[]){
 const pages:HTMLCanvasElement[]=[];let y=0;
 const add=()=>{const canvas=document.createElement("canvas");canvas.width=1190;canvas.height=1684;const ctx=canvas.getContext("2d");if(!ctx)throw Error("Canvas unavailable");ctx.scale(2,2);ctx.fillStyle="white";ctx.fillRect(0,0,595,842);ctx.fillStyle="#51217B";ctx.font="bold 21px Arial";ctx.fillText("AmplifyWorld",40,50);ctx.font="bold 12px Arial";ctx.fillText(title,40,84);ctx.font="10px Arial";ctx.fillText(number,40,102);ctx.fillRect(40,115,515,1);ctx.fillText("amplifyworld.in",40,812);pages.push(canvas);y=140;return ctx;};
 let ctx=add();for(const paragraph of paragraphs){let line="";const write=(value:string)=>{if(y>765)ctx=add();ctx.fillStyle="#39204F";ctx.font="11px Arial";ctx.fillText(value,40,y,515);y+=16};for(const token of paragraph.split(/\s+/)){let word=token;while(word.length>75){if(line){write(line);line=""}write(word.slice(0,75));word=word.slice(75)}const test=line?line+" "+word:word;if(test.length>85&&line){write(line);line=word;}else line=test;}if(line)write(line);y+=10;}
 return pages;
}
