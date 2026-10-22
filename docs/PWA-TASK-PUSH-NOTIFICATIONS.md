# PWA task-assignment phone alerts

The CRM always writes a durable in-app notification when a task is assigned to a staff member or founder, including recurring tasks. Web Push is an optional extra for installed PWAs.

## Server configuration

Configure these Render environment variables for the **Digimarket API** service:
- `WEB_PUSH_VAPID_PUBLIC_KEY`: URL-safe base64 (no padding) encoding of the uncompressed 65-byte P-256 public key (0x04, X, Y).
- `WEB_PUSH_VAPID_PRIVATE_KEY`: URL-safe base64 (no padding) encoding of the 32-byte P-256 private scalar.
- `WEB_PUSH_VAPID_SUBJECT`: a valid `mailto:admin@example.com` address managed by your business.

Generate a compatible key pair in Node.js 22 and copy the resulting values into Render's private environment variables:

```js
const { generateKeyPairSync } = require("node:crypto");
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const publicKey = Buffer.concat([
 Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url"),
]).toString("base64url");
console.log("WEB_PUSH_VAPID_PUBLIC_KEY="+publicKey);
console.log("WEB_PUSH_VAPID_PRIVATE_KEY="+jwk.d);
```

Do not commit the generated private key. Keep the same key pair after deployment so existing PWA subscriptions continue to work. The frontend fetches the public key from an authenticated API endpoint, so it does not need a Vercel environment variable.

## Recipient steps

1. Install the AmplifyWorld PWA on a compatible browser.
2. Sign in, open the Notifications bell, and choose **Enable phone alerts**.
3. Grant operating-system/browser notification permission.

On iOS, use the Home Screen-installed Safari web app. Supported browsers can receive Web Push even when the PWA is closed, subject to operating-system restrictions and connectivity.

Alerts only contain generic text; task details are accessible after signing in. Subscription endpoints are organization/user-scoped. Expired subscriptions are removed automatically upon provider responses 404 or 410. When VAPID is missing or a provider is unreachable, the in-app notification remains available.

## Verification

- Assign a new task to a founder and confirm the in-app bell has a new unread **TASK_ASSIGNED** notification.
- On the founder's authorized and subscribed device, confirm a generic "New task assigned" system notification appears.
- Confirm that assigning a task within another organization never creates notifications for unrelated members.
- Confirm that reassignment notifies newly added users only.

Web Push delivery depends on external push services. CI covers in-app notification persistence and push URL safety; a real-device push acceptance test is required for end-to-end verification.
