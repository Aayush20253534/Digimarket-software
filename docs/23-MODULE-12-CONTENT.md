# Module 12: Content calendar and version-controlled publication

## Features
- `/app/content` offers month, week and list views. List includes unscheduled ideas; calendar entries are grouped by planned publish time.
- Content belongs to an existing non-archived client. Optional projects must belong to the same client and be visible to the editor.
- Platform: Instagram, Facebook, LinkedIn, YouTube, Google Business, Website, Other. Formats: Reel, Post, Story, Carousel, Video, Blog, Other.
- Each post stores title, caption, hashtags, planned publication time, active client-owned private assets and a designated active staff owner.
- Manager controls enable assigning owners and browsing the entire organization; staff see posts they authored or own but can only edit assigned ownership.
- Draft states: IDEA, DRAFT, IN_REVIEW, CHANGES_REQUESTED, APPROVED, SCHEDULED, PUBLISHED, CANCELLED.
- Immutable `ContentPostRevision` rows snapshot the content text, platform, format, target time, owner and ordered asset IDs. The revision count changes on each edit.
- Saving an edited approved/scheduled post returns it to DRAFT, clears the current approval reference and mandates resubmission. Editing is not allowed during pending review. The existing Approvals workflow handles cancellation, rejection with reason and approval.
- Rejected requests reopen the content as CHANGES_REQUESTED; revising then creates a new snapshot and returns to DRAFT.
- Only an authorized user with `content.publish` may manually record PUBLISHED against an approved, current revision, with publisher identity, timestamp and optional HTTPS link.
- Scheduling is an editorial status transition only; it does not automatically post on any platform.
- Approval policy category `CONTENT` must be configured and active. The existing queue filters content by `content.approve` and configured approver roles, forbids self-approval and makes decision + post state + audit + outbox atomic.

## New API
- GET/POST `/api/v1/content`
- GET `/api/v1/content/staff` (manager)
- GET/PUT `/api/v1/content/:id`
- POST `/api/v1/content/:id/submit`
- POST `/api/v1/content/:id/schedule`
- POST `/api/v1/content/:id/publish` (manual record)
- POST `/api/v1/content/:id/cancel` (manager)
- Existing `/api/v1/approvals` handles review decisions.

## Data and security
- Migration: `20261020010000_content_calendar`. Post, asset relation and immutable revision tables.
- Optimistic `version` checks guard all state-changing mutations. Review is locked during IN_REVIEW; published records cannot be edited or published twice.
- Organization isolation, owner-only staff reads, project scoping, active client-specific file references, private Cloudinary media control.
- `content.read`, `content.manage`, `content.publish`, `content.create`, `content.edit`, `content.approve` are explicit permissions.
- Install new grants in existing organizations using the idempotent seed script (no user accounts or secrets are created).
- Audit history and outbox track submissions, reviews, publication and changes without sending captions into notification payloads.

## Verification and release
- Workflow `.github/workflows/module12-content.yml` uses isolated PostgreSQL and validates migrations, schema drift, builds, lint, types, workflow integration and Module 10/approval regressions.
- This module intentionally **does not** log into third-party social platforms, schedule background publication, or expose private direct Cloudinary media URLs. Publish status reflects a manual record by staff.
- Deployment/production services remain part of Module 17.
