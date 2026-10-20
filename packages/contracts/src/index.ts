import { z } from "zod";

export const apiHealthSchema = z.object({
  data: z.object({
    service: z.literal("api"),
    status: z.literal("ok"),
    timestamp: z.iso.datetime(),
  }),
  meta: z.object({
    version: z.literal("v1"),
  }),
});

export type ApiHealth = z.infer<typeof apiHealthSchema>;
export const healthResponseSchema = apiHealthSchema;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
  meta: z.object({ requestId: z.string() }).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const approvalCategorySchema = z.enum(["GENERAL","FINANCE","CONTENT","DELIVERABLE"]);
export type ApprovalCategory = z.infer<typeof approvalCategorySchema>;
export const approvalPolicyInputSchema = z.strictObject({
  name: z.string().trim().min(2).max(160),
  active: z.boolean(),
  approverRoleKeys: z.array(z.enum(["SUPER_ADMIN","ADMIN","FOUNDER"])).min(1).max(3),
});
export type ApprovalPolicyInput = z.infer<typeof approvalPolicyInputSchema>;
export const approvalSubmissionSchema = z.strictObject({
  category: approvalCategorySchema,
  title: z.string().trim().min(4).max(180),
  description: z.string().trim().min(5).max(4000),
});
export type ApprovalSubmission = z.infer<typeof approvalSubmissionSchema>;
export const approvalDecisionSchema = z.strictObject({
  outcome: z.enum(["APPROVED","REJECTED"]),
  reason: z.string().trim().max(1000).optional(),
}).refine((data) => data.outcome !== "REJECTED" || Boolean(data.reason?.trim()), {
  message: "Reason required for rejection",
});
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

export const financeKindSchema = z.enum(["INCOME","EXPENSE"]);
export type FinanceKind = z.infer<typeof financeKindSchema>;
export const financeCategoryInputSchema = z.strictObject({
  kind: financeKindSchema,
  name: z.string().trim().min(2).max(120),
});
export type FinanceCategoryInput = z.infer<typeof financeCategoryInputSchema>;
export const financeEntryInputSchema = z.strictObject({
  kind: financeKindSchema,
  categoryId: z.uuid(),
  amount: z.string().regex(/^(?:0|[1-9][0-9]{0,14})(?:[.][0-9]{1,4})?$/),
  occurredOn: z.iso.date(),
  method: z.enum(["CASH","UPI","BANK_TRANSFER","CARD","OTHER"]),
  merchantOrSource: z.string().trim().max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  idempotencyKey: z.uuid(),
  receiptAssetId: z.uuid().nullable().optional(),
});
export type FinanceEntryInput = z.infer<typeof financeEntryInputSchema>;
export const financeCategoryStatusSchema = z.strictObject({active:z.boolean()});
export const financeViewSchema = z.enum(["mine","all"]);

export const leadStageSchema = z.enum(["NEW","CONTACTED","QUALIFIED","PROPOSAL","WON","LOST"]);
export const leadCreateSchema = z.strictObject({
  businessName: z.string().trim().min(2).max(180),
  contactName: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  businessType: z.string().trim().max(120).optional(),
  location: z.string().trim().max(240).optional(),
  websiteUrl: z.union([z.url({protocol:/^https?$/}).max(500),z.literal("")]).optional(),
  instagramUrl: z.union([z.url({protocol:/^https?$/}).max(500),z.literal("")]).optional(),
  source: z.string().trim().max(120).optional(),
  nextFollowUpAt: z.union([z.iso.datetime({offset:true}),z.literal("")]).optional(),
  note: z.string().trim().max(2000).optional(),
});
export type LeadCreateInput = z.infer<typeof leadCreateSchema>;
export const leadUpdateSchema = leadCreateSchema.omit({note:true}).partial().extend({
  version:z.number().int().min(1),status:leadStageSchema.optional(),
}).strict();
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;
export const leadAssignSchema = z.strictObject({version:z.number().int().min(1),assignedToId:z.uuid().nullable()});
export const leadNoteSchema = z.strictObject({note:z.string().trim().min(1).max(2000)});
export const leadDuplicateReviewSchema = z.strictObject({resolution:z.enum(["CONFIRMED","DISMISSED"])});
export const leadListQuerySchema = z.strictObject({
  stage:leadStageSchema.optional(),
  sort:z.enum(["businessName","contactName","location","status","nextFollowUpAt"]).optional(),
  direction:z.enum(["asc","desc"]).optional(),
  assignedToId:z.uuid().optional(),
  q:z.string().trim().max(100).optional(),
  cursor:z.uuid().optional(),
  limit:z.coerce.number().int().min(1).max(100).default(30),
});
export const leadImportSchema = z.strictObject({
  batchId:z.uuid(),
  rows:z.array(leadCreateSchema).min(1).max(50),
});
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

// Module 8 client profile, relationship and conversion contracts.
export const clientStatusSchema=z.enum(["ACTIVE","PAUSED","ARCHIVED"]);
export const clientServiceStatusSchema=z.enum(["ACTIVE","PAUSED","ENDED"]);
const optionalClientUrl=z.union([z.url({protocol:/^https?$/}).max(500),z.literal("")]).optional();
const optionalClientEmail=z.union([z.email().max(255),z.literal("")]).optional();
export const clientCreateSchema=z.strictObject({
 businessName:z.string().trim().min(2).max(180),
 businessType:z.string().trim().max(120).optional(),phone:z.string().trim().max(40).optional(),
 email:optionalClientEmail,location:z.string().trim().max(240).optional(),
 websiteUrl:optionalClientUrl,instagramUrl:optionalClientUrl,facebookUrl:optionalClientUrl,
 notes:z.string().trim().max(2000).optional(),
});
export type ClientCreateInput=z.infer<typeof clientCreateSchema>;
export const clientUpdateSchema=clientCreateSchema.partial().extend({
 version:z.number().int().min(1),status:clientStatusSchema.optional(),
}).strict();
export type ClientUpdateInput=z.infer<typeof clientUpdateSchema>;
export const clientListQuerySchema=z.strictObject({
 q:z.string().trim().max(100).optional(),status:clientStatusSchema.optional(),
 sort:z.enum(["businessName","businessType","location","status"]).optional(),
 direction:z.enum(["asc","desc"]).optional(),
 cursor:z.uuid().optional(),limit:z.coerce.number().int().min(1).max(100).default(30),
});
export type ClientListQuery=z.infer<typeof clientListQuerySchema>;
export const clientContactSchema=z.strictObject({
 name:z.string().trim().min(2).max(160),role:z.string().trim().max(120).optional(),
 phone:z.string().trim().max(40).optional(),email:optionalClientEmail,
 isPrimary:z.boolean().default(false),
});
export type ClientContactInput=z.infer<typeof clientContactSchema>;
export const clientServiceSchema=z.strictObject({
 name:z.string().trim().min(2).max(120),description:z.string().trim().max(1000).optional(),
 status:clientServiceStatusSchema.default("ACTIVE"),
});
export type ClientServiceInput=z.infer<typeof clientServiceSchema>;
export const clientConvertSchema=z.strictObject({version:z.number().int().min(1)});

export const assetContentTypeSchema=z.enum(["image/jpeg","image/pjpeg","image/jfif","image/png","image/gif","image/webp","image/avif","image/bmp","image/tiff","image/heic","image/heif","video/mp4","video/quicktime","video/webm","application/pdf"]);
export const assetIntentSchema=z.strictObject({
 filename:z.string().trim().min(1).max(180).refine(name=>!name.includes("/")&&!name.includes("\\")&&[...name].every(ch=>ch.charCodeAt(0)>=32),"Invalid filename"),
 contentType:assetContentTypeSchema,
 bytes:z.number().int().positive().max(100_000_000),
 clientId:z.uuid().nullable().optional(),
});
export type AssetIntentInput=z.infer<typeof assetIntentSchema>;
export const assetConfirmSchema=z.strictObject({
 intentId:z.uuid(),assetId:z.string().trim().min(6).max(120),
 // The selected folder is verified and written atomically with the confirmed asset.
 folderId:z.uuid().nullable().optional(),
});
export const assetListSchema=z.strictObject({
 q:z.string().trim().max(100).optional(),
 clientId:z.uuid().optional(),
 status:z.enum(["ACTIVE","ARCHIVED"]).default("ACTIVE"),
 sort:z.enum(["name","date","size","type"]).default("date"),
 direction:z.enum(["asc","desc"]).default("desc"),
 cursor:z.uuid().optional(),
 limit:z.coerce.number().int().min(1).max(100).default(30),
});
export type AssetListQuery=z.infer<typeof assetListSchema>;
export const assetLinkSchema=z.strictObject({
 version:z.number().int().positive(),clientId:z.uuid().nullable(),
});
export const assetArchiveSchema=z.strictObject({version:z.number().int().positive()});

// Module 10: projects, project membership, milestones, deliverables and approval submissions.
export const projectStatusSchema=z.enum(["PLANNED","ACTIVE","ON_HOLD","COMPLETED","ARCHIVED"]);
export const projectMemberRoleSchema=z.enum(["MANAGER","CONTRIBUTOR","REVIEWER"]);
export const milestoneStatusSchema=z.enum(["OPEN","DONE"]);
export const deliverableStatusSchema=z.enum(["DRAFT","IN_REVIEW","CHANGES_REQUESTED","APPROVED"]);
const optionalProjectDate=z.union([z.iso.date(),z.literal("")]).optional();
export const projectCreateSchema=z.strictObject({
  clientId:z.uuid(),name:z.string().trim().min(2).max(180),
  description:z.string().trim().max(2000).optional(),
  startOn:optionalProjectDate,dueOn:optionalProjectDate,
}).refine(x=>!x.startOn||!x.dueOn||x.startOn<=x.dueOn,{message:"Start date must be on or before due date"});
export type ProjectCreateInput=z.infer<typeof projectCreateSchema>;
export const projectUpdateSchema=z.strictObject({
  version:z.number().int().positive(),name:z.string().trim().min(2).max(180).optional(),
  description:z.string().trim().max(2000).optional(),status:projectStatusSchema.optional(),
  startOn:optionalProjectDate,dueOn:optionalProjectDate,
});
export type ProjectUpdateInput=z.infer<typeof projectUpdateSchema>;
export const projectListSchema=z.strictObject({
  q:z.string().trim().max(100).optional(),status:projectStatusSchema.optional(),
  clientId:z.uuid().optional(),cursor:z.uuid().optional(),
  limit:z.coerce.number().int().min(1).max(100).default(30),
});
export type ProjectListInput=z.infer<typeof projectListSchema>;
export const projectMemberSchema=z.strictObject({
  userId:z.uuid(),role:projectMemberRoleSchema,
});
export type ProjectMemberInput=z.infer<typeof projectMemberSchema>;
export const projectMilestoneSchema=z.strictObject({
  title:z.string().trim().min(2).max(180),dueOn:optionalProjectDate,
});
export type ProjectMilestoneInput=z.infer<typeof projectMilestoneSchema>;
export const projectMilestoneUpdateSchema=z.strictObject({
  version:z.number().int().positive(),status:milestoneStatusSchema,
});
export const projectDeliverableSchema=z.strictObject({
  title:z.string().trim().min(2).max(180),
  description:z.string().trim().max(2000).optional(),
  milestoneId:z.uuid().nullable().optional(),
  assetId:z.uuid().nullable().optional(),
});
export type ProjectDeliverableInput=z.infer<typeof projectDeliverableSchema>;
export const projectDeliverableUpdateSchema=projectDeliverableSchema.partial().extend({
  version:z.number().int().positive(),
}).strict();
export type ProjectDeliverableUpdateInput=z.infer<typeof projectDeliverableUpdateSchema>;
export const projectDeliverableSubmitSchema=z.strictObject({version:z.number().int().positive()});

// Module 11: tasks and recurring schedules.
export const taskStatusSchema=z.enum(["TODO","IN_PROGRESS","BLOCKED","IN_REVIEW","DONE","CANCELLED"]);
export const taskPrioritySchema=z.enum(["LOW","MEDIUM","HIGH","URGENT"]);
export const taskFrequencySchema=z.enum(["DAILY","WEEKLY","MONTHLY"]);
const taskOptionalText=z.string().trim().max(2000).optional();
const taskOptionalTimestamp=z.iso.datetime({offset:true}).nullable().optional();
export const taskCreateSchema=z.strictObject({
 title:z.string().trim().min(2).max(180),description:taskOptionalText,
 priority:taskPrioritySchema.default("MEDIUM"),dueAt:taskOptionalTimestamp,
 projectId:z.uuid().nullable().optional(),
 assigneeIds:z.array(z.uuid()).min(1).max(30).refine(x=>new Set(x).size===x.length,"Duplicate assignee"),
});
export type TaskCreateInput=z.infer<typeof taskCreateSchema>;
export const taskUpdateSchema=z.strictObject({
 version:z.number().int().positive(),
 title:z.string().trim().min(2).max(180).optional(),
 description:taskOptionalText,priority:taskPrioritySchema.optional(),
 dueAt:taskOptionalTimestamp,status:taskStatusSchema.optional(),
});
export type TaskUpdateInput=z.infer<typeof taskUpdateSchema>;
export const taskAssigneesSchema=z.strictObject({
 version:z.number().int().positive(),
 assigneeIds:z.array(z.uuid()).min(1).max(30).refine(x=>new Set(x).size===x.length,"Duplicate assignee"),
});
export const taskListSchema=z.strictObject({
 view:z.enum(["mine","team"]).default("mine"),
 status:taskStatusSchema.optional(),projectId:z.uuid().optional(),
 q:z.string().trim().max(100).optional(),cursor:z.uuid().optional(),
 limit:z.coerce.number().int().min(1).max(100).default(30),
});
export type TaskListInput=z.infer<typeof taskListSchema>;
export const taskChecklistCreateSchema=z.strictObject({label:z.string().trim().min(2).max(240)});
export const taskChecklistUpdateSchema=z.strictObject({completed:z.boolean()});
export const taskCommentSchema=z.strictObject({body:z.string().trim().min(1).max(2000)});
export const taskRecurrenceCreateSchema=z.strictObject({
 title:z.string().trim().min(2).max(180),description:taskOptionalText,
 priority:taskPrioritySchema.default("MEDIUM"),
 projectId:z.uuid().nullable().optional(),
 assigneeIds:z.array(z.uuid()).min(1).max(30).refine(x=>new Set(x).size===x.length,"Duplicate assignee"),
 frequency:taskFrequencySchema,interval:z.number().int().min(1).max(12).default(1),
 timezone:z.string().trim().min(3).max(80),
 startAt:z.iso.datetime({offset:true}),dueOffsetDays:z.number().int().min(0).max(30).default(0),
});
export type TaskRecurrenceCreateInput=z.infer<typeof taskRecurrenceCreateSchema>;
export const taskRecurrenceUpdateSchema=z.strictObject({version:z.number().int().positive(),enabled:z.boolean()});

// Module 12: content calendar, immutable revision history and manual publish records.
export const contentPlatformSchema=z.enum(["INSTAGRAM","FACEBOOK","LINKEDIN","YOUTUBE","GOOGLE_BUSINESS","WEBSITE","OTHER"]);
export const contentFormatSchema=z.enum(["REEL","POST","STORY","CAROUSEL","VIDEO","BLOG","OTHER"]);
export const contentStatusSchema=z.enum(["IDEA","DRAFT","IN_REVIEW","CHANGES_REQUESTED","APPROVED","SCHEDULED","PUBLISHED","CANCELLED"]);
const contentAssetIds=z.array(z.uuid()).max(10).refine(x=>new Set(x).size===x.length,{message:"Duplicate asset"});
const contentHashtags=z.array(z.string().trim().regex(/^#[a-zA-Z0-9_]{1,50}$/)).max(30);
export const contentCreateSchema=z.strictObject({
  clientId:z.uuid(),projectId:z.uuid().nullable().optional(),ownerId:z.uuid().optional(),
  title:z.string().trim().min(2).max(180),caption:z.string().trim().max(10000).default(""),
  hashtags:contentHashtags.default([]),platform:contentPlatformSchema,format:contentFormatSchema,
  publishAt:z.iso.datetime({offset:true}).nullable().optional(),assetIds:contentAssetIds.default([]),
});
export type ContentCreateInput=z.infer<typeof contentCreateSchema>;
export const contentUpdateSchema=z.strictObject({
  version:z.number().int().positive(),
  title:z.string().trim().min(2).max(180).optional(),
  caption:z.string().trim().max(10000).optional(),
  hashtags:contentHashtags.optional(),platform:contentPlatformSchema.optional(),format:contentFormatSchema.optional(),
  publishAt:z.iso.datetime({offset:true}).nullable().optional(),
  projectId:z.uuid().nullable().optional(),ownerId:z.uuid().optional(),assetIds:contentAssetIds.optional(),
});
export type ContentUpdateInput=z.infer<typeof contentUpdateSchema>;
export const contentListQuerySchema=z.strictObject({
  clientId:z.uuid().optional(),ownerId:z.uuid().optional(),status:contentStatusSchema.optional(),
  platform:contentPlatformSchema.optional(),start:z.iso.datetime({offset:true}).optional(),
  end:z.iso.datetime({offset:true}).optional(),q:z.string().trim().max(100).optional(),
  limit:z.coerce.number().int().min(1).max(100).default(50),cursor:z.uuid().optional(),
}).refine(x=>!x.start||!x.end||x.start<x.end,{message:"Invalid date range"});
export type ContentListQuery=z.infer<typeof contentListQuerySchema>;
export const contentVersionSchema=z.strictObject({version:z.number().int().positive()});
export const contentPublishSchema=z.strictObject({
  version:z.number().int().positive(),publishedUrl:z.url().startsWith("https://").max(1000).nullable().optional(),
});

// Module 13: safe, exact-decimal invoice and payment contracts.
const invoiceMoney=z.string().regex(/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,4})?$/);
const qty=z.string().regex(/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/);
export const invoiceLineSchema=z.strictObject({
 description:z.string().trim().min(2).max(500),quantity:qty,unitPrice:invoiceMoney,
 taxRate:z.string().regex(/^(?:0|[1-9][0-9]?|100)(?:\.[0-9]{1,2})?$/).default("0"),
});
export const invoiceDraftSchema=z.strictObject({
 clientId:z.uuid(),sellerName:z.string().trim().min(2).max(180),
 sellerAddress:z.string().trim().min(3).max(500),sellerTaxId:z.string().trim().max(40).optional(),
 buyerName:z.string().trim().min(2).max(180),buyerAddress:z.string().trim().max(500).optional(),
 dueOn:z.iso.date(),notes:z.string().trim().max(2000).optional(),
 lines:z.array(invoiceLineSchema).min(1).max(50),
});
export type InvoiceDraftInput=z.infer<typeof invoiceDraftSchema>;
export const invoiceEditSchema=invoiceDraftSchema.omit({clientId:true}).extend({version:z.number().int().positive()}).strict();
export type InvoiceEditInput=z.infer<typeof invoiceEditSchema>;
export const invoiceListSchema=z.strictObject({clientId:z.uuid().optional(),status:z.enum(["DRAFT","ISSUED","VOID"]).optional(),
 limit:z.coerce.number().int().min(1).max(100).default(50),cursor:z.uuid().optional()});
export type InvoiceListInput=z.infer<typeof invoiceListSchema>;
export const invoiceVersionSchema=z.strictObject({version:z.number().int().positive()});
export const paymentRecordSchema=z.strictObject({
 clientId:z.uuid(),categoryId:z.uuid(),amount:invoiceMoney,
 receivedOn:z.iso.date(),method:z.enum(["CASH","UPI","BANK_TRANSFER","CARD","OTHER"]),
 reference:z.string().trim().min(4).max(180),idempotencyKey:z.uuid(),
 allocations:z.array(z.strictObject({invoiceId:z.uuid(),amount:invoiceMoney})).min(1).max(30)
  .refine(x=>new Set(x.map(y=>y.invoiceId)).size===x.length,"Duplicate invoice allocation"),
});
export type PaymentRecordInput=z.infer<typeof paymentRecordSchema>;
export const billingScheduleSchema=invoiceDraftSchema.extend({
 frequency:z.enum(["MONTHLY","QUARTERLY","YEARLY"]),
 startAt:z.iso.datetime({offset:true}),dueAfterDays:z.number().int().min(0).max(90).default(14),
}).omit({dueOn:true}).strict();
export type BillingScheduleInput=z.infer<typeof billingScheduleSchema>;
export const billingToggleSchema=z.strictObject({version:z.number().int().positive(),enabled:z.boolean()});

// Module 14: exact-decimal client profitability and revenue recognition.
const profitAmount=z.string().regex(/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,4})?$/);
export const profitabilityPeriodSchema=z.strictObject({
  from:z.iso.date(),to:z.iso.date(),clientId:z.uuid().optional(),
}).refine(v=>v.from<=v.to,{message:"Period end must not precede start"});
export type ProfitabilityPeriod=z.infer<typeof profitabilityPeriodSchema>;
export const costAllocationUpdateSchema=z.strictObject({
  version:z.number().int().nonnegative(),
  allocations:z.array(z.strictObject({
    clientId:z.uuid(),projectId:z.uuid().nullable().optional(),
    amount:profitAmount,note:z.string().trim().max(500).optional(),
  })).max(100).refine(a=>new Set(a.map(x=>x.clientId)).size===a.length,"Duplicate client attribution"),
});
export type CostAllocationUpdate=z.infer<typeof costAllocationUpdateSchema>;
export const revenueRecognitionCreateSchema=z.strictObject({
  invoiceId:z.uuid(),recognizedOn:z.iso.date(),amount:profitAmount,
  note:z.string().trim().min(4).max(500),idempotencyKey:z.uuid(),
});
export type RevenueRecognitionCreate=z.infer<typeof revenueRecognitionCreateSchema>;
export const revenueRecognitionReverseSchema=z.strictObject({
  recognizedOn:z.iso.date(),note:z.string().trim().min(4).max(500),
  idempotencyKey:z.uuid(),
});
export type RevenueRecognitionReverse=z.infer<typeof revenueRecognitionReverseSchema>;

// Module 15: controlled founder directories and versioned company configuration.
export const founderCreateSchema=z.strictObject({
 displayName:z.string().trim().min(2).max(160),
 title:z.string().trim().min(2).max(160),
 responsibilities:z.string().trim().min(4).max(4000),
 sortOrder:z.number().int().min(0).max(10000).default(0),
 userId:z.uuid().nullable().optional(),
});
export type FounderCreate=z.infer<typeof founderCreateSchema>;
export const founderUpdateSchema=founderCreateSchema.extend({
 version:z.number().int().positive(),isActive:z.boolean(),
}).strict();
export type FounderUpdate=z.infer<typeof founderUpdateSchema>;
export const companySettingsSchema=z.strictObject({
 version:z.number().int().positive(),
 name:z.string().trim().min(2).max(160),
 timezone:z.string().trim().min(1).max(80),
});
export type CompanySettingsUpdate=z.infer<typeof companySettingsSchema>;
export const billingSettingsSchema=z.strictObject({
 version:z.number().int().positive(),
 invoicePrefix:z.string().regex(/^[A-Z][A-Z0-9]{1,11}$/),
 defaultDueDays:z.number().int().min(0).max(365),
 paymentInstructions:z.string().trim().max(1000).nullable(),
});
export type BillingSettingsUpdate=z.infer<typeof billingSettingsSchema>;

// Module 16 search, reporting and notifications.
export const searchQuerySchema=z.strictObject({
 q:z.string().trim().min(2).max(100),
});
export const reportsPeriodSchema=z.strictObject({
 from:z.iso.date(),to:z.iso.date(),
}).refine(x=>x.from<=x.to,{message:"Invalid report period"});
export const notificationListSchema=z.strictObject({
 unread:z.enum(["true","false"]).optional(),
 limit:z.coerce.number().int().min(1).max(100).default(30),
});
