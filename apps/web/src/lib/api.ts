export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export type ApiOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  token?: string;
};

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("..")) {
    throw new Error("API path must be relative and safe");
  }
  const response = await fetch("/api/v1" + path, {
    method: options.method ?? "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.token ? { authorization: "Bearer " + options.token } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  if (response.status === 204) return undefined as T;
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const payload = result as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(response.status, payload?.error?.code ?? "REQUEST_FAILED", payload?.error?.message ?? "Request failed");
  }
  return (result as { data: T }).data;
}

export type LoginUser = {
  id: string;
  organizationId: string;
  loginId: string;
  displayName: string;
  status: string;
  mustChangePassword: boolean;
};
export type SessionPayload = {
  next: "SIGNED_IN";
  accessToken: string;
  user: LoginUser;
};
export type ChallengePayload = {
  next: "CHANGE_PASSWORD" | "ENROLL_MFA" | "VERIFY_MFA";
  challengeToken: string;
};
export type LoginResult = SessionPayload | ChallengePayload;
export type Identity = {
  userId: string;
  organizationId: string;
  roles: string[];
  permissions: string[];
};
export type StaffUser = {
  id: string;
  loginId: string;
  displayName: string;
  email: string | null;
  status: "INVITED" | "ACTIVE" | "DISABLED";
  createdAt: string;
  roles: string[];
};
export type Session = {
  accessToken: string;
  user: LoginUser;
  identity: Identity;
};
