# Wireframe 03 — Leads, clients, projects and work

## A. Shared lead CRM
~~~text
Leads                                         [+ Add lead] [Import]
[Search company/phone] [Stage ▼] [Owner ▼] [Due followups ▼]
┌────────────┬────────────┬────────────┬────────────┬───────────┐
│ New        │ Contacted  │ Qualified  │ Proposal   │ Won/Lost  │
│ [Lead A]   │ [Lead B]   │ [Lead C]   │ [Lead D]   │ [Lead E]  │
└────────────┴────────────┴────────────┴────────────┴───────────┘
[Table view] [Board view]
~~~
Lead form: business name, contact name, phone, business category, location/maps, Instagram/website, source, owner, notes, next follow-up. Duplicate suggestions shown before saving.

## B. Lead detail
~~~text
Lead / Business Name                         [Assign] [Convert to client]
[Status: QUALIFIED] [Phone] [Location] [Business type]
Tabs: [Overview] [Activity] [Followups]
[Profile + linked social pages]     [Next followup and owner]
Timeline:
  Contacted -> notes -> next action -> outcome
[Add followup] [Call logged] [Mark outcome]
~~~
Won conversion confirms whether matching client exists and runs atomically.

## C. Client detail
~~~text
Clients / Example Business             [Active ▼] [Edit] [New project]
[Contact, address, business type, assigned manager]
[Services] [Projects] [Assets] [Tasks] [Billing] [Activity]
┌──────────────────────────────────────────────────────────────────┐
│ Active service agreements / contract dates / account contact   │
│ Latest projects + deliverables / future content                 │
│ Receivables (only with finance permissions)                     │
│ Restricted credentials (separate authorized workflow only)      │
└──────────────────────────────────────────────────────────────────┘
~~~
Private invoice amounts and secrets disappear for users without explicit grants.

## D. Project board
~~~text
Projects                                 [+ New project]
[Client ▼] [Owner ▼] [Status ▼] [Service ▼]
[Planned]          [Active]           [In review]        [Complete]
Project A          Project B          Project C          Project D
Deadline           Deadline           Deadline           Completed
Owner              Owner              Reviewer           Owner
~~~
Project detail tabs: Overview, Milestones, Deliverables, Tasks, Members, Assets, Activity. Deliverable review uses centralized approvals.

## E. My tasks / team tasks
~~~text
Tasks                                      [+ New task] [Repeat rule]
[Mine / Team] [Due today] [Overdue] [Priority] [Project ▼]
[ ] Task: Prepare 20-sec reel          Priority: High    Due: today
[ ] Task: Call prospective client      Priority: Medium  Due: tomorrow
[x] Task: Update weekly progress       Completed

Task detail:
Title / description / assign to / related project
Checklist / comments / attachment / due date
[Start] [Mark in review] [Complete]
~~~
No implied finance or client secret access just because task is assigned.

## F. Recurrence editor
~~~text
Repeat task
Base task [Prepare weekly performance report]
Frequency [Weekly ▼]
On [Monday]
Timezone [Asia/Kolkata ▼]
Start date [____] End date [optional]
Preview next 5: [date] [date] [date] [date] [date]
[Activate recurring task]
~~~
Workers create deduplicated task instances; template is not itself counted as today's assigned work.
