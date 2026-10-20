-- Read-only billing visibility for existing administrator roles.
-- No draft, issue, record or verify privileges are granted.
INSERT INTO "RolePermission" ("roleId", "permissionKey")
SELECT role.id, permission.key
FROM "Role" AS role
JOIN "Permission" AS permission ON permission.key IN ('invoices.read','payments.read')
WHERE role.key IN ('ADMIN','SUPER_ADMIN')
ON CONFLICT ("roleId", "permissionKey") DO NOTHING;
