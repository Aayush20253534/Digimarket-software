import { Prisma } from "@digimarket/db";
import type { InvoiceDraftInput } from "@digimarket/contracts";
export const D=(v:string|number|Prisma.Decimal)=>new Prisma.Decimal(v);
export const money=(v:Prisma.Decimal)=>v.toDecimalPlaces(4,Prisma.Decimal.ROUND_HALF_UP);
export function calculateLines(lines:InvoiceDraftInput["lines"]){
  let subtotal=D(0),taxTotal=D(0);
  const items=lines.map((line,position)=>{
    const quantity=D(line.quantity),unitPrice=D(line.unitPrice),taxRate=D(line.taxRate);
    if(!quantity.isFinite()||quantity.lte(0)||!unitPrice.isFinite()||unitPrice.lt(0)
      ||!taxRate.isFinite()||taxRate.lt(0)||taxRate.gt(100))
      throw new Error("Invalid invoice amount, quantity or tax rate");
    const net=money(quantity.times(unitPrice));
    const tax=money(net.times(taxRate).div(100));
    subtotal=subtotal.plus(net);taxTotal=taxTotal.plus(tax);
    return {position,description:line.description,quantity:quantity.toFixed(2),
      unitPrice:unitPrice.toFixed(4),taxRate:taxRate.toFixed(2),
      net:net.toFixed(4),tax:tax.toFixed(4),total:net.plus(tax).toFixed(4)};
  });
  const total=subtotal.plus(taxTotal);
  if(total.lte(0)||total.gt("99999999999999"))throw new Error("Invoice total must be positive and within limits");
  return {items,subtotal:subtotal.toFixed(4),taxTotal:taxTotal.toFixed(4),total:total.toFixed(4)};
}
export const dated=(s:string)=>new Date(s+"T00:00:00.000Z");
export const out=(v:Prisma.Decimal)=>v.toFixed(4);
