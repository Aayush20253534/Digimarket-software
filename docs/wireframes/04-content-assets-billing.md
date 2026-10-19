# Wireframe 04 — Content, Cloudinary assets, invoices and analytics

## A. Content calendar
~~~text
Content calendar                          [+ New content]
[Client ▼] [Platform ▼] [Status ▼] [Owner ▼]
[Month] [Week] [List]                       October 2026
┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐
│ Mon  │ Tue  │ Wed  │ Thu  │ Fri  │ Sat  │ Sun  │
│      │      │      │      │      │      │      │
│ Reel │      │ Post │      │Story │      │      │
│      │      │      │      │      │      │      │
└──────┴──────┴──────┴──────┴──────┴──────┴──────┘
Legend: Draft / Review / Approved / Scheduled / Published
~~~
Content editor:
- Client/project, platform and format.
- Caption and hashtags.
- Planned publication time and timezone.
- Assigned creator/reviewer.
- Linked media and revision history.
- [Save draft] [Submit review] [Record published].
A planned date does not mark content as published.

## B. Cloudinary-backed asset library
~~~text
Assets                                   [Upload] [+ Folder]
[Agency / Client / Project] [Type ▼] [Search] [Sort ▼]
┌───────────────┬───────────────┬───────────────┐
│ [Thumbnail]   │ [Thumbnail]   │ [Document]    │
│ Reel final    │ Cafe logo     │ Contract PDF  │
│ Video         │ Image         │ Restricted    │
└───────────────┴───────────────┴───────────────┘
Selected file detail:
  Preview | owner | version | associated records | visibility
  [Authorized download] [Link to project] [Archive]
~~~
For restricted files, frontend requests short-lived authorized delivery; app never advertises unrestricted original URL.

## C. Invoice register
~~~text
Invoices                                  [+ New invoice]
[Client ▼] [Issued/Paid/Overdue ▼] [Date range]
Number      Client        Issued     Due      Paid      Balance
INV-0001    Client A      1 Oct      10 Oct   5,000     7,000
INV-0002    Client B      2 Oct      12 Oct  12,000     0
~~~
Amounts include explicit currency, with overdue state derived from due date and verified allocations.

## D. Invoice editor/detail
~~~text
Invoice / Draft                           [Save] [Issue]
Client [__________________]
Issue date [_____] Due date [_____]
Billing identity / contact
Line item                         Qty     Unit price       Amount
Social management                 1       12,000.00       12,000.00
[Add line]
Subtotal                                        12,000.00
Tax/discount                                     configured
Total                                            12,000.00
[Download PDF (when issued)] [Record payment]
Payment timeline / allocations / remaining balance
~~~
Billing identity/tax and numbering decisions must be confirmed before issuing legal invoices.

## E. Payment record and allocation
~~~text
Payment received
Client [____] Amount [5,000.00 INR] Date [____]
Method [Bank/UPI/Cash] Reference [________]
Proof [Upload restricted receipt]
[Record for verification]
On verified payment:
  [Allocate to invoice(s)] with remaining balance checks
~~~
No second free-standing income row; verified payment is linked to exactly one finance receipt.

## F. Company reports and client profitability
~~~text
Reports                                [Period] [Export]
[Company] [Finance] [Sales] [Projects] [Content] [Clients]
[Revenue recognized] [Collections] [Outstanding] [Direct costs]
[Trend] [Category distribution] [Client contribution table]
Client           Recognized rev    Direct costs   Contribution
Client A         ...               ...            ...
Client B         ...               ...            ...
Footnote: Recognition basis; overhead method; date and currency
~~~
Permissions gate every report query and download; metric definitions are visible.
