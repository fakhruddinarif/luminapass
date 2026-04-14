import type { LoginBody, RegisterBody } from "../dtos/auth";
import {
  applyAuthCookies,
  clearAuthCookies,
  parseRequestCookies,
  resolveRequestAuth,
} from "../middlewares/auth.middleware";
import type {
  AuthServiceContract,
  JwtService,
} from "../interfaces/auth.interface";
import { AuthServiceError } from "../interfaces/auth.interface";
import {
  csrfCookieName,
  isCsrfValid,
  toPublicUser,
} from "../services/auth.service";
import { errorResponse, successResponse } from "../utils/http-response";

interface RouteSet {
  status?: number;
  headers: Record<string, string | string[] | undefined>;
}

export interface AuthControllerContext {
  set: RouteSet;
  request: Request;
  jwt: JwtService;
}

export class AuthController {
  constructor(private readonly authService: AuthServiceContract) {}

  async register(body: RegisterBody, context: AuthControllerContext) {
    try {
      const user = await this.authService.register(body);
      const session = await this.authService.issueAccessSession(
        context.jwt,
        user,
      );

      applyAuthCookies(
        context.set,
        session.accessToken,
        session.csrfToken,
        session.expiresIn,
      );

      return successResponse(
        context.set,
        201,
        "Registration succeeded",
        toPublicUser(user),
      );
    } catch (error) {
      if (
        error instanceof AuthServiceError &&
        error.code === "USER_ALREADY_EXISTS"
      ) {
        return errorResponse(context.set, 409, error.message);
      }

      throw error;
    }
  }

  async login(body: LoginBody, context: AuthControllerContext) {
    try {
      const user = await this.authService.login(body);
      const session = await this.authService.issueAccessSession(
        context.jwt,
        user,
      );

      applyAuthCookies(
        context.set,
        session.accessToken,
        session.csrfToken,
        session.expiresIn,
      );

      return successResponse(
        context.set,
        200,
        "Login succeeded",
        toPublicUser(user),
      );
    } catch (error) {
      if (
        error instanceof AuthServiceError &&
        error.code === "INVALID_CREDENTIALS"
      ) {
        return errorResponse(context.set, 401, "Invalid email or password");
      }

      if (
        error instanceof AuthServiceError &&
        error.code === "FORBIDDEN_STATUS"
      ) {
        return errorResponse(
          context.set,
          403,
          "Account is not active or cannot be used",
        );
      }

      throw error;
    }
  }

  async info(context: AuthControllerContext) {
    const authPayload = await resolveRequestAuth(context.request, context.jwt);
    if (!authPayload) {
      return errorResponse(context.set, 401, "Unauthorized");
    }

    try {
      const user = await this.authService.getUserInfo(authPayload.sub);
      return successResponse(
        context.set,
        200,
        "User information retrieved successfully",
        toPublicUser(user),
      );
    } catch (error) {
      if (error instanceof AuthServiceError) {
        return errorResponse(context.set, 401, "Unauthorized");
      }

      throw error;
    }
  }

  async logout(context: AuthControllerContext) {
    const authPayload = await resolveRequestAuth(context.request, context.jwt);
    if (!authPayload) {
      return errorResponse(context.set, 401, "Unauthorized");
    }

    const cookies = parseRequestCookies(context.request);
    const csrfHeader = context.request.headers.get("x-csrf-token");

    if (!isCsrfValid(cookies[csrfCookieName], csrfHeader)) {
      return errorResponse(context.set, 403, "Invalid CSRF token");
    }

    await this.authService.revokeAccessToken(authPayload);
    clearAuthCookies(context.set);

    return successResponse(context.set, 200, "Logout succeeded", { ok: true });
  }
}
