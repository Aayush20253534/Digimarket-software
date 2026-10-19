export class AuthError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}
export const unauthorized = () => new AuthError(401, "UNAUTHORIZED", "Invalid credentials or session");
export const forbidden = () => new AuthError(403, "FORBIDDEN", "Access denied");
export const invalid = (message: string) => new AuthError(422, "INVALID_REQUEST", message);
