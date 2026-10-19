# Module 4: Application shell, secure login UI and role-aware dashboard

## Delivered
1. A responsive authentication screen backed by the Module 3 API. Includes login ID/password, mandatory first-login password change, encrypted TOTP enrollment flow using manual authenticator setup key, and one-time code verification.
2. A same-origin Next.js API relay, with explicit route allowlist, method checks, origin restriction for state-changing requests, bounded JSON bodies, fixed server-side API target, short timeouts and pass-through of HttpOnly refresh session cookies.
3. In-memory access token context. On a fresh page load, the client attempts cookie-backed refresh before revealing protected screens; authenticated data comes only from /api/v1/me and other authorized API responses.
4. A responsive app shell, collapsible mobile navigation, current-role-aware Team link, profile entry and logout controls. Future modules are clearly marked as unavailable, rather than placeholders that pretend to have data.
5. Dashboard foundation showing only real signed-in session, role and permission grant counts. No fake clients, income, expenses or tasks.
6. A My Profile page showing the signed-in user's account information, roles and permissions, plus logout.
7. Staff administration page with real /users reads, creation, secure generated temporary credentials, permission-gated reset/disable and Super Admin role changes.
8. Reusable UI components: PageHeader, Card, FormField, Notice, StatusBadge, Spinner and EmptyState.
9. GitHub Actions using isolated PostgreSQL, administrator bootstrap, real Express API and Next web server plus Playwright Chromium browser tests.

## Web routes
- / is the public landing/health status. It does not imply that login has been configured.
- /login is the internal sign-in, password rotation and MFA interface.
- /app redirects to /app/dashboard.
- /app/dashboard requires a current authenticated session.
- /app/profile displays authenticated identity/security information.
- /app/team/users requires permission users.read; actions are independently authorized by the Express API.
- Later agency workflow routes intentionally do not exist until corresponding modules.

## Security boundaries
- Browser never stores access tokens, challenge tokens or TOTP secrets in localStorage/sessionStorage.
- The Next API relay accepts only enumerated paths/methods. It does not proxy to arbitrary hosts or expose secret environment variables.
- Only same-origin browser mutations are relayed; refresh/logout cookies remain HttpOnly and scoped to the auth endpoint.
- Unauthorized employee staff routes show denied access. API remains authoritative regardless of UI visibility.
- Temporary passwords are randomly generated and need to be shared via a separate private channel.
- A protected route guard is a navigation aid; never use it as authorization for future database queries.
- Startup without DATABASE_URL supports health/landing but cannot sign anyone in; real Neon provider configuration occurs in cloud deployment.
- No deployed app, production account, real client data or organization database is created during Module 4.

## Browser acceptance tests
- Unauthenticated users visiting /app/dashboard return to /login.
- New admin signs in, rotates initial password, enrolls an authenticator and reaches dashboard.
- Admin sees only authenticated role/permission information.
- Admin can provision an employee via /app/team/users.
- Employee changes temporary password and can sign in.
- Employee does not see the Team link and receives Access denied when navigating to staff route.
- Employee can navigate to own profile.
- Backend migration, API tests and browser smoke remain required by CI.

## Operational constraints to address before production
- Complete active-session self-service password change, MFA reset/recovery and session/device management.
- Decide final domain arrangement and require secure HTTPS cookies with appropriate same-site policy.
- Client-specific media, project and finance fields must be permission-filtered in their modules.
- Redis-backed multi-instance rate limiting and detailed audit/report tooling will follow the relevant modules.
- When production database is set up, bootstrap first owner through privileged cloud task with secrets not stored in Git.

## Evidence
- Full cloud Playwright/TypeScript/API run passed: https://github.com/Aayush20253534/Digimarket-software/actions/runs/39233484660\n- This checks the first-login password change, privileged MFA enrollment, staff provisioning, employee role isolation and signed-out redirect.\n- GitHub main-branch workflow evidence should be checked again following the final merge.

## CI operational policy
The browser workflow uses frozen dependencies, read-only repository permissions, dynamically generated CI-only passwords and isolated PostgreSQL. No CI-generated account is reused in live environments. Changes to user credentials are not stored in browser localStorage.
