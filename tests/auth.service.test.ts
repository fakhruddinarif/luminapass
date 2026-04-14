import { describe, expect, it, mock } from "bun:test";

import { AuthService } from "../src/services/auth.service";
import { AuthServiceError } from "../src/interfaces/auth.interface";

describe("AuthService", () => {
  const baseUser = {
    id: "efb149f4-875e-4ab8-b2aa-ef22daf1ca07",
    email: "user@example.com",
    username: "userexample",
    fullName: "User Example",
    phone: null,
    avatarUrl: null,
    passwordHash: "hashed-password",
    role: "customer" as const,
    status: "active" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    deletedAt: null,
  };

  function makeService(overrides?: {
    findUserByEmailOrUsername?: () => Promise<typeof baseUser | undefined>;
    findUserByEmail?: () => Promise<typeof baseUser | undefined>;
    findUserById?: () => Promise<typeof baseUser | undefined>;
  }) {
    const userRepository = {
      findUserByEmailOrUsername:
        overrides?.findUserByEmailOrUsername ?? (async () => undefined),
      findUserByEmail: overrides?.findUserByEmail ?? (async () => baseUser),
      findUserById: overrides?.findUserById ?? (async () => baseUser),
      create: async () => baseUser,
      update: async () => baseUser,
      updateLastLoginAt: async () => {},
      getById: async () => baseUser,
      delete: async () => true,
      softDelete: async () => true,
    };

    const sessionStore = {
      set: async () => {},
      exists: async () => true,
      delete: async () => {},
    };

    const passwordHasher = {
      hash: async () => "hashed-password",
      verify: async () => true,
    };

    return new AuthService({ userRepository, sessionStore, passwordHasher });
  }

  it("throws duplicate error when email/username already exists on register", async () => {
    const service = makeService({
      findUserByEmailOrUsername: async () => baseUser,
    });

    await expect(
      service.register({
        email: "user@example.com",
        username: "userexample",
        fullName: "User Example",
        password: "StrongPass123",
      }),
    ).rejects.toBeInstanceOf(AuthServiceError);
  });

  it("throws invalid credentials when user not found", async () => {
    const service = makeService({
      findUserByEmail: async () => undefined,
    });

    await expect(
      service.login({ email: "none@example.com", password: "StrongPass123" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("returns user info for valid active user", async () => {
    const service = makeService();

    const user = await service.getUserInfo(baseUser.id);
    expect(user.id).toBe(baseUser.id);
    expect(user.email).toBe(baseUser.email);
  });

  it("issues and verifies access token payload with session store", async () => {
    const setMock = mock(async () => {});
    const existsMock = mock(async () => true);

    const service = new AuthService({
      userRepository: {
        findUserByEmailOrUsername: async () => undefined,
        findUserByEmail: async () => baseUser,
        findUserById: async () => baseUser,
        create: async () => baseUser,
        updateLastLoginAt: async () => {},
      },
      sessionStore: {
        set: setMock,
        exists: existsMock,
        delete: async () => {},
      },
      passwordHasher: {
        hash: async () => "hashed-password",
        verify: async () => true,
      },
    });

    const jwt = {
      sign: async (payload: Record<string, unknown>) => JSON.stringify(payload),
      verify: async (token: string) => JSON.parse(token),
    };

    const session = await service.issueAccessSession(jwt, {
      id: baseUser.id,
      email: baseUser.email,
      username: baseUser.username,
      fullName: baseUser.fullName,
      phone: baseUser.phone,
      avatarUrl: baseUser.avatarUrl,
      role: baseUser.role,
      status: baseUser.status,
      createdAt: baseUser.createdAt,
      updatedAt: baseUser.updatedAt,
      lastLoginAt: baseUser.lastLoginAt,
    });

    expect(session.accessToken).toBeString();
    expect(setMock).toHaveBeenCalledTimes(1);

    const payload = await service.verifyAccessToken(jwt, session.accessToken);
    expect(payload?.sub).toBe(baseUser.id);
    expect(existsMock).toHaveBeenCalledTimes(1);
  });
});
