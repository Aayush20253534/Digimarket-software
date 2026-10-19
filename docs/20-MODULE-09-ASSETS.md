# Module 9: Private Cloudinary File and Asset Manager

## Delivered
- Protected file directory at /app/assets: upload, filters, client association, archive, protected download.
- Direct signed upload with server-only CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET. If missing, upload-intent returns 503. Cloudinary API secret is never delivered to browsers.
- Upload intent for a 10-minute window with random public ID under digimarket/<organization UUID>/<intent UUID>. Images JPEG, PNG, WebP up to 20 MB; videos MP4, MOV, WebM up to 100 MB; PDF up to 10 MB.
- Every Cloudinary upload uses authenticated delivery, restricted format and no overwrite. The backend checks Cloudinary Admin API for actual immutable asset ID, public ID, upload type, file size, resource type, format and creation timestamp. Only then are intent and metadata marked confirmed atomically.
- Asset and AssetUploadIntent PostgreSQL tables, scoped to organization and optional client, with independent uniqueness and audit records.
- List/detail/download require assets.read; client-linked files additionally require clients.read. Upload/link require assets.upload; archive requires assets.delete. Client association is validated against the same organization.
- On-demand protected Cloudinary Download API URLs expire after two minutes, are generated after per-record access checks, never saved in the database and never put in audit events. Archive prevents further authorization.

## API
- POST /api/v1/assets/upload-intent, with filename, contentType, bytes, optional clientId. Returns uploadUrl, params, intentId, expiresAt.
- POST /api/v1/assets/confirm, with intentId and assetId.
- GET /api/v1/assets with q, clientId, status, cursor, limit.
- GET /api/v1/assets/:id, metadata only.
- POST /api/v1/assets/:id/authorized-download, private URL valid 120 seconds.
- POST /api/v1/assets/:id/link, with clientId and version.
- POST /api/v1/assets/:id/archive, with version.

## Validation and limitations
- Dedicated Module 9 CI runs PostgreSQL 16 schema drift checks, lint, types, unit tests, build and database-backed auth/isolation/mismatch/expiry/archive tests with a mocked Cloudinary provider. Module 8 regression also runs.
- Live Cloudinary upload requires separately provisioned credentials, account access and provider-specific limits; these cannot be verified in CI without a connected Cloudinary account.
- Only image, video and PDF formats are accepted. Executables and raw HTML are excluded. Do not upload credentials. There is no antivirus integration in this module; upload security settings on Cloudinary should also be configured.
- Archive changes metadata but does not delete the original in Cloudinary. A previously granted download URL is valid until its own expiry. Physical provider cleanup, orphan reconciliation, legal retention, scanning, restore testing and production deployment remain later hardening work.
- Assets that reach Cloudinary but are never confirmed are not shown in the application. Run orphan cleanup before production rollout. 
- No live Neon migration or production Cloudinary provisioning has been performed.
