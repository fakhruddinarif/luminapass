import { Elysia } from "elysia";

import { AuthController } from "../controllers/auth.controller";
import { loginBodySchema, registerBodySchema } from "../dtos/auth";
import type { JwtService } from "../interfaces/auth.interface";
import { authService } from "../services/auth.service";
import { errorResponse } from "../utils/http-response";

interface RouteSet {
  status?: number;
  headers: Record<string, string | string[] | undefined>;
}

interface RouteContext {
  body: unknown;
  request: Request;
  set: RouteSet;
  jwt: JwtService;
}

interface RouteContextBase {
  body: unknown;
  request: Request;
  set: RouteSet;
}

function parseJwt(context: unknown): JwtService {
  return (context as RouteContext).jwt;
}

const authController = new AuthController(authService);

export const authRoutes = new Elysia({ prefix: "/api" })
  .post("/register", async (context) => {
    const { body, set } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const parsed = registerBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        set,
        400,
        "Invalid register payload",
        parsed.error.issues,
      );
    }

    return authController.register(parsed.data, {
      set,
      request: (context as unknown as RouteContextBase).request,
      jwt,
    });
  })
  .post("/login", async (context) => {
    const { body, set } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const parsed = loginBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        set,
        400,
        "Invalid login payload",
        parsed.error.issues,
      );
    }

    return authController.login(parsed.data, {
      set,
      request: (context as unknown as RouteContextBase).request,
      jwt,
    });
  })
  .get("/info", async (context) => {
    const { set } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    return authController.info({
      set,
      request: (context as unknown as RouteContextBase).request,
      jwt,
    });
  })
  .delete("/logout", async (context) => {
    const { set } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    return authController.logout({
      set,
      request: (context as unknown as RouteContextBase).request,
      jwt,
    });
  });
