/** Exact paise arithmetic for founder-funded salary allocations. No JS floats. */
export const rupeePattern=/^(0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$/;
export function paise(value:string):bigint {
 if(!rupeePattern.test(value))throw new Error("Invalid INR amount");
 const [whole,fraction=""]=value.split(".");
 return BigInt(whole)*100n+BigInt(fraction.padEnd(2,"0"));
}
export function exactSplit(total:string,parts:readonly string[]):boolean{
 try{
  const required=paise(total);
  return required>0n&&parts.length>0&&parts.every(x=>paise(x)>0n)&&
   parts.reduce((n,x)=>n+paise(x),0n)===required;
 }catch{return false;}
}
export function inr(value:bigint):string{
 const negative=value<0n;
 const units=negative?-value:value;
 return (negative?"-":"")+(units/100n).toString()+"."+(units%100n).toString().padStart(2,"0");
}
