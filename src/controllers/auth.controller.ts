import type { LoginBody, RegisterBody } from "../dtos/auth";
import {
  applyAuthCookies,
  clearAuthCookies,
  parseRequestCookies,
  resolveRequestAuth,
} from "../middlewares/auth.middleware";
import type {
  AuthControllerContext,
  AuthControllerContract,
  AuthServiceContract,
} from "../interfaces/auth.interface";
import { AuthServiceError } from "../interfaces/auth.interface";
import {
  csrfCookieName,
  isCsrfValid,
  toPublicUser,
} from "../services/auth.service";
import { errorResponse, successResponse } from "../utils/http-response";

export class AuthController implements AuthControllerContract {
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
        return errorResponse(context.set, 409, error.message, [
          {
            code: error.code,
            message: error.message,
            field: "email,username",
          },
        ]);
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
        return errorResponse(context.set, 401, "Invalid email or password", [
          {
            code: error.code,
            message: "Invalid email or password",
            field: "email,password",
          },
        ]);
      }

      if (
        error instanceof AuthServiceError &&
        error.code === "FORBIDDEN_STATUS"
      ) {
        return errorResponse(
          context.set,
          403,
          "Account is not active or cannot be used",
          [
            {
              code: error.code,
              message: "Account is not active or cannot be used",
              field: "status",
            },
          ],
        );
      }

      throw error;
    }
  }

  async info(context: AuthControllerContext) {
    const authPayload = await resolveRequestAuth(context.request, context.jwt);
    if (!authPayload) {
      return errorResponse(context.set, 401, "Unauthorized", [
        {
          code: "UNAUTHORIZED",
          message: "Access token is missing, invalid, or expired",
        },
      ]);
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
        return errorResponse(context.set, 401, "Unauthorized", [
          {
            code: error.code,
            message: "Access token is missing, invalid, or expired",
          },
        ]);
      }

      throw error;
    }
  }

  async logout(context: AuthControllerContext) {
    const authPayload = await resolveRequestAuth(context.request, context.jwt);
    if (!authPayload) {
      return errorResponse(context.set, 401, "Unauthorized", [
        {
          code: "UNAUTHORIZED",
          message: "Access token is missing, invalid, or expired",
        },
      ]);
    }

    const cookies = parseRequestCookies(context.request);
    const csrfHeader = context.request.headers.get("x-csrf-token");

    if (!isCsrfValid(cookies[csrfCookieName], csrfHeader)) {
      return errorResponse(context.set, 403, "Invalid CSRF token", [
        {
          code: "INVALID_CSRF_TOKEN",
          message: "x-csrf-token header must match CSRF-TOKEN cookie",
          field: "x-csrf-token",
        },
      ]);
    }

    await this.authService.revokeAccessToken(authPayload);
    clearAuthCookies(context.set);

    return successResponse(context.set, 200, "Logout succeeded", { ok: true });
  }
}
