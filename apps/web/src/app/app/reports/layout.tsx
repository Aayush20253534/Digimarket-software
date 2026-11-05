import type {ReactNode} from "react";
import {BusinessWorkspaceNav} from "@/components/business-workspace-nav";

/** All reporting breakdowns retain their existing URLs and backend permissions. */
export default function ReportsLayout({children}:{children:ReactNode}){
 return <div className="aw-v5-report-shell">
  <BusinessWorkspaceNav/>
  {children}
 </div>;
}
