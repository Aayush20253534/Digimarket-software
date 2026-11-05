"use client";
import {ClientDeliveryWorkspace} from "@/components/client-delivery-workspace";
import {PageHeader} from "@/components/ui";
import {OperationsWorkspaceNav} from "@/components/operations-workspace-nav";
export default function MyDeliveriesPage(){
 return <div data-aw-module="service-deliveries" className="aw-module-root space-y-5">
  <OperationsWorkspaceNav/>
  <PageHeader eyebrow="SERVICE DELIVERY" title="My client deliveries"
    description="Your assigned service dates and completion checkboxes. Internal tasks are separate."/>
  <ClientDeliveryWorkspace/>
 </div>;
}
