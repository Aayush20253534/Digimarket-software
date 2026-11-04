"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {CheckCheck, ListTodo} from "lucide-react";
import {useAuth} from "@/components/auth-provider";

export function TaskSectionTabs(){
 const {session}=useAuth();
 const path=usePathname();
 if(!session?.identity.permissions.includes("tasks.read"))return null;
 return <nav className="aw-v2-tabs" aria-label="Task sections" data-testid="tasks-tabs">
  <Link href="/app/tasks" className={"aw-v2-tab"+(path==="/app/tasks"?" aw-v2-tab-active":"")}
   aria-current={path==="/app/tasks"?"page":undefined}><ListTodo size={16} aria-hidden="true"/>Active tasks</Link>
  <Link href="/app/task-history" className={"aw-v2-tab"+(path==="/app/task-history"?" aw-v2-tab-active":"")}
   aria-current={path==="/app/task-history"?"page":undefined}><CheckCheck size={16} aria-hidden="true"/>History</Link>
 </nav>;
}
