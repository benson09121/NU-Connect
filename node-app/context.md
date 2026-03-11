# Project Context — node-app Refactoring History

> This file is updated at the end of every chat session.
> Open this first whenever starting a new chat window.
> Last updated: 2026-03-07 (Phase 6: User Account Flow + Phase 7: Public Routes)
> Location: project root (`context.md`)

---

## Project Overview

**Stack:** Node.js + TypeScript (in-progress refactor from JS) + Prisma + PostgreSQL  
**Auth:** Azure Bearer JWT — `req.user.email` (preferred_username) is the identity anchor  
**Mix of `.ts` and `.js`:** Intentional — refactoring little by little from JS → TS  
**Key config files:** `config/db.ts` (Prisma client), `config/storage.ts`, `config/redis.js`

### ✅ Identity Rule — Auth Middleware Now Auto-Resolves DB User ID (Phase 6)

`req.user.user_id` is now set by `middlewares/middleWare.ts` (`validateAzureJWT`) to the **DB `tbl_user.user_id`** — NOT the Azure sub. You can use `req.user.user_id` directly in TS controllers.

| Source | Value | Example |
|--------|-------|---------|
| `req.user.email` (`verified.preferred_username`) | User email (identity anchor) | `jdelacruz@nu-dasma.edu.ph` |
| `req.user.user_id` | **DB `tbl_user.user_id`** (resolved by middleware) | `a3f2c1d0-7b4e-4f2a-9c8d-0e1f2a3b4c5d` (UUID) |
| `req.user.f_name` / `req.user.l_name` | Display name from DB | `"Juan"`, `"dela Cruz"` |

> **Note:** `tbl_user.user_id` is now a UUID (`gen_random_uuid()::text` Postgres default). The old `sdao-staff-002` style IDs from seeded data are now also UUID.

**Middleware flow (`validateAzureJWT`):**
1. Verifies Azure JWT → extracts `preferred_username` (email)
2. Looks up `tbl_user` by email
3. If not found → checks `tbl_user_application` (staging) for an `Approved` application
4. If staging is Student → `403 STUDENT_WEB_ACCESS_DENIED`
5. If staging not Approved → `403 ACCOUNT_NOT_APPROVED`
6. If staging Approved (non-student) → auto-provisions into `tbl_user`, marks `transferred_at = now()`
7. If found in `tbl_user` and role is Student → checks `tbl_organization_members` for an active `Executive` membership; if none found → `403 STUDENT_WEB_ACCESS_DENIED`; if found → allowed through (student is an org executive)
8. Sets `req.user = { user_id: dbUser.user_id, email, f_name, l_name }`

**In TS controllers:** `req.user.user_id` is already the DB value — no manual lookup needed.  
**In old JS controllers:** May still need `prisma.tbl_user.findFirst({ where: { email }, select: { user_id: true } })`.  
**Socket.IO rooms:** Still keyed by email — use `broadcastToUser(req.user.email, ...)`.

**Auth error codes:**

| HTTP | Code | Meaning |
|------|------|---------|
| 403 | `ACCOUNT_NOT_APPROVED` | Azure user has no approved `tbl_user_application` and no `tbl_user` record |
| 403 | `STUDENT_WEB_ACCESS_DENIED` | Student role with no active Executive org membership — redirect to mobile app |

### File Storage Convention

All user-uploaded files live under `nuconnect-files/` (relative to project root, or `/app/nuconnect-files` in production).

| Sub-directory | Contents |
|---------------|----------|
| `applications/{appId}/logo/` | Application logos (submitted during org creation) |
| `applications/{appId}/requirements/` | Requirement document uploads |
| `organizations/{orgId}/{versionId}/logo/` | **Approved** org logos (copied from applications on final approval) |
| `requirements/` | Global requirement templates |
| `esignatures/` | User e-signature images |
| `approval-signatures/` | Signed approval-chain signature copies |
| `application-periods/` | Period-related files |
| `documents/{appId}/` | Generated DOCX + PDF application documents |

Controlled by `STORAGE_BASE_PATH` env var (default: `nuconnect-files/`).

### Adviser–Organization Relationship

- Adviser is linked to org via `tbl_organization.adviser_id` (FK → `tbl_user.user_id`)
- Advisers are **NOT** members in `tbl_organization_members` — they are a separate relationship
- `PermissionBundle.organizations` now includes adviser's orgs with `meta.member_type = 'Adviser'` and view-only permissions
- Adviser can be changed mid-year via `PATCH /api/web/organizations/:orgId/adviser`
- On adviser change: permission caches invalidated for old+new, notifications sent to both

---

## Architecture Notes

### Role → Scope Mapping (organizations page)

| Role | Scope |
|------|-------|
| Academic Director, SDAO, Faculty | Global (all orgs) |
| Dean | College (orgs under his college) |
| Program Chair | Program (orgs under his program) |
| Adviser | Only orgs they advise |
| Student | Only orgs they are members of |
| Student (President of org) | Sees ALL activity of that org |

### Key DB Tables

- `tbl_user` — users (linked to role, program)
- `tbl_organization` — org identity (name, slug, adviser_id, status, category)
- `tbl_organization_version` — versioned snapshot (description, logo_path, fees, etc.)
- `tbl_organization_members` — members (linked via renewal_cycle)
- `tbl_renewal_cycle` — active academic cycle per org
- `tbl_organization_course` — links orgs to programs/colleges
- `tbl_membership_application` — membership applications
- `tbl_application_period` — application windows (start_date, end_date, start_time, end_time, is_active) — renamed from `tbl_period` in V2
- `tbl_application_requirement` — global pool of reusable requirement templates (requirement_name, is_applicable_to, file_path, is_archived) — enhanced in V2
- `tbl_application_period_requirement` — junction table linking requirements to periods (many-to-many) — **NEW** V2
- `tbl_organization_requirement_submission` — submitted documents against requirements
- `tbl_application_approval_chain` — approval chain steps per application (approver_user_id, role_id, order, status, signatures, timestamps) — **NEW** V2
- `tbl_user_esignature` — user e-signature file references (user_id PK, signature_path) — **NEW** V2
- `tbl_college_dean` — maps colleges to dean users (college_id, dean_user_id, is_active) — **NEW** V2

- `tbl_notification` — notification content (sender, title, message, type, entity_type/id, redirect_url) — **Updated V3**
- `tbl_notification_recipient` — per-user delivery + read state (recipient_id FK→tbl_user, is_read, read_at) — **Updated V3**
- `tbl_logs` — activity log entries (user_id, action, action_type, entity_type/id, organization_id, meta_data) — **Updated V3**

### org_category Enum

```prisma
enum org_category {
  Co_Curricular_Organization    @map("Co-Curricular Organization")
  Extra_Curricular_Organization @map("Extra Curricular Organization")
}
```

---

## Folder / File Conventions

| Folder | Purpose |
|--------|---------|
| `from_frontend/` | Requests FROM the frontend dev — what they need built on the backend |
| `to_frontend/` | Guides/prompts written FOR the frontend dev — how to consume the backend |
| `docs/` | Internal backend documentation (schema plans, analysis, etc.) |
| `web/models/` | Prisma query functions (TypeScript, one file per feature domain) |
| `web/controllers/` | Request handlers (TypeScript, thin — delegate to model) |
| `web/routes/` | Express Router files (mounted at `/api/web` in server.ts) |
| `services/` | Cross-cutting services: WebSocket broadcasts, email, dashboard |
| `config/` | DB, storage adapter, Redis, external API clients |

---

## API Endpoints (Organizations Page)

Base: `GET /api/web`

| Endpoint | Description |
|----------|-------------|
| `GET /api/web/organizations` | Organizations list (scoped by role) |
| `GET /api/web/organizations/recent-activities?page=1&limit=10` | Paginated activity feed |
| `GET /api/web/organizations/upcoming-events` | Upcoming events (scoped) |
| `GET /api/web/organizations/:orgId/logo` | Org logo |
| `PATCH /api/web/organizations/:orgId/adviser` | **NEW** — Change adviser mid-year (body: `{ adviser_id }`) |
| `GET /api/web/organizations/application-periods/active` | Active period + assigned requirements + counts |
| `GET /api/web/organizations/application-periods` | All application periods |
| `POST /api/web/organizations/application-periods` | Create period (start_date, end_date, start_time, end_time, is_active) |
| `PATCH /api/web/organizations/application-periods/:id/terminate` | Terminate period → { period_id, is_active: false } |
| `PATCH /api/web/organizations/application-periods/:id` | Edit period (partial update incl. times) |
| `GET /api/web/organizations/requirements` | Global pool: list non-archived requirements |
| `POST /api/web/organizations/requirements` | Global pool: create requirement (multipart) |
| `PATCH /api/web/organizations/requirements/:rid` | Global pool: edit requirement (multipart) |
| `DELETE /api/web/organizations/requirements/:rid` | Global pool: archive or hard-delete |
| `GET /api/web/organizations/requirements/:rid/template` | Global pool: download template file |
| `GET /api/web/organizations/application-periods/:id/requirements` | List requirements assigned to period |
| `POST /api/web/organizations/application-periods/:id/requirements` | Assign existing (requirement_id) or create+assign (multipart) |
| `DELETE /api/web/organizations/application-periods/:id/requirements/:rid` | Unassign requirement from period |
| `GET /api/web/organizations/applications` | **NEW** — Applications list for current period (query: period_id, status) |

## API Endpoints (Approval System)

Base: `/api/web/approvals`

| Endpoint | Description |
|----------|-------------|
| `GET /approvals/chain/:applicationId` | Full approval chain for an application |
| `POST /approvals/chain/:chainId/receive` | Mark step as received/endorsed with e-sig |
| `POST /approvals/chain/:chainId/sign` | Sign approval step with e-sig |
| `POST /approvals/chain/:chainId/approve` | Final approval (creates org on completion) |
| `POST /approvals/chain/:chainId/reject` | Reject application (reason required) |
| `GET /approvals/check-esignature` | Check if current user has e-sig uploaded |
| `GET /approvals/my-pending` | Pending approvals for current user |
| `GET /approvals/faculty/by-program/:programId` | Faculty list for extra-curricular selection |
| `POST /approvals/faculty-selection` | Submit 2 faculty selections → creates chain |
| `GET /approvals/validate/:applicationId` | Validate if chain is complete |

## API Endpoints (Notifications)

Base: `/api/web/notifications`

| Endpoint | Description |
|----------|-------------|
| `GET /api/web/notifications` | Paginated notifications (query: page, limit, is_read, type) |
| `GET /api/web/notifications/unread-count` | Unread count for badge |
| `PUT /api/web/notifications/read-all` | Mark all as read |
| `PUT /api/web/notifications/:id/read` | Mark single as read (by notification_recipient_id) |
| `POST /api/web/notifications` | Create notifications (admin/server-side) |

## API Endpoints (Activity Logs)

Base: `/api/web/logs`

| Endpoint | Description |
|----------|-------------|
| `GET /api/web/logs` | Paginated logs, role-scoped (query: page, limit, action_type, user_id, organization_id, start_date, end_date, search) |
| `GET /api/web/logs/recent` | Recent logs for dashboard (query: limit) |
| `GET /api/web/logs/stats` | Activity stats for dashboard cards (role-dependent response shape) |

## API Endpoints (E-Signature)

Base: `/api/web/esignature`

| Endpoint | Description |
|----------|-------------|
| `POST /esignature/upload` | Upload/update e-sig (multipart, field: `signature`) |
| `GET /esignature/me` | Get current user's e-sig info |
| `DELETE /esignature/me` | Delete current user's e-sig |
| `GET /esignature/user/:userId` | Get specific user's e-sig (for approvers) |
| `GET /esignature/file/:filename` | Serve e-sig image file (direct, res.sendFile) |

### OrganizationItem Response Shape

```ts
interface OrganizationItem {
  id: number;
  name: string;
  slug: string | null;
  acronym: string | null;
  college: string | null;
  program: string | null;
  status: 'active' | 'pending' | 'inactive';
  memberCount: number;
  adviserName: string;        // "LastName, FirstName"
  logoUrl: string;            // "/organizations/{id}/logo"
  category: string;           // "Co-Curricular Organization" | "Extra Curricular Organization"
  versionCreatedAt: string | null; // ISO 8601 — when the current version was created
}
```

---

## Schema Refactor Plan (DRAFT — not yet executed)

> See `docs/SCHEMA_REFACTOR_PLAN.md` for full details.

**Goal:** Remove 8 duplicated fields from `tbl_organization` that also exist on `tbl_organization_version`. After refactor, all versioned data lives only on `tbl_organization_version` and is accessed via `tbl_organization.current_org_version_id`.

**Fields to be REMOVED from `tbl_organization`:**
- `description`, `base_program_id`, `logo`, `membership_fee_type`, `membership_fee_amount`, `category`, `is_recruiting`, `is_open_to_all_courses`

**New column being ADDED:**
- `slug` — kebab-case URL slug (e.g. `junior-philippine-computer-society`)

**Status:** DRAFT — partially executed. `category` is already ONLY on `tbl_organization_version` (not on `tbl_organization`). Remaining fields (`logo`, `membership_fee_type`, etc.) still to be migrated.

---

## Files Being Actively Worked On

| File | Status | Notes |
|------|--------|-------|
| `web/models/organizationsPageModel.ts` | Active | Main model for organizations page endpoints |
| `web/controllers/organizationsPageController.ts` | Active | Controller wiring the model to routes |
| `web/models/approvalModel.ts` | **New (TS)** | Prisma queries for approval system (14 exported functions) |
| `web/controllers/approvalController.ts` | **New (TS)** | Approval handlers with Socket.IO broadcasting (11 handlers) |
| `web/routes/approval.ts` | **New (TS)** | 10 approval routes under `/api/web/approvals` |
| `web/controllers/esignatureController.ts` | **New (TS)** | E-signature CRUD via Prisma (4 handlers) |
| `web/routes/esignature.ts` | **New (TS)** | 5 e-signature routes under `/api/web/esignature` |
| `lib/documentGenerator.ts` | **New (TS)** | DOCX+PDF generator using docxtemplater + pdfmake |
| `web/controllers/documentController.ts` | **New (TS)** | Document status + download handlers (2 handlers) |
| `web/models/notificationModel.ts` | **New (TS)** | Prisma queries for notifications (5 exported functions) |
| `web/controllers/notificationController.ts` | **New (TS)** | Notification handlers (5 handlers) |
| `web/routes/notification.ts` | **New (TS)** | 5 routes under `/api/web/notifications` |
| `web/models/logModel.ts` | **New (TS)** | Prisma queries for activity logs (4 exported functions + role-scoped visibility) |
| `web/controllers/logController.ts` | **New (TS)** | Log handlers (3 handlers) |
| `web/routes/log.ts` | **New (TS)** | 3 routes under `/api/web/logs` |
| `services/notificationAndLogService.ts` | **New (TS)** | Server-side trigger functions: notify(), logActivity(), notifyAndLog() |
| `prisma/schema.prisma` | Updated | Updated 3 models + expanded enum for notifications/logs |
| `middlewares/middleWare.ts` | **Updated (Phase 6)** | DB lookup + auto-provisioning from staging + Student web block |
| `web/models/approvalModel.ts` | Updated | Added `resolveUserByEmail` helper; exec resolution by email |
| `web/models/createOrgModel.ts` | Updated | Removed `proposed_user_id` from exec insert |
| `web/models/publicModel.ts` | **New (TS) (Phase 7)** | 5 functions: getPrograms, getRoles, getAccounts, getPendingApplications, addUserApplication |
| `web/controllers/publicController.ts` | **New (TS) (Phase 7)** | 5 handlers for public registration endpoints |
| `web/routes/public.ts` | **New (TS) (Phase 7)** | 5 routes under `/api/web/public` (no auth — uses publicAuthMiddleware) |
| `to_frontend/User Account Flow — Frontend Guide.md` | **New** | Frontend guide for ACCOUNT_NOT_APPROVED + STUDENT_WEB_ACCESS_DENIED |

---

## Completed Work (session — 2026-03-01, Part 2: Notifications & Activity Logs)

### Schema Updates

**Tables modified in `prisma/schema.prisma`:**

- **`tbl_logs`** — Removed `file_path`, `timestamp`, `type`. Added: `action` (TEXT, NOT NULL), `entity_type` (VARCHAR 50), `entity_id` (INT), `organization_id` (INT, FK→tbl_organization ON DELETE SET NULL), `user_email` (VARCHAR 255), `full_name` (VARCHAR 255). Added 5 indexes. Added tbl_organization relation.
- **`tbl_notification`** — Added `type` (VARCHAR 50, default "general"), `sender_name` (VARCHAR 255). Renamed `url`→`redirect_url`. Removed old `action` column. Added FK `sender_id→tbl_user`. Added index on created_at DESC.
- **`tbl_notification_recipient`** — Changed `recipient_email`→`recipient_id` (VARCHAR 200, FK→tbl_user). Added `read_at` (TIMESTAMP). `is_read` now NOT NULL default false. Added indexes on [recipient_id, is_read] and [recipient_id].
- **`notification_entity_type` enum** — Added 3 new values: `application`, `period`, `requirement` (total now 10)

### New Files Created

| File | Purpose |
|------|---------|
| `web/models/notificationModel.ts` | 5 Prisma functions: createNotification, buildNotificationPayload, getUserNotifications, getUnreadCount, markAsRead, markAllAsRead |
| `web/models/logModel.ts` | 4 functions + role-scoped visibility: createLog, getLogs, getRecentLogs, getLogStats |
| `web/controllers/notificationController.ts` | 5 handlers: getNotifications, getUnreadCount, markRead, markAllRead, createNotifications |
| `web/controllers/logController.ts` | 3 handlers: getLogs, getRecentLogs, getLogStats |
| `web/routes/notification.ts` | 5 routes under `/api/web/notifications` |
| `web/routes/log.ts` | 3 routes under `/api/web/logs` |
| `services/notificationAndLogService.ts` | Server-side trigger service: notify(), logActivity(), notifyAndLog(), getAdminUserIds(), getUserIdsWithPermission() |
| `to_frontend/Notifications & Activity Logs — Frontend Guide.md` | Full frontend integration guide |

### Notification Endpoints

| # | Method | Path | Handler |
|---|--------|------|---------|
| 1 | GET | `/api/web/notifications` | getNotifications (paginated, filtered) |
| 2 | GET | `/api/web/notifications/unread-count` | getUnreadCount (badge) |
| 3 | PUT | `/api/web/notifications/read-all` | markAllRead |
| 4 | PUT | `/api/web/notifications/:id/read` | markRead |
| 5 | POST | `/api/web/notifications` | createNotifications (admin/system) |

### Log Endpoints

| # | Method | Path | Handler |
|---|--------|------|---------|
| 1 | GET | `/api/web/logs` | getLogs (paginated, role-scoped) |
| 2 | GET | `/api/web/logs/recent` | getRecentLogs (dashboard widget) |
| 3 | GET | `/api/web/logs/stats` | getLogStats (dashboard cards) |

### Socket.IO Events

| Event | Target | When |
|-------|--------|------|
| `notification:new` | `user:{id}` | New notification created |
| `notification:read` | `user:{id}` | Single notification marked read |
| `notification:read-all` | `user:{id}` | All notifications marked read |
| `notification:unread-count` | `user:{id}` | Unread count updated |
| `log:new` | `page:logs` + `user:{id}` | New activity log entry |
| `log:stats-updated` | `page:dashboard` | Stats changed (refetch hint) |

### Server-Side Trigger Service

`services/notificationAndLogService.ts` exports:
- `notify(params)` — Create notifications for recipients + Socket.IO push
- `logActivity(params)` — Create log entry + Socket.IO push
- `notifyAndLog(notifyParams, logParams)` — Both at once
- `getAdminUserIds()` — Get all SDAO/Admin user IDs (for broadcast)
- `getUserIdsWithPermission(name)` — Get all users with a specific permission

**Usage from controllers:**
```ts
import { notify, logActivity } from '../../services/notificationAndLogService';
```

### Old Files Renamed to `.backup`

- `web/controllers/notificationController.js` → `.js.backup`
- `web/controllers/logController.js` → `.js.backup`
- `web/models/notificationModel.js` → `.js.backup`
- `web/models/logModel.js` → `.js.backup`
- `web/routes/notifications.js` → `.js.backup`
- `web/routes/logs.js` → `.js.backup`

---

## Completed Work (session — 2026-03-01, Part 1: Approval System)

### Approval System & E-Signatures — Full Refactoring

**Scope:** Refactored the entire approval system from MySQL stored procedures + SSE to Prisma + Socket.IO. All TypeScript.

**Prisma Schema Changes (`prisma/schema.prisma`):**
- Added `enum approval_chain_status { Pending, Endorsed, Received, Signed, Approved, Rejected }`
- Added `model tbl_application_approval_chain` — chain_id (PK), application_id, period_id, approver_user_id, approver_role_id, approval_order, is_final_approval, uses_endorsed, status, signature_path, remarks, timestamps. Indexes on [application_id, approval_order] and [approver_user_id, status]
- Added `model tbl_user_esignature` — user_id (PK, FK→tbl_user), signature_path, timestamps
- Added `model tbl_college_dean` — id (PK), college_id, dean_user_id, is_active, timestamps. Index on [college_id, is_active]
- Added reverse relations on: tbl_application, tbl_application_period, tbl_role, tbl_college, tbl_user
- DB synced via `prisma db push` + `prisma generate`

**New Files Created:**

| File | Purpose |
|------|---------|
| `web/models/approvalModel.ts` (~1200 lines) | 14 Prisma functions replacing 10 MySQL stored procedures |
| `web/controllers/approvalController.ts` (~590 lines) | 11 Express handlers with Socket.IO broadcasting |
| `web/routes/approval.ts` | 10 routes under `/api/web/approvals` |
| `web/controllers/esignatureController.ts` | 4 handlers: upload, getMyEsig, deleteMy, getUserEsig |
| `web/routes/esignature.ts` | 5 routes under `/api/web/esignature` (incl. multer config + file serving) |
| `to_frontend/Approval System & E-Signatures — Frontend Guide.md` | Full frontend guide |

**Files Modified:**
- `web/routes/organizationsPage.ts` — Added `GET /organizations/applications` route (applications list)
- `server.ts` — Added imports and mounts for `approvalRoutesWeb` and `esignatureRoutesWeb`

**Approval Endpoints (all require Azure JWT):**

| # | Method | Path | Handler |
|---|--------|------|---------|
| 1 | GET | `/api/web/approvals/chain/:applicationId` | getApprovalChain |
| 2 | POST | `/api/web/approvals/chain/:chainId/receive` | markApprovalReceived |
| 3 | POST | `/api/web/approvals/chain/:chainId/sign` | signApprovalStep |
| 4 | POST | `/api/web/approvals/chain/:chainId/approve` | approveApprovalStep |
| 5 | POST | `/api/web/approvals/chain/:chainId/reject` | rejectApprovalStep |
| 6 | GET | `/api/web/approvals/check-esignature` | checkUserESignature |
| 7 | GET | `/api/web/approvals/my-pending` | getMyPendingApprovals |
| 8 | GET | `/api/web/approvals/faculty/by-program/:programId` | getFacultyByProgram |
| 9 | POST | `/api/web/approvals/faculty-selection` | submitFacultySelection |
| 10 | GET | `/api/web/approvals/validate/:applicationId` | validateApprovalChain |

**E-Signature Endpoints:**

| # | Method | Path | Handler |
|---|--------|------|---------|
| 1 | POST | `/api/web/esignature/upload` | uploadESignature (multer) |
| 2 | GET | `/api/web/esignature/me` | getMyESignature |
| 3 | DELETE | `/api/web/esignature/me` | deleteMyESignature |
| 4 | GET | `/api/web/esignature/user/:userId` | getUserESignature |
| 5 | GET | `/api/web/esignature/file/:filename` | Direct file serving (res.sendFile) |

**Applications List Endpoint (NEW):**
- `GET /api/web/organizations/applications?period_id=N&status=Pending|Approved|Rejected`
- Handler: `getApplicationsList` (in approvalController.ts)
- Route: in `web/routes/organizationsPage.ts`

**Key Business Logic Implemented:**
- `promoteApplication()` — Creates organization (new) or updates (renewal) when all final approvers approve. Provisions renewal cycle, executive roles, members, org courses.
- `createApprovalChain()` — Builds chain for co-curricular (ProgramChair→Dean→SDAO→AD) or extra-curricular (Dean→SDAO→AD, faculty added separately)
- `submitFacultySelection()` — Builds 6-step chain for extra-curricular with 2 faculty advisers
- `current_status` bug fixed: `tbl_application.status` properly updated to `Approved`/`Rejected` on final action

**Socket.IO Events:**
- `approval:updated` → `approvals` page room + applicant user
- `applications:updated` → `organizations` page room (after final approval/rejection)

**Old Files Replaced (still exist but no longer used):**
- `web/controllers/approvalController.js` (1156 lines, MySQL + SSE)
- `web/routes/approval.js` (125 lines, CommonJS)
- `web/controllers/esignatureController.js` (361 lines, MySQL)
- `web/routes/esignature.js` (143 lines, CommonJS)

---

## Completed Work (session — 2026-02-26)

### 1. Added `category` to `getOrganizationsList`

**File:** `web/models/organizationsPageModel.ts`

**Problem:** `const category = org.` was an incomplete/broken expression (syntax error). `category` was defined in `OrganizationItem` interface but never populated or returned.

**Fix:**
- Added `mapOrgCategory()` helper function that maps Prisma enum keys → human-readable strings:
  - `'Co_Curricular_Organization'` → `'Co-Curricular Organization'`
  - `'Extra_Curricular_Organization'` → `'Extra Curricular Organization'`
- Fixed the broken line to: `const category = mapOrgCategory(org.category?.toString());`
- Added `category` to the returned object in the `orgs.map()` call

**Source field:** `tbl_organization_version.category` (type `org_category?`, default `Co_Curricular_Organization`)  
Fetched by including the `tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version` relation (i.e. the current version via `current_org_version_id` FK).

> **Note:** `category` does NOT exist on `tbl_organization` — the schema already has it only on `tbl_organization_version`. The refactor plan was partially executed.

### 2. Added `versionCreatedAt` to `getOrganizationsList`

**File:** `web/models/organizationsPageModel.ts`

**What:** Added `tbl_organization_version.created_at` (timestamp of the current version) to the Prisma select alongside `category`. Returned as `versionCreatedAt: string | null` (ISO 8601) in `OrganizationItem`.

### 3. Moved `context.md` to project root

User requested the history file live at the root of the project (`/context.md`) instead of inside a `history/` subfolder.

---

## Pending / Next Steps

- [x] Update `docs/ORGANIZATIONS_PAGE_FRONTEND_GUIDE.md` and `ORGANIZATIONS_PAGE_FRONTEND_UPDATE.md` to include `category` in the `OrganizationItem` interface docs — done
- [x] Approval system: refactor 10 endpoints from MySQL SPs → Prisma + SSE → Socket.IO — **done (2026-03-01)**
- [x] E-signature routes: refactor from MySQL → Prisma, JS → TS — **done (2026-03-01)**
- [x] Applications list endpoint (NEW): `GET /organizations/applications` — **done (2026-03-01)**
- [x] `current_status` sync bug fix — **done (2026-03-01)**
- [x] Notifications schema + endpoints: `tbl_notification`, `tbl_notification_recipient` — **done (2026-03-01)**
- [x] Activity logs schema + endpoints: `tbl_logs` — **done (2026-03-01)**
- [x] Server-side trigger service: `services/notificationAndLogService.ts` — **done (2026-03-01)**
- [x] Wire `notify()` and `logActivity()` into existing controllers (approvalController, createOrgController) — **done (2026-03-03)**
- [x] Personalized notifications: full names, org names, role-specific messages, adviser notifications — **done (2026-03-03)**
- [x] E-signature + approval-signature paths consolidated to `nuconnect-files/` — **done (2026-03-03)**
- [x] Adviser–org access: PermissionBundle includes adviser's orgs with view-only permissions — **done (2026-03-03)**
- [x] PATCH adviser endpoint with cache invalidation + notifications — **done (2026-03-03)**
- [x] Logo copy on final approval: application logo → org logo directory — **done (2026-03-03)**
- [x] Log controller identity fix: use email not Azure UUID — **done (2026-03-03)**
- [x] Log model fix: correct ADMIN_ROLES names, resolve app user_id for WHERE clauses — **done (2026-03-03)**
- [ ] Frontend: display `category` and `versionCreatedAt` on org card
- [ ] Schema refactor execution (see `docs/SCHEMA_REFACTOR_PLAN.md`) — `category` is **already** only on `tbl_organization_version`; remaining fields (`logo`, `membership_fee_type`, etc.) still need migration
- [ ] Logo endpoint: confirm file serving is wired for `/api/web/organizations/:orgId/logo`
- [x] Document generation: DOCX (docxtemplater) + PDF generation — **done (2026-03-07)**
- [x] Document status + download endpoints (`/document-status`, `/download-document`) — **done (2026-03-07)**
- [x] Document generation triggered automatically after final approval (`setImmediate` in approvalController) — **done (2026-03-07)**
- [x] E-signature `signature_url` leading-slash bug fixed — **done (2026-03-07)**
- [x] UUID `user_id` default added to `tbl_user` — **done (2026-03-07, Phase 6)**
- [x] `proposed_user_id` dropped from `tbl_application_executives`; exec resolution by email — **done (2026-03-07, Phase 6)**
- [x] Auth middleware DB lookup + staging auto-provisioning + Student web block — **done (2026-03-07, Phase 6)**
- [x] `college` field added to `tbl_user_application` for Dean registrations — **done (2026-03-07, Phase 6+7)**
- [x] CORS fix: `x-api-key`, `Ocp-Apim-Subscription-Key` headers + preflight handler — **done (2026-03-07, Phase 7)**
- [x] Public registration routes: 5 endpoints under `/api/web/public` — **done (2026-03-07, Phase 7)**
- [x] `web/routes/public.js` shadowing bug fixed (renamed to `.backup`) — **done (2026-03-07, Phase 7)**
- [ ] Clean up old JS `.backup` files when refactoring is complete
- [ ] Continue `.js` → `.ts` refactoring

---

## Completed Work (session — 2026-03-03: Adviser Fix, Identity Fixes, Notifications & Logo)

### 1. Notification Controller Identity Fix

**Files:** `web/controllers/notificationController.ts`, `services/notificationAndLogService.ts`

**Problem:** `GET /api/web/notifications` returned empty `data: []` despite DB records. Root cause: controller used `req.user.user_id` (Azure UUID) to query `tbl_notification_recipient.recipient_id`, but that column stores `tbl_user.user_id` (app IDs like `sdao-staff-002`).

**Fix:**
- Added `resolveAppUserId(email)` helper → `prisma.tbl_user.findFirst({ where: { email } })`
- All 5 endpoints now resolve email → app user_id before DB queries
- `notify()` in service now resolves user_ids → emails before Socket.IO broadcast
- `logActivity()` uses `params.userEmail` for socket room targeting

### 2. Personalized Approval Notifications

**Files:** `web/models/approvalModel.ts`, `web/controllers/createOrgController.ts`, `web/controllers/approvalController.ts`

**Changes:**
- `ApprovalChainResult` expanded: `approvers[]` (user_id, email, full_name, approval_order, is_final_approval), `first_approver`, `adviser_user_id/email/name`
- `getChainContext()` expanded: `applicant_name`, `applicant_user_id`, `current_approver_name/email/user_id`, `next_approver`
- `submitApp`: 3 separate notifications — first approver ("You are the first to review"), remaining ("You will be notified when it's your turn"), adviser (renewals: "Approval process is now underway")
- All 4 actions (receive/sign/approve/reject): personalized with full names + org names, next-approver notification ("It's now your turn")

### 3. E-Signature & Approval-Signature Path Consolidation

**Files:** `web/routes/esignature.ts`, `web/controllers/esignatureController.ts`, `web/controllers/approvalController.ts`

**Change:** All paths moved from `uploads/esignatures/` and `approval-signatures/` (project root) to `nuconnect-files/esignatures/` and `nuconnect-files/approval-signatures/`. 6 replacements across 3 files.

### 4. Adviser–Organization Relationship Fix

**Files:** `web/models/permissionModel.ts`, `web/models/organizationsPageModel.ts`, `web/controllers/organizationsPageController.ts`, `web/routes/organizationsPage.ts`

**Problem:** Advisers are NOT in `tbl_organization_members`. The `PermissionBundle.organizations` was empty for them, meaning `can(adviserId, 'VIEW_ORGANIZATION', orgId)` returned `false`.

**Fix:**
- `getAllUserPermissions()` now queries `tbl_organization.findMany({ where: { adviser_id } })` and seeds `bundle.organizations` with view-only permissions: `VIEW_ORGANIZATION`, `VIEW_COMMITTEE`, `VIEW_EVALUATION`, `VIEW_EVENT`, `VIEW_APPLICATION`, `VIEW_LOGS`, `VIEW_TRANSACTIONS`
- `OrgMeta.member_id` changed to `number | null` (advisers have no member_id)
- Adviser orgs get `meta.member_type = 'Adviser'`, `meta.role_title = 'Adviser'`

**New Endpoint:** `PATCH /api/web/organizations/:orgId/adviser`
- Body: `{ adviser_id: "user-id-string" }`
- Validates org exists, new user has Adviser role, not same adviser
- Invalidates permission caches for both old and new adviser
- Notifies new adviser ("You have been assigned") and old adviser ("You have been unassigned")
- Logs activity + broadcasts `organization:adviser-changed` to organizations page

### 5. Logo Copy on Final Approval

**File:** `web/models/approvalModel.ts`

**Change:** `promoteApplication()` now copies the logo from `nuconnect-files/applications/{appId}/logo/{filename}` → `nuconnect-files/organizations/{orgId}/{versionId}/logo/{filename}` after org creation/update. Non-fatal (logged if fails).

### 6. Log Controller & Model Identity Fix

**Files:** `web/controllers/logController.ts`, `web/models/logModel.ts`

**Problems:**
1. Controller used `req.user.user_id` (Azure UUID) — changed to `req.user.email`
2. `ADMIN_ROLES` had `'SDAO Rank 1'`, `'SDAO Rank 2'` — actual DB role name is `'SDAO'`. Fixed to `['SDAO', 'Academic Director', 'Admin']`
3. `buildVisibilityFilter()` used email in `{ user_id: email }` WHERE clauses but `tbl_logs.user_id` stores app IDs. Fixed: now uses `bundle.userId` (resolved by `getPermissionBundle`)
4. `getLogStats()` non-admin path: same user_id fix via `resolveAppUserId()`

---

## Approval Chain Auto-Approval Bug Fix (Session N+1)

### Root Cause
Two bugs caused applications to auto-approve without going through the approval chain:

1. **`submitApp` never called `createApprovalChain`**: The new TS controller (`createOrgController.ts`) created the application with `status: 'Pending'` but never initiated the approval chain. The old JS controller (`organizationsController.js` line 461) did call it, but that route is commented out.

2. **Silent skipping of missing approvers**: `createApprovalChain` wrapped every approver addition in `if (approver && role)` guards. With no Program Chair, no Dean, no Academic Director in the DB, and if SDAO was also missing, the chain would be **empty**. `approveApprovalStep` then checked `remainingFinal === 0` which was true for 0 total final steps → instant `promoteApplication()`.

### DB State at Time of Bug
- **SDAO approvers**: 3 exist (ranks 1, 2, 3) — all Active
- **Program Chair users**: 0 (no users with role_id 3)
- **Academic Director users**: 0 (no users with role_id 6)
- **College Deans**: 0 rows in `tbl_college_dean`

### Fix Applied
1. **`createOrgController.ts`**: Added `createApprovalChain(result.application_id)` call after file writes. Returns 422 `APPROVAL_CHAIN_INCOMPLETE` if SDAO Rank 2 is missing.
2. **`approvalModel.ts` → `createApprovalChain()`**:
   - Now returns `ApprovalChainResult` with `chain_length`, `skipped_roles`, `warnings`
   - **Requires** SDAO Rank 2 (final approver) — throws `APPROVAL_CHAIN_INCOMPLETE` if missing
   - Skips optional approvers (Program Chair, Dean, SDAO Rank 1, Academic Director) with warnings
   - SDAO Rank 2 endorsement + final steps are always inserted (no longer conditional)
3. **`approvalModel.ts` → `approveApprovalStep()`**: Added `totalFinal === 0` safety check — returns error instead of auto-promoting when no final steps exist.

### Current Chain Structure (with seed data)
For any category:
- `[Program Chair]` → skipped (no users with that role)
- `[Dean]` → skipped (no college deans)
- **SDAO Rank 2** (endorsement) → order 1
- **SDAO Rank 1** → order 2
- **SDAO Rank 2** (FINAL) → order 3
- `[Academic Director]` → skipped (no users with that role)

Result: 3-step chain, 1 final approver

---

## Completed Work (session — 2026-03-07: Document Generation, DOCX Migration, E-Signature Fix)

### 1. docxtemplater Migration (replaces easy-template-x)

**File:** `lib/documentGenerator.ts`

**Change:** Replaced `easy-template-x` with `docxtemplater` + `pizzip` + `docxtemplater-image-module-free` for DOCX template filling.
- `{tagName}` → text replacement (single-brace)
- `{%tagName}` → image replacement (single-brace with `%`)
- All template tag keys use **underscores only** (hyphens are invalid in docxtemplater tags)
- `easy-template-x` is still in `package.json` but no longer imported or used

**Key implementation details:**
- `sigImage(sigPath): string | null` — returns absolute file path (NOT Buffer). Returning a Buffer was causing `TypeError: Cannot read properties of undefined (reading '0')` because the image module mistook it for a pre-resolved `{rId, sizePixel}` object.
- `getImage(tagValue: string): Buffer` — called by image module: reads file via `fs.readFileSync(tagValue)`.
- `APPROVAL_SIG_DIR` from `process.env.ESIGNATURES_DIR ?? path.join(__dirname, '../nuconnect-files/esignatures')`
- Template path: `templates/NU-OSA-FORM-001.docx`
- Output dir: `nuconnect-files/documents/{applicationId}/`

### 2. Template Tag Key Naming Convention — Underscores

**File:** `web/services/documentGenerationService.js`

**Change:** All hyphenated keys renamed to underscores (docxtemplater rejects hyphens in tags):

| Old key | New key |
|---------|---------|
| `1-endorser-e-signature` | `endorser_e_sig_1` |
| `2-endorser-e-signature` | `endorser_e_sig_2` |
| `1-endorser-e-sig-date` | `endorser_date1` |
| `2-endorser-e-sig-date` | `endorser_date2` |
| `1-endorser-e-time` | `endorser_e_time_1` |
| `2-endorser-e-time` | `endorser_e_time_2` |
| `1-rec-e-sig` | `rec_e_sig_1` |
| `2-rec-e-sig` | `rec_e_sig_2` |
| `1-rec-e-sig-date` | `rec_date_1` |
| `2-rec-e-sig-date` | `rec_date_2` |
| `1-rec-e-time` | `rec_time_1` |
| `2-rec-e-time` | `rec_time_2` |
| `1-final-e-sig` | `final_e_sig_1` |
| `2-final-e-sig` | `final_e_sig_2` |
| `1-final-e-sig-date` | `final_date_1` |
| `2-final-e-sig-date` | `final_date_2` |
| `academic-year` | `academic_year` |

Also added `_name` text keys alongside each image key: `endorser_name_1/2`, `rec_name_1/2`, `final_name_1/2`.

### 3. Document Generation Trigger + Data Fixes

**Files:** `lib/documentGenerator.ts`, `web/controllers/approvalController.ts`

**Trigger:** Generation kicks off automatically after final approval in `approvalController.ts`:
```typescript
setImmediate(() => {
  generateApplicationDocuments(applicationId)
    .catch(err => console.error('[doc-gen] generation failed', applicationId, err));
});
```
No test-trigger route (the `POST .../generate-document` route was removed).

**Extra fields resolved in `resolveExtraFields()`:**
- `submitter_contact_no` — from `tbl_user` mobile field
- `date_created` — from `tbl_application.created_at`
- `college_name` — from `tbl_college.college_name` via org → college relation
- `adviser_name`, `adviser_email` — **two-step lookup**: `tbl_role.findFirst({ where: { role_name: 'Adviser' } })` → get `role_id` → `tbl_application_approval_chain.findFirst({ where: { application_id, approver_role_id } })`. Fallback: `tbl_organization.adviser_id` if chain has no adviser.
- `is_approved` → `approved` tag: `'CHECKED'` | `'UNCHECKED'`
- `academic_year` — derived from `application.created_at` using Aug cutoff (e.g. if created Aug–Dec 2025 → "2025–2026")

**Logo logic:**
- If `organization.logo_url` exists, `new_box_5` / `ren_box_5` is forced to `CHECKED`
- `new_box_6` / `ren_box_6` keyword: `'faculty adviser'`

**Data object tags (all underscored):**
- Text: `newa`, `rena`, `approved`, `academic_year`, `adviser_name`, `adviser_email`, `organization_name`, `college_name`, `co`, `extra`, `date_organized`, `description`, `sdao_remarks`, `academic_director_remarks`
- Endorsers: `endorser_name_1/2`, `endorser_date1/2`, `endorser_e_time_1/2`
- Receivers: `rec_name_1/2`, `rec_date_1/2`, `rec_time_1/2`
- Final approvers: `final_name_1/2`, `final_date_1/2`
- Checkboxes: `new_box_1`–`new_box_13`, `ren_box_1`–`ren_box_15`
- Images: `{%endorser_e_sig_1/2}`, `{%rec_e_sig_1/2}`, `{%final_e_sig_1/2}`

### 4. Document REST Endpoints

**File:** `web/controllers/documentController.ts`, `web/routes/organizationsPage.ts`

| # | Method | Path | Handler | Notes |
|---|--------|------|---------|-------|
| 1 | GET | `/api/web/organizations/applications/:applicationId/document-status` | `getDocumentStatus` | Returns `{ status, documents: { pdf: {available}, docx: {available} } }`. Guards: returns `status='pending'` if app not `Approved`. |
| 2 | GET | `/api/web/organizations/applications/:applicationId/download-document?format=pdf\|docx` | `downloadDocument` | Streams file with `Content-Disposition: attachment`. |

**Removed:** `POST .../generate-document` (test trigger route) — fully deleted from routes + controller.

### 5. Socket.IO Events for Document Generation

| Event | Target room | Payload | When |
|-------|-------------|---------|------|
| `document:generated` | `user:{applicantEmail}` | `{ applicationId, pdf: {available, url}, docx: {available, url} }` | Generation succeeded |
| `document:generation-failed` | `user:{applicantEmail}` | `{ applicationId, error }` | Generation failed |

### 6. Frontend Guide Created

**File:** `to_frontend/Document Generation — Frontend Guide.md`

Documents the Socket.IO events, REST endpoints, React skeleton with `useEffect`, polling fallback (60s timeout), and a summary table.

### 7. E-Signature `signature_url` Fix

**File:** `web/controllers/esignatureController.ts`

**Problem:** All three response-building handlers returned `signature_url` with a leading `/` (e.g. `/api/web/esignature/file/...`). The frontend constructs the full URL as:
```js
`${import.meta.env.VITE_REACT_API_URL}/${signature_url}`
```
A leading slash would result in double-slash or wrong URL. Fixed to return without leading slash: `api/web/esignature/file/${filename}`.

Also fixed:
- `uploadESignature` response now includes `user_id` in `data`
- `getUserESignature` `signature_path` now returns full storage path `nuconnect-files/esignatures/${filename}` (consistent with `getMyESignature`)

---

## Completed Work (session — 2026-03-07, Part 2: OrgDetails WebSocket Refactor)

### Prompt processed: `from_frontend/backend-prompt-orgdetails-websocket-refactor.md`
### Frontend guide created: `to_frontend/OrgDetails WebSocket & REST — Frontend Guide.md`

---

### 1. New Socket.IO Room — `org-detail:{orgId}`

**File:** `services/websocketService.ts`

- `PageSubscribePayload` / `PageUnsubscribePayload` now accept `org_id` (snake_case) in addition to `orgId` (camelCase) — frontend uses snake_case
- New room helper: `rooms.orgDetail(orgId)` → `` `org-detail:${orgId}` ``
- Added `'org-detail'` to `PAGE_PERMISSIONS` with `{ permission: null, scope: 'organization' }`
- `handlePageSubscribe`: when `page === 'org-detail'`, joins `rooms.orgDetail(resolvedOrgId)` instead of `rooms.orgPage`
- `page:unsubscribe`: same resolution logic
- New export: `broadcastToOrgDetail(orgId, event, data)` — emits directly to `org-detail:{orgId}` room

---

### 2. New REST Endpoints — Org Detail Data

**Files:** `web/models/organizationsPageModel.ts`, `web/controllers/organizationsPageController.ts`, `web/routes/organizationsPage.ts`

| # | Method | Path | Handler | Description |
|---|--------|------|---------|-------------|
| 1 | GET | `/api/web/organizations/:orgId/dashboard` | `getOrgDashboardHandler` | Dashboard stat cards |
| 2 | GET | `/api/web/organizations/:orgId/applications` | `getOrgApplicationsHandler` | All org applications list |
| 3 | GET | `/api/web/organizations/:orgId/event-submissions` | `getOrgEventSubmissionsHandler` | Event requirement submissions |
| 4 | GET | `/api/web/organizations/:orgId/renewal-status` | `getOrgRenewalStatusHandler` | Renewal button visibility + latest app status |

**Dashboard model** (`getOrgDashboard`):
- Finds latest `tbl_renewal_cycle` for the org (no `current_cycle_number` on `tbl_organization`)
- Parallel counts: active members, approved events, upcoming events (start_date ≥ today), event applications, org applications
- Post-event submissions: counted as distinct events with ≥1 post-event file upload (joined to `tbl_event_application_requirement.is_applicable_to`)

**Renewal status model** (`getOrgRenewalStatus`):
- `show_renewal: true` → org is `Approved`, no pending renewal for active period, not already renewed in current period, and there IS an active period
- `recently_approved: true` → approved within last 7 days (for success banner)

All routes registered before the wildcard `/:orgId/logo` route to avoid shadowing.

---

### 3. Socket Broadcasts Wired Up

**`web/controllers/organizationsPageController.ts`** — `changeAdviser`:
- After `broadcastToPage('organizations', ...)`, now also emits `org:updated` to `org-detail:{orgId}` room

**`web/controllers/approvalController.ts`** — `approveApprovalStep`:
- After final approval (when `result.organization_created`), emits `org:renewal-status:updated`, `org:dashboard:updated`, `org:applications:updated` to `org-detail:{result.organization_id}`

**`web/controllers/approvalController.ts`** — `rejectApprovalStep`:
- After rejection, looks up `organization_id` from `tbl_application`
- Emits `org:renewal-status:updated`, `org:applications:updated` to `org-detail:{organization_id}`

**`web/controllers/createOrgController.ts`** — `submitApp`:
- After `broadcastToPage('organizations', 'applications:new', ...)`, if `organization.is_renewal && organization.organization_id`, emits `org:renewal-status:updated` + `org:applications:updated` to `org-detail:{org_id}`

---

### 4. Socket Events Summary

| Event | Emitted When |
|-------|-------------|
| `org:updated` | Adviser changed (changeAdviser) |
| `org:dashboard:updated` | Application fully approved |
| `org:renewal-status:updated` | Application submitted, approved, or rejected |
| `org:applications:updated` | Application submitted, approved, or rejected |

---

### 5. Previously Completed in this Session (Part 1)

- `web/controllers/esignatureController.ts` — `signature_url` leading slash removed; `user_id` added to upload response
- `web/models/applicationPeriodModel.ts` — `approvedCount` + `rejectedCount` added to `withCounts()`
- `web/controllers/approvalController.ts` — `next_approver`, `logActivity`, `approval_turn` notification type
- `web/models/approvalModel.ts` — slug auto-generated in `promoteApplication()` (both new org + renewal)
- `web/models/organizationsPageModel.ts` — `getOrgBySlug(slug)` added
- `web/controllers/organizationsPageController.ts` — `getOrgBySlugHandler` added
- `web/routes/organizationsPage.ts` — `GET /organizations/by-slug/:slug` added

---

## Completed Work (session — 2026-03-07, Phase 6: User Account Flow & Schema Fixes)

### Prompt processed: `from_frontend/backend-prompt-user-account-flow-and-schema-fix.md`
### Frontend guide created: `to_frontend/User Account Flow — Frontend Guide.md`

---

### 1. Prisma Schema Changes

| Change | Detail |
|--------|--------|
| `tbl_user.user_id` | Added `@default(dbgenerated("gen_random_uuid()::text"))` — DB now auto-generates UUID |
| `tbl_application_executives.proposed_user_id` | **Removed entirely** — execs resolved by email at approval time, not at creation |
| `tbl_user_application.transferred_at` | Added `DateTime? @db.Timestamp(6)` — set when staging account is auto-provisioned into tbl_user |
| `tbl_user_application.college` | Added `String? @db.VarChar(255)` — required for Dean role registrations |

**Migrations applied:**
- `20260307083740_init_with_uuid_user_and_transferred_at`
- `20260307093758_add_college_to_user_application`

---

### 2. Auth Middleware Rewrite (`middlewares/middleWare.ts`)

`validateAzureJWT` completely rewritten to resolve DB identity:

1. Verifies Azure JWT → extracts `email` from `preferred_username`
2. Looks up `tbl_user` by email (with `tbl_role.role_name`)
3. If not found → checks `tbl_user_application WHERE email AND status='Approved'`
4. Staging is Student → `403 STUDENT_WEB_ACCESS_DENIED`
5. Staging not found/not Approved → `403 ACCOUNT_NOT_APPROVED`
6. Staging found (non-student) → auto-provisions into `tbl_user` using all-scalar unchecked write, marks `transferred_at = now()`
7. After both paths: if `dbUser.tbl_role?.role_name === 'Student'` → DB-checks `tbl_organization_members` for an active `Executive` record for this user; none → `403 STUDENT_WEB_ACCESS_DENIED`; found → allowed through
8. Sets `req.user = { user_id: dbUser.user_id, email, f_name, l_name }`

**Key constraint:** All FK fields use scalar form (`role_id`, `program_id`, `section_id`) — Prisma XOR rule prevents mixing connect + scalar in the same write.

---

### 3. `web/models/approvalModel.ts` — Email-Based Executive Resolution

- Added `resolveUserByEmail(email, displayName, roleId)` async helper
  - Looks up `tbl_user` by email; if not found, creates with UUID generated by DB
  - Uses all-scalar unchecked write to avoid Prisma XOR conflict
- President resolution: if `proposed_email` exists → `presidentUserId = await resolveUserByEmail(...)`
- Exec loop: skips if `!exec.proposed_email || !exec.proposed_rank_id`; resolves `userId = await resolveUserByEmail(exec.proposed_email, exec.proposed_name, studentRoleId)`
- `getApplicationOfficers`: removed `proposed_user_id: true` from select

---

### 4. `web/models/createOrgModel.ts` — Removed proposed_user_id

- Exec insert loop: removed `proposed_user_id` field + removed pre-lookup of `existingUser` by email
- Now inserts only: `proposed_name`, `proposed_email`, `proposed_title`, `proposed_rank_id`

---

### 5. `prisma/seed.ts` Updates

- All `tbl_user` upserts: `where: { email }` (not `user_id`) — no hardcoded user_id in creates
- DB generates UUID automatically via `gen_random_uuid()`
- All FK fields use scalar form: `role_id: roleSDO.role_id`, `program_id: programs[...]`, etc.

---

### 6. Frontend Guide — User Account Flow

**File:** `to_frontend/User Account Flow — Frontend Guide.md`

| Section | Content |
|---------|---------|
| 1.1 | `403 ACCOUNT_NOT_APPROVED` — copy to show user, logout button guidance |
| 1.2 | `403 STUDENT_WEB_ACCESS_DENIED` — redirect to mobile, QR code example |
| 2 | Axios interceptor handling both error codes |
| 3 | "Not Approved" screen UI guidance |
| 4 | Transparent first-login auto-provisioning (feels seamless) |
| 5 | UUID user_id change note |
| 6 | Full 4xx error code table |

---

## Completed Work (session — 2026-03-07, Phase 7: Public Routes & CORS Fix)

### Prompt processed: `from_frontend/backend-prompt-public-register-routes-cors.md`

---

### 1. CORS Fix (`server.ts`)

```typescript
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:3000', ...(FRONTEND_URL)],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'X-Requested-With',
    'Accept', 'Origin', 'x-api-key', 'Ocp-Apim-Subscription-Key'
  ],
};
app.options('*', cors(corsOptions));  // preflight before all routes
app.use(cors(corsOptions));
```

---

### 2. New File: `web/models/publicModel.ts`

| Function | Description |
|----------|-------------|
| `getPrograms()` | Returns colleges → programs grouped by college: `[{ ProgramsList: [{ college_name, program: [{program_id, program_name}] }] }]` |
| `getRoles()` | All roles: `[{ role_name }]` |
| `getAccounts()` | Active user emails: `[{ email }]` |
| `getPendingApplications()` | All application emails + status (lowercased): `[{ email, status }]` |
| `addUserApplication(email, roleName, programId, reason, college)` | Resolves `role_id` from name; blocks duplicate Pending/Approved (throws `{ code: 'DUPLICATE' }`); creates with `status: 'Pending'` |

---

### 3. New File: `web/controllers/publicController.ts`

- `handleGetPrograms`, `handleGetRoles`, `handleGetAccounts`, `handleGetPendingApplications`
- `handleAddUserApplication`: extracts `{ email, role, program_id, college, reason }` from body; normalizes `program_id` (null for `'not_applicable'`/empty); trims `college` (null for non-Dean); returns `409` on DUPLICATE

---

### 4. New File: `web/routes/public.ts`

Mounted at `/api/web/public` in `server.ts` — **before all authenticated routes**.  
Uses `publicAuthMiddleware` (validates static `x-api-key` / `Ocp-Apim-Subscription-Key` / bearer).

| Method | Path | Handler |
|--------|------|---------|
| GET | `/programs` | `handleGetPrograms` |
| GET | `/roles` | `handleGetRoles` |
| GET | `/accounts` | `handleGetAccounts` |
| GET | `/pending-users-applications` | `handleGetPendingApplications` |
| POST | `/user-application` | `handleAddUserApplication` |

---

### 5. Old File Renamed

- `web/routes/public.js` → **`web/routes/public.js.backup`**
  - Was shadowing the new `public.ts`, causing `pool.getConnection is not a function` 500 errors

---

## Notes
- **Logo URL convention:** `/organizations/{org_id}/logo` — served via `res.sendFile` for the org's logo file
- **Requirement templates (V2):** stored under `nuconnect-files/requirements/{filename}`. Full relative path saved in DB (`tbl_application_requirement.file_path`). Requirements are a global pool — not scoped to any period. Periods link to requirements via `tbl_application_period_requirement` junction table.
- **Archive vs hard-delete:** When deleting a requirement, if it has FK connections (junction links or submitted docs), soft-archive (`is_archived = true`). Otherwise hard-delete. Archived requirements are hidden from UI but preserved for referential integrity.
- **Slug:** Already added to `tbl_organization` schema; used as URL slug with `id` as fallback
- **Adviser name format:** `"LastName, FirstName"` — assembled server-side
- **Member count:** Queried via `groupBy` on `tbl_organization_members` (not nested) because members are under `tbl_renewal_cycle`
- **`tbl_org_rank_permission_override` (MISSING TABLE — needs future migration):** Org-scoped permission override for rank-level grants/revokes. Allows a president to revoke a rank-level permission within their org without affecting other orgs. Sits at resolution step 2, after `tbl_rank_permission` (global baseline) and before `tbl_committee_role_permission`. Schema shape: `organization_id`, `cycle_number`, `rank_id`, `permission_id`, `is_allowed` (bool), `granted_by`, `created_at`. Full resolution order: `tbl_rank_permission` → `tbl_org_rank_permission_override` → `tbl_committee_role_permission` → `tbl_executive_member_permission` → `tbl_member_permission_override`.
