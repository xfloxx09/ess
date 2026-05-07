import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { CookieOptions, Request, Response } from "express";
import { loginSchema, passwordResetRequestSchema, passwordResetSchema } from "@ess/shared";
import { Body$ } from "../../common/zod-validation.pipe";
import { env } from "../../common/env";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { RequestUser } from "../../common/authz.types";

const REFRESH_COOKIE = "ess_refresh";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("login")
  async login(
    @Body(Body$(loginSchema)) body: { email: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body.email, body.password, {
      userAgent: req.headers["user-agent"] ?? undefined,
      ipAddress: req.ip ?? undefined,
    });
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    const { refreshToken: _refreshToken, refreshExpiresAt: _refreshExpiresAt, ...rest } = result;
    return rest;
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieToken = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];
    const headerToken = req.headers["x-refresh-token"];
    const raw = cookieToken ?? (typeof headerToken === "string" ? headerToken : undefined);
    if (!raw) {
      res.status(401);
      return { error: "missing_refresh" };
    }
    const result = await this.auth.refresh(raw, {
      userAgent: req.headers["user-agent"] ?? undefined,
      ipAddress: req.ip ?? undefined,
    });
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    const { refreshToken: _refreshToken, refreshExpiresAt: _refreshExpiresAt, ...rest } = result;
    return rest;
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieToken = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];
    await this.auth.logout(cookieToken);
    clearRefreshCookie(res);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: { user: RequestUser }) {
    return this.auth.me(req.user.id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("forgot")
  forgot(@Body(Body$(passwordResetRequestSchema)) body: { email: string }) {
    return this.auth.forgot(body.email);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("reset")
  reset(@Body(Body$(passwordResetSchema)) body: { token: string; password: string }) {
    return this.auth.reset(body.token, body.password);
  }
}

function buildCookieOptions(expires: Date): CookieOptions {
  const opts: CookieOptions = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    expires,
    path: "/",
  };
  if (env.COOKIE_DOMAIN) opts.domain = env.COOKIE_DOMAIN;
  return opts;
}

function setRefreshCookie(res: Response, token: string, expiresAt: string) {
  res.cookie(REFRESH_COOKIE, token, buildCookieOptions(new Date(expiresAt)));
}

function clearRefreshCookie(res: Response) {
  res.cookie(REFRESH_COOKIE, "", buildCookieOptions(new Date(0)));
}
