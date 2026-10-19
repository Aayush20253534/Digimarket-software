import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  approvalCategorySchema, approvalPolicyInputSchema, approvalSubmissionSchema,
  approvalDecisionSchema,
} from "@digimarket/contracts";
import { AuthService, type Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";
import { ApprovalService } from "./service";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result=schema.safeParse(value);
  if(!result.success) throw new AuthError(422,"VALIDATION_ERROR","Invalid approval fields");
  return result.data;
}
const idSchema=z.uuid();

export function registerApprovalRoutes(app: Express, authService: AuthService) {
  const approvals=new ApprovalService(authService.database);
  const authenticate=async (req:Request,res:Response,next:NextFunction)=>{
    try {
      const header=req.get("authorization");
      if(!header?.startsWith("Bearer ")) throw unauthorized();
      res.locals.principal=await authService.authenticate(header.slice(7));
      next();
    } catch(error) {next(error);}
  };
  const actor=(res:Response)=>res.locals.principal as Principal;
  const base="/api/v1";
  app.get(base+"/approval-policies",authenticate,async (_req,res)=>{
    res.set("Cache-Control","no-store");
    res.json({data:await approvals.policies(actor(res))});
  });
  app.put(base+"/approval-policies/:category",authenticate,async (req,res)=>{
    const category=parse(approvalCategorySchema,req.params.category);
    const input=parse(approvalPolicyInputSchema,req.body);
    res.json({data:await approvals.policy(actor(res),category,input)});
  });
  app.get(base+"/approvals",authenticate,async (req,res)=>{
    const view=parse(z.enum(["mine","queue"]),req.query.view??"mine");
    res.set("Cache-Control","no-store");
    res.json({data:await approvals.list(actor(res),view)});
  });
  app.post(base+"/approvals",authenticate,async (req,res)=>{
    const input=parse(approvalSubmissionSchema,req.body);
    res.status(201).json({data:await approvals.submit(actor(res),input)});
  });
  app.get(base+"/approvals/:id",authenticate,async (req,res)=>{
    const id=parse(idSchema,req.params.id);
    res.set("Cache-Control","no-store");
    res.json({data:await approvals.get(actor(res),id)});
  });
  app.post(base+"/approvals/:id/decision",authenticate,async (req,res)=>{
    const id=parse(idSchema,req.params.id);
    const input=parse(approvalDecisionSchema,req.body);
    res.json({data:await approvals.decide(actor(res),id,input)});
  });
  app.post(base+"/approvals/:id/cancel",authenticate,async (req,res)=>{
    const id=parse(idSchema,req.params.id);
    res.json({data:await approvals.cancel(actor(res),id)});
  });
}
