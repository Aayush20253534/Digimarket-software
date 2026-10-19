import { permissionCatalog } from "@digimarket/db/permissions";

export type SystemRole = "SUPER_ADMIN" | "ADMIN" | "FOUNDER" | "EMPLOYEE";
export const SYSTEM_ROLES: SystemRole[] = ["SUPER_ADMIN", "ADMIN", "FOUNDER", "EMPLOYEE"];
export const privilegedRole = (roles: string[]) => roles.some((role) => role === "SUPER_ADMIN" || role === "ADMIN" || role === "FOUNDER");

const admin = [
  "approvals.read", "approvals.submit", "approvals.decide", "approvals.policy.manage",
  "users.read", "users.create", "users.update", "users.reset", "teams.read", "teams.manage",
  "leads.read", "leads.create", "leads.edit", "leads.assign", "leads.convert", "leads.bulk", "leads.duplicates.review",
  "clients.read", "clients.create", "clients.edit", "finance.entry.create",
  "finance.entry.read.own", "finance.read.all", "finance.category.manage", "finance.approve", "projects.create", "projects.assign", "projects.read",
  "projects.update", "tasks.create", "tasks.update.own", "content.create",
  "content.edit", "assets.upload", "assets.read",
] as const;
const founder = [
  "approvals.read", "approvals.submit", "approvals.decide",
  "teams.read", "leads.read", "leads.create", "leads.edit", "leads.assign", "leads.bulk", "leads.duplicates.review",
  "clients.read", "clients.create", "clients.edit", "finance.entry.create",
  "finance.entry.read.own", "finance.read.all", "finance.approve", "projects.create", "projects.read", "projects.update",
  "tasks.create", "tasks.update.own", "content.create", "content.edit",
  "assets.upload", "assets.read",
] as const;
const employee = ["approvals.read", "approvals.submit", "leads.read", "leads.create", "leads.edit.own", "finance.entry.create", "finance.entry.read.own", "tasks.update.own"] as const;
export const systemRoleGrants: Record<SystemRole, readonly string[]> = {
  SUPER_ADMIN: permissionCatalog.map(([key]) => key),
  ADMIN: admin,
  FOUNDER: founder,
  EMPLOYEE: employee,
};
