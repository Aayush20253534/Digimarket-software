import { createHmac } from "node:crypto";
import { describe,expect,it } from "vitest";
import { inboundSenders,validMetaSignature } from "./webhook";
describe("authenticated WhatsApp lead capture",()=>{
 const body={object:"whatsapp_business_account",entry:[{changes:[{
  field:"messages",value:{metadata:{phone_number_id:"1234567890"},messages:[
   {from:"919876543210",id:"wamid.first",type:"text",text:{body:"private, do not store"}},
   {from:"919876543210",id:"wamid.second",type:"image"},
   {from:"919988776655",id:"wamid.third",type:"text"},
  ]},
 }]}]};
 it("reads only sender numbers and deduplicates them",()=>{
  expect(inboundSenders(body,"1234567890")).toEqual(["919876543210","919988776655"]);
  expect(inboundSenders(body,"other")).toEqual([]);
 });
 it("never turns group conversation metadata into leads",()=>{
  const group={object:"whatsapp_business_account",entry:[{changes:[{
   field:"messages",value:{metadata:{phone_number_id:"1234567890"},messages:[
    {from:"919876543210",id:"wamid.group",group_id:"group-1",type:"text"},
    {from:"919876543210",id:"wamid.group2",context:{group_id:"group-2"},type:"text"},
    {from:"919876543210",id:"wamid.group3",recipient_type:"group",type:"text"},
    {from:"919876543210",id:"wamid.group4",chat_id:"120363000@g.us",type:"text"},
    {from:"919876543210@g.us",id:"wamid.group5",type:"text"},
   ]},
  }]}]};
  expect(inboundSenders(group,"1234567890")).toEqual([]);
 });
 it("ignores delivery status and invalid numbers",()=>{
  expect(inboundSenders({object:"whatsapp_business_account",entry:[{changes:[{
   field:"messages",value:{metadata:{phone_number_id:"1234567890"},
    statuses:[{recipient_id:"919876543210"}],messages:[{from:"not-a-phone",id:"wamid.bad"}]},
  }]}]},"1234567890")).toEqual([]);
 });
 it("accepts an authentic signature and rejects tampering",()=>{
  const secret="my-secure-app-secret-example";
  const buffer=Buffer.from(JSON.stringify(body));
  const signature="sha256="+createHmac("sha256",secret).update(buffer).digest("hex");
  expect(validMetaSignature(buffer,signature,secret)).toBe(true);
  expect(validMetaSignature(Buffer.from("{}"),signature,secret)).toBe(false);
  expect(validMetaSignature(buffer,undefined,secret)).toBe(false);
  expect(validMetaSignature(buffer,"sha256=0",secret)).toBe(false);
 });
});
