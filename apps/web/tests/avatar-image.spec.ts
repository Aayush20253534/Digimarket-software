import {test,expect} from "@playwright/test";
import {calculateAvatarCrop} from "../src/lib/avatar-image";

test("portrait uploads crop a square without changing face proportions",()=>{
 const crop=calculateAvatarCrop(1080,1920);
 expect(crop.size).toBe(1080);
 expect(crop.sx).toBe(0);
 expect(crop.sy).toBeGreaterThan(0);
 expect(crop.sy+crop.size).toBeLessThanOrEqual(1920);
});

test("landscape uploads crop a square from the horizontal center",()=>{
 const crop=calculateAvatarCrop(1920,1080);
 expect(crop.size).toBe(1080);
 expect(crop.sx).toBe(420);
 expect(crop.sy).toBe(0);
});

test("square uploads retain their entire frame and invalid inputs are rejected",()=>{
 expect(calculateAvatarCrop(640,640)).toEqual({sx:0,sy:0,size:640});
 expect(()=>calculateAvatarCrop(0,100)).toThrow("Invalid image dimensions");
});
