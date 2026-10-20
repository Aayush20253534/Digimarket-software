-- Align existing system founder grants with administrator-owned task scheduling.
-- Only permission bindings change; no business or task records are touched.
INSERT INTO "RolePermission" ("roleId", "permissionKey")
SELECT r."id", p."key" FROM "Role" r CROSS JOIN "Permission" p
WHERE r."key" = 'FOUNDER' AND r."isSystem" = true
 AND p."key" IN ('tasks.read', 'notifications.read')
ON CONFLICT ("roleId", "permissionKey") DO NOTHING;
DELETE FROM "RolePermission" rp USING "Role" r
WHERE rp."roleId"=r."id" AND r."key"='FOUNDER' AND r."isSystem"=true
 AND rp."permissionKey" IN ('tasks.create', 'tasks.recurrence.manage', 'tasks.manage');
