import { describe,expect,it } from "vitest";
import { cloudinarySign,validateMedia } from "./provider";
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
   expect(()=>validateMedia("text/html",200)).toThrow();
   expect(()=>validateMedia("image/png",20_000_001)).toThrow();
 });
});
