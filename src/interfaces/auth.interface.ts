import type { AccessTokenPayload, LoginBody, RegisterBody } from "../dtos/auth";
import type { CreateUserParams } from "../dtos/user";
import type { users } from "../entities/users";

type DbUser = typeof users.$inferSelect;

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

export interface AuthUserRepositoryContract {
  create(input: CreateUserParams): Promise<DbUser>;
  findUserByEmail(email: string): Promise<DbUser | undefined>;
  findUserByUsername(username: string): Promise<DbUser | undefined>;
  findUserById(id: string): Promise<DbUser | undefined>;
  findUserByEmailOrUsername(
    email: string,
    username: string,
  ): Promise<DbUser | undefined>;
  updateLastLoginAt(id: string, loginAt: Date): Promise<void>;
}

export interface SessionStoreContract {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export interface PasswordHasherContract {
  hash(value: string): Promise<string>;
  verify(value: string, hash: string): Promise<boolean>;
}

export interface AuthServiceDependencies {
  userRepository: AuthUserRepositoryContract;
  sessionStore: SessionStoreContract;
  passwordHasher: PasswordHasherContract;
}

export interface RouteSetContract {
  status?: number;
  headers: Record<string, string | string[] | undefined>;
}

export interface AuthControllerContext {
  set: RouteSetContract;
  request: Request;
  jwt: JwtService;
}

export interface AuthControllerContract {
  register(body: RegisterBody, context: AuthControllerContext): Promise<unknown>;
  login(body: LoginBody, context: AuthControllerContext): Promise<unknown>;
  info(context: AuthControllerContext): Promise<unknown>;
  logout(context: AuthControllerContext): Promise<unknown>;
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
