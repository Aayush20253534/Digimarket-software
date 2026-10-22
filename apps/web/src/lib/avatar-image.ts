/** Calculate a distortion-free square crop from an uploaded photograph. */
export function calculateAvatarCrop(width:number,height:number){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)
  throw new Error("Invalid image dimensions");
 const size=Math.min(width,height);
 // For tall portrait photos, favor the upper-middle area where faces tend to be.
 return {sx:(width-size)/2,sy:(height-size)*0.32,size};
}

/** Browser-only image processing. Compress within the existing avatar API size limit. */
export async function prepareAvatarImage(file:File):Promise<string>{
 if(!["image/png","image/jpeg","image/webp"].includes(file.type))
  throw new Error("Use PNG, JPEG or WebP");
 if(file.size>10*1024*1024)
  throw new Error("The original photo must be 10 MB or smaller");

 const objectUrl=URL.createObjectURL(file);
 const image=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{
   image.onload=()=>resolve();
   image.onerror=()=>reject(new Error("Unable to read the selected image"));
   image.src=objectUrl;
  });
  const crop=calculateAvatarCrop(image.naturalWidth,image.naturalHeight);
  const canvas=document.createElement("canvas");
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("Image processing is unavailable in this browser");
  for(const size of [512,448,384,320,256]){
   canvas.width=size;canvas.height=size;
   ctx.clearRect(0,0,size,size);
   // 9-argument drawImage crops the original square before resizing:
   // it does not squash a portrait or landscape photo.
   ctx.drawImage(image,crop.sx,crop.sy,crop.size,crop.size,0,0,size,size);
   for(const quality of [0.88,0.8,0.7,0.6,0.5]){
    const output=canvas.toDataURL("image/jpeg",quality);
    if(output.length<=135000)return output;
   }
  }
  throw new Error("Unable to compress the profile picture below 100 KB");
 }finally{
  image.onload=null;image.onerror=null;
  URL.revokeObjectURL(objectUrl);
 }
}
