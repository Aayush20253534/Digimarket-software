import {describe,expect,it} from "vitest";
import {subscriptionHash,validPushEndpoint} from "./push";
describe("Web Push endpoint safety",()=>{
 it("accepts registered public push gateways",()=>{
  expect(validPushEndpoint("https://fcm.googleapis.com/fcm/send/sample")).toBe(true);
  expect(validPushEndpoint("https://web.push.apple.com/Qexample")).toBe(true);
 });
 it("rejects localhost, internal, or crafted endpoints",()=>{
  for(const url of ["http://fcm.googleapis.com/","https://127.0.0.1/","https://localhost/",
   "https://evil.test/?host=web.push.apple.com","https://fcm.googleapis.com.evil.test/",
   "https://user:pass@fcm.googleapis.com/"]){
   expect(validPushEndpoint(url)).toBe(false);
  }
 });
 it("hashes endpoints without storing their cleartext as unique index keys",()=>{
  expect(subscriptionHash("https://fcm.googleapis.com/a")).toMatch(/^[a-f0-9]{64}$/);
  expect(subscriptionHash("https://fcm.googleapis.com/a")).not.toBe(subscriptionHash("https://fcm.googleapis.com/b"));
 });
});
