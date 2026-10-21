import { createHash } from "node:crypto";
import { AuthError, invalid } from "../auth/errors";

type AssetType="image"|"video"|"raw";
export type ProviderResource={
 asset_id:string;public_id:string;resource_type:string;type:string;
 format:string;bytes:number;created_at?:string;
};
export type UploadOptions={uploadUrl:string;params:Record<string,string>};
export interface AssetProvider {
 uploadOptions(publicId:string,resourceType:AssetType,formats:string[]):UploadOptions;
 inspect(publicId:string,resourceType:AssetType):Promise<ProviderResource>;
 download(publicId:string,resourceType:AssetType,format:string):string;
}
export function cloudinarySign(params:Record<string,string>,secret:string):string{
 const canonical=Object.entries(params).filter(([key,value])=>key!=="api_key"&&key!=="signature"&&key!=="file"&&value!=="")
   .sort(([a],[b])=>a.localeCompare(b,"en")).map(([key,value])=>key+"="+value).join("&");
 return createHash("sha1").update(canonical+secret).digest("hex");
}
type Config={cloudName:string;apiKey:string;apiSecret:string};
function environment():Config{
 const cloudName=process.env.CLOUDINARY_CLOUD_NAME??"";
 const apiKey=process.env.CLOUDINARY_API_KEY??"";
 const apiSecret=process.env.CLOUDINARY_API_SECRET??"";
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(cloudName)||!/^[0-9a-zA-Z_-]{4,100}$/.test(apiKey)||apiSecret.length<8){
   throw new AuthError(503,"ASSETS_UNCONFIGURED","Asset storage is not configured");
 }
 return {cloudName,apiKey,apiSecret};
}
// Cloudinary RAW resources store the extension in public_id and commonly omit
// `format` from Admin API metadata. Infer PDF only from the returned RAW public ID;
// all other identity, delivery type, and byte-count checks remain mandatory.
export function parseCloudinaryResource(payload:unknown,resourceType:AssetType):ProviderResource{
 if(!payload||typeof payload!=="object"||Array.isArray(payload))
   throw new AuthError(502,"STORAGE_RESPONSE_INVALID","Cloudinary returned incomplete upload metadata");
 const asset=payload as Partial<ProviderResource>;
 const format=resourceType==="raw"&&(asset.format==null||asset.format==="")&&
   typeof asset.public_id==="string"&&/\.pdf$/i.test(asset.public_id)
   ?"pdf":asset.format;
 if(typeof asset.asset_id!=="string"||!asset.asset_id||
    typeof asset.public_id!=="string"||!asset.public_id||
    typeof asset.resource_type!=="string"||typeof asset.type!=="string"||
    typeof format!=="string"||!format||
    typeof asset.bytes!=="number"||!Number.isSafeInteger(asset.bytes)||asset.bytes<=0){
   throw new AuthError(502,"STORAGE_RESPONSE_INVALID","Cloudinary returned incomplete upload metadata");
 }
 return {asset_id:asset.asset_id,public_id:asset.public_id,resource_type:asset.resource_type,
   type:asset.type,format,bytes:asset.bytes,
   ...(typeof asset.created_at==="string"?{created_at:asset.created_at}:{})};
}
export class CloudinaryAssetProvider implements AssetProvider {
 uploadOptions(publicId:string,resourceType:AssetType,formats:string[]):UploadOptions {
   const {cloudName,apiKey,apiSecret}=environment();
   const signed:Record<string,string>={
     public_id:publicId,type:"authenticated",overwrite:"false",
     unique_filename:"false",allowed_formats:formats.join(","),
     timestamp:String(Math.floor(Date.now()/1000)),
   };
   const signature=cloudinarySign(signed,apiSecret);
   return {uploadUrl:"https://api.cloudinary.com/v1_1/"+cloudName+"/"+resourceType+"/upload",
     params:{...signed,api_key:apiKey,signature}};
 }
 async inspect(publicId:string,resourceType:AssetType):Promise<ProviderResource> {
   const {cloudName,apiKey,apiSecret}=environment();
   const path=publicId.split("/").map(encodeURIComponent).join("/");
   const url="https://api.cloudinary.com/v1_1/"+cloudName+"/resources/"+resourceType+"/authenticated/"+path;
   let response:Response;
   try{
     response=await fetch(url,{headers:{Authorization:"Basic "+Buffer.from(apiKey+":"+apiSecret).toString("base64")},
       cache:"no-store",signal:AbortSignal.timeout(10_000)});
   }catch{
     throw new AuthError(502,"STORAGE_UNAVAILABLE","Cannot confirm the Cloudinary upload");
   }
   if(!response.ok)throw new AuthError(422,"UPLOAD_NOT_FOUND","Cloudinary asset could not be verified");
   return parseCloudinaryResource(await response.json(),resourceType);
 }
 download(publicId:string,resourceType:AssetType,format:string):string{
   const {cloudName,apiKey,apiSecret}=environment();
   const now=Math.floor(Date.now()/1000);
   const params:Record<string,string>={
     timestamp:String(now),expires_at:String(now+120),public_id:publicId,
     format,type:"authenticated",attachment:"true",
   };
   const signature=cloudinarySign(params,apiSecret);
   const q=new URLSearchParams({...params,signature,api_key:apiKey});
   return "https://api.cloudinary.com/v1_1/"+cloudName+"/"+resourceType+"/download?"+q.toString();
 }
}
// Signed Cloudinary uploads are limited by BOTH MIME type and actual extension.
/// JPEG browsers frequently call the media type image/jpeg while Cloudinary
// reports the format as jpg. Keep the aliases in the signed whitelist.
export const IMAGE_FORMATS=["jpg","jpeg","jfif","png","gif","webp","avif","bmp","tif","tiff","heic","heif"] as const;
export const MEDIA_TYPES:Record<string,{kind:AssetType;format:string;maxBytes:number}>={
 "image/jpeg":{kind:"image",format:"jpg",maxBytes:10_000_000},
 "image/pjpeg":{kind:"image",format:"jpg",maxBytes:10_000_000},
 "image/jfif":{kind:"image",format:"jfif",maxBytes:10_000_000},
 "image/png":{kind:"image",format:"png",maxBytes:10_000_000},
 "image/gif":{kind:"image",format:"gif",maxBytes:10_000_000},
 "image/webp":{kind:"image",format:"webp",maxBytes:10_000_000},
 "image/avif":{kind:"image",format:"avif",maxBytes:10_000_000},
 "image/bmp":{kind:"image",format:"bmp",maxBytes:10_000_000},
 "image/tiff":{kind:"image",format:"tiff",maxBytes:10_000_000},
 "image/heic":{kind:"image",format:"heic",maxBytes:10_000_000},
 "image/heif":{kind:"image",format:"heif",maxBytes:10_000_000},
 "video/mp4":{kind:"video",format:"mp4",maxBytes:100_000_000},
 "video/quicktime":{kind:"video",format:"mov",maxBytes:100_000_000},
 "video/webm":{kind:"video",format:"webm",maxBytes:100_000_000},
 "application/pdf":{kind:"raw",format:"pdf",maxBytes:50_000_000},
};
export function validateMedia(contentType:string,bytes:number){
 const kind=MEDIA_TYPES[contentType];
 if(!kind)throw invalid("Supported: JPG, JPEG, JFIF, PNG, GIF, WebP, AVIF, BMP, TIFF, HEIC, HEIF, MP4, MOV, WebM, PDF");
 if(!Number.isSafeInteger(bytes)||bytes<1||bytes>kind.maxBytes)
   throw invalid("File exceeds the allowed size for this format");
 return kind;
}
