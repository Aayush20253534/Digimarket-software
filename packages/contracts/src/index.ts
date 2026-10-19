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
