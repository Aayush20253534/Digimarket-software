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

export const assetContentTypeSchema=z.enum(["image/jpeg","image/png","image/webp","video/mp4","video/quicktime","video/webm","application/pdf"]);
export const assetIntentSchema=z.strictObject({
 filename:z.string().trim().min(1).max(180).refine(name=>!name.includes("/")&&!name.includes("\\")&&[...name].every(ch=>ch.charCodeAt(0)>=32),"Invalid filename"),
 contentType:assetContentTypeSchema,
 bytes:z.number().int().positive().max(100_000_000),
 clientId:z.uuid().nullable().optional(),
});
export type AssetIntentInput=z.infer<typeof assetIntentSchema>;
export const assetConfirmSchema=z.strictObject({
 intentId:z.uuid(),assetId:z.string().trim().min(6).max(120),
});
export const assetListSchema=z.strictObject({
 q:z.string().trim().max(100).optional(),
 clientId:z.uuid().optional(),
 status:z.enum(["ACTIVE","ARCHIVED"]).default("ACTIVE"),
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
