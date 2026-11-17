import {AccountDetails} from "@/components/finance/ledgers";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <AccountDetails id={id}/>;}
