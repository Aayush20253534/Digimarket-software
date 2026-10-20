# Render Free: first admin and backend endpoints

The Express backend is an API, not the sign-in web interface.

## Public API status

When Render reports that the API is healthy, open:

- `https://YOUR-ACTUAL-RENDER-HOST.onrender.com/` or `/endpoint`: basic API overview.
- `/api/v1/health`: HTTP 200 if the Node API process is running.
- `/api/v1/ready`: HTTP 200 only if the database is reachable, HTTP 503 if not.
- `POST /api/v1/auth/login`: authenticated login exchange. The recommended interface is the **Vercel** site at `https://YOUR-WEB-HOST.vercel.app/login`.

Do not attempt to log into the Render root URL: it is a JSON backend, not the Next.js UI.

## Provision the very first administrator on Render Free

1. Confirm that `DATABASE_URL`, `DIRECT_DATABASE_URL`, independent JWT secrets, MFA encryption key, Cloudinary credentials, `OPS_MONITOR_TOKEN`, and the frontend origin are correctly configured on the Render **API web service**.
2. Use the standard free-compatible Render **start command** (no paid pre-deploy hook needed):

   ```sh
   pnpm --filter @digimarket/db db:migrate:deploy && pnpm --filter @digimarket/api exec tsx ../../packages/db/src/seed.ts && pnpm --filter @digimarket/api start
   ```

3. In **Render → digimarket-api → Environment**, temporarily add these **three** environment variables. Choose your own long, unique temporary password, using the Render secret editor rather than a chat message or a checked-in file.

   ```dotenv
   BOOTSTRAP_ORG_NAME=DigiMarket
   BOOTSTRAP_ADMIN_LOGIN=admin
   BOOTSTRAP_ADMIN_PASSWORD=<your-own-strong-unique-temporary-password>
   ```

   No email is required for the initial administrator. Choose a login ID with 3–80 letters, digits, dots, underscores or hyphens; the password must be 12–128 characters.

4. Save the variables and manually redeploy the **latest** GitHub `main`. Once migrations and seeding complete, the API creates the initial organization, user, system roles, and permission assignments in a transaction. The admin's password is stored only as an Argon2id hash. No password or TOTP value is printed.
5. Confirm `/api/v1/ready` is HTTP 200. Visit the **Vercel** frontend `/login` and enter the login ID and temporary password.
6. The app requires a **new password** on first sign-in. After setting it, log in again; privileged admins must configure a time-based authenticator (Google Authenticator, Microsoft Authenticator, 1Password, etc.) and enter the six-digit code.
7. Immediately after successful first login, **delete all three BOOTSTRAP_* environment variables from Render and redeploy**. Leaving bootstrap passwords in a host secret store is unnecessary. In subsequent deployments, the database is already initialized and the bootstrap guard does not reset or create additional users.

**The first-admin bootstrap is not an open HTTP endpoint.** It only runs locally inside the API process when all three temporary server-side variables are set and the database contains no organization. If an organization already exists, the guard skips initialization. If only some variables are supplied, the API refuses to start to prevent a silently broken setup.

## Additional users

After the first administrator signs in and configures MFA, open the app's **Team → Users** screen to assign logins and temporary passwords to employees. The admin chooses each person's role. The API restricts user creation to authorized accounts and requires users to change temporary passwords at first login. There is no public registration or fixed/default administrator password.

## Redis note for free hosting

The standard **Render API** does not require a `REDIS_URL` to start and authenticate. The Redis-dependent BullMQ **background worker** is separate. Without an always-running worker, job-driven reminders, scheduled recurring tasks and invoicing are not automatically processed, even though the rest of the application can operate.

## Troubleshooting

- `/` works but `/ready` is 503: verify Neon connection and database migrations.
- `/ready` is 200 but login fails: verify the initial admin was bootstrapped, that the frontend URL is in Render `CORS_ALLOWED_ORIGINS`, and that Vercel `API_INTERNAL_URL` points at this Render service.
- Login prompts for password change or authenticator setup: this is expected for the first admin.
- A previously provisioned organization cannot be bootstrapped again with the same environment variables; use admin permissions or a controlled recovery procedure instead.
- Render Free can sleep when idle; wakeups may exceed the frontend's short API proxy timeout and initially show 503. Retry after Render reports healthy.

See [Module 17 production runbook](28-MODULE-17-PRODUCTION.md) for migration, backup, and incident handling.
