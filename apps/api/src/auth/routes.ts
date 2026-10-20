import type { Express, Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { AuthService, type Principal } from "./service";
import { AuthError, unauthorized } from "./errors";

const password = z.string().min(12).max(128);
const loginId = z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9_.-]+$/);
const loginSchema = z.strictObject({ loginId, password: z.string().min(1).max(128) });
const changeSchema = z.strictObject({ challengeToken: z.string().min(20), oldPassword: z.string().min(1), newPassword: password });
const createSchema = z.strictObject({
  loginId, displayName: z.string().trim().min(1).max(160),
  email: z.email().optional(), temporaryPassword: password,
  role: z.enum(["SUPER_ADMIN","ADMIN","FOUNDER","EMPLOYEE"]).default("EMPLOYEE"),
});
const resetSchema = z.strictObject({ temporaryPassword: password });
const roleSchema = z.strictObject({ role: z.enum(["ADMIN", "FOUNDER", "EMPLOYEE"]) });
const uuid = z.uuid();

function body<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AuthError(422, "VALIDATION_ERROR", "Invalid request fields");
  return parsed.data;
}

function bearer(request: Request) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) throw unauthorized();
  return authorization.slice(7);
}

export function registerAuthRoutes(app: Express, service: AuthService, allowedOrigins: string[]) {
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 120,
    standardHeaders: "draft-8", legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many authentication requests" } },
  });
  const credentialLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });
  app.use(cookieParser());
  app.use("/api/v1/auth", authLimit);

  // Cookie-authenticated POST endpoints are origin-bound to prevent CSRF.
  const cookieOrigin = (request: Request, _response: Response, next: NextFunction) => {
    const origin = request.get("origin");
    if (!origin || !allowedOrigins.includes(origin)) throw new AuthError(403, "ORIGIN_DENIED", "Untrusted request origin");
    next();
  };
  const auth = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const principal = await service.authenticate(bearer(request));
      response.locals.principal = principal;
      next();
    } catch (error) { next(error); }
  };
  const principal = (response: Response): Principal => response.locals.principal as Principal;

  function setRefreshCookie(response: Response, token: string) {
    response.cookie("digimarket_refresh", token, {
      httpOnly: true, secure: service.config.secureCookies, sameSite: "strict",
      path: "/api/v1/auth", maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
  function clearCookie(response: Response) {
    response.clearCookie("digimarket_refresh", {
      httpOnly: true, secure: service.config.secureCookies, sameSite: "strict", path: "/api/v1/auth",
    });
  }
  function finishLogin(response: Response, result: Awaited<ReturnType<AuthService["login"]>>) {
    if (result.next === "SIGNED_IN") {
      setRefreshCookie(response, result.refreshToken);
      response.json({ data: { next: result.next, accessToken: result.accessToken, user: result.user } });
    } else {
      response.json({ data: result });
    }
  }

  app.post("/api/v1/auth/login", credentialLimit, async (request, response) => {
    const input = body(loginSchema, request.body);
    const result = await service.login(input.loginId, input.password);
    finishLogin(response, result);
  });
  app.post("/api/v1/auth/change-password", async (request, response) => {
    const input = body(changeSchema, request.body);
    response.json({ data: await service.changePassword(input.challengeToken, input.oldPassword, input.newPassword) });
  });
  app.post("/api/v1/auth/refresh", cookieOrigin, async (request, response) => {
    const token = request.cookies?.digimarket_refresh;
    if (typeof token !== "string") throw unauthorized();
    finishLogin(response, await service.refresh(token));
  });
  app.post("/api/v1/auth/logout", cookieOrigin, async (request, response) => {
    const token = request.cookies?.digimarket_refresh;
    if (typeof token === "string") await service.logout(token);
    clearCookie(response);
    response.status(204).end();
  });

  app.get("/api/v1/me", auth, async (_request, response) => {
    const current = principal(response);
    response.json({ data: {
      userId: current.userId, organizationId: current.organizationId,
      roles: current.roles, permissions: [...current.permissions].sort(),
    } });
  });
  app.get("/api/v1/users", auth, async (_request, response) => {
    response.json({ data: await service.listUsers(principal(response)) });
  });
  app.post("/api/v1/users", auth, async (request, response) => {
    const input = body(createSchema, request.body);
    response.status(201).json({ data: await service.createUser(principal(response), input) });
  });
  app.post("/api/v1/users/:id/reset-password", auth, async (request, response) => {
    const id = uuid.parse(request.params.id);
    const input = body(resetSchema, request.body);
    response.json({ data: await service.resetPassword(principal(response), id, input.temporaryPassword) });
  });
  app.post("/api/v1/users/:id/disable", auth, async (request, response) => {
    const id = uuid.parse(request.params.id);
    response.json({ data: await service.disableUser(principal(response), id) });
  });
  app.put("/api/v1/users/:id/role", auth, async (request, response) => {
    const id = uuid.parse(request.params.id);
    const input = body(roleSchema, request.body);
    response.json({ data: await service.changeRole(principal(response), id, input.role) });
  });

  // Only install error handler on auth-enabled app; avoid leaking stack traces.
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (response.headersSent) return _next(error);
    if (error instanceof AuthError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof z.ZodError) {
      response.status(422).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request fields" } });
      return;
    }
    console.error("Unhandled API failure", error instanceof Error ? error.name : "UNKNOWN");
    response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal service error" } });
  });
}
