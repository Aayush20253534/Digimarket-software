import {describe,expect,it} from "vitest";
import {buildZip} from "./zip";

describe("private folder ZIP archiver",()=>{
 it("writes valid stored ZIP local and central headers for nested paths",()=>{
  const archive=buildZip([{name:"Designs/logo.png",data:Buffer.from([4,3,2,1])},
    {name:"invoices/proof.pdf",data:Buffer.from("%PDF-1.7")}]);
  expect(archive.readUInt32LE(0)).toBe(0x04034b50);
  const nameLen=archive.readUInt16LE(26);
  expect(archive.subarray(30,30+nameLen).toString()).toBe("Designs/logo.png");
  expect(archive.readUInt32LE(18)).toBe(4);
  expect(archive.subarray(30+nameLen,34+nameLen)).toEqual(Buffer.from([4,3,2,1]));
  expect(archive.readUInt32LE(archive.length-22)).toBe(0x06054b50);
  expect(archive.readUInt16LE(archive.length-12)).toBe(2);
 });
 it("encodes an empty folder archive without a fabricated file",()=>{
  const archive=buildZip([]);
  expect(archive.length).toBe(22);
  expect(archive.readUInt32LE(0)).toBe(0x06054b50);
 });
});
