# Wireframe 01 — Authentication and app shell

## A. Login (desktop)
~~~text
┌──────────────────────────────────────────────────────────────────────────┐
│                     DigiMarket Software                                 │
│                                                                          │
│                ┌─────────────────────────────────────┐                   │
│                │ Welcome back                        │                   │
│                │ Internal agency workspace           │                   │
│                │                                     │                   │
│                │ Login ID                            │                   │
│                │ [_______________________________]   │                   │
│                │ Password                       [eye]│                   │
│                │ [_______________________________]   │                   │
│                │                                     │                   │
│                │ [ Sign in                        ]  │                   │
│                │ Error / locked session feedback     │                   │
│                └─────────────────────────────────────┘                   │
│             No public registration                                       │
└──────────────────────────────────────────────────────────────────────────┘
~~~
First login redirects to required change-password screen. Credential errors generic; no exposure of whether login ID exists.

## B. Global app shell and dashboard
~~~text
┌──────────────────┬───────────────────────────────────────────────────────┐
│ DigiMarket       │ Search all permitted records        Bell   User menu  │
├──────────────────┼───────────────────────────────────────────────────────┤
│ ▣ Dashboard      │ Overview       [date range]          [+ Quick add]    │
│ ◇ Finance        │                                                       │
│ ◇ Approvals      │ [My tasks due]  [Followups due]  [Notifications]       │
│ ◇ Leads          │                                                       │
│ ◇ Clients        │ [Authorized company KPIs or personal work summary]    │
│ ◇ Projects       │                                                       │
│ ◇ Tasks          │ [My tasks and deadlines]   [Lead followups]           │
│ ◇ Content        │                                                       │
│ ◇ Assets         │ [Recent activity / approvals / calendar snapshot]    │
│ ◇ Invoices       │                                                       │
│ ◇ Payments       │                                                       │
│ ◇ Reports        │                                                       │
│ ◇ Founders       │                                                       │
│ ◇ Team / Admin   │                                                       │
│ ◇ Settings       │                                                       │
└──────────────────┴───────────────────────────────────────────────────────┘
~~~
Role guard: employee should not see company-wide financial values without permission. Default dashboard is personal work status.

## C. Team and account management
~~~text
Page: Team / Users
[Search users] [Role ▼] [Status ▼]                  [+ Create account]
Name / Login ID    Team           Role         Status        Action
User A             Content        Employee     Active        Edit / Disable
User B             Management     Admin        Active        Edit / Reset

Create Account drawer:
  Display name [_____________]
  Unique login ID [__________]
  Team [____________________]
  Role [____________________]
  Temp password [Generate securely]
  [Create] [Cancel]
~~~
Admin cannot view old passwords. Invite or temporary credential delivery must use a secure approved mechanism.

## D. Founder page
~~~text
Founders  [Edit only if allowed]
┌─────────────────────────────────────────┐
│ Founder profile                          │
│ Role/title                               │
│ Responsibilities                         │
│ Team or service ownership                │
│ Contact visibility (permission-filtered) │
└─────────────────────────────────────────┘
~~~
Founder role descriptions do not define app permissions.

## E. Mobile navigation
~~~text
┌────────────────────────────┐
│ ☰ DigiMarket    🔔 Profile │
├────────────────────────────┤
│ Overview                   │
│ [My tasks due]             │
│ [Followups]                │
│ [Activity]                 │
│                            │
│ [+ Quick add]              │
└────────────────────────────┘
~~~
Side rail becomes a drawer; tables transform to stacked record cards where practical.
