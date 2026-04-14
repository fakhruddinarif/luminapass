import { randomUUID, timingSafeEqual } from "node:crypto";
import type { InferSelectModel } from "drizzle-orm";

import type { AccessTokenPayload, LoginBody, RegisterBody } from "../dtos/auth";
import { accessTokenPayloadSchema } from "../dtos/auth";
import { users } from "../entities/users";
import {
  userRepository,
  type UserRepository,
} from "../repositories/users.repository";
import { redis, type RedisClient } from "../config/redis";
import {
  AuthServiceError,
  type AuthServiceContract,
  type AuthenticatedUser,
  type JwtService,
} from "../interfaces/auth.interface";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export const authCookieName = "AUTH-TOKEN";
export const csrfCookieName = "CSRF-TOKEN";

type DbUser = InferSelectModel<typeof users>;

interface SessionStore {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

interface PasswordHasher {
  hash(value: string): Promise<string>;
  verify(value: string, hash: string): Promise<boolean>;
}

interface AuthServiceDependencies {
  userRepository: Pick<
    UserRepository,
    | "create"
    | "findUserByEmail"
    | "findUserByEmailOrUsername"
    | "findUserById"
    | "updateLastLoginAt"
  >;
  sessionStore: SessionStore;
  passwordHasher: PasswordHasher;
}

function buildSessionKey(jti: string): string {
  return `auth:session:${jti}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function secureEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function generateCsrfToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

export class AuthService implements AuthServiceContract {
  constructor(private readonly deps: AuthServiceDependencies) {}

  async register(input: RegisterBody): Promise<AuthenticatedUser> {
    const email = normalizeEmail(input.email);
    const username = normalizeUsername(input.username);

    const existing = await this.deps.userRepository.findUserByEmailOrUsername(
      email,
      username,
    );

    if (existing) {
      throw new AuthServiceError(
        "USER_ALREADY_EXISTS",
        "Email or username is already registered",
      );
    }

    const passwordHash = await this.deps.passwordHasher.hash(input.password);

    const created = await this.deps.userRepository.create({
      email,
      username,
      fullName: input.fullName.trim(),
      passwordHash,
      phone: input.phone?.trim(),
      avatarUrl: input.avatarUrl,
      role: input.role,
    });

    return toAuthenticatedUser(created);
  }

  async login(input: LoginBody): Promise<AuthenticatedUser> {
    const email = normalizeEmail(input.email);
    const user = await this.deps.userRepository.findUserByEmail(email);

    if (!user) {
      throw new AuthServiceError(
        "INVALID_CREDENTIALS",
        "Invalid email or password",
      );
    }

    const verified = await this.deps.passwordHasher.verify(
      input.password,
      user.passwordHash,
    );

    if (!verified) {
      throw new AuthServiceError(
        "INVALID_CREDENTIALS",
        "Invalid email or password",
      );
    }

    if (user.status !== "active") {
      throw new AuthServiceError("FORBIDDEN_STATUS", "Account cannot be used");
    }

    const loginAt = new Date();
    await this.deps.userRepository.updateLastLoginAt(user.id, loginAt);

    const updatedUser = await this.deps.userRepository.findUserById(user.id);
    if (!updatedUser) {
      throw new AuthServiceError("USER_NOT_FOUND", "User not found");
    }

    return toAuthenticatedUser(updatedUser);
  }

  async issueAccessSession(jwt: JwtService, user: AuthenticatedUser) {
    const iat = nowInSeconds();
    const exp = iat + ACCESS_TOKEN_TTL_SECONDS;
    const jti = randomUUID();

    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat,
      exp,
      jti,
    };

    const accessToken = await jwt.sign(payload);
    await this.deps.sessionStore.set(
      buildSessionKey(jti),
      user.id,
      ACCESS_TOKEN_TTL_SECONDS,
    );

    return {
      accessToken,
      csrfToken: generateCsrfToken(),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  async verifyAccessToken(
    jwt: JwtService,
    token: string,
  ): Promise<AccessTokenPayload | null> {
    let decoded: unknown;

    try {
      decoded = await jwt.verify(token);
    } catch {
      return null;
    }

    const payload = accessTokenPayloadSchema.safeParse(decoded);
    if (!payload.success) {
      return null;
    }

    if (payload.data.exp <= nowInSeconds()) {
      return null;
    }

    const sessionExists = await this.deps.sessionStore.exists(
      buildSessionKey(payload.data.jti),
    );
    if (!sessionExists) {
      return null;
    }

    return payload.data;
  }

  async revokeAccessToken(payload: AccessTokenPayload): Promise<void> {
    await this.deps.sessionStore.delete(buildSessionKey(payload.jti));
  }

  async getUserInfo(userId: string): Promise<AuthenticatedUser> {
    const user = await this.deps.userRepository.findUserById(userId);
    if (!user) {
      throw new AuthServiceError("USER_NOT_FOUND", "User not found");
    }

    if (user.status !== "active") {
      throw new AuthServiceError("FORBIDDEN_STATUS", "Account cannot be used");
    }

    return toAuthenticatedUser(user);
  }
}

function createRedisSessionStore(client: RedisClient): SessionStore {
  return {
    async set(key: string, value: string, ttlSeconds: number) {
      await client.set(key, value, "EX", ttlSeconds);
    },
    async exists(key: string) {
      return Boolean(await client.exists(key));
    },
    async delete(key: string) {
      await client.del(key);
    },
  };
}

const bunPasswordHasher: PasswordHasher = {
  async hash(value: string) {
    return Bun.password.hash(value, {
      algorithm: "argon2id",
      memoryCost: 19_456,
      timeCost: 2,
    });
  },
  async verify(value: string, hash: string) {
    return Bun.password.verify(value, hash);
  },
};

export const authService = new AuthService({
  userRepository,
  sessionStore: createRedisSessionStore(redis),
  passwordHasher: bunPasswordHasher,
});

export async function verifyAccessToken(
  jwt: JwtService,
  token: string,
): Promise<AccessTokenPayload | null> {
  return authService.verifyAccessToken(jwt, token);
}

export function isCsrfValid(
  csrfCookieValue: string | undefined,
  csrfHeaderValue: string | null,
): boolean {
  if (!csrfCookieValue || !csrfHeaderValue) {
    return false;
  }

  return secureEquals(csrfCookieValue, csrfHeaderValue);
}

function toAuthenticatedUser(user: DbUser): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export function toPublicUser(user: AuthenticatedUser) {
  return { ...user };
}
