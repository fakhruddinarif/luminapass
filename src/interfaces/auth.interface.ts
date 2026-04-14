import type { AccessTokenPayload, LoginBody, RegisterBody } from "../dtos/auth";

export interface JwtService {
  sign(payload: Record<string, unknown>): Promise<string>;
  verify(token: string): Promise<unknown>;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: "customer" | "admin";
  status: "active" | "suspended" | "deleted";
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface AuthSession {
  accessToken: string;
  csrfToken: string;
  expiresIn: number;
}

export interface AuthServiceContract {
  register(input: RegisterBody): Promise<AuthenticatedUser>;
  login(input: LoginBody): Promise<AuthenticatedUser>;
  issueAccessSession(
    jwt: JwtService,
    user: AuthenticatedUser,
  ): Promise<AuthSession>;
  verifyAccessToken(
    jwt: JwtService,
    token: string,
  ): Promise<AccessTokenPayload | null>;
  revokeAccessToken(payload: AccessTokenPayload): Promise<void>;
  getUserInfo(userId: string): Promise<AuthenticatedUser>;
}

export class AuthServiceError extends Error {
  constructor(
    public readonly code:
      | "USER_ALREADY_EXISTS"
      | "INVALID_CREDENTIALS"
      | "USER_NOT_FOUND"
      | "FORBIDDEN_STATUS",
    message: string,
  ) {
    super(message);
  }
}
