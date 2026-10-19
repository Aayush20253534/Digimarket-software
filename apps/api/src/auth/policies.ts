import { permissionCatalog } from "@digimarket/db/permissions";

export type SystemRole = "SUPER_ADMIN" | "ADMIN" | "FOUNDER" | "EMPLOYEE";
export const SYSTEM_ROLES: SystemRole[] = ["SUPER_ADMIN", "ADMIN", "FOUNDER", "EMPLOYEE"];
export const privilegedRole = (roles: string[]) => roles.some((role) => role === "SUPER_ADMIN" || role === "ADMIN" || role === "FOUNDER");

const admin = [
  "users.read", "users.create", "users.update", "users.reset", "teams.read", "teams.manage",
  "leads.read", "leads.create", "leads.edit", "leads.assign", "leads.convert",
  "clients.read", "clients.create", "clients.edit", "finance.entry.create",
  "finance.entry.read.own", "projects.create", "projects.assign", "projects.read",
  "projects.update", "tasks.create", "tasks.update.own", "content.create",
  "content.edit", "assets.upload", "assets.read",
] as const;
const founder = [
  "teams.read", "leads.read", "leads.create", "leads.edit", "leads.assign",
  "clients.read", "clients.create", "clients.edit", "finance.entry.create",
  "finance.entry.read.own", "projects.create", "projects.read", "projects.update",
  "tasks.create", "tasks.update.own", "content.create", "content.edit",
  "assets.upload", "assets.read",
] as const;
const employee = ["leads.read", "leads.create", "finance.entry.create", "finance.entry.read.own", "tasks.update.own"] as const;
export const systemRoleGrants: Record<SystemRole, readonly string[]> = {
  SUPER_ADMIN: permissionCatalog.map(([key]) => key),
  ADMIN: admin,
  FOUNDER: founder,
  EMPLOYEE: employee,
};
