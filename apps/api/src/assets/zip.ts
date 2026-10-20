/* Dependency-free, uncompressed ZIP archive for bounded private folder downloads. */
function crc32(data:Buffer):number{
 let crc=0xFFFFFFFF;
 for(const value of data){
  crc^=value;
  for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xEDB88320:0);
 }
 return (crc^0xFFFFFFFF)>>>0;
}
export function buildZip(files:{name:string;data:Buffer}[]):Buffer{
 const local:Buffer[]=[],central:Buffer[]=[];
 let offset=0,centralLength=0;
 for(const item of files){
  const name=Buffer.from(item.name,"utf8");
  if(name.length>65535)throw Error("Filename too long");
  const size=item.data.length,checksum=crc32(item.data);
  const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);
  lh.writeUInt16LE(20,4);lh.writeUInt16LE(0x0800,6);
  lh.writeUInt32LE(checksum,14);lh.writeUInt32LE(size,18);
  lh.writeUInt32LE(size,22);lh.writeUInt16LE(name.length,26);
  local.push(lh,name,item.data);
  const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);
  ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0x0800,8);
  ch.writeUInt32LE(checksum,16);ch.writeUInt32LE(size,20);ch.writeUInt32LE(size,24);
  ch.writeUInt16LE(name.length,28);ch.writeUInt32LE(offset,42);
  central.push(ch,name);
  offset+=lh.length+name.length+size;centralLength+=ch.length+name.length;
 }
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
 end.writeUInt32LE(centralLength,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,...central,end]);
}
