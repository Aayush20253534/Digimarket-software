import { permissionCatalog } from "@digimarket/db/permissions";

export type SystemRole = "SUPER_ADMIN" | "ADMIN" | "FOUNDER" | "EMPLOYEE";
export const SYSTEM_ROLES: SystemRole[] = ["SUPER_ADMIN", "ADMIN", "FOUNDER", "EMPLOYEE"];
export const privilegedRole = (roles: string[]) => roles.some((role) => role === "SUPER_ADMIN" || role === "ADMIN");

const admin = [
  "notifications.read", "search.read", "reports.business.read", "approvals.read", "approvals.submit", "approvals.decide", "approvals.policy.manage",
  "users.read", "users.create", "users.update", "users.reset", "teams.read", "teams.manage",
  "leads.read", "leads.create", "leads.edit", "leads.assign", "leads.convert", "leads.bulk", "leads.duplicates.review",
  "clients.read", "clients.create", "clients.edit", "finance.entry.create",
  "finance.entry.read.own", "finance.read.all", "finance.category.manage", "finance.approve", "invoices.read", "payments.read", "projects.create", "projects.assign", "projects.read",
  "projects.update", "projects.deliverables.write", "projects.review", "tasks.create", "tasks.read", "tasks.manage", "tasks.recurrence.manage", "tasks.comment", "tasks.update.own", "content.read", "content.manage", "content.publish", "content.create",
  "content.edit", "content.approve", "profitability.read", "profitability.manage", "founders.read", "founders.edit", "organization.settings.manage", "assets.upload", "assets.read", "assets.delete",
] as const;
const founder = [
  "notifications.read", "approvals.read", "approvals.submit", "approvals.decide",
  "teams.read", "leads.read", "leads.create", "leads.edit", "leads.assign", "leads.convert", "leads.bulk", "leads.duplicates.review",
  "clients.read", "clients.create", "clients.edit", "finance.entry.create",
  "finance.entry.read.own", "finance.read.all", "finance.approve", "projects.create", "projects.assign", "projects.read", "projects.update", "projects.deliverables.write", "projects.review",
  "tasks.read", "tasks.update.own", "content.read", "content.manage", "content.publish", "content.create", "content.edit", "content.approve",
  "invoices.read", "invoices.draft", "invoices.manage", "invoices.issue", "payments.read", "payments.record", "payments.verify", "profitability.read", "profitability.manage", "founders.read", "founders.edit", "assets.upload", "assets.read",
] as const;
const employee = ["notifications.read","search.read","founders.read", "approvals.read", "approvals.submit", "leads.read", "leads.create", "leads.edit.own", "leads.convert", "clients.read", "clients.edit", "finance.entry.create", "finance.entry.read.own", "projects.read", "projects.deliverables.write", "tasks.read", "tasks.comment", "tasks.update.own"] as const;
export const systemRoleGrants: Record<SystemRole, readonly string[]> = {
  SUPER_ADMIN: permissionCatalog.map(([key]) => key),
  ADMIN: admin,
  FOUNDER: founder,
  EMPLOYEE: employee,
};
