import { describe, expect, it } from "bun:test";

import { AuthController } from "../src/controllers/auth.controller";
import { AuthServiceError } from "../src/interfaces/auth.interface";

function buildUser() {
  return {
    id: "user-1",
    email: "user@example.com",
    username: "user1",
    fullName: "User One",
    phone: null,
    avatarUrl: null,
    role: "customer" as const,
    status: "active" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
  };
}

function buildContext(request?: Request) {
  return {
    set: {
      status: 200,
      headers: {},
    },
    request: request ?? new Request("http://localhost/api/register"),
    jwt: {
      sign: async () => "token",
      verify: async () => ({ sub: "user-1" }),
    },
  };
}

describe("AuthController", () => {
  it("register returns 201 and sets auth cookies", async () => {
    const service = {
      register: async () => buildUser(),
      issueAccessSession: async () => ({
        accessToken: "access-token",
        csrfToken: "csrf-token",
        expiresIn: 900,
      }),
      login: async () => buildUser(),
      verifyAccessToken: async () => null,
      revokeAccessToken: async () => {},
      getUserInfo: async () => buildUser(),
    };

    const controller = new AuthController(service as any);
    const response = await controller.register(
      {
        email: "user@example.com",
        username: "user1",
        fullName: "User One",
        password: "StrongPass123",
        role: "customer",
      },
      buildContext(),
    );

    expect(response.status).toBe(201);
    expect(response.errors).toBeNull();
    expect(response.data).toHaveProperty("id");
  });

  it("register maps USER_ALREADY_EXISTS to 409", async () => {
    const service = {
      register: async () => {
        throw new AuthServiceError(
          "USER_ALREADY_EXISTS",
          "Email or username is already registered",
        );
      },
      issueAccessSession: async () => ({
        accessToken: "access-token",
        csrfToken: "csrf-token",
        expiresIn: 900,
      }),
      login: async () => buildUser(),
      verifyAccessToken: async () => null,
      revokeAccessToken: async () => {},
      getUserInfo: async () => buildUser(),
    };

    const controller = new AuthController(service as any);
    const response = await controller.register(
      {
        email: "user@example.com",
        username: "user1",
        fullName: "User One",
        password: "StrongPass123",
        role: "customer",
      },
      buildContext(),
    );

    expect(response.status).toBe(409);
    expect(response.errors?.[0]?.code).toBe("USER_ALREADY_EXISTS");
  });

  it("login maps INVALID_CREDENTIALS to 401", async () => {
    const service = {
      register: async () => buildUser(),
      issueAccessSession: async () => ({
        accessToken: "access-token",
        csrfToken: "csrf-token",
        expiresIn: 900,
      }),
      login: async () => {
        throw new AuthServiceError("INVALID_CREDENTIALS", "Invalid");
      },
      verifyAccessToken: async () => null,
      revokeAccessToken: async () => {},
      getUserInfo: async () => buildUser(),
    };

    const controller = new AuthController(service as any);
    const response = await controller.login(
      {
        email: "user@example.com",
        password: "wrong",
      },
      buildContext(new Request("http://localhost/api/login")),
    );

    expect(response.status).toBe(401);
    expect(response.errors?.[0]?.code).toBe("INVALID_CREDENTIALS");
  });

  it("info returns 401 when request has no auth cookie", async () => {
    const service = {
      register: async () => buildUser(),
      issueAccessSession: async () => ({
        accessToken: "access-token",
        csrfToken: "csrf-token",
        expiresIn: 900,
      }),
      login: async () => buildUser(),
      verifyAccessToken: async () => null,
      revokeAccessToken: async () => {},
      getUserInfo: async () => buildUser(),
    };

    const controller = new AuthController(service as any);
    const response = await controller.info(
      buildContext(new Request("http://localhost/api/info")),
    );

    expect(response.status).toBe(401);
    expect(response.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });

  it("logout returns 401 when request has no auth cookie", async () => {
    const service = {
      register: async () => buildUser(),
      issueAccessSession: async () => ({
        accessToken: "access-token",
        csrfToken: "csrf-token",
        expiresIn: 900,
      }),
      login: async () => buildUser(),
      verifyAccessToken: async () => null,
      revokeAccessToken: async () => {},
      getUserInfo: async () => buildUser(),
    };

    const controller = new AuthController(service as any);
    const response = await controller.logout(
      buildContext(
        new Request("http://localhost/api/logout", { method: "DELETE" }),
      ),
    );

    expect(response.status).toBe(401);
    expect(response.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });
});
