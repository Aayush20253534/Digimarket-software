import {redirect} from "next/navigation";
// Preserve legacy URLs without exposing retired billing UI or deleting financial data.
export default function BillingPage(){redirect("/app/finance");}
