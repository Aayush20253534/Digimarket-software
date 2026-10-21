import { afterEach,describe,expect,it,vi } from "vitest";
import { CloudinaryAssetProvider,cloudinarySign,parseCloudinaryResource,validateMedia,IMAGE_FORMATS } from "./provider";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("Cloudinary authenticated resource verification",()=>{
 const rawPdf={
   asset_id:"cloudinary-asset-id",public_id:"digimarket/org/document.pdf",
   resource_type:"raw",type:"authenticated",bytes:4096,created_at:"2026-10-21T06:00:00Z",
 };
 it("normalizes a RAW PDF response with no format or a null format",()=>{
   expect(parseCloudinaryResource(rawPdf,"raw")).toMatchObject({...rawPdf,format:"pdf"});
   expect(parseCloudinaryResource({...rawPdf,format:null},"raw").format).toBe("pdf");
   expect(parseCloudinaryResource({...rawPdf,format:"pdf"},"raw").format).toBe("pdf");
 });
 it("never infers format for images, videos, or non-PDF RAW files",()=>{
   expect(()=>parseCloudinaryResource({...rawPdf,resource_type:"image"},"image")).toThrow();
   expect(()=>parseCloudinaryResource({...rawPdf,resource_type:"video"},"video")).toThrow();
   expect(()=>parseCloudinaryResource({...rawPdf,public_id:"digimarket/org/document.exe"},"raw")).toThrow();
   expect(()=>parseCloudinaryResource({...rawPdf,public_id:"digimarket/org/document.pdf",format:"exe"},"raw")).not.toThrow();
 });
 it("requires provider identity, byte count and type even for RAW PDFs",()=>{
   for(const variant of [
     {...rawPdf,asset_id:undefined},{...rawPdf,public_id:undefined},
     {...rawPdf,resource_type:undefined},{...rawPdf,type:undefined},
     {...rawPdf,bytes:undefined},{...rawPdf,bytes:0},{...rawPdf,bytes:NaN},
   ])expect(()=>parseCloudinaryResource(variant,"raw")).toThrow();
 });
 it("reads a Cloudinary Admin API RAW PDF response that omits format",async()=>{
   vi.stubEnv("CLOUDINARY_CLOUD_NAME","ci-cloud");
   vi.stubEnv("CLOUDINARY_API_KEY","ci-key");
   vi.stubEnv("CLOUDINARY_API_SECRET","ci-secret-secret");
   const fetchMock=vi.fn(async()=>new Response(JSON.stringify(rawPdf),{status:200}));
   vi.stubGlobal("fetch",fetchMock);
   const verified=await new CloudinaryAssetProvider().inspect(rawPdf.public_id,"raw");
   expect(verified.format).toBe("pdf");
   expect(verified.asset_id).toBe(rawPdf.asset_id);
   expect(fetchMock).toHaveBeenCalledOnce();
 });
});
describe("Cloudinary signed upload security",()=>{
 it("does not include api_key or signature in the signing payload",()=>{
   const secret="not-a-real-secret";
   const input={public_id:"digimarket/org/asset",timestamp:"123",type:"authenticated",
     api_key:"EXCLUDED",file:"EXCLUDED",signature:"EXCLUDED"};
   expect(cloudinarySign(input,secret)).toBe(cloudinarySign({
     timestamp:"123",type:"authenticated",public_id:"digimarket/org/asset"},secret));
   expect(cloudinarySign(input,secret)).toMatch(/^[a-f0-9]{40}$/);
 });
 it("enforces server-side content-type and size",()=>{
   expect(validateMedia("image/jpeg",500).kind).toBe("image");
   expect(validateMedia("video/mp4",100_000_000).kind).toBe("video");
   expect(validateMedia("application/pdf",50_000_000)).toEqual({
     kind:"raw",format:"pdf",maxBytes:50_000_000,
   });
   expect(()=>validateMedia("application/pdf",50_000_001)).toThrow();
   expect(()=>validateMedia("application/pdf",0)).toThrow();
   expect(()=>validateMedia("text/html",200)).toThrow();
   for(const type of ["image/jpeg","image/jfif","image/png","image/gif","image/webp","image/avif","image/bmp","image/tiff","image/heic","image/heif"]){
     expect(validateMedia(type,10_000_000).kind).toBe("image");
     expect(()=>validateMedia(type,10_000_001)).toThrow();
   }
   expect(IMAGE_FORMATS).toContain("jpg");
   expect(IMAGE_FORMATS).toContain("jpeg");
   expect(IMAGE_FORMATS).toContain("jfif");
   expect(()=>validateMedia("image/png",20_000_001)).toThrow();
 });
});
