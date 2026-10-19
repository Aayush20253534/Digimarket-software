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
